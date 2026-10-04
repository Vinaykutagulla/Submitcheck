import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bandForScore, confidenceForMatch, filterJournals, profileManuscript, rankJournals, topicFamilies, type MatchJournal } from '@/utils/decisionTreeMatcher';
import { lookupLiveApc } from '@/lib/journal-apc';
import { parseApcInr } from '@/lib/apc';
import { createSemanticProfile, judgeJournalCandidates } from '@/lib/semantic-profile';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const maxDuration = 60;

const fallbackJournals = [
  {
    id: 'fallback-journal-controlled-release',
    name: 'Journal of Controlled Release',
    publisher: 'Elsevier',
    field: 'Life Sciences',
    scope: ['drug delivery', 'formulation', 'nanomedicine'],
    indexed: ['Scopus', 'Web of Science', 'PubMed'],
    quartile: 'Q1',
    oa: false,
    apc: 400000,
    apcDisplay: '₹4,00,000',
    speed: '5 days',
    access: 'Subscription',
    requirements: { abstract: 'structured', wordLimit: 5000, refStyle: 'Numbered' },
  },
  {
    id: 'fallback-int-journal-of-pharmaceutics',
    name: 'International Journal of Pharmaceutics',
    publisher: 'Elsevier',
    field: 'Life Sciences',
    scope: ['pharmaceutics', 'drug delivery', 'formulation'],
    indexed: ['Scopus', 'Web of Science', 'PubMed'],
    quartile: 'Q1',
    oa: false,
    apc: 368000,
    apcDisplay: '₹3,68,000',
    speed: '4 days',
    access: 'Subscription',
    requirements: { abstract: 'structured', wordLimit: 5000, refStyle: 'Numbered' },
  },
  {
    id: 'fallback-pharmaceutics',
    name: 'Pharmaceutics',
    publisher: 'MDPI',
    field: 'Life Sciences',
    scope: ['pharmaceutics', 'drug delivery', 'formulation'],
    indexed: ['Scopus', 'Web of Science', 'DOAJ'],
    quartile: 'Q1',
    oa: true,
    apc: 165000,
    apcDisplay: '₹1,65,000',
    speed: '18 days',
    access: 'Open Access',
    requirements: { abstract: 'unstructured', wordLimit: 8000, refStyle: 'Numbered' },
  },
  {
    id: 'fallback-aaps-pharmscitech',
    name: 'AAPS PharmSciTech',
    publisher: 'Springer',
    field: 'Life Sciences',
    scope: ['pharmaceutical technology', 'formulation'],
    indexed: ['Scopus', 'Web of Science'],
    quartile: 'Q2',
    oa: false,
    apc: 185000,
    apcDisplay: '₹1,85,000',
    speed: '15 days',
    access: 'Subscription',
    requirements: { abstract: 'structured', wordLimit: 6000, refStyle: 'Numbered' },
  },
  {
    id: 'fallback-drug-delivery-translational',
    name: 'Drug Delivery and Translational Research',
    publisher: 'Springer',
    field: 'Life Sciences',
    scope: ['drug delivery', 'nanomedicine', 'translational research'],
    indexed: ['Scopus', 'Web of Science', 'PubMed'],
    quartile: 'Q2',
    oa: false,
    apc: 240000,
    apcDisplay: '₹2,40,000',
    speed: '18 days',
    access: 'Subscription',
    requirements: { abstract: 'structured', wordLimit: 5000, refStyle: 'Numbered' },
  },
  {
    id: 'fallback-ejpb',
    name: 'European Journal of Pharmaceutics and Biopharmaceutics',
    publisher: 'Elsevier',
    field: 'Life Sciences',
    scope: ['pharmaceutics', 'biopharmaceutics', 'drug delivery'],
    indexed: ['Scopus', 'Web of Science', 'PubMed'],
    quartile: 'Q1',
    oa: false,
    apc: 340000,
    apcDisplay: '₹3,40,000',
    speed: '8 days',
    access: 'Subscription',
    requirements: { abstract: 'structured', wordLimit: 5000, refStyle: 'Numbered' },
  },
  {
    id: 'fallback-molecular-pharmaceutics',
    name: 'Molecular Pharmaceutics',
    publisher: 'American Chemical Society',
    field: 'Life Sciences',
    scope: ['pharmaceutics', 'drug delivery', 'nanoparticles'],
    indexed: ['Scopus', 'Web of Science', 'PubMed'],
    quartile: 'Q1',
    oa: false,
    apc: 255000,
    apcDisplay: '₹2,55,000',
    speed: '14 days',
    access: 'Subscription',
    requirements: { abstract: 'structured', wordLimit: 5000, refStyle: 'Numbered' },
  },
  {
    id: 'fallback-journal-pharmaceutical-sciences',
    name: 'Journal of Pharmaceutical Sciences',
    publisher: 'Elsevier',
    field: 'Life Sciences',
    scope: ['pharmaceutical sciences', 'formulation'],
    indexed: ['Scopus', 'Web of Science', 'PubMed'],
    quartile: 'Q1',
    oa: false,
    apc: 300000,
    apcDisplay: '₹3,00,000',
    speed: '7 days',
    access: 'Subscription',
    requirements: { abstract: 'structured', wordLimit: 5500, refStyle: 'Numbered' },
  },
] as const;

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

function isAnySelection(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return ['', 'any', 'any field', 'any indexing', 'any quartile', 'all fields', 'all'].includes(normalized);
}

export async function POST(request: Request) {
  try {
    // This endpoint intentionally works without login (the free-tier Find Journals funnel), but
    // every call still triggers paid Anthropic calls (semantic profiling + AI judging) plus a
    // large catalog query - without this, an anonymous scripted caller could run up unbounded AI
    // cost with zero friction. A generous per-IP ceiling preserves normal use (a real author
    // trying several filter combinations) while stopping that.
    const clientIp = getClientIp(request);
    const rateLimit = await checkRateLimit(`journal-match:${clientIp}`, 20, 600);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many match requests from this connection. Please wait a bit and try again.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
      );
    }

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
    const supabase = getAdminClient();
    if (!supabase) {
      const semanticResult = await createSemanticProfile(body.manuscriptText);
      const semanticProfile = semanticResult.profile;
      const fallbackRanked = rankJournals(body.manuscriptText, fallbackJournals as unknown as MatchJournal[], semanticProfile);
      const matches = fallbackRanked
        .filter(({ match }) => match.band !== null && Boolean(match.directEvidence) && Boolean(match.topicalEvidence))
        .slice(0, 25)
        .map((entry) => ({
          ...entry,
          match: { ...entry.match, matchSource: 'deterministic-fallback' as const },
        }));

      return NextResponse.json({
        source: 'demo',
        matches,
        semanticProfileUsed: Boolean(semanticProfile),
        semanticProfileStatus: semanticResult.status,
        semanticProfileProviderStatus: semanticResult.providerStatus,
        semanticJudgeStatus: 'missing_key',
        fallbackUsed: true,
      });
    }
    const database = supabase;

    const indexingRelation = typeof body.indexing === 'string' && body.indexing !== 'Any indexing'
      ? 'journal_indexings!inner(indexing_name)'
      : 'journal_indexings(indexing_name)';

    const prioritizedTopics = [...manuscriptProfile.topics]
      .sort((left, right) => (manuscriptProfile.topicScores[right] ?? 0) - (manuscriptProfile.topicScores[left] ?? 0));
    const topicTerms = prioritizedTopics.flatMap((topic) => topicFamilies[topic]?.slice(0, 3) ?? []);
    const analyticalFallbackTerms = [
      'aqbd', 'analytical quality by design', 'ich q14', 'hplc', 'high performance liquid chromatography',
      'chromatography', 'chromatographic method', 'method validation', 'method development', 'pharmaceutical analysis'
    ];
    // Deliberately built from deterministic signals only (local topic-family keywords, no
    // Claude call) so the DB candidate search below can run concurrently with the semantic
    // profile request instead of waiting on it - the profile still fully informs ranking/judging
    // further down, and the unfiltered `broadQuery` already covers recall independent of these terms.
    const searchTerms = [...new Set([...prioritizedTopics, ...topicTerms, ...manuscriptProfile.keywords, ...analyticalFallbackTerms])]
      .map((term) => term.replace(/[^a-z0-9 -]/gi, '').trim())
      .filter((term) => term.length >= 3)
      .filter((term) => !['compounds', 'compound', 'positive', 'that', 'using', 'based', 'molecular', 'dynamics', 'network', 'simulation', 'research', 'analysis', 'article', 'review'].includes(term))
      .slice(0, 18);

    function buildQuery(withKeywordSearch: boolean, termPool: string[] = searchTerms) {
      let nextQuery = database
        .from('journals')
        .select(`id,source_record_id,name,issn,eissn,publisher,field,source_type,subjects,quartile,oa,apc_display,indexed,scope,asjc_codes,requirements,sponsored,sponsor_tier,submission_url,${indexingRelation}`)
        .eq('source_type', 'Journal')
        .limit(2000);

      if (typeof body.field === 'string' && !isAnySelection(body.field)) {
        nextQuery = nextQuery.contains('subjects', [body.field]);
      }
      if (typeof body.quartile === 'string' && !isAnySelection(body.quartile)) {
        const quartileRank = body.quartile.match(/^Q[1-4]/)?.[0];
        if (quartileRank) nextQuery = nextQuery.eq('quartile', quartileRank);
      }
      if (typeof body.indexing === 'string' && !isAnySelection(body.indexing)) {
        const indexingName = body.indexing === 'WoS' ? 'Web of Science' : body.indexing;
        nextQuery = nextQuery.eq('journal_indexings.indexing_name', indexingName);
      }
      if (withKeywordSearch && termPool.length) {
        nextQuery = nextQuery.or(termPool.map((term) => `search_document.ilike.%${term}%`).join(','));
      }
      return nextQuery;
    }

    // The semantic-profile Claude call and the DB candidate search were previously fully
    // serialized even though neither depends on the other's result - running them concurrently
    // removes the smaller of the two durations from the critical path entirely.
    const [semanticResult, keywordQuery, broadQuery] = await Promise.all([
      createSemanticProfile(body.manuscriptText),
      buildQuery(true, searchTerms),
      buildQuery(false),
    ]);
    const semanticProfile = semanticResult.profile;
    if (keywordQuery.error) throw keywordQuery.error;
    if (broadQuery.error) throw broadQuery.error;

    const shouldUseFallbackTerms = !keywordQuery.data?.length && !((typeof body.field === 'string' && !isAnySelection(body.field)) || (typeof body.indexing === 'string' && !isAnySelection(body.indexing)) || (typeof body.quartile === 'string' && !isAnySelection(body.quartile)));
    const fallbackQuery = shouldUseFallbackTerms ? await buildQuery(true, analyticalFallbackTerms) : null;
    if (fallbackQuery?.error) throw fallbackQuery.error;
    const fallbackData = fallbackQuery?.data ?? [];

    // Keyword search is useful for narrowing a large catalog, but it must not
    // decide which journals are eligible for ranking. Merge it with the
    // filtered catalog so relevant journals whose metadata uses different
    // wording are still considered.
    const candidateRows = [...(keywordQuery.data ?? []), ...fallbackData, ...(broadQuery.data ?? [])];
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
        scope: Array.isArray(row.subjects) && row.subjects.length ? row.subjects : (Array.isArray(row.scope) ? row.scope : []),
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
        .filter(({ journal }) => journal.apc === null || journal.apc === undefined);

      const enriched = await Promise.all(unknownCandidates.map(async (entry) => {
        const liveApc = await lookupLiveApc(entry.journal.issn || entry.journal.eissn, entry.journal.submissionUrl);
        if (!liveApc) return entry;
        const liveDisplay = liveApc.amount == null ? null : `${liveApc.amount} ${liveApc.currency ?? ''}`.trim();
        return {
          ...entry,
          journal: { ...entry.journal, apc: parseApcInr(liveDisplay), apcDisplay: liveDisplay ?? entry.journal.apcDisplay },
        };
      }));

      const pricedCandidates = [...catalogMatches, ...enriched]
        .sort((left, right) => right.match.score - left.match.score || left.journal.name.localeCompare(right.journal.name));

      rankedJournals = [...pricedCandidates, ...unknownCandidates]
        .filter((entry, index, array) => array.findIndex((candidate) => candidate.journal.name === entry.journal.name) === index)
        .sort((left, right) => right.match.score - left.match.score || left.journal.name.localeCompare(right.journal.name));

      excludedForMissingData = [...excludedForMissingData, ...unknownCandidates
        .filter(({ journal }) => journal.apc === null || journal.apc === undefined)
        .map(({ journal }) => ({ journal, missingField: 'apc' as const }))];
    }

    const judgeResult = await judgeJournalCandidates(
      body.manuscriptText,
      rankedJournals.slice(0, 20).map(({ journal }) => ({ name: journal.name, field: journal.field, scope: journal.scope })),
    );
    const judgeByName = new Map(judgeResult.decisions.map((decision) => [decision.name, decision]));
    // Keep each candidate's original deterministic `match` untouched and store the AI-blended
    // result separately in `aiMatch`. Previously this overwrote `match` in place with the blended
    // AI score, so when Claude's judge scored a genuinely good candidate low, its deterministic
    // band/evidence was destroyed too - making "fall back to deterministic matching" impossible for
    // exactly the candidates that mattered, since there was no original signal left to fall back to.
    const judgedRanked = rankedJournals.map((entry) => {
      const decision = judgeByName.get(entry.journal.name);
      if (!decision) return { ...entry, judgeScore: null, judgeReasons: [], judgeExclusions: [], aiMatch: null };
      const blendedScore = Math.round(entry.match.score * 0.4 + decision.relevanceScore * 0.6);
      const blendedBand = bandForScore(blendedScore);
      const blendedWarnings = [...entry.match.warnings, ...decision.exclusions.map((reason) => `AI exclusion: ${reason}`)];
      return {
        ...entry,
        judgeScore: decision.relevanceScore,
        judgeReasons: decision.reasons,
        judgeExclusions: decision.exclusions,
        aiMatch: {
          ...entry.match,
          score: blendedScore,
          band: blendedBand,
          confidence: confidenceForMatch(blendedBand, Boolean(entry.match.directEvidence), blendedWarnings.length),
          matchSource: 'ai-semantic' as const,
          reasons: [...entry.match.reasons, ...decision.reasons.map((reason) => `AI fit: ${reason}`)],
          warnings: blendedWarnings,
        },
      };
    }).sort((left, right) => {
      const leftScore = left.aiMatch?.score ?? left.match.score;
      const rightScore = right.aiMatch?.score ?? right.match.score;
      return rightScore - leftScore || left.journal.name.localeCompare(right.journal.name);
    });
    const aiAvailable = judgeResult.status === 'active' && judgeResult.decisions.length > 0;
    const matchesDeterministic = (entry: (typeof judgedRanked)[number]) => entry.match.band !== null
      && Boolean(entry.match.directEvidence)
      && Boolean(entry.match.topicalEvidence)
      && !entry.match.warnings.some((warning) => warning.includes('secondary topic'));
    const matchesAiJudged = (entry: (typeof judgedRanked)[number]) => entry.aiMatch !== null
      && entry.aiMatch.band !== null
      && (entry.judgeScore ?? 0) >= 45
      && Boolean(entry.aiMatch.directEvidence)
      && entry.judgeExclusions.length === 0;

    let matchSource: 'ai-semantic' | 'deterministic-fallback' = aiAvailable ? 'ai-semantic' : 'deterministic-fallback';
    let filteredJournals = judgedRanked.filter(aiAvailable ? matchesAiJudged : matchesDeterministic);
    // A successful AI judge call can still score every candidate below the cutoff (or flag one
    // exclusion reason, which disqualifies it outright) and legitimately return zero matches even
    // though the manuscript has real topical fits in the catalog. Rather than showing an empty
    // "no journals found" result, fall back to the deterministic topic/keyword filter so the user
    // always sees the broader matches that a working, just-overly-strict AI pass would have missed.
    if (aiAvailable && filteredJournals.length === 0) {
      matchSource = 'deterministic-fallback';
      filteredJournals = judgedRanked.filter(matchesDeterministic);
    }

    const matches = filteredJournals
      .sort((left, right) => {
        const leftScore = matchSource === 'ai-semantic' ? (left.aiMatch?.score ?? left.match.score) : left.match.score;
        const rightScore = matchSource === 'ai-semantic' ? (right.aiMatch?.score ?? right.match.score) : right.match.score;
        return rightScore - leftScore || left.journal.name.localeCompare(right.journal.name);
      })
      .slice(0, 25)
      .map((entry) => ({
        ...entry,
        match: matchSource === 'ai-semantic' && entry.aiMatch ? { ...entry.aiMatch, matchSource } : { ...entry.match, matchSource },
      }));
    return NextResponse.json({
      source: 'supabase',
      matches,
      semanticProfileUsed: Boolean(semanticProfile),
      semanticProfileStatus: semanticResult.status,
      semanticProfileProviderStatus: semanticResult.providerStatus,
      semanticJudgeStatus: judgeResult.status,
      semanticJudgeProviderStatus: judgeResult.providerStatus,
      fallbackUsed: matchSource === 'deterministic-fallback',
      fallbackReason: matchSource === 'deterministic-fallback' ? (aiAvailable ? 'ai_zero_matches' : 'ai_unavailable') : null,
      excludedCount: excludedForMissingData.length,
      excludedForMissingData: excludedForMissingData.map(({ journal, missingField }) => ({ journal: journal.name, missingField })),
    });
  } catch (error) {
    console.error('Journal match failed:', error);
    return NextResponse.json({ error: 'Unable to search the journal catalog.' }, { status: 500 });
  }
}
