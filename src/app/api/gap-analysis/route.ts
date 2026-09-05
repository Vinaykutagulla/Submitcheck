import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  timeout: 20000,
});

type GapAnalysisRequest = {
  manuscriptText?: unknown;
  journalName?: unknown;
  journalField?: unknown;
  articleType?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GapAnalysisRequest;
    const manuscriptText = typeof body.manuscriptText === 'string' ? body.manuscriptText : '';
    const journalName = typeof body.journalName === 'string' ? body.journalName : 'target journal';
    const journalField = typeof body.journalField === 'string' ? body.journalField : 'general research';
    const articleType = typeof body.articleType === 'string' ? body.articleType : 'research';

    if (!manuscriptText.trim()) {
      return NextResponse.json({ error: 'Manuscript text is required.' }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        usesFallback: true,
        gaps: heuristicallyGenerateGaps(manuscriptText, journalName, journalField, articleType),
      });
    }

    const prompt = `
You are an academic editorial reviewer.
Return only valid JSON with an array called "gaps".
Each item must contain:
- id: short string
- priority: "critical" or "important"
- icon: "❌" or "🟡"
- title: short string
- description: string
- example: string

Goal: identify missing or weak manuscript elements for the journal ${journalName} in ${journalField}.
Manuscript type: ${articleType}

Manuscript text:
${manuscriptText.slice(0, 25000)}

Focus on clear, actionable journal-fit and revision issues. Keep it concise and practical.
`;

    const completion = await anthropic.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 1200,
      temperature: 0.3,
      system: 'You are a strict academic editor helping plan manuscript revisions. Output valid JSON only.',
      messages: [{ role: 'user', content: prompt }],
    });

    const content = completion.content?.[0]?.type === 'text' ? completion.content[0].text : '';
    const parsed = safeJsonParse(content);
    const gaps = Array.isArray(parsed?.gaps) && parsed.gaps.length ? parsed.gaps : heuristicallyGenerateGaps(manuscriptText, journalName, journalField, articleType);

    return NextResponse.json({ usesFallback: false, gaps });
  } catch {
    return NextResponse.json({
      usesFallback: true,
      gaps: heuristicallyGenerateGaps(
        typeof (await request.clone().json()).manuscriptText === 'string' ? (await request.clone().json()).manuscriptText : '',
        'target journal',
        'general research',
        'research',
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
  articleType: string,
) {
  const text = manuscriptText.toLowerCase();
  const gaps = [] as Array<{ id: string; priority: 'critical' | 'important'; icon: '❌' | '🟡'; title: string; description: string; example: string }>;

  if (!/abstract\s*:/i.test(manuscriptText)) {
    gaps.push({
      id: 'abstract',
      priority: 'critical',
      icon: '❌',
      title: 'Abstract is missing or weak',
      description: `The abstract for ${journalName} should summarize the purpose, methods, key findings, and contribution clearly.`,
      example: 'Abstract: This study evaluates... Methods: ... Results: ... Conclusion: ...',
    });
  }

  if (!/(novel|new|original|first|contribution|innovation|improves)/i.test(manuscriptText)) {
    gaps.push({
      id: 'novelty',
      priority: 'critical',
      icon: '❌',
      title: 'Novelty statement is missing',
      description: 'Most journals expect a clear statement of what is new and why the work matters.',
      example: 'Unlike previous work, this is the first study to demonstrate ...',
    });
  }

  if (!/(limitation|limitations|future work|future directions)/i.test(manuscriptText)) {
    gaps.push({
      id: 'limitations',
      priority: 'important',
      icon: '🟡',
      title: 'Limitations section is not obvious',
      description: 'Transparent study limits improve scientific credibility and editorial review.',
      example: 'This study has several limitations. First, ... Second, ...',
    });
  }

  if (!/references?/i.test(manuscriptText)) {
    gaps.push({
      id: 'references',
      priority: 'important',
      icon: '🟡',
      title: 'Reference section may need tightening',
      description: 'The manuscript should clearly cite prior work and journal-appropriate reference formats.',
      example: 'References\n1. Author, A. (2024). Title. Journal.',
    });
  }

  if (!/(methods|results|discussion|conclusion)/i.test(manuscriptText)) {
    gaps.push({
      id: 'structure',
      priority: 'important',
      icon: '🟡',
      title: 'Manuscript structure may not match target journal expectations',
      description: 'A clearly separated Methods, Results, Discussion, and Conclusion structure is often required.',
      example: 'Methods: ...\nResults: ...\nDiscussion: ...\nConclusion: ...',
    });
  }

  if (!/(patient|clinical|trial|dataset|algorithm|model|experiment|simulation|participants)/i.test(manuscriptText)) {
    gaps.push({
      id: 'field-fit',
      priority: 'important',
      icon: '🟡',
      title: `Field-language fit for ${journalField} could be stronger`,
      description: `The manuscript should use more explicit domain language for ${journalField} readership.`,
      example: 'Use more targeted terms like clinical outcomes, model evaluation, or experimental design depending on the field.',
    });
  }

  return gaps.slice(0, 5);
}
