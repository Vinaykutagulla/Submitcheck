import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ manuscripts: [] }, { status: 200 });
    }

    const { data, error } = await supabase
      .from('manuscripts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ manuscripts: data ?? [] });
  } catch {
    return NextResponse.json({ manuscripts: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { title?: unknown; raw_text?: unknown };

    if (typeof body.title !== 'string' || !body.title.trim()) {
      return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
    }

    if (typeof body.raw_text !== 'string' || body.raw_text.trim().length < 20) {
      return NextResponse.json({ error: 'Manuscript text is too short.' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Please sign in to save a manuscript.' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('manuscripts')
      .insert({
        user_id: user.id,
        title: body.title.trim(),
        raw_text: body.raw_text,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ manuscript: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unable to save manuscript.' }, { status: 500 });
  }
}
