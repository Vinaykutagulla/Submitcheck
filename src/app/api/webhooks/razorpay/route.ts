import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

type RazorpayWebhookPayload = {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        notes?: { plan?: string; user_id?: string; journal_name?: string };
      };
    };
  };
};

export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Webhook secret is not configured.' }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') ?? '';
  const expectedSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const matches = expectedSignature.length === signature.length
    && crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));

  if (!matches) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 });
  }

  const payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
  const paymentEntity = payload.payload?.payment?.entity;
  const userId = paymentEntity?.notes?.user_id;

  if (payload.event === 'payment.captured' && userId) {
    // The order's notes record which plan was actually purchased (set server-side in
    // /api/create-order, never client-controlled) - a journal unlock must not fall through to
    // granting a full Pro subscription just because this webhook is the server-to-server fallback
    // for the client-side verify-payment call.
    const journalName = paymentEntity?.notes?.journal_name;
    if (paymentEntity?.notes?.plan === 'journal' && journalName) {
      await supabaseAdmin
        .from('journal_unlocks')
        .upsert({ user_id: userId, journal_name: journalName, payment_id: paymentEntity?.id }, { onConflict: 'user_id,journal_name' });
    } else {
      await supabaseAdmin
        .from('profiles')
        .update({ plan: 'pro', plan_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() })
        .eq('id', userId);
    }
  }

  // payment.failed and events without a user_id (anonymous checkout) are acknowledged
  // but require no action here; the client-side verify-payment handler covers those.

  return NextResponse.json({ received: true });
}
