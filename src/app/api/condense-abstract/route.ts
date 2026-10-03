import { NextResponse } from 'next/server';
import { anthropic } from '@/lib/claude';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export const maxDuration = 30;

type CondenseAbstractRequest = {
  abstractText?: unknown;
  wordLimit?: unknown;
  journalName?: unknown;
};

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

export async function POST(request: Request) {
  let body: CondenseAbstractRequest;

  try {
    body = (await request.json()) as CondenseAbstractRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in to use AI formatting fixes.' }, { status: 401 });
  }

  const { data: profile } = await supabase.from('profiles').select('plan, plan_expires_at').eq('id', user.id).single();
  const planActive = profile?.plan === 'pro' && (!profile.plan_expires_at || new Date(profile.plan_expires_at) > new Date());
  if (!planActive) {
    return NextResponse.json({ error: 'Upgrade to Pro to use AI formatting fixes.' }, { status: 403 });
  }

  const abstractText = typeof body.abstractText === 'string' ? body.abstractText.trim() : '';
  const wordLimit = typeof body.wordLimit === 'number' && body.wordLimit > 0 ? body.wordLimit : 250;
  const journalName = typeof body.journalName === 'string' ? body.journalName : 'the target journal';

  if (!abstractText) {
    return NextResponse.json({ error: 'Abstract text is required.' }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI condensing is not available right now.' }, { status: 503 });
  }

  const prompt = `You are an academic editor. Condense the following abstract to no more than ${wordLimit} words for submission to ${journalName}.
Preserve the objective, methods, all key quantitative results, and the conclusion. Do not invent any numbers, findings, or claims that are not already present in the text below. Do not add commentary, headings, or quotation marks - return ONLY the condensed abstract text itself.

Abstract:
${abstractText.slice(0, 6000)}`;

  try {
    const completion = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: Math.max(600, Math.ceil(wordLimit * 2.2)),
      temperature: 0.3,
      system: 'You are a precise academic editor. Output only the requested text, nothing else.',
      messages: [{ role: 'user', content: prompt }],
    }, { timeout: 25000 });

    const condensed = (completion.content?.[0]?.type === 'text' ? completion.content[0].text : '').trim().replace(/^["']|["']$/g, '');

    if (!condensed) {
      return NextResponse.json({ error: 'The AI did not return a condensed abstract. Try again.' }, { status: 502 });
    }

    return NextResponse.json({ condensed, wordCount: wordCount(condensed) });
  } catch (error) {
    if (error instanceof Error) {
      console.error('Abstract condensing failed:', error.message);
    }

    return NextResponse.json({ error: 'Condensing failed. Try again in a moment.' }, { status: 502 });
  }
}
