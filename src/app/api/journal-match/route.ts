import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { profileManuscript, rankJournals } from '@/utils/decisionTreeMatcher';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function coerceSubjectList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : typeof item === 'object' && item && 'subject' in item && typeof (item as { subject?: unknown }).subject === 'string' ? (item as { subject: string }).subject : ''))
      .filter(Boolean);
  }
  return [];
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
    if (typeof body.manuscriptText !== 'string' || body.manuscriptText.trim().length < 50) {
      return NextResponse.json({ error: 'Manuscript text must be at least 50 characters.' }, { status: 400 });
    }

    const maxBudget = typeof body.budget === 'number' && body.budget > 0 ? body.budget : null;
    const manuscriptProfile = profileManuscript(body.manuscriptText);

    const supabase = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ source: 'demo', matches: [] });
    }

    const indexingRelation = typeof body.indexing === 'string' && body.indexing !== 'Any indexing'
      ? 'journal_indexings!inner(indexing_name)'
      : 'journal_indexings(indexing_name)';

    let query = supabase
      .from('journals')
      .select(`id,source_record_id,name,issn,eissn,publisher,field,source_type,subjects,quartile,oa,apc_display,indexed,scope,asjc_codes,requirements,sponsored,sponsor_tier,submission_url,${indexingRelation}`)
      .eq('source_type', 'Journal')
      .limit(1000);

    if (typeof body.field === 'string' && body.field !== 'Any field') {
      query = query.contains('subjects', [body.field]);
    }

    if (typeof body.quartile === 'string' && body.quartile !== 'Any quartile') {
      const quartileRanks = body.quartile === 'Q1 only' ? ['Q1'] : body.quartile === 'Q2+' ? ['Q1', 'Q2'] : body.quartile === 'Q3+' ? ['Q1', 'Q2', 'Q3'] : ['Q1', 'Q2', 'Q3', 'Q4'];
      query = query.in('quartile', quartileRanks);
    }

    if (typeof body.indexing === 'string' && body.indexing !== 'Any indexing') {
      const indexingName = body.indexing === 'WoS' ? 'Web of Science' : body.indexing;
      query = query.eq('journal_indexings.indexing_name', indexingName);
    }

    const { data, error } = await query;
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
        sponsored: Boolean(row.sponsored),
        requirements: {
          abstract: (requirements.abstract?.type === 'structured' ? 'structured' : 'unstructured') as 'structured' | 'unstructured',
          wordLimit: Number(requirements.wordLimit) || null,
          refStyle: requirements.refStyle ?? 'Numbered',
        },
      };
    });

    const filteredJournals = maxBudget === null
      ? journals
      : journals.filter((journal) => {
          const apc = Number(String(journal.apc).replace(/[^0-9]/g, '')) || null;
          return apc !== null && apc <= maxBudget;
        });

    const matches = rankJournals(body.manuscriptText, filteredJournals).slice(0, 25);
    return NextResponse.json({ source: 'supabase', matches });
  } catch (error) {
    console.error('Journal match failed:', error);
    return NextResponse.json({ error: 'Unable to search the journal catalog.' }, { status: 500 });
  }
}
