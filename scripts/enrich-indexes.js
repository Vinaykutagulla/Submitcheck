const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const limit = Number(process.env.INDEX_ENRICH_LIMIT || process.argv[2] || 100);
const offset = Number(process.env.INDEX_ENRICH_OFFSET || process.argv[3] || 0);
const delayMs = Number(process.env.INDEX_ENRICH_DELAY_MS || 120);

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before enriching indexes.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeIssn(value) {
  const digits = String(value || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  return digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : null;
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'SubmitCheck/1.0 journal index enrichment', ...headers },
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) return null;
  return response.json();
}

async function findOpenAlex(issn) {
  const record = await fetchJson(`https://api.openalex.org/sources/issn:${encodeURIComponent(issn)}`);
  if (!record) return [];
  const names = new Set(['OpenAlex']);
  if (record.is_in_doaj) names.add('DOAJ');
  return [...names];
}

async function findDoaj(issn) {
  const record = await fetchJson(`https://doaj.org/api/search/journals/issn:${encodeURIComponent(issn)}`);
  return record?.results?.length ? ['DOAJ'] : [];
}

async function findPubMed(issn) {
  const result = await fetchJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=nlmcatalog&retmode=json&term=${encodeURIComponent(`${issn}[issn]`)}`);
  return Number(result?.esearchresult?.count) > 0 ? ['PubMed'] : [];
}

async function enrichJournal(journal) {
  const issn = normalizeIssn(journal.issn) || normalizeIssn(journal.eissn);
  if (!issn) return { name: journal.name, indexes: [] };

  const indexSets = await Promise.allSettled([
    findOpenAlex(issn),
    findDoaj(issn),
    findPubMed(issn),
  ]);
  const indexes = [...new Set(indexSets.filter((result) => result.status === 'fulfilled').flatMap((result) => result.value))];
  const rows = indexes.map((indexingName) => ({
    journal_id: journal.id,
    indexing_name: indexingName,
    is_primary: false,
    source: 'public_api_enrichment',
  }));

  if (rows.length) {
    const { error } = await supabase
      .from('journal_indexings')
      .upsert(rows, { onConflict: 'journal_id,indexing_name' });
    if (error) throw error;
  }

  return { name: journal.name, indexes };
}

async function main() {
  const { data: journals, error } = await supabase
    .from('journals')
    .select('id,name,issn,eissn')
    .eq('source_type', 'Journal')
    .not('issn', 'is', null)
    .order('name')
    .range(offset, offset + limit - 1);

  if (error) throw error;

  let enriched = 0;
  for (const journal of journals ?? []) {
    const result = await enrichJournal(journal);
    enriched += result.indexes.length ? 1 : 0;
    console.log(`${enriched}/${journals.length}: ${result.name} -> ${result.indexes.join(', ') || 'no public index match'}`);
    await sleep(delayMs);
  }

  console.log(`Index enrichment complete for ${journals?.length ?? 0} journals starting at offset ${offset}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
