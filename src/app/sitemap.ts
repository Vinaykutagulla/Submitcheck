import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://thesubmitcheck.com';
  const lastModified = new Date();
  return [
    { url: baseUrl, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/pricing`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/signup`, lastModified, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${baseUrl}/login`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
