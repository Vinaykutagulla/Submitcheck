import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email ?? '',
        fullName: typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '',
      },
    });
  } catch {
    return NextResponse.json({ user: null }, { status: 500 });
  }
}