import { anthropic } from '@/lib/claude';

export type SemanticProfile = {
  researchQuestion: string;
  studyDesign: string;
  subjectArea: string[];
  populationOrMaterial: string[];
  interventions: string[];
  methods: string[];
  outcomes: string[];
  articleType: string;
  exclusions: string[];
};

export type SemanticProfileStatus = 'active' | 'missing_key' | 'auth_failed' | 'rate_limited' | 'provider_error';
export type JournalJudgeCandidate = { name: string; field: string; scope: string[] };
export type JournalJudgeDecision = { name: string; relevanceScore: number; reasons: string[]; exclusions: string[] };

const emptyProfile: SemanticProfile = {
  researchQuestion: '', studyDesign: '', subjectArea: [], populationOrMaterial: [],
  interventions: [], methods: [], outcomes: [], articleType: '', exclusions: [],
};

function providerStatus(error: unknown): { status: SemanticProfileStatus; code?: number } {
  const code = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: unknown }).status) : 0;
  return { status: code === 401 || code === 403 ? 'auth_failed' : code === 429 ? 'rate_limited' : 'provider_error', code: code || undefined };
}

function parseProfile(value: string): SemanticProfile | null {
  try {
    const parsed = JSON.parse(value.replace(/```json|```/gi, '').trim()) as Partial<SemanticProfile>;
    const strings = (items: unknown) => Array.isArray(items) ? items.filter((item): item is string => typeof item === 'string').slice(0, 8) : [];
    return {
      researchQuestion: typeof parsed.researchQuestion === 'string' ? parsed.researchQuestion : '',
      studyDesign: typeof parsed.studyDesign === 'string' ? parsed.studyDesign : '',
      subjectArea: strings(parsed.subjectArea), populationOrMaterial: strings(parsed.populationOrMaterial),
      interventions: strings(parsed.interventions), methods: strings(parsed.methods), outcomes: strings(parsed.outcomes),
      articleType: typeof parsed.articleType === 'string' ? parsed.articleType : '', exclusions: strings(parsed.exclusions),
    };
  } catch { return null; }
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  const cleaned = value.replace(/```json|```/gi, '').trim();
  for (const candidate of [cleaned, cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1)]) {
    if (!candidate || !candidate.startsWith('{') || !candidate.endsWith('}')) continue;
    try { return JSON.parse(candidate) as Record<string, unknown>; } catch { /* try the next bounded candidate */ }
  }
  return null;
}

export async function createSemanticProfile(manuscriptText: string): Promise<{ profile: SemanticProfile | null; status: SemanticProfileStatus; providerStatus?: number }> {
  if (!process.env.ANTHROPIC_API_KEY) return { profile: null, status: 'missing_key' };
  try {
    const completion = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001', max_tokens: 700, temperature: 0,
      system: 'Extract a strict academic manuscript profile. Return JSON only. Do not invent details.',
      messages: [{ role: 'user', content: `Extract this JSON profile. Use empty strings or arrays when evidence is absent.
{"researchQuestion":"","studyDesign":"","subjectArea":[],"populationOrMaterial":[],"interventions":[],"methods":[],"outcomes":[],"articleType":"","exclusions":[]}

Manuscript:
${manuscriptText.slice(0, 18000)}` }],
    });
    const content = completion.content?.[0]?.type === 'text' ? completion.content[0].text : '';
    const profile = parseProfile(content);
    return profile ? { profile, status: 'active' } : { profile: null, status: 'provider_error' };
  } catch (error) {
    const result = providerStatus(error);
    console.error('Semantic manuscript profiling failed:', result.status);
    return { profile: null, status: result.status, providerStatus: result.code };
  }
}

export async function judgeJournalCandidates(manuscriptText: string, candidates: JournalJudgeCandidate[]): Promise<{ decisions: JournalJudgeDecision[]; status: SemanticProfileStatus; providerStatus?: number }> {
  if (!process.env.ANTHROPIC_API_KEY || candidates.length === 0) return { decisions: [], status: process.env.ANTHROPIC_API_KEY ? 'provider_error' : 'missing_key' };
  try {
    const completion = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001', max_tokens: 1400, temperature: 0,
      system: 'You are a strict academic journal-fit judge. Judge topical scope fit, not prestige or generic field overlap. Return JSON only.',
      messages: [{ role: 'user', content: `Judge each candidate journal for this manuscript. A journal is relevant only when its scope genuinely publishes the subject and article type. AI, statistics, or HPLC are methods and must not replace the research subject. Return exactly {"decisions":[{"name":"exact name","relevanceScore":0,"reasons":["evidence"],"exclusions":["reason"]}]}. Do not invent scope details.

MANUSCRIPT:
${manuscriptText.slice(0, 24000)}

CANDIDATES:
${JSON.stringify(candidates)}` }],
    });
    const content = completion.content?.[0]?.type === 'text' ? completion.content[0].text : '';
    const parsed = parseJsonObject(content);
    const decisions = Array.isArray(parsed?.decisions) ? parsed.decisions.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const value = item as Partial<JournalJudgeDecision>;
      if (typeof value.name !== 'string' || typeof value.relevanceScore !== 'number') return [];
      const strings = (items: unknown) => Array.isArray(items) ? items.filter((reason): reason is string => typeof reason === 'string').slice(0, 4) : [];
      return [{ name: value.name, relevanceScore: Math.max(0, Math.min(100, Math.round(value.relevanceScore))), reasons: strings(value.reasons), exclusions: strings(value.exclusions) }];
    }) : [];
    return decisions.length ? { decisions, status: 'active' } : { decisions: [], status: 'provider_error' };
  } catch (error) {
    const result = providerStatus(error);
    const message = error instanceof Error ? error.message.slice(0, 120) : 'unknown provider error';
    console.error('Journal semantic judging failed:', result.status, message);
    return { decisions: [], status: result.status, providerStatus: result.code };
  }
}

export { emptyProfile };
