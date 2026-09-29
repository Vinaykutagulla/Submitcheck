import type { MetadataRoute } from 'next';

const aiCrawlers = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'Google-Extended',
  'PerplexityBot',
  'Perplexity-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  'CCBot',
  'Amazonbot',
  'Applebot-Extended',
  'Bytespider',
  'cohere-ai',
  'Meta-ExternalAgent',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/api/', '/app'] },
      { userAgent: aiCrawlers, allow: '/', disallow: ['/api/', '/app'] },
    ],
    sitemap: 'https://thesubmitcheck.com/sitemap.xml',
  };
}
