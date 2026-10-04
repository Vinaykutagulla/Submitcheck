import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      razorpay_order_id?: unknown;
      razorpay_payment_id?: unknown;
      razorpay_signature?: unknown;
    };
    const orderId = typeof body.razorpay_order_id === 'string' ? body.razorpay_order_id : '';
    const paymentId = typeof body.razorpay_payment_id === 'string' ? body.razorpay_payment_id : '';
    const signature = typeof body.razorpay_signature === 'string' ? body.razorpay_signature : '';
    const keyId = process.env.RAZORPAY_KEY_ID;
    const secret = process.env.RAZORPAY_KEY_SECRET;

    if (!orderId || !paymentId || !signature || !secret || !keyId) {
      return NextResponse.json({ error: 'Payment verification fields are required.' }, { status: 400 });
    }

    const expectedSignature = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
    const signatureMatches = expectedSignature.length === signature.length && crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
    if (!signatureMatches) {
      return NextResponse.json({ error: 'Payment signature mismatch.' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Please log in to verify your payment.' }, { status: 401 });
    }

    // The HMAC signature only proves this order/payment pair genuinely came from Razorpay - it
    // says nothing about which plan was purchased, for how much, or for whom. The previous version
    // trusted a client-supplied `plan`/`journalName` directly, which let anyone pay for the
    // cheapest plan (the Rs99 journal unlock) and then call this endpoint claiming `plan: "pro"` to
    // get a full subscription for a fraction of the price, or resubmit the same valid proof
    // repeatedly (with different journal names, or indefinitely over time) to stack unlimited
    // entitlements from a single real payment. Fetching the order back from Razorpay and reading
    // its own `notes` (set server-side in /api/create-order, never client-controlled) is the same
    // source of truth the Razorpay webhook already trusts - now applied consistently here too.
    const razorpay = new Razorpay({ key_id: keyId, key_secret: secret });
    const order = await razorpay.orders.fetch(orderId);

    if (order.status !== 'paid') {
      return NextResponse.json({ error: 'This order has not been paid yet.' }, { status: 400 });
    }

    const notes = (order.notes ?? {}) as Record<string, string | number>;
    const orderUserId = typeof notes.user_id === 'string' ? notes.user_id : '';
    if (orderUserId !== user.id) {
      return NextResponse.json({ error: 'This payment does not belong to the signed-in account.' }, { status: 403 });
    }

    const plan = notes.plan === 'manuscript' ? 'manuscript' : notes.plan === 'journal' ? 'journal' : 'pro';
    const journalName = typeof notes.journal_name === 'string' ? notes.journal_name.trim() : '';

    // Record the payment before granting anything, relying on the payments table's unique
    // provider_payment_id constraint to reject a second redemption of the same payment. Without
    // this, a valid signature/order/payment-id tuple could be resubmitted indefinitely (today, or
    // months from now) to keep re-granting a fresh 30-day Pro window, or to stack unlimited journal
    // unlocks, from a single real payment.
    const amount = typeof order.amount === 'number' ? order.amount : Number(order.amount) || 0;
    const { error: paymentInsertError } = await supabase.from('payments').insert({
      user_id: user.id,
      provider: 'razorpay',
      provider_payment_id: paymentId,
      amount,
      currency: order.currency,
      status: 'paid',
      plan,
      metadata: { order_id: orderId, journal_name: journalName || null },
    });

    if (paymentInsertError) {
      if (paymentInsertError.code === '23505') {
        return NextResponse.json({ error: 'This payment has already been processed.' }, { status: 409 });
      }
      throw paymentInsertError;
    }

    try {
      if (plan === 'journal' && journalName) {
        await supabase.from('journal_unlocks').upsert({ user_id: user.id, journal_name: journalName, payment_id: paymentId }, { onConflict: 'user_id,journal_name' });
      } else {
        await supabase.from('profiles').update({ plan: 'pro', plan_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }).eq('id', user.id);
      }
    } catch (grantError) {
      // The payment is already durably recorded (and cannot be redeemed again) even if this
      // specific entitlement write hiccups - log for manual reconciliation rather than silently
      // losing a paid-for upgrade.
      console.error('Payment recorded but entitlement grant failed:', grantError instanceof Error ? grantError.message : grantError);
    }

    return NextResponse.json({ verified: true, payment_id: paymentId, order_id: orderId, plan });
  } catch (error) {
    console.error('Payment verification failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Invalid payment verification request.' }, { status: 400 });
  }
}