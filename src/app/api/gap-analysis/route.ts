import { NextResponse } from 'next/server';
import { anthropic } from '@/lib/claude';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export const maxDuration = 60;

type GapAnalysisRequest = {
  manuscriptText?: unknown;
  journalName?: unknown;
  journalField?: unknown;
  articleType?: unknown;
  journalRequirements?: unknown;
};

export async function POST(request: Request) {
  const routeStart = Date.now();
  let body: GapAnalysisRequest;

  try {
    body = (await request.json()) as GapAnalysisRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in to use AI gap analysis.' }, { status: 401 });
  }

  const { data: profile } = await supabase.from('profiles').select('plan, plan_expires_at').eq('id', user.id).single();
  const planActive = profile?.plan === 'pro' && (!profile.plan_expires_at || new Date(profile.plan_expires_at) > new Date());
  if (!planActive) {
    return NextResponse.json({ error: 'Upgrade to Pro to use AI gap analysis.' }, { status: 403 });
  }

  const manuscriptText = typeof body.manuscriptText === 'string' ? body.manuscriptText : '';
  const journalName = typeof body.journalName === 'string' ? body.journalName : 'target journal';
  const journalField = typeof body.journalField === 'string' ? body.journalField : 'general research';
  const articleType = typeof body.articleType === 'string' ? body.articleType : 'research';
  const journalRequirements = body.journalRequirements && typeof body.journalRequirements === 'object'
    ? JSON.stringify(body.journalRequirements)
    : '{}';

  try {

    if (!manuscriptText.trim()) {
      return NextResponse.json({ error: 'Manuscript text is required.' }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        usesFallback: true,
        gaps: heuristicallyGenerateGaps(manuscriptText, journalName, journalField),
      });
    }

    const prompt = `
You are an academic editorial reviewer.
Return only valid JSON with an array called "gaps".
Each item must contain:
- id: short string
- priority: "critical" or "important"
- icon: "❌" or "🟡"
- location: section name or "whole manuscript"
- evidence: short exact quote or precise description of what is present/missing
- title: a specific issue tied to this manuscript section
- description: explain what the manuscript currently says or omits, why it conflicts with the target journal, and what to change
- example: replacement-ready wording, structure, or concrete edit; never use a generic placeholder like "add more detail"

Goal: identify missing or weak manuscript elements for the journal ${journalName} in ${journalField}.
Manuscript type: ${articleType}

Target journal requirements (treat these as constraints):
${journalRequirements}

Manuscript text (read the complete supplied text; references are included only when checking citation and reference quality):
${manuscriptText.slice(0, 90000)}

Read the manuscript closely before answering. First identify its actual study design, biological material or dataset, methods, controls, primary outcomes, statistics, limitations, and main claim. Then compare those details against the target journal scope and requirements. Identify exact sections or phrases when possible. Do not return generic checks such as "improve clarity" or "add more detail". Every fix must name the manuscript section, cite a short exact phrase or state that a required item is absent, explain the publication risk for this journal, and give a concrete replacement paragraph, sentence, table, or analysis request. Prioritize issues that could cause editorial rejection, then scientific reporting gaps, then journal-format mismatches. Return at most 6 high-value fixes.

Also return "sentenceSuggestions": an array of at most 5 sentences from THIS manuscript that are long, unclear, passive, or wordy. Only pick sentences from the actual prose (Abstract, Introduction, Methods, Results, Discussion, Conclusion) - never the title, author list, or affiliations block. For each, copy the "sentence" field EXACTLY character-for-character as it appears in the manuscript text above (so it can be located by exact string match - do not paraphrase or normalize whitespace), write a "suggestion" with a genuinely improved rewrite of that same sentence, and a short "reason" (e.g. "Long sentence - split for readability", "Passive voice", "Wordy phrasing"). Only include sentences that truly need improvement; return fewer than 5 if the writing is already clear. Never invent a sentence that is not verbatim present in the manuscript text.
`;

    // maxDuration on this route is 60s - this budget is measured from routeStart (set at the very
    // top of POST, before the auth/Supabase checks) and leaves a large safety margin so a retry can
    // NEVER push the function into Vercel's hard platform timeout (which returns a non-JSON 504 that
    // bypasses our own try/catch fallback entirely - confirmed in production, see repo memory).
    // Now that the SDK's hidden retry multiplication is disabled (maxRetries: 0 in claude.ts),
    // these numbers are an accurate ceiling - no more 3x surprise multiplier. Dense, long
    // manuscripts with this prompt's verbatim-sentence-reproduction requirement can genuinely
    // take Claude 30-45s to generate, so attempt 1 gets most of the budget; the retry is mainly a
    // safety net for a fast-completing-but-malformed-JSON response, not for genuine slowness.
    const overallBudgetMs = 50000;
    const firstAttemptTimeoutMs = 45000;
    const minRemainingToRetry = 10000;

    const callAndParse = async (timeoutMs: number) => {
      const completion = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 6000,
        temperature: 0.3,
        system: 'You are a strict academic editor helping plan manuscript revisions. Output valid JSON only.',
        messages: [{ role: 'user', content: prompt }],
      }, { timeout: timeoutMs });
      const content = completion.content?.[0]?.type === 'text' ? completion.content[0].text : '';
      const parsed = safeJsonParse(content);
      const parsedOk = Boolean(parsed) && Array.isArray(parsed.gaps) && parsed.gaps.length > 0;
      return { parsed, parsedOk, stopReason: completion.stop_reason, contentLength: content.length };
    };

    let attempt = await callAndParse(firstAttemptTimeoutMs);
    if (!attempt.parsedOk) {
      console.error('Gap analysis JSON did not parse on attempt 1. stop_reason:', attempt.stopReason, 'length:', attempt.contentLength);
      const remaining = overallBudgetMs - (Date.now() - routeStart);
      if (remaining >= minRemainingToRetry) {
        attempt = await callAndParse(remaining);
        if (!attempt.parsedOk) {
          console.error('Gap analysis JSON did not parse on retry. stop_reason:', attempt.stopReason, 'length:', attempt.contentLength);
        }
      }
    }

    const { parsed, parsedOk } = attempt;
    // Track whether Claude's JSON actually parsed so `usesFallback` reflects reality instead of
    // silently reporting success while gaps/sentenceSuggestions quietly used the local heuristic.
    const gaps = parsedOk ? parsed.gaps : heuristicallyGenerateGaps(manuscriptText, journalName, journalField);
    const sentenceSuggestions = Array.isArray(parsed?.sentenceSuggestions)
      ? parsed.sentenceSuggestions.filter((item: unknown): item is { sentence: string; suggestion: string; reason: string } =>
          Boolean(item) && typeof item === 'object'
          && typeof (item as { sentence?: unknown }).sentence === 'string'
          && typeof (item as { suggestion?: unknown }).suggestion === 'string'
          && manuscriptText.includes((item as { sentence: string }).sentence))
        .slice(0, 5)
      : [];

    return NextResponse.json({ usesFallback: !parsedOk, gaps, sentenceSuggestions });
  } catch (error) {
    if (error instanceof Error) {
      console.error('Claude gap analysis failed:', error.message);
    }

    return NextResponse.json({
      usesFallback: true,
      gaps: heuristicallyGenerateGaps(
        manuscriptText,
        journalName,
        journalField,
      ),
    });
  }
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value.replace(/```json|```/gi, '').trim());
  } catch {
    return null;
  }
}

function heuristicallyGenerateGaps(
  manuscriptText: string,
  journalName: string,
  journalField: string,
) {
  const text = manuscriptText.replace(/\r\n?/g, '\n');
  const lower = text.toLowerCase();
  const gaps = [] as Array<{ id: string; priority: 'critical' | 'important'; icon: '❌' | '🟡'; location: string; evidence: string; title: string; description: string; example: string }>;
  const abstract = text.match(/(?:^|\n)\s*abstract\s*:?[ \t]*\n?([\s\S]*?)(?=\n\s*keywords?\b|\n\s*(?:introduction|1\.?\s+introduction)\b|$)/i)?.[1] ?? '';
  const hasMethods = /(?:^|\n)\s*(?:materials and methods|methods?|experimental|methodology)\b/i.test(text);
  const hasResults = /(?:^|\n)\s*(?:results?|findings?)\b/i.test(text);
  const hasReferences = /(?:^|\n)\s*references?\b/i.test(text);

  if (!abstract.trim()) gaps.push({ id: 'abstract', priority: 'critical', icon: '❌', location: 'Abstract', evidence: 'No abstract block detected.', title: `Add a complete abstract for ${journalName}`, description: 'Editors expect a self-contained abstract covering objective, methods, key results, and conclusion.', example: 'Write 200-300 words covering the objective, methods, key numerical results, limitations, and conclusion.' });
  else if (!/(methods?|results?|conclusion|findings?)/i.test(abstract)) gaps.push({ id: 'abstract-evidence', priority: 'critical', icon: '❌', location: 'Abstract', evidence: `Abstract begins: "${abstract.trim().slice(0, 180)}"`, title: 'Make the abstract evidence-led', description: `The abstract does not clearly expose methods, results, and conclusion for ${journalName}.`, example: 'Restructure the abstract to state the objective, summarize the methods, report the key quantitative results, and end with a conclusion.' });
  if (!hasMethods || !hasResults) gaps.push({ id: 'structure', priority: 'important', icon: '🟡', location: 'Overall structure', evidence: `Detected sections: Methods ${hasMethods ? 'present' : 'not detected'}, Results ${hasResults ? 'present' : 'not detected'}.`, title: `Check required sections for ${journalField}`, description: 'Confirm Methods and Results are clearly labeled and separated from other sections.', example: 'Add explicit "Methods" and "Results" headings if this content is currently merged with other sections.' });
  if (!hasReferences) gaps.push({ id: 'references', priority: 'important', icon: '🟡', location: 'References', evidence: 'No references section detected.', title: 'Add a references section', description: 'A reference list is required to support claims and prior-work comparisons.', example: 'Add a References section formatted to the target journal\'s citation style.' });
  if (!/(limitation|limitations|future work|future directions)/i.test(lower)) gaps.push({ id: 'limitations', priority: 'important', icon: '🟡', location: 'Discussion / Conclusion', evidence: 'No explicit limitations section detected.', title: 'State the study limitations', description: 'Editors expect explicit limitations to contextualize how far the findings can be generalized.', example: 'Add a short limitations paragraph covering sample size, scope, and any assumptions made in the analysis.' });
  if (!/(novel|new|original|first|contribution|innovation)/i.test(abstract || text.slice(0, 6000))) gaps.push({ id: 'novelty', priority: 'important', icon: '🟡', location: 'Abstract / Introduction', evidence: 'No concise novelty claim detected.', title: 'State the original contribution precisely', description: 'Define what this study adds beyond prior work rather than a broad, unsupported claim.', example: 'Add one sentence stating precisely what is new about this study compared to prior published work, with a citation.' });
  return gaps.slice(0, 6);
}

