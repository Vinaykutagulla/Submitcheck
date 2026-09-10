import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { profileManuscript, rankJournals, topicFamilies } from '@/utils/decisionTreeMatcher';
import { lookupLiveApc } from '@/lib/journal-apc';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function coerceIndexList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : typeof item === 'object' && item && 'indexing_name' in item && typeof (item as { indexing_name?: unknown }).indexing_name === 'string' ? (item as { indexing_name: string }).indexing_name : ''))
      .filter(Boolean);
  }
  return [];
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { manuscriptText?: unknown; field?: unknown; indexing?: unknown; quartile?: unknown; budget?: unknown };
    if (typeof body.manuscriptText !== 'string' || body.manuscriptText.trim().length < 3) {
      return NextResponse.json({ error: 'Add a title, abstract, or manuscript text before matching.' }, { status: 400 });
    }

    const maxBudget = typeof body.budget === 'number' && body.budget > 0 ? body.budget : null;
    const manuscriptProfile = profileManuscript(body.manuscriptText);

    const supabase = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ source: 'demo', matches: [] });
    }
    const database = supabase;

    const indexingRelation = typeof body.indexing === 'string' && body.indexing !== 'Any indexing'
      ? 'journal_indexings!inner(indexing_name)'
      : 'journal_indexings(indexing_name)';

    const topicTerms = manuscriptProfile.topics.flatMap((topic) => topicFamilies[topic]?.slice(0, 2) ?? []);
    const searchTerms = [...new Set([...manuscriptProfile.topics, ...topicTerms, ...manuscriptProfile.keywords])]
      .map((term) => term.replace(/[^a-z0-9 -]/gi, '').trim())
      .filter((term) => term.length >= 4)
      .filter((term) => !['compounds', 'compound', 'positive', 'that', 'using', 'based', 'molecular', 'dynamics', 'network', 'simulation', 'research', 'analysis'].includes(term))
      .slice(0, 10);

    function buildQuery(withKeywordSearch: boolean) {
      let nextQuery = database
        .from('journals')
        .select(`id,source_record_id,name,issn,eissn,publisher,field,source_type,subjects,quartile,oa,apc_display,indexed,scope,asjc_codes,requirements,sponsored,sponsor_tier,submission_url,${indexingRelation}`)
        .eq('source_type', 'Journal')
        .limit(300);

      if (typeof body.field === 'string' && body.field !== 'Any field') {
        nextQuery = nextQuery.contains('subjects', [body.field]);
      }
      if (typeof body.quartile === 'string' && body.quartile !== 'Any quartile') {
        const quartileRank = body.quartile.match(/^Q[1-4]/)?.[0];
        if (quartileRank) nextQuery = nextQuery.eq('quartile', quartileRank);
      }
      if (typeof body.indexing === 'string' && body.indexing !== 'Any indexing') {
        const indexingName = body.indexing === 'WoS' ? 'Web of Science' : body.indexing;
        nextQuery = nextQuery.eq('journal_indexings.indexing_name', indexingName);
      }
      if (withKeywordSearch && searchTerms.length) {
        nextQuery = nextQuery.or(searchTerms.map((term) => `search_document.ilike.%${term}%`).join(','));
      }
      return nextQuery;
    }

    let { data, error } = await buildQuery(true);
    if (error) throw error;
    if (!data?.length) {
      const fallback = await buildQuery(false);
      data = fallback.data;
      error = fallback.error;
    }
    if (error) throw error;

    const journals = (data ?? []).map((row) => {
      const requirements = (row as { requirements?: { abstract?: { type?: string }; wordLimit?: number; refStyle?: string } }).requirements ?? {};
      const enrichedIndexings = coerceIndexList((row as { journal_indexings?: unknown }).journal_indexings);

      return {
        id: row.source_record_id ?? row.id,
        name: row.name,
        issn: row.issn ?? undefined,
        eissn: row.eissn ?? undefined,
        submissionUrl: row.submission_url ?? undefined,
        publisher: row.publisher ?? 'Publisher not listed',
        field: row.field ?? 'Multidisciplinary',
        quartile: row.quartile ?? 'Unranked',
        oa: Boolean(row.oa),
        apc: row.apc_display ?? 'Check journal website',
        speed: 'Check journal website',
        indexed: enrichedIndexings.length ? enrichedIndexings : (Array.isArray(row.indexed) ? row.indexed : ['Scopus']),
        scope: Array.isArray(row.subjects) && row.subjects.length ? row.subjects : (Array.isArray(row.scope) ? row.scope : []),
        asjcCodes: Array.isArray(row.asjc_codes) ? row.asjc_codes : [],
        sponsored: Boolean(row.sponsored),
        requirements: {
          abstract: (requirements.abstract?.type === 'structured' ? 'structured' : 'unstructured') as 'structured' | 'unstructured',
          wordLimit: Number(requirements.wordLimit) || null,
          refStyle: requirements.refStyle ?? 'Numbered',
        },
      };
    });

    let rankedJournals = rankJournals(body.manuscriptText, journals);
    if (maxBudget !== null) {
      const candidates = rankedJournals.slice(0, 40);
      const enriched = await Promise.all(candidates.map(async ({ journal, profile, match }) => {
        const catalogApc = Number(String(journal.apc).replace(/[^0-9]/g, '')) || null;
        if (catalogApc !== null) return { journal, profile, match };
        const liveApc = await lookupLiveApc(journal.issn || journal.eissn, journal.submissionUrl);
        if (liveApc) {
          return { journal: { ...journal, apc: `${liveApc.amount} ${liveApc.currency}` }, profile, match };
        }
        return { journal, profile, match };
      }));
      rankedJournals = enriched.filter(({ journal }) => {
        const apc = Number(String(journal.apc).replace(/[^0-9]/g, '')) || null;
        return apc !== null && apc <= maxBudget;
      });
    }

    // Do not present catalog rows that only matched a generic word from the manuscript.
    const matches = rankedJournals
      .filter(({ match }) => match.score >= 40)
      .slice(0, 25);
    return NextResponse.json({ source: 'supabase', matches });
  } catch (error) {
    console.error('Journal match failed:', error);
    return NextResponse.json({ error: 'Unable to search the journal catalog.' }, { status: 500 });
  }
}
