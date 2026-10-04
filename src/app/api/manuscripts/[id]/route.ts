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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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
      return NextResponse.json({ error: 'Please sign in to update this manuscript.' }, { status: 401 });
    }

    const { data: manuscript, error } = await supabase
      .from('manuscripts')
      .update({
        title: body.title.trim(),
        raw_text: body.raw_text,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error || !manuscript) {
      return NextResponse.json({ error: 'Manuscript not found or could not be updated.' }, { status: 404 });
    }

    return NextResponse.json({ manuscript });
  } catch (error) {
    console.error('Unable to update manuscript:', error);
    return NextResponse.json({ error: 'Unable to update manuscript.' }, { status: 500 });
  }
}