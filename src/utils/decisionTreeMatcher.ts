export type MatchJournal = {
  name: string;
  publisher?: string;
  field: string;
  scope: string[];
  asjcCodes?: string[];
  sponsored?: boolean;
  requirements: {
    abstract: 'structured' | 'unstructured';
    wordLimit: number | null;
    refStyle: string;
  };
};

export type ManuscriptProfile = {
  words: number;
  field: string;
  articleType: 'Review' | 'Research' | 'Methods' | 'Case study' | 'Unknown';
  topics: string[];
  keywords: string[];
  methods: string[];
  signals: {
    hasAbstract: boolean;
    hasKeywords: boolean;
    hasReferences: boolean;
    hasStructuredAbstract: boolean;
    hasNovelty: boolean;
    hasLimitations: boolean;
  };
};

export type JournalMatchResult = {
  score: number;
  confidence: 'High' | 'Medium' | 'Low';
  reasons: string[];
  warnings: string[];
};

const fieldSignals: Record<string, string[]> = {
  'Life Sciences': ['drug', 'pharmaceut', 'clinical', 'cell', 'protein', 'nanomedicine', 'formulation', 'biology', 'patient'],
  Chemistry: ['chemistry', 'synthesis', 'molecule', 'reaction', 'catalyst', 'polymer', 'spectroscopy', 'chemical'],
  Engineering: ['engineering', 'design', 'prototype', 'optimization', 'mechanical', 'process', 'simulation', 'device'],
  'Computer Science': ['algorithm', 'machine learning', 'software', 'dataset', 'neural network', 'computer', 'model'],
  Physics: ['physics', 'quantum', 'particle', 'material', 'energy', 'optical', 'magnetic'],
  'Social Sciences': ['survey', 'policy', 'education', 'social', 'behavior', 'psychology', 'interview', 'qualitative'],
  Medicine: ['patient', 'clinical trial', 'diagnosis', 'hospital', 'treatment', 'disease', 'health'],
};

const topicFamilies: Record<string, string[]> = {
  pharmaceutics: ['pharmaceut', 'drug delivery', 'formulation', 'dissolution', 'solid dispersion', 'dosage'],
  'drug delivery': ['drug delivery', 'nanomedicine', 'nanoparticle', 'release', 'formulation'],
  chemistry: ['chemistry', 'chemical', 'molecule', 'synthesis', 'reaction', 'spectroscopy'],
  synthesis: ['synthesis', 'synthesized', 'reaction', 'compound', 'molecule'],
  'machine learning': ['machine learning', 'deep learning', 'neural network', 'algorithm', 'classifier'],
  engineering: ['engineering', 'design', 'prototype', 'optimization', 'simulation', 'device'],
  education: ['education', 'student', 'teaching', 'classroom', 'university'],
  psychology: ['psychology', 'behavior', 'cognitive', 'mental health', 'participants'],
  medicine: ['patient', 'clinical', 'diagnosis', 'treatment', 'disease', 'health'],
  interdisciplinary: ['interdisciplinary', 'multidisciplinary', 'across fields', 'broad impact'],
};

const stopWords = new Set('about after again against also among because before being between both could does during each from further have having into itself more most other over same should some such than their there these they this those through under very what when where which while with would your'.split(' '));

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function extractKeywords(text: string) {
  const titleText = text.match(/^title\s*:\s*(.+)$/im)?.[1] ?? '';
  const keywordText = text.match(/keywords?\s*:\s*([^\n]+)/i)?.[1] ?? '';
  const explicitWords = `${titleText} ${keywordText}`.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? [];
  const words = text.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? [];
  const counts = new Map<string, number>();
  for (const word of explicitWords) {
    if (!stopWords.has(word)) counts.set(word, (counts.get(word) ?? 0) + 5);
  }
  for (const word of words) {
    if (stopWords.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 15)
    .map(([word]) => word);
}

export function profileManuscript(text: string): ManuscriptProfile {
  const lower = text.toLowerCase();
  const fieldScores = Object.entries(fieldSignals).map(([field, terms]) => ({
    field,
    score: terms.filter((term) => lower.includes(term)).length,
  })).sort((a, b) => b.score - a.score);
  const field = fieldScores[0]?.score ? fieldScores[0].field : 'Multidisciplinary';
  const articleType = /review|systematic review|meta-analysis|literature search/.test(lower)
    ? 'Review'
    : /case report|case study|single patient/.test(lower)
      ? 'Case study'
      : /protocol|benchmark|dataset|software package/.test(lower)
        ? 'Methods'
        : /methods|participants|sample size|experiment|we conducted/.test(lower)
          ? 'Research'
          : 'Unknown';
  const topics = Object.entries(topicFamilies).filter(([, terms]) => includesAny(lower, terms)).map(([topic]) => topic);
  const methods = ['survey', 'interview', 'randomized', 'in vitro', 'in vivo', 'simulation', 'regression', 'qualitative', 'systematic review']
    .filter((method) => lower.includes(method));

  return {
    words: countWords(text),
    field,
    articleType,
    topics,
    keywords: extractKeywords(text),
    methods,
    signals: {
      hasAbstract: /abstract\s*:/i.test(text),
      hasKeywords: /keywords?\s*:/i.test(text),
      hasReferences: /references?/i.test(text),
      hasStructuredAbstract: /(?:background|objective|methods|results|conclusion)\s*:/i.test(text),
      hasNovelty: /novel|first|original|innovation|contribution/.test(lower),
      hasLimitations: /limitation|future work|further research|however/.test(lower),
    },
  };
}

export function scoreJournal(profile: ManuscriptProfile, journal: MatchJournal): JournalMatchResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const journalText = `${journal.name} ${journal.publisher ?? ''} ${journal.field} ${journal.scope.join(' ')} ${(journal.asjcCodes ?? []).join(' ')}`.toLowerCase();
  const matchingKeywords = profile.keywords.filter((keyword) => journalText.includes(keyword));
  const matchingTopics = profile.topics.filter((topic) => journalText.includes(topic) || topicFamilies[topic].some((term) => journalText.includes(term)));
  const fieldFit = journal.field === profile.field ? 30 : journal.field === 'Multidisciplinary' ? 20 : 0;
  const scopeFit = journal.scope.length ? Math.min(30, Math.round((matchingTopics.length / Math.min(journal.scope.length, 3)) * 30)) : 0;
  const keywordFit = Math.min(25, matchingKeywords.length * 5);
  const articleFit = profile.articleType === 'Unknown' ? 8 : journal.name.toLowerCase().includes(profile.articleType.toLowerCase()) ? 15 : 10;
  const requirementFit = journal.requirements.wordLimit === null ? 0 : profile.words <= journal.requirements.wordLimit ? 10 : 0;
  let score = fieldFit + scopeFit + keywordFit + articleFit + requirementFit;

  if (fieldFit >= 30) reasons.push(`Strong ${profile.field} field alignment`);
  else if (fieldFit === 20) reasons.push('Broad multidisciplinary scope can accommodate this field');
  else warnings.push(`Field mismatch: manuscript signals ${profile.field}, journal is ${journal.field}`);
  if (matchingTopics.length) reasons.push(`Topic overlap: ${matchingTopics.slice(0, 3).join(', ')}`);
  else warnings.push('No strong topic or scope overlap detected');
  if (matchingKeywords.length) reasons.push(`Keyword overlap: ${matchingKeywords.slice(0, 4).join(', ')}`);
  if (profile.articleType !== 'Unknown') reasons.push(`${profile.articleType} manuscript profile detected`);
  if (journal.requirements.wordLimit === null) warnings.push('Word limit not available from catalog');
  else if (requirementFit) reasons.push(`Within ${journal.requirements.wordLimit.toLocaleString()} word limit`);
  else warnings.push(`Over the ${journal.requirements.wordLimit.toLocaleString()} word limit`);

  if (journal.requirements.abstract === 'structured' && !profile.signals.hasStructuredAbstract) {
    score -= 8;
    warnings.push('Structured abstract required');
  }
  if (!profile.signals.hasReferences) {
    score -= 4;
    warnings.push('References section not detected');
  }
  if (!profile.signals.hasNovelty) {
    score -= 3;
    warnings.push('Novelty statement not detected');
  }

  score = Math.max(0, Math.min(98, Math.round(score)));
  const confidence = score >= 72 && warnings.length <= 1 ? 'High' : score >= 48 ? 'Medium' : 'Low';
  return { score, confidence, reasons, warnings };
}

export function rankJournals<T extends MatchJournal>(text: string, journals: T[]) {
  const profile = profileManuscript(text);
  return journals
    .map((journal) => ({ journal, profile, match: scoreJournal(profile, journal) }))
    .sort((a, b) => b.match.score - a.match.score || a.journal.name.localeCompare(b.journal.name));
}
