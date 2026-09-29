import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const planPricing = {
  pro: { amount: 29900, currency: 'INR' },
  manuscript: { amount: 49900, currency: 'INR' },
} as const;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { plan?: keyof typeof planPricing; amount?: unknown; currency?: unknown; receipt?: unknown };
    const plan = body.plan === 'pro' || body.plan === 'manuscript' ? body.plan : 'pro';
    const pricing = planPricing[plan];
    const amount = typeof body.amount === 'number' ? body.amount : pricing.amount;
    const currency = typeof body.currency === 'string' ? body.currency : pricing.currency;

    if (!Number.isInteger(amount) || amount < 100) {
      return NextResponse.json({ error: 'Amount must be at least 100 paise.' }, { status: 400 });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return NextResponse.json({ error: 'Razorpay is not configured.' }, { status: 500 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Please log in before paying, so your plan is saved to your account.' }, { status: 401 });
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await razorpay.orders.create({
      amount,
      currency,
      receipt: typeof body.receipt === 'string' ? body.receipt : `submitcheck-${plan}-${Date.now()}`,
      notes: { plan, user_id: user.id },
    });

    return NextResponse.json({ order_id: order.id, amount: order.amount, currency: order.currency, key_id: keyId, plan });
  } catch (error) {
    const status = error instanceof Error && /authentication|unauthorized/i.test(error.message) ? 401 : 500;
    return NextResponse.json({ error: 'Unable to create Razorpay order.' }, { status });
  }
}