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
  directEvidence?: boolean;
  topicalEvidence?: boolean;
  reasons: string[];
  warnings: string[];
};

const fieldSignals: Record<string, string[]> = {
  'Life Sciences': ['drug', 'pharmaceut', 'clinical', 'cell', 'protein', 'nanomedicine', 'formulation', 'biology', 'patient'],
  Chemistry: ['chemistry', 'synthesis', 'molecule', 'reaction', 'catalyst', 'polymer', 'spectroscopy', 'chemical'],
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
  'Arts and Humanities': ['literature', 'history', 'culture', 'language', 'philosophy', 'heritage', 'discourse'],
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

const broadTopicNames = new Set(['pharmacology', 'medicine', 'chemistry', 'synthesis', 'engineering', 'psychology', 'education', 'data science']);

const stopWords = new Set('about after again against also among because before being between both could does during each from further have having into itself more most other over same should some such than their there these they this those through under very what when where which while with would your'.split(' '));
const genericMatchWords = new Set(['molecular', 'dynamics', 'simulation', 'model', 'modeling', 'network', 'computational', 'study', 'research', 'analysis', 'method', 'methods', 'results', 'abstract', 'in-vitro', 'vitro', 'compounds', 'compound', 'positive', 'that', 'using', 'based', 'chemical', 'chemicals', 'acid', 'pharmacology']);

function hasWholeWord(text: string, term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\b)${escaped}(?:$|\\b)`, 'i').test(text);
}

function hasWordOrPlural(text: string, term: string) {
  if (hasWholeWord(text, term)) return true;
  if (term.length > 4 && term.endsWith('s') && hasWholeWord(text, term.slice(0, -1))) return true;
  return !term.endsWith('s') && hasWholeWord(text, `${term}s`);
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
    .filter(([word]) => !genericMatchWords.has(word))
    .slice(0, 15)
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

export function scoreJournal(profile: ManuscriptProfile, journal: MatchJournal, semanticProfile?: SemanticProfile | null): JournalMatchResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const journalText = `${journal.name} ${journal.publisher ?? ''} ${journal.field} ${journal.scope.join(' ')} ${(journal.asjcCodes ?? []).join(' ')}`.toLowerCase();
  const journalIdentityText = `${journal.name} ${journal.publisher ?? ''} ${journal.scope.join(' ')} ${(journal.asjcCodes ?? []).join(' ')}`.toLowerCase();
  const journalFieldText = journal.field.toLowerCase();
  const semanticText = semanticProfile ? [semanticProfile.researchQuestion, semanticProfile.studyDesign, ...semanticProfile.subjectArea, ...semanticProfile.populationOrMaterial, ...semanticProfile.interventions, ...semanticProfile.methods, ...semanticProfile.outcomes, semanticProfile.articleType].join(' ').toLowerCase() : '';
  const semanticJournalText = `${journal.name} ${journal.field} ${journal.scope.join(' ')}`.toLowerCase();
  const semanticTokens = semanticText.match(/[a-z][a-z-]{4,}/g) ?? [];
  const semanticOverlap = semanticTokens.filter((token) => hasWholeWord(semanticJournalText, token)).length;
  const semanticFit = semanticProfile ? Math.min(20, semanticOverlap * 2) : 0;
  const matchingKeywords = profile.keywords.filter((keyword) => !genericMatchWords.has(keyword) && hasWordOrPlural(journalIdentityText, keyword));
  const matchingTopics = profile.topics.filter((topic) => topicFamilies[topic].some((term) => journalIdentityText.includes(term)));
  const fieldTopicMatches = profile.topics.filter((topic) => topicFamilies[topic].some((term) => journalFieldText.includes(term)));
  const specificTopicMatches = matchingTopics.filter((topic) => !broadTopicNames.has(topic));
  const matchingMethods = profile.methods.filter((method) => hasWholeWord(journalIdentityText, method));
  const topicalEvidence = specificTopicMatches.length > 0 || matchingKeywords.length > 0;
  const directEvidence = topicalEvidence || (matchingMethods.length > 0 && matchingTopics.length > 0);
  const profileIdentityText = `${profile.topics.join(' ')} ${profile.keywords.join(' ')}`;
  const journalSpecialtyText = `${journal.name} ${journal.field} ${journal.scope.join(' ')}`.toLowerCase();
  const biomedicalJournal = /pharmacol|pharmaceutical|immunolog|toxicolog|biochem|molecular biology|medicinal chemistry|drug|medicine|clinical|natural product|plant science|food science|life science|therapeutic|anti-inflammatory/.test(journalText);
  const biomedicalProfile = profile.topics.some((topic) => ['pharmacology', 'natural products', 'molecular pharmacology', 'analytical profiling'].includes(topic)) || profile.field === 'Life Sciences' || profile.field === 'Medicine';
  const dominantTopicScore = profile.topics.reduce((acc, topic) => acc + (topicFamilies[topic]?.filter((term) => profileIdentityText.includes(term)).length ?? 0), 0);
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
  const sameFieldWithoutDirectEvidence = journal.field === profile.field && !hasDirectTopicEvidence;
  const multidisciplinaryWithoutDirectEvidence = journal.field === 'Multidisciplinary' && !hasDirectTopicEvidence;
  const fieldFit = sameFieldWithoutDirectEvidence
    ? 6
    : journal.field === profile.field
      ? 30
      : journal.field === 'Multidisciplinary'
        ? multidisciplinaryWithoutDirectEvidence ? 4 : 12
        : biomedicalProfile && biomedicalJournal && matchingTopics.length
          ? specificTopicMatches.length ? 16 : 8
          : crossDomainTopicFit && matchingTopics.length ? 14 : 0;
  const scopeFit = specificTopicMatches.length
    ? Math.min(30, specificTopicMatches.length * 15)
    : fieldTopicMatches.length ? 5 : matchingTopics.length ? 8 : 0;
  const keywordFit = Math.min(15, matchingKeywords.length * 5);
  const methodFit = Math.min(15, matchingMethods.length * 5);
  const biomedicalFit = biomedicalProfile && biomedicalJournal && specificTopicMatches.length ? 6 : 0;
  const interdisciplinaryFit = journal.field === 'Multidisciplinary' && matchingTopics.length ? 8 : 0;
  const methodOnlyTopicFit = profile.topics.includes('natural products')
    && !matchingTopics.includes('natural products')
    && matchingTopics.some((topic) => ['molecular pharmacology', 'data science'].includes(topic))
    && matchingMethods.length > 0;
  const nucleicAcidJournal = /\bnucleic acids?\b/i.test(journalText);
  const specialtyMismatch = /alzheimer|dementia|hiv|fluoride|oncolog|diabetes|cardiology|cardiovascular|neurolog|dentistry|cancer|tumou?r|tuberculosis|malaria/.test(journalSpecialtyText)
    && !/alzheimer|dementia|\bhiv\b|fluoride|oncolog|diabetes|cardiolog|neurolog|dentistry|cancer|tumou?r|tuberculosis|malaria/.test(profileIdentityText);
  const articleFit = profile.articleType === 'Unknown' ? 8 : journal.name.toLowerCase().includes(profile.articleType.toLowerCase()) ? 15 : 10;
  const requirementFit = journal.requirements.wordLimit === null ? 0 : profile.words <= journal.requirements.wordLimit ? 10 : 0;
  let score = fieldFit + scopeFit + keywordFit + methodFit + articleFit + requirementFit + biomedicalFit + interdisciplinaryFit;
  score += semanticFit;

  if (fieldFit >= 30) reasons.push(`Strong ${profile.field} field alignment`);
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
  if (!hasDirectTopicEvidence && (journal.field === profile.field || journal.field === 'Multidisciplinary')) {
    score -= 20;
    warnings.push('No direct journal-topic or keyword evidence; field-only overlap is not enough');
  }
  if (incidentalNeighborPenalty) {
    score -= 25;
    warnings.push('Journal only overlaps via a nearby field term and not the manuscript\'s dominant topic');
  }

  if (nucleicAcidJournal && !profile.signals.hasNucleicAcidFocus) {
    score -= 50;
    warnings.push('Journal focuses on nucleic-acid research, but this manuscript does not');
  }
  if (matchingTopics.includes('economics') && profile.field !== 'Economics' && profile.field !== 'Social Sciences') {
    score -= 35;
    warnings.push('Economics overlap appears incidental rather than the manuscript\'s primary focus');
  }
  if (specialtyMismatch) {
    score -= 30;
    warnings.push('Journal has a disease-specific focus not detected in the manuscript');
  }
  if (nonBiomedicalJournalMismatch) {
    score -= 25;
    warnings.push('Journal field is outside the manuscript\'s biomedical domain');
  }
  if (methodOnlyTopicFit) {
    score -= 30;
    warnings.push('Journal fit is driven by a method, not the manuscript\'s primary natural-products topic');
  }
  if (offDomainPharmaceuticalJournal) {
    score -= 40;
    warnings.push('Journal specialty is outside the manuscript\'s pharmaceutical formulation domain');
  }
  if (primaryDrugDeliveryMismatch) {
    score -= 25;
    warnings.push('Journal does not show a direct drug-delivery or formulation scope match');
  }
  if (!specificTopicMatches.length && matchingTopics.length > 0) {
    score -= 15;
    warnings.push('Only broad topic overlap detected; manuscript-specific specialty match is missing');
  }
  if (!specificTopicMatches.length && !matchingKeywords.length && !matchingMethods.length) {
    score -= 25;
    warnings.push('No concrete topic, keyword, or method evidence remains after filtering');
  }
  if (!directEvidence) {
    score -= 20;
    warnings.push('No direct topic, keyword, or method evidence connects this journal to the manuscript');
  }
  if (!topicalEvidence && matchingMethods.length > 0) {
    warnings.push('Match is method-based; the journal topic was not directly confirmed');
  }

  score = Math.max(0, Math.min(98, Math.round(score)));
  const confidence = score >= 72 && warnings.length <= 1 ? 'High' : score >= 48 ? 'Medium' : 'Low';
  return { score, confidence, directEvidence, topicalEvidence, reasons, warnings };
}

export function rankJournals<T extends MatchJournal>(text: string, journals: T[], semanticProfile?: SemanticProfile | null) {
  const profile = profileManuscript(text);
  return journals
    .map((journal) => ({ journal, profile, match: scoreJournal(profile, journal, semanticProfile) }))
    .sort((a, b) => b.match.score - a.match.score || a.journal.name.localeCompare(b.journal.name));
}

export function rankAndFilterJournals<T extends MatchJournal>(text: string, journals: T[], filters: JournalFilters) {
  const filtered = filterJournals(journals, filters);
  return { ranked: rankJournals(text, filtered.results), excludedForMissingData: filtered.excludedForMissingData, excludedCount: filtered.excludedCount };
}
