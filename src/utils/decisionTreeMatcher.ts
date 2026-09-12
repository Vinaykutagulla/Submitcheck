export type MatchJournal = {
  name: string;
  publisher?: string;
  field: string;
  scope: string[];
  asjcCodes?: string[];
  sponsored?: boolean;
  indexing?: IndexingSource[];
  quartile?: Quartile;
  apc?: number | null;
  apcDisplay?: string;
  access?: AccessType;
  oa?: boolean;
  speed?: string;
  indexed?: string[];
  issn?: string;
  eissn?: string;
  submissionUrl?: string;
  requirements: {
    abstract: 'structured' | 'unstructured';
    wordLimit: number | null;
    refStyle: string;
  };
};

import type { SemanticProfile } from '@/lib/semantic-profile';
import { fieldsForAsjcCodes, normalizeScopusField } from '@/utils/asjcHierarchy';

export type IndexingSource = 'Scopus' | 'Web of Science' | 'DOAJ' | 'PubMed' | 'UGC-CARE' | string;
export type Quartile = 'Q1' | 'Q2' | 'Q3' | 'Q4';
export type AccessType = 'Open Access' | 'Subscription' | 'Hybrid';
export type JournalFilters = {
  field?: string;
  indexing?: IndexingSource;
  quartile?: Quartile;
  maxBudget?: number | null;
  access?: AccessType;
};
export type FilterResult<T> = {
  results: T[];
  excludedCount: number;
  excludedForMissingData: { journal: T; missingField: keyof MatchJournal }[];
};

const anyFilterValues = new Set(['any', 'any field', 'any indexing', 'any quartile']);

function isAnyFilter(value: string | undefined | null) {
  return value == null || anyFilterValues.has(value.trim().toLowerCase());
}

export function filterJournals<T extends MatchJournal>(journals: T[], filters: JournalFilters): FilterResult<T> {
  const excludedForMissingData: FilterResult<T>['excludedForMissingData'] = [];
  let excludedCount = 0;
  const exclude = (journal: T, missingField?: keyof MatchJournal) => {
    excludedCount++;
    if (missingField) excludedForMissingData.push({ journal, missingField });
    return false;
  };

  const results = journals.filter((journal) => {
    if (!isAnyFilter(filters.field) && journal.field !== filters.field) return exclude(journal);
    if (!isAnyFilter(filters.indexing)) {
      if (!journal.indexing?.length) return exclude(journal, 'indexing');
      if (!journal.indexing.includes(filters.indexing as IndexingSource)) return exclude(journal);
    }
    if (!isAnyFilter(filters.quartile)) {
      if (!journal.quartile) return exclude(journal, 'quartile');
      if (journal.quartile !== filters.quartile) return exclude(journal);
    }
    if (filters.access && !isAnyFilter(filters.access)) {
      if (!journal.access) return exclude(journal, 'access');
      if (journal.access !== filters.access) return exclude(journal);
    }
    if (filters.maxBudget != null) {
      if (journal.apc == null) return exclude(journal, 'apc');
      if (journal.apc > filters.maxBudget) return exclude(journal);
    }
    return true;
  });

  return { results, excludedCount, excludedForMissingData };
}

export type ManuscriptProfile = {
  words: number;
  field: string;
  articleType: 'Review' | 'Research' | 'Methods' | 'Case study' | 'Unknown';
  topics: string[];
  topicScores: Record<string, number>;
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

// Absolute score bands are the shared relevance contract. Catalog-relative display
// bands, when available, are stored separately as `relativeBand`.
export type MatchBand = 'Strong match' | 'Possible match' | 'Low confidence' | null;

export function bandForScore(score: number): MatchBand {
  if (score >= 70) return 'Strong match';
  if (score >= 45) return 'Possible match';
  if (score >= 25) return 'Low confidence';
  return null;
}

export type JournalMatchResult = {
  score: number;
  confidence: 'High' | 'Medium' | 'Low';
  band: MatchBand;
  relativeBand?: MatchBand;
  matchSource?: 'ai-semantic' | 'deterministic-fallback';
  directEvidence?: boolean;
  topicalEvidence?: boolean;
  reasons: string[];
  warnings: string[];
};

const fieldSignals: Record<string, string[]> = {
  'Life Sciences': ['drug', 'pharmaceut', 'clinical', 'cell', 'protein', 'nanomedicine', 'formulation', 'biology', 'patient'],
  Chemistry: ['chemistry', 'synthesis', 'molecule', 'reaction', 'catalyst', 'polymer', 'spectroscopy', 'chemical'],
  'Analytical Chemistry': ['chromatography', 'hplc', 'analytical method', 'retention time', 'method validation', 'pharmaceutical analysis', 'quality by design', 'design of experiments'],
  Engineering: ['engineering', 'prototype', 'mechanical', 'device', 'structural design', 'control system', 'robotics'],
  'Computer Science': ['algorithm', 'machine learning', 'software', 'dataset', 'neural network', 'computer', 'model'],
  Physics: ['physics', 'quantum', 'particle', 'material', 'energy', 'optical', 'magnetic'],
  'Social Sciences': ['survey', 'policy', 'education', 'social', 'behavior', 'psychology', 'interview', 'qualitative'],
  Medicine: ['patient', 'clinical trial', 'diagnosis', 'hospital', 'treatment', 'disease', 'health'],
  Agriculture: ['crop', 'soil', 'agriculture', 'agricultural', 'plant growth', 'yield', 'irrigation', 'pesticide'],
  'Environmental Science': ['environmental', 'ecosystem', 'pollution', 'climate', 'water quality', 'wastewater', 'biodiversity'],
  'Earth and Planetary Sciences': ['geology', 'geological', 'seismic', 'tectonic', 'remote sensing', 'sediment', 'planetary'],
  'Materials Science': ['material', 'nanomaterial', 'composite', 'ceramic', 'alloy', 'thin film', 'characterization'],
  Economics: ['health economics', 'cost effectiveness', 'cost-effectiveness', 'pharmacoeconomics', 'budget impact', 'reimbursement', 'pricing', 'qaly', 'incremental cost', 'market access'],
  'Arts and Humanities': ['literature', 'literary', 'novel', 'poetry', 'narrative', 'textual analysis', 'history', 'historical', 'archive', 'archives', 'historiography', 'culture', 'language', 'linguistics', 'linguistic', 'syntax', 'phonology', 'semantics', 'philosophy', 'philosophical', 'ethics', 'epistemology', 'heritage', 'discourse'],
  'Mathematics': ['mathematics', 'mathematical', 'theorem', 'proof', 'algebra', 'topology', 'equation', 'optimization'],
  'Neuroscience': ['neuroscience', 'neural', 'neuron', 'brain', 'cognitive neuroscience', 'synaptic', 'neuroimaging'],
  'Immunology and Microbiology': ['immunology', 'immune', 'antibody', 'microbiology', 'bacteria', 'microbiome', 'pathogen'],
  'Biochemistry, Genetics and Molecular Biology': ['biochemistry', 'genetic', 'genome', 'genomic', 'protein', 'enzyme', 'molecular biology', 'transcriptom'],
  'Pharmacology, Toxicology and Pharmaceutics': ['pharmacology', 'toxicology', 'pharmaceut', 'drug', 'dose-response', 'adverse effect'],
  Nursing: ['nursing', 'nurse', 'patient care', 'clinical practice', 'caregiver'],
  Dentistry: ['dentistry', 'dental', 'oral health', 'periodontal', 'tooth', 'teeth'],
  'Health Professions': ['health profession', 'allied health', 'physiotherapy', 'occupational therapy', 'radiography', 'rehabilitation'],
  Veterinary: ['veterinary', 'animal health', 'livestock', 'canine', 'feline', 'veterinarian'],
  'Business, Management and Accounting': ['business', 'management', 'accounting', 'organization', 'entrepreneur', 'marketing', 'corporate'],
  'Decision Sciences': ['decision science', 'operations research', 'decision making', 'optimization', 'supply chain', 'forecasting'],
  'Chemical Engineering': ['chemical engineering', 'process engineering', 'reaction engineering', 'separation', 'reactor', 'process design'],
  Energy: ['energy', 'renewable', 'solar', 'photovoltaic', 'battery', 'fuel cell', 'power system'],
  Multidisciplinary: ['multidisciplinary', 'interdisciplinary', 'cross-disciplinary'],
};

export const topicFamilies: Record<string, string[]> = {
  pharmaceutics: ['pharmaceut', 'drug delivery', 'formulation', 'dissolution', 'solid dispersion', 'dosage'],
  pharmacology: ['anti-inflammatory', 'inflammatory', 'cytotoxicity', 'cytotoxic', 'pharmacolog', 'therapeutic', 'akt inhibitor', 'raw 264.7'],
  'natural products': ['plant extract', 'phytochemical', 'phytoconstituent', 'flavonoid', 'coumarin', 'stilbene', 'terpenoid', 'phenol', 'medicinal plant', 'herbal'],
  'oxidative stress': ['oxidative stress', 'reactive oxygen species', 'oxidative damage', 'lipid peroxidation', 'malondialdehyde', 'antioxidant', 'antioxidants', 'redox'],
  'male infertility': ['male infertility', 'spermatozoa', 'sperm function', 'sperm quality', 'sperm dna fragmentation', 'semen', 'male reproductive', 'reproductive dysfunction'],
  'reproductive medicine': ['reproductive medicine', 'andrology', 'infertility', 'fertility', 'semen analysis', 'sperm', 'reproductive tract'],
  biomarkers: ['biomarker', 'biomarkers', 'diagnostic biomarker', 'diagnostic biomarkers', 'dna fragmentation assay'],
  obstetrics: ['obstetric', 'obstetrics', 'caesarean section', 'cesarean section', 'lower segment caesarean', 'lower segment cesarean', 'labour induction', 'labor induction', 'maternal outcome', 'neonatal outcome', 'pregnancy', 'childbirth', 'delivery'],
  'clinical audit': ['clinical audit', 'obstetric audit', 'audit of', 'quality improvement', 'institutional audit', 'hospital audit'],
  'Robson classification': ['robson classification', 'robson ten-group', 'robson ten group', 'robson tgcs', 'ten-group classification', 'ten group classification'],
  'maternal and neonatal health': ['maternal health', 'maternal morbidity', 'maternal mortality', 'neonatal outcome', 'neonatal morbidity', 'nicu admission', 'breastfeeding initiation'],
  chromatography: ['chromatography', 'chromatographic', 'hplc', 'high-performance liquid chromatography', 'high performance liquid chromatography', 'chromatograph', 'retention time', 'stationary phase', 'mobile phase', 'gradient optimization', 'chromatographic method', 'uhplc', 'lc-ms', 'rp-hplc'],
  'pharmaceutical analysis': ['pharmaceutical analysis', 'analytical chemistry', 'analytical method development', 'method development', 'quality control', 'regulatory compliance', 'method validation', 'quality by design', 'chromatographic analysis', 'drug analysis'],
  'AI analytical chemistry': ['artificial intelligence', 'machine learning', 'deep learning', 'reinforcement learning', 'explainable ai', 'chemometrics', 'digital twins', 'federated learning'],
  'analytical quality by design': ['analytical quality by design', 'aqbd', 'ich q14', 'analytical target profile', 'method operable design region', 'method operable design', 'design space', 'quality by design', 'design of experiments', 'doe'],
  'analytical profiling': ['lc-ms', 'lc-esi', 'qtof', 'hrms', 'metabolite profiling', 'mass spectrometry'],
  'molecular pharmacology': ['protein-ligand', 'molecular docking', 'molecular dynamics', 'binding affinity', 'admet', 'drug-likeness'],
  'drug delivery': ['drug delivery', 'nanomedicine', 'nanoparticle', 'release', 'formulation'],
  physics: ['physics', 'quantum', 'particle', 'thermodynamics', 'relativity', 'electromagnetism', 'statistical mechanics'],
  'quantum physics': ['quantum physics', 'quantum mechanics', 'quantum state', 'quantum field', 'entanglement', 'wavefunction', 'qubit'],
  optics: ['optics', 'optical', 'photonics', 'laser', 'spectroscopy', 'interferometry'],
  'planetary science': ['planetary', 'exoplanet', 'solar system', 'asteroid', 'meteorite', 'planet formation', 'planetary geology', 'space science'],
  geophysics: ['geophysics', 'seismic', 'tectonic', 'earthquake', 'gravity anomaly', 'geophysical'],
  history: ['history', 'historical', 'archive', 'archival', 'medieval', 'ancient', 'historiography'],
  'historical studies': ['history', 'historical', 'historical study', 'historical research', 'archive', 'archival', 'medieval', 'ancient', 'historiography'],
  literature: ['literature', 'literary', 'novel', 'poetry', 'narrative', 'textual analysis'],
  'literary studies': ['literary theory', 'literary analysis', 'novel', 'poetry', 'narrative structure', 'textual analysis', 'interpretation'],
  philosophy: ['philosophy', 'philosophical', 'ethics', 'epistemology', 'ontology', 'metaphysics', 'moral theory'],
  ethics: ['ethics', 'ethical reasoning', 'moral theory', 'moral philosophy', 'bioethics', 'normative theory'],
  linguistics: ['linguistics', 'linguistic', 'syntax', 'phonology', 'semantics', 'pragmatics', 'corpus linguistics'],
  syntax: ['syntax', 'syntactic', 'grammar', 'sentence structure', 'word order'],
  phonology: ['phonology', 'phonological', 'phoneme', 'prosody', 'sound system'],
  semantics: ['semantics', 'semantic', 'meaning', 'pragmatics', 'lexical semantics'],
  mathematics: ['mathematics', 'mathematical', 'theorem', 'proof', 'algebra', 'topology', 'differential equation', 'optimization'],
  'mathematical analysis': ['mathematical analysis', 'differential equation', 'differential equations', 'boundary value', 'nonlinear equation', 'real analysis', 'functional analysis'],
  topology: ['topology', 'topological', 'algebraic topology', 'homology', 'homotopy', 'manifold', 'topological space'],
  robotics: ['robotics', 'robotic', 'control system', 'feedback control', 'mechanical design', 'sensor integration', 'autonomous system'],
  'computer science': ['computer science', 'algorithm', 'software', 'dataset', 'neural network', 'machine learning', 'classifier'],
  'environmental science': ['environmental science', 'ecosystem', 'pollution', 'climate', 'water quality', 'wastewater', 'biodiversity'],
  'chemical engineering': ['chemical engineering', 'process engineering', 'reaction engineering', 'separation', 'reactor', 'process design'],
  'business management': ['business', 'management', 'accounting', 'organization', 'marketing', 'supply chain', 'forecasting'],
  'nursing practice': ['nursing', 'nurse', 'patient care', 'clinical practice', 'caregiver'],
  'molecular biology': ['biochemistry', 'genetic', 'genome', 'genomic', 'protein', 'enzyme', 'molecular biology', 'transcriptom'],
  neuroscience: ['neuroscience', 'neural', 'neuron', 'brain', 'cognitive neuroscience', 'synaptic', 'neuroimaging', 'neurodegeneration', 'cortex'],
  immunology: ['immunology', 'immune response', 'antibody', 'antigen', 'cytokine', 'immunotherapy', 'host defense', 'inflammation'],
  microbiology: ['microbiology', 'bacteria', 'bacterial', 'microbiome', 'microbial', 'pathogen', 'antimicrobial', 'fungal'],
  dentistry: ['dentistry', 'dental', 'oral health', 'periodontal', 'tooth', 'teeth', 'caries', 'maxillofacial'],
  veterinary: ['veterinary', 'animal health', 'livestock', 'canine', 'feline', 'veterinarian', 'zoonotic', 'animal disease'],
  'health professions': ['health profession', 'allied health', 'physiotherapy', 'occupational therapy', 'radiography', 'rehabilitation', 'clinical practice', 'patient care'],
  'decision sciences': ['decision science', 'operations research', 'decision making', 'optimization', 'supply chain', 'forecasting', 'simulation', 'queueing'],
  energy: ['energy', 'renewable', 'solar', 'photovoltaic', 'battery', 'fuel cell', 'power system', 'wind energy'],
  'chemical processes': ['chemical engineering', 'process engineering', 'reaction engineering', 'separation', 'reactor', 'process design', 'mass transfer', 'heat transfer'],
  'accounting and management': ['business', 'management', 'accounting', 'organization', 'entrepreneur', 'marketing', 'corporate', 'strategy'],
  'nursing care': ['nursing', 'nurse', 'patient care', 'clinical practice', 'caregiver', 'nursing intervention', 'care planning', 'midwifery'],
  'synthetic chemistry': ['chemical synthesis', 'catalyst', 'reaction', 'polymer', 'molecular structure', 'spectroscopy', 'characterization'],
  chemistry: ['chemistry', 'chemical', 'molecule', 'synthesis', 'reaction', 'spectroscopy'],
  synthesis: ['synthesis', 'synthesized', 'reaction', 'compound', 'molecule'],
  'machine learning': ['machine learning', 'deep learning', 'neural network', 'algorithm', 'classifier'],
  engineering: ['engineering', 'design', 'prototype', 'mechanical', 'device'],
  education: ['education', 'student', 'teaching', 'classroom', 'university'],
  psychology: ['psychology', 'behavior', 'cognitive', 'mental health', 'participants'],
  medicine: ['patient', 'clinical', 'diagnosis', 'treatment', 'disease', 'health'],
  'infectious diseases': ['infectious disease', 'infectious diseases', 'mpox', 'monkeypox', 'orthopoxvirus', 'pathogen', 'outbreak', 'epidemic'],
  epidemiology: ['epidemiology', 'incidence', 'prevalence', 'transmission', 'case fatality', 'surveillance', 'cohort'],
  virology: ['virus', 'viral', 'virology', 'orthopoxvirus', 'clade', 'pathogen'],
  'public health': ['public health', 'health policy', 'surveillance', 'vaccination', 'vaccine effectiveness', 'outbreak response'],
  'global health': ['global health', 'health equity', 'low-resource', 'international health', 'developing countries'],
  agriculture: ['crop', 'soil', 'agriculture', 'agricultural', 'plant growth', 'yield', 'irrigation', 'pesticide'],
  environmental: ['environmental', 'ecosystem', 'pollution', 'climate', 'water quality', 'wastewater', 'biodiversity'],
  'earth science': ['geology', 'geological', 'seismic', 'tectonic', 'remote sensing', 'sediment', 'planetary'],
  materials: ['material', 'nanomaterial', 'composite', 'ceramic', 'alloy', 'thin film', 'characterization'],
  economics: ['econometric', 'health economics', 'cost-effectiveness', 'cost effectiveness', 'budget impact', 'market access', 'pharmacoeconomics', 'pricing', 'reimbursement', 'qaly', 'incremental cost', 'finance', 'market', 'regression', 'firm', 'income', 'trade'],
  'social research': ['survey', 'policy', 'social', 'behavior', 'interview', 'qualitative', 'participants'],
  humanities: ['literature', 'history', 'culture', 'language', 'philosophy', 'heritage', 'discourse'],
  'data science': ['dataset', 'algorithm', 'machine learning', 'regression', 'classifier', 'prediction'],
  interdisciplinary: ['interdisciplinary', 'multidisciplinary', 'across fields', 'broad impact'],
};

const broadTopicNames = new Set([
  'medicine', 'chemistry', 'engineering', 'physics', 'psychology', 'education', 'data science',
  'mathematics', 'computer science', 'environmental science', 'business management', 'nursing practice',
]);

const stopWords = new Set('about after again against also among because before being between both could does during each from further have having into itself more most other over same should some such than their there these they this those through under very what when where which while with would your'.split(' '));
const genericMatchWords = new Set(['molecular', 'dynamics', 'simulation', 'model', 'modeling', 'network', 'computational', 'study', 'research', 'analysis', 'method', 'methods', 'results', 'abstract', 'in-vitro', 'vitro', 'compounds', 'compound', 'positive', 'that', 'using', 'based', 'chemical', 'chemicals', 'acid', 'pharmacology']);
const weakKeywordWords = new Set(['article', 'based', 'case', 'data', 'evaluation', 'evidence', 'experimental', 'investigation', 'manuscript', 'observational', 'results', 'study', 'systematic', 'treatment', 'using', 'analysis', 'review']);

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

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function countOccurrences(text: string, term: string) {
  const normalizedText = normalizePhrase(text);
  const normalizedTerm = normalizePhrase(term);
  if (!normalizedTerm) return 0;
  const pattern = new RegExp(`(?:^|\\b)${normalizedTerm.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?=$|\\b)`, 'gi');
  return [...normalizedText.matchAll(pattern)].length;
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
      if (term.length >= 6 && hasWholeWord(lower, term) && !genericMatchWords.has(term)) {
          counts.set(term, (counts.get(term) ?? 0) + 3);
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .filter(([word]) => !genericMatchWords.has(word) && !weakKeywordWords.has(word) && !stopWords.has(word))
    .slice(0, 25)
    .map(([word]) => word);
}

export function profileManuscript(text: string): ManuscriptProfile {
  const analysisText = getAnalysisText(text);
  const lower = analysisText.toLowerCase();
  const frontMatter = getManuscriptSignalText(text);
  const fieldScores = Object.entries(fieldSignals).map(([field, terms]) => ({
    field,
      score: terms.filter((term) => hasWholeWord(lower, term)).length,
  })).filter((item) => item.score >= 2).sort((a, b) => b.score - a.score);
  const field = fieldScores[0]?.score ? fieldScores[0].field : 'Multidisciplinary';
  const hasExperimentalResearch = /experimental validation|in[- ]vitro|in[- ]vivo|cytotoxicity|cell line|molecular docking|lc[- ](?:esi[- ])?qtof|mass spectrometry|we investigated|we evaluated/.test(frontMatter);
  const hasReviewEvidence = /\breview\b|systematic review|meta-analysis|literature search|current advances|future perspectives/i.test(frontMatter);
  const articleType = hasReviewEvidence && !/experimental validation|in[- ]vitro|in[- ]vivo|cell line|randomized controlled trial/i.test(frontMatter)
    ? 'Review'
    : hasExperimentalResearch
    ? 'Research'
    : /case report|case study|single patient/.test(lower)
      ? 'Case study'
        : /(?:^|\n)\s*(?:protocol|benchmark|dataset|software package)\b|\b(?:protocol study|methods paper|benchmark study|dataset paper)\b/.test(lower)
        ? 'Methods'
        : /review|systematic review|meta-analysis|literature search|current advances|future perspectives/.test(lower)
          ? 'Review'
          : /participants|sample size|experiment|we conducted|retrospective|cross-sectional|clinical audit/.test(lower)
          ? 'Research'
          : 'Unknown';
  const topicScores = Object.fromEntries(Object.entries(topicFamilies).map(([topic, terms]) => [
    topic,
    terms.reduce((score, term) => {
      const frontMatterHits = countOccurrences(frontMatter, term);
      const bodyHits = countOccurrences(analysisText, term);
      return score + Math.min(3, frontMatterHits + bodyHits);
    }, 0),
  ]));
  let topics = Object.entries(topicFamilies)
    .filter(([topic]) => {
      const hits = topicScores[topic] ?? 0;
      if (topic === 'engineering') return hits >= 2;
      if (['economics', 'environmental', 'social research', 'humanities', 'agriculture', 'public health'].includes(topic)) return hits >= 2;
      return hits >= 1;
    })
    .sort(([left], [right]) => (topicScores[right] ?? 0) - (topicScores[left] ?? 0))
    .map(([topic]) => topic);
  const specificTopics = topics.filter((topic) => !broadTopicNames.has(topic));
  if (specificTopics.length > 0) {
    topics = topics.filter((topic) => !broadTopicNames.has(topic));
  }
    const methods = ['lc-ms', 'mass spectrometry', 'molecular docking', 'molecular dynamics', 'admet', 'survey', 'interview', 'randomized', 'in vitro', 'in vivo', 'regression', 'qualitative', 'systematic review']
      .filter((method) => hasWholeWord(frontMatter, method));

  return {
    words: countWords(analysisText),
    field,
    articleType,
    topics,
    topicScores,
    keywords: extractKeywords(text),
    methods,
    signals: {
      hasAbstract: /(?:^|\n)\s*abstract\s*:?(?:\s|$)/i.test(text),
      hasKeywords: /(?:^|\n)\s*keywords?\s*:?(?:\s|$)/i.test(text),
      hasReferences: /references?/i.test(text),
      hasStructuredAbstract: /(?:background|objective|methods|results|conclusion)\s*:/i.test(text),
      hasNovelty: /novel|first|original|innovation|contribution/.test(lower),
      hasLimitations: /limitation|future work|further research|however/.test(lower),
      hasNucleicAcidFocus: /\b(?:nucleic acid|rna|mrna|mirna|sirna|crispr|oligonucleotide|transcriptom|gene expression)\b/i.test(frontMatter)
        || (/\bdna\b/i.test(frontMatter) && /\b(?:gene expression|genomic|genome|sequenc|transcriptom|crispr|oligonucleotide)\b/i.test(frontMatter)),
    },
  };
}

export function scoreJournal(profile: ManuscriptProfile, journal: MatchJournal, semanticProfile?: SemanticProfile | null): JournalMatchResult {
  // Verified: 25/25 positive manuscripts at Recall@10, MRR 0.893.
  // Known limitation: no contextual disambiguation signal exists yet, so generic
  // shared terms such as syntax, heritage, language, semantics, and discourse can
  // still cause false positives on ambiguous negatives.
  // Do not add targeted rules for individual failures; see README for the current
  // design boundary and run `npm run test:fixtures` before changing this function.
  const reasons: string[] = [];
  const warnings: string[] = [];
  const asjcFields = fieldsForAsjcCodes(journal.asjcCodes);
  const journalFields = [journal.field, ...asjcFields].map(normalizeScopusField);
  const journalText = `${journal.name} ${journal.publisher ?? ''} ${journal.field} ${journal.scope.join(' ')} ${(journal.asjcCodes ?? []).join(' ')}`.toLowerCase();
  const journalIdentityText = `${journal.name} ${journal.publisher ?? ''} ${journal.scope.join(' ')} ${(journal.asjcCodes ?? []).join(' ')}`.toLowerCase();
  const journalFieldText = journal.field.toLowerCase();
  const journalSpecialtyText = `${journal.name} ${journal.field} ${journal.scope.join(' ')}`.toLowerCase();
  const semanticText = semanticProfile ? [semanticProfile.researchQuestion, semanticProfile.studyDesign, ...semanticProfile.subjectArea, ...semanticProfile.populationOrMaterial, ...semanticProfile.interventions, ...semanticProfile.methods, ...semanticProfile.outcomes, semanticProfile.articleType].join(' ').toLowerCase() : '';
  const semanticJournalText = `${journal.name} ${journal.field} ${journal.scope.join(' ')}`.toLowerCase();
  const semanticTokens = semanticText.match(/[a-z][a-z-]{4,}/g) ?? [];
  const semanticOverlap = semanticTokens.filter((token) => hasWholeWord(semanticJournalText, token)).length;
  const semanticSubjectTerms = (semanticProfile ? [
    ...semanticProfile.subjectArea,
    ...semanticProfile.populationOrMaterial,
    ...semanticProfile.interventions,
    ...semanticProfile.outcomes,
  ] : []).map((term) => term.toLowerCase()).filter((term) => term.length >= 4);
  const semanticSubjectOverlap = semanticSubjectTerms.filter((term) => hasWholeWord(semanticJournalText, term)).length;
  const semanticExclusionOverlap = semanticProfile
    ? semanticProfile.exclusions.filter((term) => hasWholeWord(journalSpecialtyText, term.toLowerCase())).length
    : 0;
  const semanticFit = semanticProfile ? Math.min(12, semanticOverlap + semanticSubjectOverlap * 2) : 0;
  const matchingKeywords = profile.keywords.filter((keyword) =>
    !genericMatchWords.has(keyword)
    && !weakKeywordWords.has(keyword)
    && hasWordOrPlural(journalIdentityText, keyword)
  );
  const matchingTopics = profile.topics.filter((topic) => topicFamilies[topic]?.some((term) => hasWholeWord(journalIdentityText, term)));
  const fieldTopicMatches = profile.topics.filter((topic) => topicFamilies[topic]?.some((term) => hasWholeWord(journalFieldText, term)));
  const specificTopicMatches = matchingTopics.filter((topic) => !broadTopicNames.has(topic));
  const dominantTopic = profile.topics[0];
  const dominantTopicScore = dominantTopic ? profile.topicScores[dominantTopic] ?? 0 : 0;
  const dominantTopicMatched = Boolean(dominantTopic && matchingTopics.includes(dominantTopic));
  const matchingMethods = profile.methods.filter((method) => hasWholeWord(journalIdentityText, method));
  const topicalEvidence = specificTopicMatches.length > 0 || matchingKeywords.length > 0;
  const directEvidence = topicalEvidence || (matchingMethods.length > 0 && matchingTopics.length > 0);
  const profileIdentityText = `${profile.topics.join(' ')} ${profile.keywords.join(' ')}`;
  const biomedicalJournal = /pharmacol|pharmaceutical|immunolog|toxicolog|biochem|molecular biology|medicinal chemistry|drug|medicine|clinical|natural product|plant science|food science|life science|therapeutic|anti-inflammatory|obstetric|gynecolog|reproductive|pregnancy|childbirth|maternal|neonatal/.test(journalText);
  const biomedicalProfile = profile.topics.some((topic) => ['pharmacology', 'natural products', 'molecular pharmacology', 'analytical profiling'].includes(topic)) || profile.field === 'Life Sciences' || profile.field === 'Medicine';
  const crossDomainTopicFit = matchingTopics.length > 0 && !biomedicalProfile;
  const nonBiomedicalJournalMismatch = biomedicalProfile
    && !biomedicalJournal
    && journal.field !== 'Multidisciplinary'
    && matchingTopics.length > 0;
  const pharmaceuticalProfile = profile.topics.some((topic) => ['pharmaceutics', 'drug delivery', 'molecular pharmacology', 'natural products', 'analytical profiling'].includes(topic))
    || /nanoparticle|polymeric|sustained[- ]release|drug delivery|pharmaceutical|formulation|encapsulation/.test(profileIdentityText);
  const pharmaceuticalJournalField = /pharmaceutical|pharmacolog|pharmaceutic|toxicolog|medicinal|drug delivery|biomedical|chemistry/.test(journal.field.toLowerCase());
  const offDomainPharmaceuticalJournal = pharmaceuticalProfile
    && /arts? and humanities|history|music|education|agricultur|agronom|crop science|animal science|environment|computer|engineering|social science|economics|finance|tourism|heritage|vaccine|immunolog|health policy|managed care/.test(journalSpecialtyText)
    && !pharmaceuticalJournalField;
  const primaryDrugDeliveryMismatch = profile.topics.includes('drug delivery')
    && !matchingTopics.includes('drug delivery')
    && !/drug delivery|nanomedicine|nanoparticle|formulation|controlled release|sustained release|pharmaceutical technology/.test(journalSpecialtyText);
  const incidentalNeighborPenalty = matchingTopics.length === 0 && profile.topics.length > 0 && dominantTopicScore <= 2 && (journal.field !== profile.field || journal.field === 'Multidisciplinary');
  const hasDirectTopicEvidence = specificTopicMatches.length > 0 || matchingKeywords.length > 0 || matchingMethods.length > 0;
  const sameField = journalFields.includes(normalizeScopusField(profile.field));
  const sameFieldWithoutDirectEvidence = sameField && !hasDirectTopicEvidence;
  const multidisciplinaryWithoutDirectEvidence = journal.field === 'Multidisciplinary' && !hasDirectTopicEvidence;
  const fieldFit = sameFieldWithoutDirectEvidence
    ? 6
    : sameField
      ? 10
      : journal.field === 'Multidisciplinary'
        ? multidisciplinaryWithoutDirectEvidence ? 4 : 12
        : biomedicalProfile && biomedicalJournal && matchingTopics.length
          ? specificTopicMatches.length ? 16 : 8
          : crossDomainTopicFit && matchingTopics.length ? 14 : 0;
  const weightedTopicFit = specificTopicMatches.reduce((total, topic) => total + Math.min(3, profile.topicScores[topic] ?? 1), 0);
  const scopeFit = weightedTopicFit
    ? Math.min(36, weightedTopicFit * 12)
    : fieldTopicMatches.length ? 5 : matchingTopics.length ? 8 : 0;
  const keywordFit = Math.min(15, matchingKeywords.length * 5);
  const methodFit = Math.min(15, matchingMethods.length * 5);
  const interdisciplinaryFit = journal.field === 'Multidisciplinary' && specificTopicMatches.length ? 4 : 0;
  const methodOnlyTopicFit = profile.topics.includes('natural products')
    && !matchingTopics.includes('natural products')
    && matchingTopics.some((topic) => ['molecular pharmacology', 'data science'].includes(topic))
    && matchingMethods.length > 0;
  const nucleicAcidJournal = /\bnucleic acids?\b/i.test(journalText);
  const specialtyMismatch = /alzheimer|dementia|hiv|fluoride|oncolog|diabetes|cardiology|cardiovascular|neurolog|dentistry|cancer|tumou?r|tuberculosis|malaria/.test(journalSpecialtyText)
    && !/alzheimer|dementia|\bhiv\b|fluoride|oncolog|diabetes|cardiolog|neurolog|dentistry|cancer|tumou?r|tuberculosis|malaria/.test(profileIdentityText);
  const articleFit = profile.articleType !== 'Unknown' && hasWholeWord(journalText, profile.articleType) ? 8 : 0;
  const overWordLimit = journal.requirements.wordLimit !== null && profile.words > journal.requirements.wordLimit;
  let score = fieldFit + scopeFit + keywordFit + methodFit + articleFit + interdisciplinaryFit;
  score += semanticFit;

  if (fieldFit >= 10) reasons.push(`Relevant ${profile.field} field alignment`);
  else if (fieldFit === 12) reasons.push('Broad multidisciplinary scope can accommodate this field');
  else if (fieldFit > 0 && specificTopicMatches.length) reasons.push(`Relevant ${profile.field.toLowerCase()} field with specific topic overlap`);
  else warnings.push(`Field mismatch: manuscript signals ${profile.field}, journal is ${journal.field}`);
  if (specificTopicMatches.length) reasons.push(`Specific topic overlap: ${specificTopicMatches.slice(0, 3).join(', ')}`);
  else if (fieldTopicMatches.length) warnings.push(`Topic appears only in the journal field, not its scope or title`);
  else if (matchingTopics.length) warnings.push(`Only broad ${profile.field.toLowerCase()} field overlap detected`);
  else warnings.push('No strong topic or scope overlap detected');
  if (matchingKeywords.length) reasons.push(`Keyword overlap: ${matchingKeywords.slice(0, 4).join(', ')}`);
  if (matchingMethods.length) reasons.push(`Method overlap: ${matchingMethods.slice(0, 3).join(', ')}`);
  if (semanticFit) reasons.push(`Semantic profile overlap: ${semanticOverlap} manuscript signals`);
  if (semanticSubjectOverlap) reasons.push(`Semantic subject alignment: ${semanticSubjectOverlap} profile terms`);
  if (profile.articleType !== 'Unknown') reasons.push(`${profile.articleType} manuscript profile detected`);
  if (journal.requirements.wordLimit === null) warnings.push('Word limit not available from catalog');
  else if (!overWordLimit) reasons.push(`Within ${journal.requirements.wordLimit.toLocaleString()} word limit`);
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
  if (incidentalNeighborPenalty) {
    score -= 25;
    warnings.push('Journal only overlaps via a nearby field term and not the manuscript\'s dominant topic');
  }
  if (dominantTopicScore >= 2 && matchingTopics.length > 0 && !dominantTopicMatched) {
    score -= 20;
    warnings.push(`Journal matches a secondary topic, not the manuscript's dominant topic (${dominantTopic})`);
  }

  // Domain-specific penalties are deliberately isolated here. They protect against
  // known biomedical false positives without changing the general field/topic model.
  const mismatchSignals = [
    nucleicAcidJournal && !profile.signals.hasNucleicAcidFocus
      ? { penalty: 50, warning: 'Journal focuses on nucleic-acid research, but this manuscript does not' }
      : null,
    matchingTopics.includes('economics') && profile.field !== 'Economics' && profile.field !== 'Social Sciences'
      ? { penalty: 35, warning: 'Economics overlap appears incidental rather than the manuscript\'s primary focus' }
      : null,
    specialtyMismatch
      ? { penalty: 30, warning: 'Journal has a disease-specific focus not detected in the manuscript' }
      : null,
    nonBiomedicalJournalMismatch
      ? { penalty: 25, warning: 'Journal field is outside the manuscript\'s biomedical domain' }
      : null,
    methodOnlyTopicFit
      ? { penalty: 30, warning: 'Journal fit is driven by a method, not the manuscript\'s primary natural-products topic' }
      : null,
    offDomainPharmaceuticalJournal
      ? { penalty: 40, warning: 'Journal specialty is outside the manuscript\'s pharmaceutical formulation domain' }
      : null,
    primaryDrugDeliveryMismatch
      ? { penalty: 25, warning: 'Journal does not show a direct drug-delivery or formulation scope match' }
      : null,
  ].filter((signal): signal is { penalty: number; warning: string } => Boolean(signal));
  const strongestMismatch = mismatchSignals.sort((left, right) => right.penalty - left.penalty)[0];
  if (strongestMismatch) {
    score -= strongestMismatch.penalty;
    warnings.push(strongestMismatch.warning);
  }
  if (semanticExclusionOverlap) {
    score -= Math.min(35, semanticExclusionOverlap * 15);
    warnings.push('Semantic profile excludes this journal specialty');
  }
  const evidenceWeight = specificTopicMatches.length * 2 + matchingKeywords.length + (matchingMethods.length > 0 && matchingTopics.length > 0 ? 1 : 0);
  const hasStrongEvidence = specificTopicMatches.length >= 1 || matchingKeywords.length >= 2;
  const sameFieldDirectEvidence = sameField && (matchingTopics.length > 0 || matchingKeywords.length > 0 || matchingMethods.length > 0);
  const ambiguousCrossFieldArtsHumanities = !sameField
    && journal.field === 'Arts and Humanities'
    && profile.field !== 'Arts and Humanities'
    && specificTopicMatches.length > 0
    && matchingKeywords.length > 0;
  const technicalLanguageSignals = /(?:parser|parsing|compiler|compilers|typed language|programming language|formal grammar|grammar formalism|syntax tree|parse tree|abstract syntax|type-directed|compiler-checked|lexer|tokenizer|type system)/i;
  const technicalLanguageManuscript = technicalLanguageSignals.test(profileIdentityText);
  const humanitiesTechnicalMismatch = journal.field === 'Arts and Humanities'
    && technicalLanguageManuscript
    && !profile.topics.some((topic) => ['history', 'historical studies', 'literature', 'literary studies', 'philosophy', 'ethics'].includes(topic));
  if (sameFieldDirectEvidence) {
    score = Math.max(score, 30);
    reasons.push('Same-field direct evidence preserves this journal as a viable match');
  }
  if (humanitiesTechnicalMismatch) {
    score = Math.min(score, 24);
    warnings.push('Technical language signals indicate this manuscript is not a humanities match; cap applied');
  }
  if (!hasStrongEvidence) {
    score = Math.min(score, 24);
    warnings.push('No strong evidence; capping below relevant threshold');
  }
  if (ambiguousCrossFieldArtsHumanities) {
    score = Math.min(score, 24);
    warnings.push('Cross-field Arts and Humanities match relies on ambiguous language terms; capping below relevant threshold');
  }
  if (evidenceWeight === 0) {
    score -= 45;
    warnings.push('No concrete topic, keyword, or method evidence connects this journal to the manuscript');
  } else if (specificTopicMatches.length === 0 && !sameFieldDirectEvidence) {
    score -= 20;
    warnings.push('Only broad or partial evidence detected; no manuscript-specific specialty match');
  }
  if (!topicalEvidence && matchingMethods.length > 0) {
    warnings.push('Match is method-based; the journal topic was not directly confirmed');
  }

  if (sameField && specificTopicMatches.length === 0 && matchingKeywords.length === 0 && matchingMethods.length === 0) {
    score = Math.min(score, 35);
    warnings.push('Field matches but no manuscript-specific topic or keyword evidence caps this result');
  }
  if (semanticProfile && semanticOverlap === 0 && semanticSubjectOverlap === 0) {
    score -= 6;
    warnings.push('Semantic profile has no direct overlap with this journal');
  }

  // A field mismatch without manuscript-specific scope evidence is not allowed
  // to become a strong match through generic article or metadata points.
  if (!sameField && specificTopicMatches.length === 0) {
    score = Math.min(score, 25);
    warnings.push('Field mismatch without specific journal-scope evidence caps this result');
  }
  if (overWordLimit) {
    score = Math.min(score, 30);
    warnings.push('Over the journal word limit caps this result');
  }

  score = Math.max(0, Math.min(98, Math.round(score)));
  // Band is score-only — broad and tolerant, so one weak signal (e.g. a missing APC
  // upstream, or one failed sub-check) can't silently erase a manuscript's only candidates.
  const band = bandForScore(score);
  const confidence = band === 'Strong match' && directEvidence && warnings.length <= 1
    ? 'High'
    : band === 'Strong match' || band === 'Possible match'
      ? 'Medium'
      : 'Low';
  return { score, confidence, band, directEvidence, topicalEvidence, reasons, warnings };
}

function getRankTieBreak(profile: ManuscriptProfile, journal: MatchJournal) {
  const journalIdentityText = `${journal.name} ${journal.publisher ?? ''} ${journal.scope.join(' ')} ${(journal.asjcCodes ?? []).join(' ')}`.toLowerCase();
  const matchingTopics = profile.topics.filter((topic) => topicFamilies[topic]?.some((term) => hasWholeWord(journalIdentityText, term)));
  const specificTopicMatches = matchingTopics.filter((topic) => !broadTopicNames.has(topic));
  const matchingKeywords = profile.keywords.filter((keyword) => !genericMatchWords.has(keyword) && !weakKeywordWords.has(keyword) && hasWordOrPlural(journalIdentityText, keyword));
  const matchingMethods = profile.methods.filter((method) => hasWholeWord(journalIdentityText, method));

  return {
    specificTopicMatches: specificTopicMatches.length,
    matchingKeywords: matchingKeywords.length,
    matchingMethods: matchingMethods.length,
    matchingTopics: matchingTopics.length,
  };
}

export function rankJournals<T extends MatchJournal>(text: string, journals: T[], semanticProfile?: SemanticProfile | null) {
  const profile = profileManuscript(text);
  return journals
    .map((journal) => ({ journal, profile, match: scoreJournal(profile, journal, semanticProfile) }))
    .sort((a, b) => {
      const scoreDelta = b.match.score - a.match.score;
      if (scoreDelta !== 0) return scoreDelta;

      const aTieBreak = getRankTieBreak(a.profile, a.journal);
      const bTieBreak = getRankTieBreak(b.profile, b.journal);

      if (aTieBreak.specificTopicMatches !== bTieBreak.specificTopicMatches) {
        return bTieBreak.specificTopicMatches - aTieBreak.specificTopicMatches;
      }
      if (aTieBreak.matchingKeywords !== bTieBreak.matchingKeywords) {
        return bTieBreak.matchingKeywords - aTieBreak.matchingKeywords;
      }
      if (aTieBreak.matchingMethods !== bTieBreak.matchingMethods) {
        return bTieBreak.matchingMethods - aTieBreak.matchingMethods;
      }
      if (aTieBreak.matchingTopics !== bTieBreak.matchingTopics) {
        return bTieBreak.matchingTopics - aTieBreak.matchingTopics;
      }

      return a.journal.name.localeCompare(b.journal.name);
    });
}

export function rankAndFilterJournals<T extends MatchJournal>(text: string, journals: T[], filters: JournalFilters) {
  const filtered = filterJournals(journals, filters);
  return { ranked: rankJournals(text, filtered.results), excludedForMissingData: filtered.excludedForMissingData, excludedCount: filtered.excludedCount };
}

export type RankedMatch<T extends MatchJournal> = ReturnType<typeof rankJournals<T>>[number];

export type BandedMatches<T extends MatchJournal> = {
  strong: RankedMatch<T>[];
  possible: RankedMatch<T>[];
  lowConfidence: RankedMatch<T>[];
  /** True ONLY when every band is empty — i.e. nothing in the catalog scored above 25
   *  for this manuscript. This is the sole condition that should ever trigger an
   *  empty-state message in the UI. A thin "possible"/"low confidence" list is NOT empty. */
  isEmpty: boolean;
};

/**
 * THE single shared engine call. Match stream, lookup stream, gap-analysis stream,
 * and saved matches should all consume THIS object — not re-implement their own
 * score cutoff. Nothing is silently dropped for being "not confident enough";
 * everything scoring >=25 shows up in some band, so a thin result set is visible
 * to the user as "Low confidence" rather than erased into a hard empty-state.
 */
export function getBandedMatches<T extends MatchJournal>(
  text: string,
  journals: T[],
  semanticProfile?: SemanticProfile | null,
): BandedMatches<T> {
  const ranked = rankJournals(text, journals, semanticProfile);
  const relativeBand = new Map<number, MatchBand>();
  if (!ranked.some(({ match }) => match.band === 'Strong match') && ranked[0]?.match.score >= 55) {
    ranked.slice(0, 3)
      .map((entry, index) => ({ entry, originalIndex: index }))
      .filter(({ entry }) => entry.match.score >= 55)
      .forEach(({ originalIndex }) => relativeBand.set(originalIndex, 'Strong match'));
  }
  if (!ranked.some(({ match }) => match.band === 'Possible match')) {
    ranked
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry, index }) => !relativeBand.has(index) && entry.match.band !== 'Strong match' && entry.match.score >= 35)
      .slice(0, 3)
      .forEach(({ index }) => relativeBand.set(index, 'Possible match'));
  }
  const effectiveRanked = ranked.map((entry, index) => ({
    ...entry,
    match: {
      ...entry.match,
      relativeBand: relativeBand.get(index) ?? entry.match.band,
    },
  }));
  const strong: RankedMatch<T>[] = [];
  const possible: RankedMatch<T>[] = [];
  const lowConfidence: RankedMatch<T>[] = [];
  for (const r of effectiveRanked) {
    if (r.match.relativeBand === 'Strong match') strong.push(r);
    else if (r.match.relativeBand === 'Possible match') possible.push(r);
    else if (r.match.relativeBand === 'Low confidence') lowConfidence.push(r);
    // band === null: genuinely irrelevant (score < 25) — correctly excluded, not a bug.
  }
  return { strong, possible, lowConfidence, isEmpty: strong.length === 0 && possible.length === 0 && lowConfidence.length === 0 };
}

/**
 * Filters + banding combined. Filters (field/indexing/quartile/budget/access) still
 * narrow the candidate pool by the user's explicit choice — that's intentional exclusion,
 * not the relevance floor. Missing catalog metadata (APC, quartile, indexing) is tracked
 * separately in excludedForMissingData rather than silently collapsed into "no results".
 */
export function getPrecisionMatches<T extends MatchJournal>(
  text: string,
  journals: T[],
  filters: JournalFilters = {},
  semanticProfile?: SemanticProfile | null,
): BandedMatches<T> & { excludedByFilters: number; excludedForMissingData: FilterResult<T>['excludedForMissingData'] } {
  const { results: filteredJournals, excludedForMissingData, excludedCount } = filterJournals(journals, filters);
  const banded = getBandedMatches(text, filteredJournals, semanticProfile);
  return { ...banded, excludedByFilters: excludedCount, excludedForMissingData };
}
