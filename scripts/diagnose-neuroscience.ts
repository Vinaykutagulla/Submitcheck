import { profileManuscript, scoreJournal, topicFamilies } from '../src/utils/decisionTreeMatcher';

const neuroscienceManuscript = `Title: Synaptic plasticity and neural oscillations during working memory
Abstract: We record neuronal activity in cortical circuits and analyze synaptic plasticity, network oscillations, and memory-related firing patterns. The study combines electrophysiology with cognitive task performance.`;

const profile = profileManuscript(neuroscienceManuscript);
const journal = {
  name: 'Journal of Neuroscience',
  field: 'Neuroscience',
  scope: ['neuroscience', 'cognitive neuroscience', 'synaptic plasticity', 'neural oscillations', 'brain circuits'],
  asjcCodes: ['2800'],
  requirements: { abstract: 'unstructured', wordLimit: null, refStyle: 'Numbered' },
};

const broadTopicNames = new Set([
  'pharmacology', 'medicine', 'chemistry', 'synthesis', 'engineering', 'psychology', 'education', 'data science',
  'mathematics', 'computer science', 'environmental science', 'business management', 'nursing practice',
  'molecular biology', 'neuroscience', 'immunology', 'microbiology', 'dentistry', 'veterinary', 'health professions',
  'decision sciences', 'energy', 'chemical engineering', 'accounting and management', 'nursing care',
  'physics', 'planetary science', 'history', 'literature', 'philosophy', 'linguistics',
]);

const genericMatchWords = new Set([
  'molecular', 'dynamics', 'simulation', 'model', 'modeling', 'network', 'computational', 'study', 'research', 'analysis', 'method', 'methods', 'results', 'abstract', 'in-vitro', 'vitro', 'compounds', 'compound', 'positive', 'that', 'using', 'based', 'chemical', 'chemicals', 'acid', 'pharmacology'
]);

const weakKeywordWords = new Set([
  'article', 'based', 'case', 'data', 'evaluation', 'evidence', 'experimental', 'investigation', 'manuscript', 'observational', 'results', 'study', 'systematic', 'treatment', 'using', 'analysis', 'review'
]);

function normalizePhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u2010-\u2015_/-]+/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasWholeWord(text: string, term: string) {
  const normalizedText = normalizePhrase(text);
  const normalizedTerm = normalizePhrase(term);
  if (!normalizedTerm) return false;
  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\b)${escaped}(?:$|\\b)`, 'i').test(normalizedText);
}

function hasWordOrPlural(text: string, term: string) {
  if (hasWholeWord(text, term)) return true;
  if (term.length > 4 && term.endsWith('s') && hasWholeWord(text, term.slice(0, -1))) return true;
  return !term.endsWith('s') && hasWholeWord(text, `${term}s`);
}

const journalIdentityText = `${journal.name} ${journal.field} ${journal.scope.join(' ')} ${(journal.asjcCodes ?? []).join(' ')}`.toLowerCase();
const journalFieldText = journal.field.toLowerCase();
const matchingKeywords = profile.keywords.filter(
  (keyword) => !genericMatchWords.has(keyword) && !weakKeywordWords.has(keyword) && hasWordOrPlural(journalIdentityText, keyword)
);
const matchingTopics = profile.topics.filter((topic) => topicFamilies[topic]?.some((term) => hasWholeWord(journalIdentityText, term)));
const fieldTopicMatches = profile.topics.filter((topic) => topicFamilies[topic]?.some((term) => hasWholeWord(journalFieldText, term)));
const specificTopicMatches = matchingTopics.filter((topic) => !broadTopicNames.has(topic));

const weightedTopicFit = specificTopicMatches.reduce(
  (total, topic) => total + Math.min(3, profile.topicScores[topic] ?? 1),
  0
);
const scopeFit = weightedTopicFit
  ? Math.min(36, weightedTopicFit * 12)
  : fieldTopicMatches.length
    ? 5
    : matchingTopics.length
      ? 8
      : 0;
const keywordFit = Math.min(15, matchingKeywords.length * 5);
const matchingMethods = profile.methods.filter((method) => hasWholeWord(journalIdentityText, method));
const methodFit = Math.min(15, matchingMethods.length * 5);
const articleFit = profile.articleType !== 'Unknown' && hasWholeWord(journalIdentityText, profile.articleType) ? 8 : 0;
const interdisciplinaryFit = journal.field === 'Multidisciplinary' && specificTopicMatches.length ? 4 : 0;
const semanticFit = 0;
const evidenceWeight = specificTopicMatches.length * 2 + matchingKeywords.length + (matchingMethods.length > 0 && matchingTopics.length > 0 ? 1 : 0);

const result = scoreJournal(profile, journal as any);

console.log('DIAGNOSTIC1');
console.log(JSON.stringify({
  topics: profile.topics,
  topicScores: profile.topicScores,
  keywords: profile.keywords,
  methods: profile.methods,
}, null, 2));

console.log('\nDIAGNOSTIC2');
console.log(JSON.stringify({
  matchingTopics,
  fieldTopicMatches,
  specificTopicMatches,
  weightedTopicFit,
  scopeFit,
  keywordFit,
  methodFit,
  articleFit,
  interdisciplinaryFit,
  evidenceWeight,
}, null, 2));

console.log('\nDIAGNOSTIC3');
console.log(JSON.stringify({
  fieldFit: 10,
  scopeFit,
  keywordFit,
  methodFit,
  articleFit,
  interdisciplinaryFit,
  semanticFit,
  evidenceWeight,
  finalScore: result.score,
  band: result.band,
  reasons: result.reasons,
  warnings: result.warnings,
}, null, 2));
