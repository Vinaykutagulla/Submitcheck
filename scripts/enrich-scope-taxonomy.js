const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const batchSize = Number(process.env.SCOPE_ENRICH_BATCH || 100);

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before enriching scope taxonomy.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const aliasGroups = [
  {
    test: /analytical chemistry|pharmaceutical analysis|analytical method/i,
    terms: ['analytical chemistry', 'pharmaceutical analysis', 'liquid chromatography', 'HPLC', 'chromatography', 'analytical method development', 'method validation', 'analytical quality by design', 'AQbD', 'ICH Q14', 'design of experiments', 'method operable design region'],
  },
  {
    test: /chromatograph|liquid chromatography|HPLC/i,
    terms: ['liquid chromatography', 'HPLC', 'chromatography', 'retention time', 'method development', 'method validation'],
  },
  {
    test: /pharmacology|toxicology|pharmaceutics|drug delivery|medicinal chemistry/i,
    terms: ['pharmaceutical analysis', 'drug development', 'method validation', 'formulation', 'pharmaceutics'],
  },
  {
    test: /obstetric|gynecol|reproductive|maternity|midwifery|pregnancy|neonatal/i,
    terms: ['obstetrics', 'gynecology', 'pregnancy', 'childbirth', 'maternal health', 'neonatal health', 'clinical audit'],
  },
  {
    test: /computer science|artificial intelligence|machine learning|data science/i,
    terms: ['computer science', 'artificial intelligence', 'machine learning', 'data science', 'algorithms'],
  },
];

function enrichJournal(journal) {
  const generatedTerms = new Set(aliasGroups.flatMap((group) => group.terms.map((term) => term.toLowerCase())));
  const originalScope = (journal.scope || []).filter((term) => !generatedTerms.has(String(term).toLowerCase()));
  const originalSearch = [...generatedTerms].reduce((value, term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return value.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), ' ');
  }, String(journal.search_document || ''));
  const base = [journal.name, journal.field, ...(journal.subjects || []), ...originalScope].join(' ');
  const additions = aliasGroups.filter((group) => group.test.test(base)).flatMap((group) => group.terms);
  const scope = [...new Set([...originalScope, ...additions])];
  const searchDocument = `${originalSearch} ${scope.join(' ')}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return { scope, search_document: searchDocument };
}

async function main() {
  const { data: journals, error } = await supabase
    .from('journals')
    .select('id,name,field,subjects,scope,search_document')
    .eq('source_type', 'Journal')
    .order('name');
  if (error) throw error;

  let updated = 0;
  for (let offset = 0; offset < (journals || []).length; offset += batchSize) {
    const batch = (journals || []).slice(offset, offset + batchSize);
    for (const journal of batch) {
      const patch = enrichJournal(journal);
      const { error: updateError } = await supabase.from('journals').update(patch).eq('id', journal.id);
      if (updateError) throw updateError;
      updated += 1;
    }
    console.log(`Enriched ${Math.min(offset + batch.length, journals.length)} / ${journals.length}`);
  }
  console.log(`Scope taxonomy enrichment complete: ${updated} journals updated.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
