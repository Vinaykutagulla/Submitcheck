import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const publicIndexes = ['Scopus', 'OpenAlex', 'PubMed', 'DOAJ'];

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ indexes: [] });

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const indexes = await Promise.all(publicIndexes.map(async (name) => {
      const { count, error } = await supabase
        .from('journal_indexings')
        .select('id', { count: 'exact', head: true })
        .eq('indexing_name', name);
      if (error) throw error;
      return { name, count: count ?? 0 };
    }));
    return NextResponse.json({ indexes });
  } catch {
    return NextResponse.json({ indexes: [] }, { status: 500 });
  }
}
