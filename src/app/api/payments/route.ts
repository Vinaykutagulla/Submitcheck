import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const planPricing = {
  pro: { amount: 29900, label: 'Author Pro', currency: 'INR' },
  manuscript: { amount: 49900, label: 'Per manuscript', currency: 'INR' },
} as const;

function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) return null;

  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

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

export async function POST(request: Request) {
  try {
    const body = await request.json() as { plan?: 'pro' | 'manuscript'; receipt?: string };
    const plan = body.plan === 'pro' || body.plan === 'manuscript' ? body.plan : 'pro';

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (!user && userError) {
      return NextResponse.json({ error: 'Please sign in to unlock Pro.' }, { status: 401 });
    }

    const client = getRazorpayClient();
    const pricing = planPricing[plan];

    if (!client) {
      if (user) {
        await supabase
          .from('profiles')
          .update({ plan: 'pro', plan_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() })
          .eq('id', user.id);
      }

      return NextResponse.json({
        demo: true,
        plan,
        message: 'Demo checkout approved. Razorpay keys are not configured yet.',
      });
    }

    const order = await client.orders.create({
      amount: pricing.amount,
      currency: pricing.currency,
      receipt: body.receipt || `${plan}-${Date.now()}`,
      notes: {
        plan,
        userId: user?.id ?? 'anonymous',
      },
    });

    return NextResponse.json({
      demo: false,
      order,
      plan,
      pricing: pricing.label,
    });
  } catch {
    return NextResponse.json({ error: 'Unable to create payment checkout.' }, { status: 500 });
  }
}
