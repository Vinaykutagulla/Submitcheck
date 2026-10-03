import Anthropic from '@anthropic-ai/sdk';

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  // Claude completions with larger max_tokens (gap analysis, semantic judging) can legitimately
  // take well over 18s. Keep this below each route's maxDuration so the try/catch fallback still
  // has time to run instead of Vercel killing the function first.
  timeout: 55000,
  // The SDK's default maxRetries=2 silently multiplies `timeout` by up to 3x on a retryable
  // failure (e.g. a timeout counts as retryable) before it ever throws back to our code - this
  // caused a real production 504 (60s platform kill) even with a much lower app-level timeout
  // budget. Callers that want their own retry/fallback strategy (e.g. gap-analysis) do it
  // explicitly and budget it against their route's maxDuration; the SDK must not add a hidden,
  // unbudgeted retry loop underneath that.
  maxRetries: 0,
});

export type GapPriority = 'critical' | 'important';

export type GapObject = {
  id: string;
  priority: GapPriority;
  icon: '❌' | '🟡';
  title: string;
  description: string;
  example: string;
};

export function getGapSchema() {
  return [
    {
      id: 'string',
      priority: 'critical | important',
      icon: '❌ | 🟡',
      title: 'string',
      description: 'string',
      example: 'string',
    },
  ];
}
