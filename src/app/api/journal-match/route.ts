import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { filterJournals, profileManuscript, rankJournals, topicFamilies } from '@/utils/decisionTreeMatcher';
import { lookupLiveApc } from '@/lib/journal-apc';
import { parseApcInr } from '@/lib/apc';
import { createSemanticProfile, judgeJournalCandidates } from '@/lib/semantic-profile';

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
    let body: { manuscriptText?: unknown; field?: unknown; indexing?: unknown; quartile?: unknown; budget?: unknown; access?: unknown };
    try {
      body = await request.json() as { manuscriptText?: unknown; field?: unknown; indexing?: unknown; quartile?: unknown; budget?: unknown; access?: unknown };
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
    }

    if (typeof body.manuscriptText !== 'string' || body.manuscriptText.trim().length < 3) {
      return NextResponse.json({ error: 'Add a title, abstract, or manuscript text before matching.' }, { status: 400 });
    }

    const maxBudget = typeof body.budget === 'number' && Number.isFinite(body.budget) && body.budget > 0 ? body.budget : null;
    const manuscriptProfile = profileManuscript(body.manuscriptText);
    const semanticResult = await createSemanticProfile(body.manuscriptText);
    const semanticProfile = semanticResult.profile;

    const supabase = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ source: 'demo', matches: [] });
    }
    const database = supabase;

    const indexingRelation = typeof body.indexing === 'string' && body.indexing !== 'Any indexing'
      ? 'journal_indexings!inner(indexing_name)'
      : 'journal_indexings(indexing_name)';

    const prioritizedTopics = [...manuscriptProfile.topics]
      .sort((left, right) => (manuscriptProfile.topicScores[right] ?? 0) - (manuscriptProfile.topicScores[left] ?? 0));
    const topicTerms = prioritizedTopics.flatMap((topic) => topicFamilies[topic]?.slice(0, 3) ?? []);
    const semanticTerms = semanticProfile
      ? [
        semanticProfile.researchQuestion,
        semanticProfile.studyDesign,
        ...semanticProfile.subjectArea,
        ...semanticProfile.populationOrMaterial,
        ...semanticProfile.interventions,
        ...semanticProfile.methods,
        ...semanticProfile.outcomes,
      ]
      : [];
    const searchTerms = [...new Set([...prioritizedTopics, ...topicTerms, ...manuscriptProfile.keywords, ...semanticTerms])]
      .map((term) => term.replace(/[^a-z0-9 -]/gi, '').trim())
      .filter((term) => term.length >= 4)
      .filter((term) => !['compounds', 'compound', 'positive', 'that', 'using', 'based', 'molecular', 'dynamics', 'network', 'simulation', 'research', 'analysis'].includes(term))
      .slice(0, 10);

    function buildQuery(withKeywordSearch: boolean) {
      let nextQuery = database
        .from('journals')
        .select(`id,source_record_id,name,issn,eissn,publisher,field,source_type,subjects,quartile,oa,apc_display,indexed,scope,asjc_codes,requirements,sponsored,sponsor_tier,submission_url,${indexingRelation}`)
        .eq('source_type', 'Journal')
        .limit(1000);

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

    const keywordQuery = await buildQuery(true);
    if (keywordQuery.error) throw keywordQuery.error;

    // Keyword search is useful for narrowing a large catalog, but it must not
    // decide which journals are eligible for ranking. Merge it with the
    // filtered catalog so relevant journals whose metadata uses different
    // wording are still considered.
    const broadQuery = await buildQuery(false);
    if (broadQuery.error) throw broadQuery.error;
    const candidateRows = [...(keywordQuery.data ?? []), ...(broadQuery.data ?? [])];
    const rowsById = new Map<string, (typeof candidateRows)[number]>();
    for (const row of candidateRows) {
      rowsById.set(String(row.id), row);
    }
    const journals = [...rowsById.values()].map((row) => {
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
        quartile: /^Q[1-4]$/.test(row.quartile ?? '') ? row.quartile as 'Q1' | 'Q2' | 'Q3' | 'Q4' : undefined,
        oa: Boolean(row.oa),
        apc: parseApcInr(row.apc_display),
        apcDisplay: row.apc_display ?? 'Check journal website',
        speed: 'Check journal website',
        indexing: enrichedIndexings.length ? enrichedIndexings : (Array.isArray(row.indexed) ? row.indexed : []),
        indexed: enrichedIndexings.length ? enrichedIndexings : (Array.isArray(row.indexed) ? row.indexed : []),
        scope: [...new Set([
          ...(Array.isArray(row.subjects) ? row.subjects : []),
          ...(Array.isArray(row.scope) ? row.scope : []),
        ])],
        asjcCodes: Array.isArray(row.asjc_codes) ? row.asjc_codes : [],
        sponsored: Boolean(row.sponsored),
        access: row.oa ? 'Open Access' as const : 'Subscription' as const,
        requirements: {
          abstract: (requirements.abstract?.type === 'structured' ? 'structured' : 'unstructured') as 'structured' | 'unstructured',
          wordLimit: Number(requirements.wordLimit) || null,
          refStyle: requirements.refStyle ?? 'Numbered',
        },
      };
    });

    const filterResult = filterJournals(journals, {
      // Supabase already applies the exact subject taxonomy filter above.
      field: undefined,
      indexing: typeof body.indexing === 'string' && body.indexing !== 'Any indexing'
        ? body.indexing === 'WoS' ? 'Web of Science' : body.indexing
        : undefined,
      quartile: typeof body.quartile === 'string' && /^Q[1-4] only$/.test(body.quartile)
        ? body.quartile.slice(0, 2) as 'Q1' | 'Q2' | 'Q3' | 'Q4'
        : undefined,
      access: body.access === 'Open Access' || body.access === 'Subscription' || body.access === 'Hybrid' ? body.access : undefined,
    });
    let rankedJournals = rankJournals(body.manuscriptText, filterResult.results, semanticProfile);
    let excludedForMissingData = filterResult.excludedForMissingData;
    if (maxBudget !== null) {
      const catalogMatches = rankedJournals.filter(({ journal }) => {
        return journal.apc !== null && journal.apc !== undefined && journal.apc <= maxBudget;
      });
      const unknownCandidates = rankedJournals
        .filter(({ journal }) => journal.apc === null || journal.apc === undefined)
        .slice(0, Math.max(20, 40 - catalogMatches.length));
      const enriched = await Promise.all(unknownCandidates.map(async ({ journal, profile, match }) => {
        const liveApc = await lookupLiveApc(journal.issn || journal.eissn, journal.submissionUrl);
        if (liveApc) {
          const liveDisplay = liveApc.amount == null ? null : `${liveApc.amount} ${liveApc.currency ?? ''}`.trim();
          return { journal: { ...journal, apc: parseApcInr(liveDisplay), apcDisplay: liveDisplay ?? journal.apcDisplay }, profile, match };
        }
        return { journal, profile, match };
      }));
      const verifiedLiveMatches = enriched.filter(({ journal }) => {
        return journal.apc !== null && journal.apc !== undefined && journal.apc <= maxBudget;
      });
      rankedJournals = [...catalogMatches, ...verifiedLiveMatches]
        .sort((left, right) => right.match.score - left.match.score || left.journal.name.localeCompare(right.journal.name));
      excludedForMissingData = [...excludedForMissingData, ...unknownCandidates
        .filter(({ journal }) => journal.apc === null || journal.apc === undefined)
        .map(({ journal }) => ({ journal, missingField: 'apc' as const }))];
    }

    const judgeResult = await judgeJournalCandidates(
      body.manuscriptText,
      rankedJournals.slice(0, 15).map(({ journal }) => ({ name: journal.name, field: journal.field, scope: journal.scope })),
    );
    const judgeByName = new Map(judgeResult.decisions.map((decision) => [decision.name, decision]));
    const judgedRanked = rankedJournals.map((entry) => {
      const decision = judgeByName.get(entry.journal.name);
      if (!decision) return { ...entry, judgeScore: null, judgeReasons: [], judgeExclusions: [] };
      const blendedScore = Math.round(entry.match.score * 0.4 + decision.relevanceScore * 0.6);
      return {
        ...entry,
        judgeScore: decision.relevanceScore,
        judgeReasons: decision.reasons,
        judgeExclusions: decision.exclusions,
        match: {
          ...entry.match,
          score: blendedScore,
          matchSource: 'ai-semantic' as const,
          reasons: [...entry.match.reasons, ...decision.reasons.map((reason) => `AI fit: ${reason}`)],
          warnings: [...entry.match.warnings, ...decision.exclusions.map((reason) => `AI exclusion: ${reason}`)],
        },
      };
    }).sort((left, right) => right.match.score - left.match.score || left.journal.name.localeCompare(right.journal.name));
    const aiAvailable = judgeResult.status === 'active' && judgeResult.decisions.length > 0;
    const deterministicMatches = rankedJournals
      .filter(({ match }) => match.score >= 45
        && Boolean(match.directEvidence)
        && Boolean(match.topicalEvidence)
        && !match.warnings.some((warning) => warning.includes('secondary topic')))
      .map((entry) => ({ ...entry, match: { ...entry.match, matchSource: 'deterministic-fallback' as const } }));
    const matches = (aiAvailable
      ? judgedRanked.filter(({ match, judgeScore, judgeExclusions }) => match.score >= 55 && (judgeScore ?? 0) >= 65 && Boolean(match.directEvidence) && judgeExclusions.length === 0)
      : deterministicMatches)
      .slice(0, 25)
      .map((entry) => ({
        ...entry,
        match: { ...entry.match, matchSource: aiAvailable ? 'ai-semantic' as const : 'deterministic-fallback' as const },
      }));
    return NextResponse.json({
      source: 'supabase',
      matches,
      semanticProfileUsed: Boolean(semanticProfile),
      semanticProfileStatus: semanticResult.status,
      semanticProfileProviderStatus: semanticResult.providerStatus,
      semanticJudgeStatus: judgeResult.status,
      semanticJudgeProviderStatus: judgeResult.providerStatus,
      fallbackUsed: !aiAvailable,
      diagnostics: {
        catalogRows: journals.length,
        filteredRows: filterResult.results.length,
        rankedRows: rankedJournals.length,
        deterministicRows: deterministicMatches.length,
        topRanked: rankedJournals.slice(0, 5).map(({ journal, match }) => ({
          name: journal.name,
          score: match.score,
          directEvidence: match.directEvidence,
          topicalEvidence: match.topicalEvidence,
          secondaryTopic: match.warnings.some((warning) => warning.includes('secondary topic')),
        })),
      },
      excludedCount: excludedForMissingData.length,
      excludedForMissingData: excludedForMissingData.map(({ journal, missingField }) => ({ journal: journal.name, missingField })),
    });
  } catch (error) {
    console.error('Journal match failed:', error);
    return NextResponse.json({ error: 'Unable to search the journal catalog.' }, { status: 500 });
  }
}
