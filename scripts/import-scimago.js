const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const workbookPath = process.argv[2];
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!workbookPath || !fs.existsSync(workbookPath)) {
  throw new Error('Usage: node scripts/import-scimago.js <scimago-export.csv|xlsx>');
}
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before importing.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const workbook = XLSX.readFile(path.resolve(workbookPath), { cellDates: false });
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });

function value(row, ...names) {
  const key = Object.keys(row).find((candidate) => names.some((name) => candidate.trim().toLowerCase() === name.toLowerCase()));
  return key ? String(row[key]).trim() : '';
}

function normalizeIssns(raw) {
  return raw.split(/[;,\s]+/).map((value) => {
    const digits = value.replace(/[^0-9Xx]/g, '').toUpperCase();
    return digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : '';
  }).filter(Boolean);
}

function normalizeQuartile(raw) {
  const match = raw.toUpperCase().match(/Q([1-4])/);
  return match ? `Q${match[1]}` : '';
}

function normalizeApc(raw) {
  if (!raw) return '';
  const match = raw.match(/(₹|Rs\.?|INR|USD|\$|EUR|€|GBP|£)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  return match ? `${match[1] ? `${match[1]} ` : ''}${match[2]}` : '';
}

async function main() {
  const { data: catalog, error: catalogError } = await supabase.from('journals').select('id,name,issn,eissn');
  if (catalogError) throw catalogError;
  const byIssn = new Map();
  const byName = new Map();
  for (const journal of catalog ?? []) {
    for (const rawIssn of [journal.issn, journal.eissn]) {
      for (const normalized of normalizeIssns(String(rawIssn || ''))) byIssn.set(normalized, journal);
    }
    byName.set(String(journal.name || '').toLowerCase(), journal);
  }

  let updated = 0;
  let skipped = 0;
  const updates = new Map();
  const inserts = new Map();

  for (const row of rows) {
    const issns = normalizeIssns(value(row, 'ISSN', 'Issn', 'EISSN', 'Print ISSN', 'Electronic ISSN'));
    const name = value(row, 'Title', 'Journal title', 'Source title', 'Journal');
    const quartile = normalizeQuartile(value(row, 'SJR Best Quartile', 'Best Quartile', 'Quartile', 'Quartiles'));
    const explicitApc = normalizeApc(value(row, 'APC', 'Article Processing Charge', 'Publication Fee', 'Open Access Fee'));
    const apc = explicitApc || (/^(yes|true)$/i.test(value(row, 'Open Access Diamond', 'Diamond OA')) ? '0 INR' : '');
    if ((!issns.length && !name) || (!quartile && !apc)) {
      skipped += 1;
      continue;
    }

    const journal = issns.map((issn) => byIssn.get(issn)).find(Boolean) || byName.get(name.toLowerCase());
    if (!journal) {
      const sourceRecordId = value(row, 'Sourceid', 'Source ID', 'Sourcerecord ID');
      if (!sourceRecordId || !name) {
        skipped += 1;
        continue;
      }
      const subjects = value(row, 'Areas', 'Categories').split(';').map((item) => item.replace(/\s*\(Q[1-4]\)/gi, '').trim()).filter(Boolean);
      inserts.set(sourceRecordId, {
        source_record_id: sourceRecordId,
        name,
        issn: issns[0] || null,
        eissn: issns[1] || null,
        publisher: value(row, 'Publisher'),
        field: subjects[0] || 'Multidisciplinary',
        source_type: 'Journal',
        subjects,
        quartile: quartile || 'Unranked',
        oa: /^(yes|true)$/i.test(value(row, 'Open Access')),
        apc_display: apc || null,
        turnaround_days: null,
        indexed: ['Scopus'],
        scope: [],
        asjc_codes: [],
        requirements: { abstract: { type: 'unstructured' }, wordLimit: null, refStyle: 'Numbered' },
        search_document: [name, value(row, 'Publisher'), subjects.join(' '), 'Scopus'].filter(Boolean).join(' ').toLowerCase(),
        sponsored: false,
        sponsor_tier: null,
        submission_url: null,
      });
      continue;
    }

    const patch = {};
    if (quartile) patch.quartile = quartile;
    if (apc) patch.apc_display = apc;
    const website = value(row, 'Website', 'Journal URL', 'URL', 'Source URL');
    if (website) patch.submission_url = website;
    updates.set(journal.id, { id: journal.id, ...patch });
  }

  const insertRows = [...inserts.values()];
  for (let offset = 0; offset < insertRows.length; offset += 500) {
    const batch = insertRows.slice(offset, offset + 500);
    const result = await supabase.from('journals').upsert(batch, { onConflict: 'source_record_id' });
    if (result.error) throw result.error;
    console.log(`Inserted ${Math.min(offset + batch.length, insertRows.length)}/${insertRows.length}`);
  }

  const updateRows = [...updates.values()];
  for (let offset = 0; offset < updateRows.length; offset += 100) {
    const batch = updateRows.slice(offset, offset + 100);
    await Promise.all(batch.map(async (patch) => {
      const { id, ...values } = patch;
      const result = await supabase.from('journals').update(values).eq('id', id);
      if (result.error) throw result.error;
    }));
    updated += batch.length;
    console.log(`Updated ${updated}/${updateRows.length}`);
  }

  console.log(`SCImago import complete: ${updated} updated, ${insertRows.length} inserted, ${skipped} skipped.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});