import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const queryText = new URL(request.url).searchParams.get('q')?.trim();
  if (!queryText || queryText.length < 2) {
    return NextResponse.json({ journals: [] });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ journals: [] });

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const safeQuery = queryText.replace(/[,()]/g, ' ').trim();
    const { data, error } = await supabase
      .from('journals')
      .select('id,source_record_id,name,issn,eissn,publisher,field,subjects,quartile,oa,apc_display,indexed,submission_url,journal_indexings(indexing_name)')
      .or(`name.ilike.%${safeQuery}%,publisher.ilike.%${safeQuery}%,issn.ilike.%${safeQuery}%,eissn.ilike.%${safeQuery}%`)
      .order('name')
      .limit(10);

    if (error) throw error;

    const journals = (data ?? []).map((row) => ({
      id: row.source_record_id ?? row.id,
      name: row.name,
      issn: row.issn ?? null,
      eissn: row.eissn ?? null,
      publisher: row.publisher ?? 'Publisher not listed',
      field: row.field ?? 'Multidisciplinary',
      subjects: Array.isArray(row.subjects) ? row.subjects : [],
      quartile: row.quartile ?? 'Unranked',
      oa: Boolean(row.oa),
      apc: row.apc_display ?? null,
      indexed: Array.isArray(row.journal_indexings) && row.journal_indexings.length
        ? row.journal_indexings.map((item) => item.indexing_name)
        : (Array.isArray(row.indexed) ? row.indexed : []),
      submissionUrl: row.submission_url ?? null,
    }));

    return NextResponse.json({ journals });
  } catch {
    return NextResponse.json({ error: 'Unable to search the journal catalog.' }, { status: 500 });
  }
}
