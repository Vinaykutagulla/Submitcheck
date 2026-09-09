import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      razorpay_order_id?: unknown;
      razorpay_payment_id?: unknown;
      razorpay_signature?: unknown;
      plan?: unknown;
    };
    const orderId = typeof body.razorpay_order_id === 'string' ? body.razorpay_order_id : '';
    const paymentId = typeof body.razorpay_payment_id === 'string' ? body.razorpay_payment_id : '';
    const signature = typeof body.razorpay_signature === 'string' ? body.razorpay_signature : '';
    const secret = process.env.RAZORPAY_KEY_SECRET;

    if (!orderId || !paymentId || !signature || !secret) {
      return NextResponse.json({ error: 'Payment verification fields are required.' }, { status: 400 });
    }

    const expectedSignature = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
    const matches = expectedSignature.length === signature.length && crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
    if (!matches) {
      return NextResponse.json({ error: 'Payment signature mismatch.' }, { status: 400 });
    }

    const plan = body.plan === 'manuscript' ? 'manuscript' : 'pro';
    try {
      const supabase = await createSupabaseServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update({ plan: 'pro', plan_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }).eq('id', user.id);
      }
    } catch {
      // Signature verification remains successful even if profile persistence is unavailable.
    }

    return NextResponse.json({ verified: true, payment_id: paymentId, order_id: orderId, plan });
  } catch {
    return NextResponse.json({ error: 'Invalid payment verification request.' }, { status: 400 });
  }
}