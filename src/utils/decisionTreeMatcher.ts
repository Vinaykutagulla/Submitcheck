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
    hasNucleicAcidFocus: boolean;
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
  Engineering: ['engineering', 'prototype', 'mechanical', 'device', 'structural design'],
  'Computer Science': ['algorithm', 'machine learning', 'software', 'dataset', 'neural network', 'computer', 'model'],
  Physics: ['physics', 'quantum', 'particle', 'material', 'energy', 'optical', 'magnetic'],
  'Social Sciences': ['survey', 'policy', 'education', 'social', 'behavior', 'psychology', 'interview', 'qualitative'],
  Medicine: ['patient', 'clinical trial', 'diagnosis', 'hospital', 'treatment', 'disease', 'health'],
};

export const topicFamilies: Record<string, string[]> = {
  pharmaceutics: ['pharmaceut', 'drug delivery', 'formulation', 'dissolution', 'solid dispersion', 'dosage'],
  pharmacology: ['anti-inflammatory', 'inflammatory', 'cytotoxicity', 'cytotoxic', 'pharmacolog', 'therapeutic', 'akt inhibitor', 'raw 264.7'],
  'natural products': ['plant extract', 'phytochemical', 'phytoconstituent', 'flavonoid', 'coumarin', 'stilbene', 'terpenoid', 'phenol', 'medicinal plant', 'herbal'],
  'analytical profiling': ['lc-ms', 'lc-esi', 'qtof', 'hrms', 'metabolite profiling', 'mass spectrometry'],
  'molecular pharmacology': ['protein-ligand', 'molecular docking', 'molecular dynamics', 'binding affinity', 'admet', 'drug-likeness'],
  'drug delivery': ['drug delivery', 'nanomedicine', 'nanoparticle', 'release', 'formulation'],
  chemistry: ['chemistry', 'chemical', 'molecule', 'synthesis', 'reaction', 'spectroscopy'],
  synthesis: ['synthesis', 'synthesized', 'reaction', 'compound', 'molecule'],
  'machine learning': ['machine learning', 'deep learning', 'neural network', 'algorithm', 'classifier'],
  engineering: ['engineering', 'design', 'prototype', 'mechanical', 'device'],
  education: ['education', 'student', 'teaching', 'classroom', 'university'],
  psychology: ['psychology', 'behavior', 'cognitive', 'mental health', 'participants'],
  medicine: ['patient', 'clinical', 'diagnosis', 'treatment', 'disease', 'health'],
  interdisciplinary: ['interdisciplinary', 'multidisciplinary', 'across fields', 'broad impact'],
};

const stopWords = new Set('about after again against also among because before being between both could does during each from further have having into itself more most other over same should some such than their there these they this those through under very what when where which while with would your'.split(' '));
const genericMatchWords = new Set(['molecular', 'dynamics', 'network', 'simulation', 'model', 'study', 'research', 'analysis', 'method', 'methods', 'results', 'abstract', 'in-vitro', 'vitro', 'compounds', 'compound', 'positive', 'that', 'using', 'based', 'chemical', 'chemicals', 'acid', 'pharmacology']);

function hasWholeWord(text: string, term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\b)${escaped}(?:$|\\b)`, 'i').test(text);
}

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function getAnalysisText(text: string) {
  return text.match(/^[\s\S]*?(?=\n\s*references?\b)/i)?.[0] ?? text;
}

function getManuscriptSignalText(text: string) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const title = lines.find((line) => !/^(?:abstract|keywords?|introduction|authors?|authors? for correspondence|email)\b/i.test(line)) ?? '';
  const abstract = text.match(/(?:^|\n)\s*abstract\s*:?[ \t]*\n?([\s\S]*?)(?=\n\s*keywords?\b|\n\s*(?:introduction|1\.?\s+introduction)\b|$)/i)?.[1] ?? '';
  const keywords = text.match(/(?:^|\n)\s*keywords?\s*:?\s*([^\n]+)/i)?.[1] ?? '';
  return `${title}\n${abstract}\n${keywords}`.toLowerCase();
}

function extractKeywords(text: string) {
  const titleText = text.match(/^title\s*:\s*(.+)$/im)?.[1] ?? text.split('\n').map((line) => line.trim()).find(Boolean) ?? '';
  const keywordText = text.match(/keywords?\s*:?\s*([^\n]+)/i)?.[1] ?? '';
  const explicitWords = `${titleText} ${keywordText}`.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? [];
  const counts = new Map<string, number>();
  for (const word of explicitWords) {
    if (!stopWords.has(word)) counts.set(word, (counts.get(word) ?? 0) + 5);
  }
  const lower = getManuscriptSignalText(text);
  for (const terms of Object.values(topicFamilies)) {
    for (const term of terms) {
      if (term.length >= 6 && lower.includes(term) && !genericMatchWords.has(term)) {
        counts.set(term, (counts.get(term) ?? 0) + 3);
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 15)
    .filter(([word]) => !genericMatchWords.has(word))
    .map(([word]) => word);
}

export function profileManuscript(text: string): ManuscriptProfile {
  const analysisText = getAnalysisText(text);
  const lower = analysisText.toLowerCase();
  const frontMatter = getManuscriptSignalText(text);
  const fieldScores = Object.entries(fieldSignals).map(([field, terms]) => ({
    field,
    score: terms.filter((term) => lower.includes(term)).length,
  })).sort((a, b) => b.score - a.score);
  const field = fieldScores[0]?.score ? fieldScores[0].field : 'Multidisciplinary';
  const hasExperimentalResearch = /experimental validation|in[- ]vitro|in[- ]vivo|cytotoxicity|cell line|molecular docking|lc[- ](?:esi[- ])?qtof|mass spectrometry|we investigated|we evaluated/.test(lower);
  const articleType = hasExperimentalResearch
    ? 'Research'
    : /case report|case study|single patient/.test(lower)
      ? 'Case study'
      : /protocol|benchmark|dataset|software package/.test(lower)
        ? 'Methods'
        : /review|systematic review|meta-analysis|literature search/.test(lower)
          ? 'Review'
          : /methods|participants|sample size|experiment|we conducted/.test(lower)
          ? 'Research'
          : 'Unknown';
  let topics = Object.entries(topicFamilies)
    .filter(([topic, terms]) => terms.filter((term) => frontMatter.includes(term)).length >= (topic === 'engineering' ? 2 : 1))
    .map(([topic]) => topic);
  const specificBiomedicalTopics = ['pharmacology', 'natural products', 'analytical profiling', 'molecular pharmacology'];
  if (specificBiomedicalTopics.some((topic) => topics.includes(topic))) {
    topics = topics.filter((topic) => !['chemistry', 'synthesis', 'medicine'].includes(topic));
  }
  const methods = ['lc-ms', 'mass spectrometry', 'molecular docking', 'molecular dynamics', 'admet', 'survey', 'interview', 'randomized', 'in vitro', 'in vivo', 'regression', 'qualitative', 'systematic review']
    .filter((method) => lower.includes(method));

  return {
    words: countWords(analysisText),
    field,
    articleType,
    topics,
    keywords: extractKeywords(text),
    methods,
    signals: {
      hasAbstract: /(?:^|\n)\s*abstract\s*:?(?:\s|$)/i.test(text),
      hasKeywords: /(?:^|\n)\s*keywords?\s*:?(?:\s|$)/i.test(text),
      hasReferences: /references?/i.test(text),
      hasStructuredAbstract: /(?:background|objective|methods|results|conclusion)\s*:/i.test(text),
      hasNovelty: /novel|first|original|innovation|contribution/.test(lower),
      hasLimitations: /limitation|future work|further research|however/.test(lower),
      hasNucleicAcidFocus: /\b(?:nucleic acid|rna|mrna|mirna|sirna|dna|crispr|oligonucleotide|transcriptom|gene expression)\b/i.test(frontMatter),
    },
  };
}

export function scoreJournal(profile: ManuscriptProfile, journal: MatchJournal): JournalMatchResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const journalText = `${journal.name} ${journal.publisher ?? ''} ${journal.field} ${journal.scope.join(' ')} ${(journal.asjcCodes ?? []).join(' ')}`.toLowerCase();
  const journalIdentityText = `${journal.name} ${journal.scope.join(' ')} ${(journal.asjcCodes ?? []).join(' ')}`.toLowerCase();
  const matchingKeywords = profile.keywords.filter((keyword) => !genericMatchWords.has(keyword) && hasWholeWord(journalIdentityText, keyword));
  const matchingTopics = profile.topics.filter((topic) => topicFamilies[topic].some((term) => journalIdentityText.includes(term)));
  const specificTopicMatches = matchingTopics.filter((topic) => !['pharmacology', 'medicine', 'chemistry', 'synthesis'].includes(topic));
  const matchingMethods = profile.methods.filter((method) => hasWholeWord(journalIdentityText, method));
  const biomedicalJournal = /pharmacol|pharmaceutical|immunolog|toxicolog|biochem|molecular biology|medicinal chemistry|drug|medicine|clinical|natural product|plant science|food science|life science|therapeutic|anti-inflammatory/.test(journalText);
  const biomedicalProfile = profile.topics.some((topic) => ['pharmacology', 'natural products', 'molecular pharmacology', 'analytical profiling'].includes(topic)) || profile.field === 'Life Sciences' || profile.field === 'Medicine';
  const fieldFit = journal.field === profile.field
    ? 30
    : journal.field === 'Multidisciplinary'
      ? 12
      : biomedicalProfile && biomedicalJournal && matchingTopics.length
        ? specificTopicMatches.length ? 16 : 8
        : 0;
  const scopeFit = specificTopicMatches.length
    ? Math.min(30, specificTopicMatches.length * 15)
    : matchingTopics.length ? 8 : 0;
  const keywordFit = Math.min(15, matchingKeywords.length * 5);
  const methodFit = Math.min(15, matchingMethods.length * 5);
  const biomedicalFit = biomedicalProfile && biomedicalJournal && specificTopicMatches.length ? 6 : 0;
  const nucleicAcidJournal = /\bnucleic acids?\b/i.test(journalText);
  const articleFit = profile.articleType === 'Unknown' ? 8 : journal.name.toLowerCase().includes(profile.articleType.toLowerCase()) ? 15 : 10;
  const requirementFit = journal.requirements.wordLimit === null ? 0 : profile.words <= journal.requirements.wordLimit ? 10 : 0;
  let score = fieldFit + scopeFit + keywordFit + methodFit + articleFit + requirementFit + biomedicalFit;

  if (fieldFit >= 30) reasons.push(`Strong ${profile.field} field alignment`);
  else if (fieldFit === 12) reasons.push('Broad multidisciplinary scope can accommodate this field');
  else if (fieldFit > 0 && specificTopicMatches.length) reasons.push('Relevant biomedical field with specific topic overlap');
  else warnings.push(`Field mismatch: manuscript signals ${profile.field}, journal is ${journal.field}`);
  if (specificTopicMatches.length) reasons.push(`Specific topic overlap: ${specificTopicMatches.slice(0, 3).join(', ')}`);
  else if (matchingTopics.length) warnings.push('Only broad pharmacology field overlap detected');
  else warnings.push('No strong topic or scope overlap detected');
  if (matchingKeywords.length) reasons.push(`Keyword overlap: ${matchingKeywords.slice(0, 4).join(', ')}`);
  if (matchingMethods.length) reasons.push(`Method overlap: ${matchingMethods.slice(0, 3).join(', ')}`);
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

  if (nucleicAcidJournal && !profile.signals.hasNucleicAcidFocus) {
    score -= 50;
    warnings.push('Journal focuses on nucleic-acid research, but this manuscript does not');
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
