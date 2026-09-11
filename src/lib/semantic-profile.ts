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

const emptyProfile: SemanticProfile = {
  researchQuestion: '',
  studyDesign: '',
  subjectArea: [],
  populationOrMaterial: [],
  interventions: [],
  methods: [],
  outcomes: [],
  articleType: '',
  exclusions: [],
};

function parseProfile(value: string): SemanticProfile | null {
  try {
    const parsed = JSON.parse(value.replace(/```json|```/gi, '').trim()) as Partial<SemanticProfile>;
    return {
      researchQuestion: typeof parsed.researchQuestion === 'string' ? parsed.researchQuestion : '',
      studyDesign: typeof parsed.studyDesign === 'string' ? parsed.studyDesign : '',
      subjectArea: Array.isArray(parsed.subjectArea) ? parsed.subjectArea.filter((item): item is string => typeof item === 'string').slice(0, 8) : [],
      populationOrMaterial: Array.isArray(parsed.populationOrMaterial) ? parsed.populationOrMaterial.filter((item): item is string => typeof item === 'string').slice(0, 8) : [],
      interventions: Array.isArray(parsed.interventions) ? parsed.interventions.filter((item): item is string => typeof item === 'string').slice(0, 8) : [],
      methods: Array.isArray(parsed.methods) ? parsed.methods.filter((item): item is string => typeof item === 'string').slice(0, 8) : [],
      outcomes: Array.isArray(parsed.outcomes) ? parsed.outcomes.filter((item): item is string => typeof item === 'string').slice(0, 8) : [],
      articleType: typeof parsed.articleType === 'string' ? parsed.articleType : '',
      exclusions: Array.isArray(parsed.exclusions) ? parsed.exclusions.filter((item): item is string => typeof item === 'string').slice(0, 8) : [],
    };
  } catch {
    return null;
  }
}

export async function createSemanticProfile(manuscriptText: string): Promise<{ profile: SemanticProfile | null; status: SemanticProfileStatus }> {
  if (!process.env.ANTHROPIC_API_KEY) return { profile: null, status: 'missing_key' };

  try {
    const completion = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      temperature: 0,
      system: 'Extract a strict academic manuscript profile. Return JSON only. Do not invent details.',
      messages: [{ role: 'user', content: `Extract this JSON profile from the manuscript. Use empty strings or arrays when evidence is absent.\n\n{\n  "researchQuestion": "",\n  "studyDesign": "",\n  "subjectArea": [],\n  "populationOrMaterial": [],\n  "interventions": [],\n  "methods": [],\n  "outcomes": [],\n  "articleType": "",\n  "exclusions": []\n}\n\nManuscript:\n${manuscriptText.slice(0, 60000)}` }],
    });
    const content = completion.content?.[0]?.type === 'text' ? completion.content[0].text : '';
    const profile = parseProfile(content);
    return profile ? { profile, status: 'active' } : { profile: null, status: 'provider_error' };
  } catch (error) {
    const statusCode = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: unknown }).status) : 0;
    const status = statusCode === 401 || statusCode === 403
      ? 'auth_failed'
      : statusCode === 429
        ? 'rate_limited'
        : 'provider_error';
    console.error('Semantic manuscript profiling failed:', status);
    return { profile: null, status };
  }
}

export { emptyProfile };