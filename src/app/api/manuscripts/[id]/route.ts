import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Please sign in to view this manuscript.' }, { status: 401 });
    }

    const { data: manuscript, error } = await supabase
      .from('manuscripts')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !manuscript) {
      return NextResponse.json({ error: 'Manuscript not found.' }, { status: 404 });
    }

    return NextResponse.json({ manuscript });
  } catch {
    return NextResponse.json({ error: 'Unable to load manuscript.' }, { status: 500 });
  }
}