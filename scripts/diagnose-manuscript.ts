/**
 * Reusable diagnostic for "why did manuscript X get no/wrong journal matches".
 *
 * Runs the SAME deterministic profiling + ranking logic the production API uses,
 * directly against the real Supabase catalog, without needing the AI layers or a
 * running dev server. This is fast (a few seconds) and free of Anthropic rate limits,
 * so it's the right first step whenever a real manuscript reports bad results.
 *
 * Usage:
 *   npm run diagnose -- "C:\path\to\manuscript.docx"
 *   npm run diagnose -- "C:\path\to\manuscript.txt"
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { profileManuscript, rankJournals, topicFamilies, type MatchJournal } from '../src/utils/decisionTreeMatcher';

function loadEnvLocal() {
  const envPath = resolve(__dirname, '..', '.env.local');
  const text = readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2];
  }
}

async function extractText(filePath: string): Promise<string> {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
  return readFileSync(filePath, 'utf8');
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npm run diagnose -- "C:\\path\\to\\manuscript.docx"');
    process.exit(1);
  }

  loadEnvLocal();
  const text = await extractText(filePath);
  const profile = profileManuscript(text);

  console.log('=== MANUSCRIPT PROFILE ===');
  console.log('field:', profile.field);
  console.log('articleType:', profile.articleType);
  console.log('topics (by score):', profile.topics.slice(0, 8).map((t) => `${t}:${profile.topicScores[t]}`).join(', '));
  console.log('keywords:', profile.keywords.slice(0, 15).join(', '));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.log('\nNo Supabase credentials in .env.local - stopping after profile (can\'t rank against the real catalog).');
    return;
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Supabase silently caps a plain query at ~1000 rows (of 31k+ in the catalog), so mirror
  // production's approach: union a keyword-filtered query with a broad unfiltered one.
  const prioritizedTopics = [...profile.topics].sort((a, b) => (profile.topicScores[b] ?? 0) - (profile.topicScores[a] ?? 0));
  const topicTerms = prioritizedTopics.flatMap((topic) => topicFamilies[topic]?.slice(0, 3) ?? []);
  const searchTerms = [...new Set([...prioritizedTopics, ...topicTerms, ...profile.keywords])]
    .map((term) => term.replace(/[^a-z0-9 -]/gi, '').trim())
    .filter((term) => term.length >= 3)
    .slice(0, 18);

  const selectColumns = 'id,source_record_id,name,publisher,field,subjects,quartile,oa,apc_display,indexed,scope,asjc_codes,requirements';
  const [broadResult, keywordResult] = await Promise.all([
    supabase.from('journals').select(selectColumns).eq('source_type', 'Journal').limit(1000),
    searchTerms.length
      ? supabase.from('journals').select(selectColumns).eq('source_type', 'Journal').or(searchTerms.map((term) => `search_document.ilike.%${term}%`).join(',')).limit(1000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (broadResult.error) {
    console.error('Supabase query failed:', broadResult.error.message);
    return;
  }
  const rowsById = new Map<string, Record<string, unknown>>();
  for (const row of [...(broadResult.data ?? []), ...(keywordResult.data ?? [])]) {
    rowsById.set(String((row as { id: string }).id), row as Record<string, unknown>);
  }
  const rows = [...rowsById.values()] as Array<{ name: string; publisher: string | null; field: string | null; subjects: string[] | null; scope: string[] | null; asjc_codes: string[] | null; quartile: string | null; requirements: unknown }>;

  const journals: MatchJournal[] = (rows ?? []).map((row) => ({
    name: row.name,
    publisher: row.publisher ?? undefined,
    field: row.field ?? 'Multidisciplinary',
    scope: Array.isArray(row.subjects) && row.subjects.length ? row.subjects : (Array.isArray(row.scope) ? row.scope : []),
    asjcCodes: Array.isArray(row.asjc_codes) ? row.asjc_codes : [],
    quartile: /^Q[1-4]$/.test(row.quartile ?? '') ? (row.quartile as MatchJournal['quartile']) : undefined,
    requirements: {
      abstract: (row.requirements as { abstract?: { type?: string } } | null)?.abstract?.type === 'structured' ? 'structured' : 'unstructured',
      wordLimit: null,
      refStyle: 'Numbered',
    },
  }));

  console.log(`\n=== CATALOG === ${journals.length} journals loaded`);

  const ranked = rankJournals(text, journals, null);

  console.log('\n=== TOP 25 RANKED (deterministic only, no AI) ===');
  ranked.slice(0, 25).forEach((entry, index) => {
    console.log(`${index + 1}. ${entry.journal.name} | score=${entry.match.score} | band=${entry.match.band ?? 'none'}`);
    if (entry.match.warnings.length) console.log(`   ! ${entry.match.warnings.join(' | ')}`);
  });

  const strongCount = ranked.filter((e) => e.match.band === 'Strong match').length;
  const possibleCount = ranked.filter((e) => e.match.band === 'Possible match').length;
  const top10MaxScore = Math.max(0, ...ranked.slice(0, 10).map((e) => e.match.score));
  console.log(`\n=== SUMMARY === strong=${strongCount} possible=${possibleCount} top10MaxScore=${top10MaxScore}`);
  if (top10MaxScore < 40) {
    console.log('WARNING: even the best-ranked candidates are weak. This usually means a topicFamilies/fieldSignals gap for this subject area - check whether the manuscript\'s core vocabulary is represented in src/utils/decisionTreeMatcher.ts.');
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
