import Anthropic from '@anthropic-ai/sdk';

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  timeout: 15000,
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
