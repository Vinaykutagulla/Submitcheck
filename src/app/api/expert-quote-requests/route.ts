import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const required = ['serviceType', 'topic', 'requirements', 'whatsapp', 'email', 'contactMethod', 'words', 'deadline', 'quoteAmount', 'timeline'];
    if (required.some((field) => typeof body[field] !== 'string' || !String(body[field]).trim())) {
      return NextResponse.json({ error: 'Please complete all quote request fields.' }, { status: 400 });
    }

    const supabase = getAdminClient();
    if (!supabase) return NextResponse.json({ error: 'Quote storage is not configured yet.' }, { status: 503 });

    const { data, error } = await supabase.from('expert_quote_requests').insert({
      service_type: String(body.serviceType),
      topic: String(body.topic).trim(),
      word_count: Number(body.words) || 5000,
      deadline: String(body.deadline),
      requirements: String(body.requirements).trim(),
      whatsapp: String(body.whatsapp).trim(),
      email: String(body.email).trim().toLowerCase(),
      contact_method: String(body.contactMethod),
      indicative_quote: String(body.quoteAmount),
      estimated_timeline: String(body.timeline),
      status: 'new',
    }).select('id').single();

    if (error) throw error;
    return NextResponse.json({ requestId: data.id }, { status: 201 });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'PGRST205') {
      return NextResponse.json({ error: 'Expert quote table is not configured. Run the expert_quote_requests SQL in Supabase.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Unable to save the quote request.' }, { status: 500 });
  }
}
