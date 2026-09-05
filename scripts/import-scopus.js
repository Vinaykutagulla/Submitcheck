const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const workbookPath = process.argv[2] || 'C:/Users/lenovo/Downloads/ext_list_Jul_2026.xlsx';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!fs.existsSync(workbookPath)) {
  throw new Error(`Workbook not found: ${workbookPath}`);
}

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before importing.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const workbook = XLSX.readFile(path.resolve(workbookPath), { cellDates: false });
const sheet = workbook.Sheets['Scopus Sources Jul. 2026'];

if (!sheet) {
  throw new Error('Primary sheet "Scopus Sources Jul. 2026" was not found.');
}

const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
const normalizeHeader = (value) => String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\s+/g, ' ').trim();
const getColumnValue = (row, header) => {
  const matchingKey = Object.keys(row).find((key) => normalizeHeader(key) === normalizeHeader(header));
  return matchingKey ? row[matchingKey] : '';
};
const subjectFields = [
  '1000 General', '1100 Agricultural and Biological Sciences', '1200 Arts and Humanities',
  '1300 Biochemistry, Genetics and Molecular Biology', '1400 Business, Management and Accounting',
  '1500 Chemical Engineering', '1600 Chemistry', '1700 Computer Science', '1800 Decision Sciences',
  '1900 Earth and Planetary Sciences', '2000 Economics, Econometrics and Finance', '2100 Energy',
  '2200 Engineering', '2300 Environmental Science', '2400 Immunology and Microbiology', '2500 Materials Science',
  '2600 Mathematics', '2700 Medicine', '2800 Neuroscience', '2900 Nursing',
  '3000 Pharmacology, Toxicology and Pharmaceutics', '3100 Physics and Astronomy', '3200 Psychology',
  '3300 Social Sciences', '3400 Veterinary', '3500 Dentistry', '3600 Health Professions'
];

const activeJournals = rows
  .filter((row) => String(row['Active or Inactive']).trim().toLowerCase() === 'active')
  .filter((row) => String(row['Source Type']).trim().toLowerCase() === 'journal')
  .map((row) => {
    const asjcCodes = String(row['All Science Journal Classification Codes (ASJC)'] || '')
      .split(';')
      .map((code) => code.trim())
      .filter(Boolean);

    const topLevelFields = ['Life Sciences', 'Social Sciences', 'Physical Sciences', 'Health Sciences']
      .filter((field) => String(getColumnValue(row, `Top level: ${field}`) || '').trim());

    const subjects = subjectFields
      .filter((fieldName) => String(getColumnValue(row, fieldName) || '').trim())
      .map((fieldName) => fieldName.replace(/^\d+\s*/, '').replace(/\n/g, ' ').trim());

    const normalizedSubjects = [...new Set(subjects.filter(Boolean))];

    return {
      source_record_id: String(row['Sourcerecord ID']).trim(),
      name: String(row['Source Title']).trim(),
      issn: String(row.ISSN || '').trim() || null,
      eissn: String(row.EISSN || '').trim() || null,
      publisher: String(row.Publisher || '').trim() || null,
      field: normalizedSubjects[0] || topLevelFields[0] || 'Multidisciplinary',
      source_type: String(row['Source Type']).trim() || null,
      subjects: normalizedSubjects,
      quartile: 'Unranked',
      oa: Boolean(String(row['Open Access Status'] || '').trim()),
      indexed: ['Scopus'],
      scope: topLevelFields,
      asjc_codes: asjcCodes,
      requirements: {
        abstract: { type: 'unstructured' },
        wordLimit: null,
        refStyle: 'Numbered',
      },
      search_document: [
        row['Source Title'],
        row.Publisher,
        normalizedSubjects.join(' '),
        topLevelFields.join(' '),
        'Scopus',
      ].filter(Boolean).join(' ').toLowerCase(),
    };
  })
  .filter((journal) => journal.source_record_id && journal.name);

async function upsertIndexingSource(name) {
  const { data, error } = await supabase
    .from('indexing_sources')
    .upsert({ name }, { onConflict: 'name' })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

async function upsertJournalRelations(insertedJournals, journalBySourceId) {
  const subjectRows = [];
  const indexingRows = [];
  const requirementRows = [];
  const indexingNames = new Set();

  for (const insertedJournal of insertedJournals) {
    const journal = journalBySourceId.get(insertedJournal.source_record_id);
    if (!journal) continue;

    for (const subject of journal.subjects || []) {
      subjectRows.push({ journal_id: insertedJournal.id, subject });
    }

    for (const indexingName of journal.indexed || ['Scopus']) {
      indexingNames.add(indexingName);
    }

    requirementRows.push({
      journal_id: insertedJournal.id,
      abstract_type: 'unstructured',
      word_limit: null,
      ref_style: 'Numbered',
      novelty_required: false,
      limitations_required: false,
    });
  }

  const indexingIds = new Map();
  for (const indexingName of indexingNames) {
    indexingIds.set(indexingName, await upsertIndexingSource(indexingName));
  }

  for (const insertedJournal of insertedJournals) {
    const journal = journalBySourceId.get(insertedJournal.source_record_id);
    if (!journal) continue;

    for (const indexingName of journal.indexed || ['Scopus']) {
      indexingRows.push({
        journal_id: insertedJournal.id,
        indexing_source_id: indexingIds.get(indexingName),
        indexing_name: indexingName,
        is_primary: indexingName === 'Scopus',
        source: 'scopus_import',
      });
    }
  }

  if (subjectRows.length) {
    const { error } = await supabase.from('journal_subjects').upsert(subjectRows, { onConflict: 'journal_id,subject' });
    if (error) throw error;
  }

  if (indexingRows.length) {
    const { error } = await supabase.from('journal_indexings').upsert(indexingRows, { onConflict: 'journal_id,indexing_name' });
    if (error) throw error;
  }

  if (requirementRows.length) {
    const { error } = await supabase.from('journal_requirements').upsert(requirementRows, { onConflict: 'journal_id' });
    if (error) throw error;
  }
}

async function main() {
  console.log(`Importing ${activeJournals.length} active journals from ${path.basename(workbookPath)}...`);

  for (let offset = 0; offset < activeJournals.length; offset += 500) {
    const batch = activeJournals.slice(offset, offset + 500);

    const journalPayload = batch.map((journal) => ({
      source_record_id: journal.source_record_id,
      name: journal.name,
      issn: journal.issn,
      eissn: journal.eissn,
      publisher: journal.publisher,
      field: journal.field,
      source_type: journal.source_type,
      subjects: journal.subjects,
      quartile: journal.quartile,
      oa: journal.oa,
      apc_display: null,
      turnaround_days: null,
      indexed: journal.indexed,
      scope: journal.scope,
      asjc_codes: journal.asjc_codes,
      requirements: journal.requirements,
      search_document: journal.search_document,
      sponsored: false,
      sponsor_tier: null,
      submission_url: null,
    }));

    const { data: insertedJournals, error } = await supabase
      .from('journals')
      .upsert(journalPayload, { onConflict: 'source_record_id' })
      .select('id, source_record_id, subjects');

    if (error) throw error;

    const journalBySourceId = new Map(batch.map((journal) => [journal.source_record_id, journal]));
    await upsertJournalRelations(insertedJournals ?? [], journalBySourceId);

    console.log(`Imported ${Math.min(offset + batch.length, activeJournals.length)} / ${activeJournals.length}`);
  }

  console.log('Scopus journal import complete.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});