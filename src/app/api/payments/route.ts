import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ plan: 'free' });
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('plan, plan_expires_at')
      .eq('id', user.id)
      .single();

    if (error) throw error;

    return NextResponse.json({
      plan: data?.plan ?? 'free',
      expiresAt: data?.plan_expires_at ?? null,
    });
  } catch {
    return NextResponse.json({ plan: 'free' });
  }
}
