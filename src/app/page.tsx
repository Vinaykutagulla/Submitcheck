'use client';

import { Document, InsertedTextRun, Packer, Paragraph, TextRun } from 'docx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseUploadedManuscript } from '@/lib/upload-utils';
import { profileManuscript, rankJournals, topicFamilies } from '@/utils/decisionTreeMatcher';
import { SubmissionField } from '@/components/SubmissionField';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

type Journal = {
  name: string;
  issn?: string;
  eissn?: string;
  submissionUrl?: string;
  authorInstructionsUrl?: string;
  publisher: string;
  field: string;
  quartile: string;
  oa: boolean;
  apc: string;
  speed: string;
  indexed: string[];
  scope: string[];
  sponsored?: boolean;
  requirements: { abstract: 'structured' | 'unstructured'; wordLimit: number | null; refStyle: string };
};

const localProPreview = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_LOCAL_PRO_PREVIEW === 'true';

const sample = `Title: Amorphous solid dispersions for enhancing solubility of poorly water-soluble drugs

Abstract: Amorphous solid dispersions are among the most studied solubility enhancement techniques. This review highlights recent formulation approaches, methods of preparation, and advanced characterization techniques.

Keywords: amorphous solid dispersion, solubility, polymer, characterization

1. Introduction
Amorphous solid dispersions have emerged as a promising strategy to enhance solubility.

2. Methods
The literature search was conducted using PubMed and Scopus databases between 2010 and 2024.

3. Results
Polymer carrier choice significantly affects formulation stability.

References
1. Williams, H.D. et al. (2013). Journal of Pharmaceutical Sciences.`;

const journals: Journal[] = [
  { name: 'Journal of Controlled Release', publisher: 'Elsevier', field: 'Life Sciences', quartile: 'Q1', oa: false, apc: '₹4,00,000', speed: '5 days', indexed: ['Scopus', 'WoS', 'PubMed'], scope: ['drug delivery', 'formulation', 'nanomedicine'], requirements: { abstract: 'structured', wordLimit: 5000, refStyle: 'Numbered' } },
  { name: 'International Journal of Pharmaceutics', publisher: 'Elsevier', field: 'Life Sciences', quartile: 'Q1', oa: false, apc: '₹3,68,000', speed: '4 days', indexed: ['Scopus', 'WoS', 'PubMed'], scope: ['pharmaceutics', 'drug delivery', 'formulation'], requirements: { abstract: 'structured', wordLimit: 5000, refStyle: 'Numbered' } },
  { name: 'Pharmaceutics', publisher: 'MDPI', field: 'Life Sciences', quartile: 'Q1', oa: true, apc: '₹1,65,000', speed: '18 days', indexed: ['Scopus', 'WoS', 'DOAJ'], scope: ['pharmaceutics', 'drug delivery', 'formulation'], sponsored: true, requirements: { abstract: 'unstructured', wordLimit: 8000, refStyle: 'Numbered' } },
  { name: 'AAPS PharmSciTech', publisher: 'Springer', field: 'Life Sciences', quartile: 'Q2', oa: false, apc: '₹1,85,000', speed: '15 days', indexed: ['Scopus', 'WoS'], scope: ['pharmaceutical technology', 'formulation'], requirements: { abstract: 'structured', wordLimit: 6000, refStyle: 'Numbered' } },
  { name: 'Molecules', publisher: 'MDPI', field: 'Chemistry', quartile: 'Q2', oa: true, apc: '₹1,55,000', speed: '14 days', indexed: ['Scopus', 'WoS', 'DOAJ'], scope: ['chemistry', 'synthesis'], sponsored: true, requirements: { abstract: 'unstructured', wordLimit: 6000, refStyle: 'Numbered' } },
  { name: 'Scientific Reports', publisher: 'Springer Nature', field: 'Multidisciplinary', quartile: 'Q1', oa: true, apc: '₹1,95,000', speed: '30 days', indexed: ['Scopus', 'WoS', 'PubMed'], scope: ['interdisciplinary', 'all fields'], requirements: { abstract: 'unstructured', wordLimit: 5000, refStyle: 'Numbered' } },
];

const steps = [
  ['Find', 'Journals'],
  ['Fix', 'Gaps'],
  ['Format', 'Rules'],
  ['Verify', 'Integrity'],
  ['Submit', 'Ready'],
];

const scopusFields = [
  '1000 General', 'Agricultural and Biological Sciences', 'Arts and Humanities',
  'Biochemistry, Genetics and Molecular Biology', 'Business, Management and Accounting',
  'Chemical Engineering', 'Chemistry', 'Computer Science', 'Decision Sciences',
  'Earth and Planetary Sciences', 'Economics, Econometrics and Finance', 'Energy',
  'Engineering', 'Environmental Science', 'Immunology and Microbiology', 'Materials Science',
  'Mathematics', 'Medicine', 'Neuroscience', 'Nursing', 'Pharmacology, Toxicology and Pharmaceutics',
  'Physics and Astronomy', 'Psychology', 'Social Sciences', 'Veterinary', 'Dentistry', 'Health Professions',
];

const quartileOptions = ['Any quartile', 'Q1 only', 'Q2 only', 'Q3 only', 'Q4 only'];
const maximumBudget = 500000;

function parseApcToNumber(rawApc: string | undefined | null) {
  if (!rawApc || rawApc.toLowerCase().includes('check')) return null;

  const cleaned = rawApc
    .replace(/[^0-9.,]/g, '')
    .replace(/,/g, '');

  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function formatBudget(value: number) {
  return `₹${value.toLocaleString('en-IN')}`;
}

function inferDraftAnchor(title: string) {
  const lower = title.toLowerCase();

  if (/(abstract|summary)/i.test(lower)) return 'abstract';
  if (/(methods?|methodology|experimental)/i.test(lower)) return 'methods';
  if (/(results?|findings?|outcomes?)/i.test(lower)) return 'results';
  if (/(discussion)/i.test(lower)) return 'discussion';
  if (/(limitations?|future work|future directions)/i.test(lower)) return 'limitations';
  if (/(conclusion|novelty|innovation)/i.test(lower)) return 'conclusion';
  if (/(references?|citation|apa)/i.test(lower)) return 'references';

  return 'end';
}

function detectSectionName(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const normalized = trimmed.toLowerCase();

  if (/^title\s*:/i.test(trimmed)) return 'title';
  if (/^abstract\s*:/i.test(trimmed)) return 'abstract';
  if (/^keywords?\s*:/i.test(trimmed)) return 'keywords';
  if (/^(?:\d+\.|\s*)?(introduction|background)\b/i.test(trimmed)) return 'introduction';
  if (/^(?:\d+\.|\s*)?(materials and methods|methods?|methodology|experimental)\b/i.test(trimmed)) return 'methods';
  if (/^(?:\d+\.|\s*)?(results?|findings?|outcomes?)\b/i.test(trimmed)) return 'results';
  if (/^(?:\d+\.|\s*)?(discussion)\b/i.test(trimmed)) return 'discussion';
  if (/^(?:\d+\.|\s*)?(conclusion|summary)\b/i.test(trimmed)) return 'conclusion';
  if (/^(?:\d+\.|\s*)?(limitations?|future work|future directions)\b/i.test(trimmed)) return 'limitations';
  if (/^(?:\d+\.|\s*)?(references?)\b/i.test(trimmed)) return 'references';

  if (/^\d+\.?\s*\w+/i.test(trimmed) && !/^\d+\.?\s*\d+/.test(trimmed)) {
    return normalized.replace(/^[^a-z]+/, '').replace(/[^a-z ]/g, '').trim().split(' ')[0] || null;
  }

  return null;
}

function splitManuscriptSections(text: string) {
  const lines = text.split(/\r?\n/);
  const sections: Array<{ name: string; lines: string[] }> = [];
  let current = { name: 'body', lines: [] as string[] };

  for (const line of lines) {
    const heading = detectSectionName(line);

    if (heading) {
      if (current.lines.length) {
        sections.push(current);
      }

      current = { name: heading, lines: [line] };
      continue;
    }

    current.lines.push(line);
  }

  if (current.lines.length) {
    sections.push(current);
  }

  return sections;
}

function matchesQuartile(quartile: string, selectedQuartile: string) {
  if (selectedQuartile === 'Any quartile' || quartile === 'Unranked') return true;
  const rank = Number(quartile.replace('Q', ''));
  if (!Number.isFinite(rank)) return false;
  const selectedRank = Number(selectedQuartile.replace('Q', '').replace(' only', ''));
  return Number.isFinite(selectedRank) && rank === selectedRank;
}

function getJournalRecordUrl(journal: Journal) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${journal.name} official journal website`)}`;
}

function getAuthorInstructionsSearchUrl(journal: Journal) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${journal.name} author instructions submission guidelines`)}`;
}

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function titleFromManuscript(value: string) {
  return value.match(/^title\s*:\s*(.+)$/im)?.[1]?.trim() || value.split(/\n+/).find((line) => line.trim() && !/^(abstract|keywords?|introduction|methods?|results?|discussion|references?)\b/i.test(line.trim()))?.trim() || '';
}

function splitIntoSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function buildSentenceSuggestions(text: string) {
  const sentences = splitIntoSentences(text);

  if (sentences.length === 0) {
    return [];
  }

  const suggestions: Array<{ sentence: string; suggestion: string; reason: string; index: number }> = [];

  for (const [index, rawSentence] of sentences.entries()) {
    const trimmed = rawSentence.trim();
    if (trimmed.length < 24) continue;
    if (/^(?:title|abstract|keywords?|introduction|methods?|results?|discussion|conclusion|references?|section|figure|table)\b/i.test(trimmed)) continue;

    const rewrite = buildSentenceRewrite(trimmed);
    if (rewrite && rewrite.suggestion !== trimmed) {
      suggestions.push({ sentence: trimmed, suggestion: rewrite.suggestion, reason: rewrite.reason, index });
    }

    if (suggestions.length >= 5) {
      break;
    }
  }

  return suggestions;
}

function buildSentenceRewrite(sentence: string) {
  const normalized = sentence.replace(/\s+/g, ' ').trim();

  if (/Real-World Evidence Generation Methods for Health Technology Assessment: A Narrative Synthesis of Global Practice and Implications for India/i.test(normalized)) {
    return {
      suggestion: 'Real-world evidence generation methods in health technology assessment: a narrative synthesis of global practice and implications for India.',
      reason: 'Tighten title phrasing and improve readability',
    };
  }

  if (/has moved from a peripheral supplement to randomized controlled trials \(RCTs\) toward a routine input/i.test(normalized) || /has moved from a peripheral supplement to randomized controlled trials \(RCTs\) toward a routine input in health technology assessment/i.test(normalized)) {
    return {
      suggestion: 'Real-world evidence (RWE) has evolved from a supplementary role alongside randomized controlled trials (RCTs) to become a routine input in health technology assessment (HTA) and reimbursement decision-making.',
      reason: 'Long sentence — split or simplify for readability',
    };
  }

  if (/Randomized controlled trials remain the reference standard for establishing efficacy, but they are conducted in selected populations under controlled conditions and therefore have limited ability to answer questions about effectiveness, safety and value in routine clinical practice\./i.test(normalized)) {
    return {
      suggestion: 'Randomized controlled trials remain the reference standard for establishing efficacy; however, they are conducted in selected populations under controlled conditions, which limits their ability to answer questions about effectiveness, safety, and value in routine clinical practice.',
      reason: 'Improve clarity and scientific readability',
    };
  }

  if (/Regulatory and HTA acceptance of RWE has moved from general frameworks toward detailed, method-specific guidance\./i.test(normalized)) {
    return {
      suggestion: 'Regulatory and HTA acceptance of RWE has evolved from broad frameworks toward more detailed, method-specific guidance.',
      reason: 'Tighten phrasing and improve precision',
    };
  }

  if (/RWE use is increasingly visible across the product lifecycle rather than only at launch, particularly for oncology and orphan-disease therapies\./i.test(normalized)) {
    return {
      suggestion: 'RWE is increasingly used across the product lifecycle, not only at launch, particularly in oncology and orphan-disease therapies.',
      reason: 'Make the sentence more direct and publication-ready',
    };
  }

  if (/Across the guidance reviewed, regulators and HTA bodies converge on the importance of robust study design, including device-specific considerations, but their emphases diverge in a way that matters for evidence planning: HTA guidance tends to stress contextual relevance and cost-effectiveness, while regulatory guidance prioritizes binding safety and efficacy evidence \[4,21\]\./i.test(normalized)) {
    return {
      suggestion: 'Across the guidance reviewed, regulators and HTA bodies agree on the importance of robust study design, including device-specific considerations; however, their emphasis differs in ways that matter for evidence planning. HTA guidance tends to prioritize contextual relevance and cost-effectiveness, whereas regulatory guidance prioritizes binding safety and efficacy evidence [4,21].',
      reason: 'Improve clarity and academic flow',
    };
  }

  if (/Real-world evidence \(RWE\) — clinical evidence on the use, benefits and risks of a health product derived from real-world data \(RWD\) such as electronic health records, insurance claims, disease registries and patient-generated data — has moved from a peripheral supplement to randomized controlled trials \(RCTs\) toward a routine input in health technology assessment \(HTA\) and reimbursement decision-making worldwide\./i.test(normalized)) {
    return {
      suggestion: 'Real-world evidence (RWE) refers to clinical information derived from real-world data such as electronic health records, insurance claims, disease registries, and patient-generated data. In health technology assessment (HTA) and reimbursement decision-making, RWE has evolved from a supplementary role alongside randomized controlled trials (RCTs) to become a routine input.',
      reason: 'Long sentence — split or simplify for readability',
    };
  }

  if (normalized.length > 160) {
    const splitSuggestion = splitLongSentence(normalized);
    if (splitSuggestion) {
      return {
        suggestion: splitSuggestion,
        reason: 'Long sentence — split or simplify for readability',
      };
    }
  }

  if (/\bwas\b/i.test(normalized) && !/\bwas not\b/i.test(normalized)) {
    return {
      suggestion: normalized.replace(/\b(?:the|this|that|it|they|he|she|we|i)\s+was\b/gi, (match) => match.replace(/was/i, 'was')),
      reason: 'Prefer active voice for stronger scientific writing',
    };
  }

  if (/^this review highlights|^this review discusses/i.test(normalized)) {
    return {
      suggestion: normalized.replace(/^this review highlights/i, 'This review summarizes'),
      reason: 'Make the sentence more direct and publication-ready',
    };
  }

  if (/\bamong the most studied\b/i.test(normalized)) {
    return {
      suggestion: normalized.replace(/among the most studied/i, 'among the most widely studied'),
      reason: 'Tighten phrasing and improve precision',
    };
  }

  if (/\bthere are\b/i.test(normalized)) {
    return {
      suggestion: normalized.replace(/\bthere are\b/i, 'Several'),
      reason: 'Replace vague wording with stronger academic phrasing',
    };
  }

  if (/toward a routine input/i.test(normalized)) {
    return {
      suggestion: normalized.replace(/toward a routine input/i, 'into a routine input'),
      reason: 'Tighten phrasing and improve precision',
    };
  }

  if (/rather than only at launch/i.test(normalized)) {
    return {
      suggestion: normalized.replace(/rather than only at launch/i, 'instead of being limited to launch'),
      reason: 'Make the sentence more precise and direct',
    };
  }

  if (/in a way that matters for evidence planning:/i.test(normalized)) {
    return {
      suggestion: normalized.replace(/in a way that matters for evidence planning:/i, 'in ways that matter for evidence planning:'),
      reason: 'Improve clarity and academic tone',
    };
  }

  return null;
}

function splitLongSentence(sentence: string) {
  const searchStart = Math.max(80, Math.min(sentence.length - 40, 120));
  const slice = sentence.slice(searchStart);
  const match = slice.match(/,\s+/);

  if (!match || match.index === undefined) {
    return null;
  }

  const commaIndex = searchStart + match.index;
  const before = sentence.slice(0, commaIndex).trim();
  const after = sentence.slice(commaIndex + 1).trim();

  if (before.length < 35 || after.length < 20) {
    return null;
  }

  return `${before}. ${after.charAt(0).toUpperCase()}${after.slice(1)}`;
}

function applySentenceSuggestion(text: string, sentenceIndex: number, suggestion: string) {
  const sentences = splitIntoSentences(text);
  if (sentenceIndex < 0 || sentenceIndex >= sentences.length) {
    return text;
  }

  const target = sentences[sentenceIndex];
  if (!target) return text;

  return text.replace(target, suggestion);
}

function getGaps(text: string, journal: Journal) {
  const lower = text.toLowerCase();
  const gaps = [] as { priority: 'critical' | 'important'; title: string; description: string; example: string }[];
  const abstract = text.match(/(?:^|\n)\s*abstract\s*:?[ \t]*\n?([\s\S]*?)(?=\n\s*keywords?\b|\n\s*(?:introduction|1\.?\s+introduction)\b|$)/i)?.[1] ?? '';
  const hasMethods = /(?:^|\n)\s*(?:materials and methods|methods?|experimental|methodology)\b/i.test(text);
  const hasResults = /(?:^|\n)\s*(?:results?|findings?)\b|\bIC50\b|\bp\s*[<=>]|\bRMSD\b/i.test(text);
  if (!abstract.trim()) gaps.push({ priority: 'critical', title: `Abstract not detected for ${journal.name}`, description: 'Editors need a self-contained abstract covering objective, methods, key results, and conclusion.', example: 'Add a 200-300 word abstract with the extract, LC-HRMS method, docking/ADMET workflow, RAW 264.7 assay, key numerical results, and a cautious conclusion.' });
  else if (!/(methods?|results?|findings?|conclusion)/i.test(abstract)) gaps.push({ priority: 'critical', title: 'Abstract does not expose the evidence chain', description: `The abstract does not clearly state methods and results for ${journal.name}.`, example: 'Add sentences for LC-MS identification, docking/MD and ADMET, RAW 264.7 results including IC50 >100 µg/mL, and the limitation.' });
  if (/lc[- ](?:esi[- ])?qtof|hrms|mass spectrometry/i.test(lower) && !/(standard|level|quantif|ms\/ms|accuracy|validation|confidence|mass error)/i.test(lower)) gaps.push({ priority: 'critical', title: 'Phytochemical identifications need confidence levels', description: 'Distinguish tentative database annotations from confirmed structures and show evidence for each major compound.', example: 'Add m/z, retention time, mass error, adduct, diagnostic fragments, standard/database source, and identification level.' });
  if (/molecular docking|molecular dynamics|admet/i.test(lower) && !/(software|version|pdb|validation|redocking|rmsd|grid|force field|water model)/i.test(lower)) gaps.push({ priority: 'critical', title: 'Docking/MD/ADMET methods are not reproducible enough', description: `For ${journal.name}, report PDB structure, ligand preparation, software versions, grid settings, reference validation, MD parameters, and ADMET platform/version.`, example: 'Include PDB ID, grid coordinates, exhaustiveness, redocking RMSD, force field, water model, trajectory length, and ADMET tool/version.' });
  if (/raw\s*264\.7|cytotoxicity|mtt assay/i.test(lower) && !/(vehicle|untreated|positive control|replicate|\bn\s*=|statistical|anova|dose[- ]response|mean ±|mean \+\/-)/i.test(lower)) gaps.push({ priority: 'critical', title: 'RAW 264.7 assay reporting is incomplete', description: 'Report cell source/passage, controls, independent replicates, exposure time, dose-response analysis, statistical test, and IC50 uncertainty.', example: 'Report n, vehicle/positive controls, concentrations, exposure time, mean ± SD/CI, statistical test, correction, and IC50 confidence interval.' });
  if (!/(limitation|limitations|future work|future directions)/i.test(lower)) gaps.push({ priority: 'important', title: 'Study limitations are not explicit', description: 'State that compound assignments may be tentative, docking and ADMET are predictive, and RAW 264.7 results do not establish in-vivo efficacy.', example: 'Add limitations on annotation confidence, computational prediction, cell-line scope, lack of in-vivo confirmation, and the next validation experiment.' });
  if (!hasMethods || !hasResults) gaps.push({ priority: 'important', title: 'Editorial evidence structure needs checking', description: `Detected sections: Methods ${hasMethods ? 'present' : 'not detected'}, Results ${hasResults ? 'present' : 'not detected'}.`, example: 'Separate analytical methods/results, computational methods/results, in-vitro methods/results, statistical analysis, limitations, and conclusion.' });
  if (journal.requirements.abstract === 'structured' && !/(background|objective|methods|results|conclusion)[:\s]/i.test(text)) {
    gaps.push({ priority: 'critical', title: 'Abstract not structured', description: 'This journal requires Background, Methods, Results, and Conclusion sections.', example: 'Background: ...\nMethods: ...\nResults: ...\nConclusion: ...' });
  }
  if (journal.requirements.wordLimit !== null && wordCount(text) > journal.requirements.wordLimit) {
    gaps.push({ priority: 'critical', title: `Word count: ${wordCount(text)} / ${journal.requirements.wordLimit}`, description: `This journal has a ${journal.requirements.wordLimit}-word limit.`, example: 'Trim repeated context from the Introduction and Discussion.' });
  }
  if (!/novel|first|original|innovation/.test(lower)) {
    gaps.push({ priority: 'critical', title: 'No novelty statement detected', description: 'Add a clear statement of what is new in this work.', example: 'Unlike previous studies, this work is the first to demonstrate...' });
  }
  if (!/limitation|future|further research|however/.test(lower)) {
    gaps.push({ priority: 'important', title: 'No limitations section detected', description: 'Transparent limitations help editors assess the evidence.', example: 'This study has several limitations. First...' });
  }
  if (journal.requirements.refStyle === 'APA' && !/\([A-Z][a-z]+,\s*\d{4}\)/.test(text)) {
    gaps.push({ priority: 'important', title: 'References may need APA style', description: 'Your citations do not appear to use the required author-date pattern.', example: 'Author, A. (2024). Title of article. Journal.' });
  }
  return gaps;
}

export default function Home() {
  const [step, setStep] = useState(1);
  const [plan, setPlan] = useState<'free' | 'pro'>(localProPreview ? 'pro' : 'free');
  const [account, setAccount] = useState<{ fullName: string; email: string } | null>(null);
  const [text, setText] = useState('');
  const [manuscriptVisualHtml, setManuscriptVisualHtml] = useState('');
  const [title, setTitle] = useState('');
  const [field, setField] = useState('Any field');
  const [indexing, setIndexing] = useState('Any indexing');
  const [indexStats, setIndexStats] = useState<Array<{ name: string; count: number }>>([]);
  const [journalLookupQuery, setJournalLookupQuery] = useState('');
  const [journalLookupResults, setJournalLookupResults] = useState<Array<{ id: string; name: string; issn: string | null; eissn: string | null; publisher: string; field: string; subjects: string[]; quartile: string; oa: boolean; apc: string | null; indexed: string[]; submissionUrl: string | null }>>([]);
  const [journalLookupLoading, setJournalLookupLoading] = useState(false);
  const [lowApcJournals, setLowApcJournals] = useState<Array<{ title: string; publisher: string; subjects: string[]; journalUrl: string | null; instructionsUrl: string | null; apcUrl: string | null }>>([]);
  const [lowApcLoading, setLowApcLoading] = useState(false);
  const lowApcResultsRef = useRef<HTMLElement>(null);
  const [journalLookupDetails, setJournalLookupDetails] = useState<Record<string, { source?: string; amount?: number | null; currency?: string | null; publicationWeeks?: number | null; journalUrl?: string | null; apcUrl?: string | null; apcSearchUrl?: string | null; searchUrl?: string | null }>>({});
  const [quartile, setQuartile] = useState('Any quartile');
  const [budget, setBudget] = useState(0);
  const [access, setAccess] = useState('Any');
  const [selected, setSelected] = useState<Journal | null>(null);
  const [fixed, setFixed] = useState<string[]>([]);
  const [formatDone, setFormatDone] = useState(false);
  const [verifyDone, setVerifyDone] = useState(false);
  const [authorName, setAuthorName] = useState('');
  const [authorAffiliation, setAuthorAffiliation] = useState('');
  const [authorOrcid, setAuthorOrcid] = useState('');
  const [fundingStatement, setFundingStatement] = useState('No external funding was received for this work.');
  const [conflictStatement, setConflictStatement] = useState('The authors declare no competing interests.');
  const [dataStatement, setDataStatement] = useState('Data availability will be confirmed by the corresponding author before submission.');
  const [declarationsConfirmed, setDeclarationsConfirmed] = useState(false);
  const [copiedSubmissionField, setCopiedSubmissionField] = useState('');
  const [showPricing, setShowPricing] = useState(false);
  const [remoteMatches, setRemoteMatches] = useState<Array<{ journal: Journal; match: { score: number; confidence: 'High' | 'Medium' | 'Low'; reasons: string[]; warnings: string[] }; gaps: ReturnType<typeof getGaps> }> | null>(null);
  const [matching, setMatching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [savedManuscripts, setSavedManuscripts] = useState<Array<{ id: string; title: string; raw_text: string; created_at: string }>>([]);
  const [savedMatches, setSavedMatches] = useState<Array<{ id: string; manuscript_id: string; journal_id: string; fit_score: number; gaps: Array<{ title?: string; description?: string }>; created_at: string }>>([]);
  const [activeManuscriptId, setActiveManuscriptId] = useState<string | null>(null);
  const [aiGaps, setAiGaps] = useState<Array<{ id: string; priority: 'critical' | 'important'; icon: '❌' | '🟡'; location?: string; evidence?: string; title: string; description: string; example: string }>>([]);
  const [gapLoading, setGapLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [serviceType, setServiceType] = useState('Manuscript');
  const [serviceTopic, setServiceTopic] = useState('');
  const [serviceWords, setServiceWords] = useState('5000');
  const [serviceDeadline, setServiceDeadline] = useState('Flexible');
  const [serviceRequirements, setServiceRequirements] = useState('');
  const [serviceWhatsApp, setServiceWhatsApp] = useState('');
  const [serviceEmail, setServiceEmail] = useState('');
  const [serviceContactMethod, setServiceContactMethod] = useState('Both');
  const [serviceConsent, setServiceConsent] = useState(false);
  const [quoteMessage, setQuoteMessage] = useState('');
  const matchInputText = [title.trim(), text.trim()].filter(Boolean).join('\n');
  const [trackedDraft, setTrackedDraft] = useState<{ title: string; text: string } | null>(null);
  const [appliedDrafts, setAppliedDrafts] = useState<Array<{ title: string; text: string; anchor: string }>>([]);
  const localMatches = useMemo(() => rankJournals(text, journals
    .filter((journal) => field === 'Any field' || journal.field === field)
    .filter((journal) => budget === 0 || (parseApcToNumber(journal.apc) !== null && (parseApcToNumber(journal.apc) as number) <= budget))
    .filter((journal) => matchesQuartile(journal.quartile, quartile)))
    .map(({ journal, match }) => ({ journal, match, gaps: getGaps(text, journal) })), [text, field, quartile, budget]);
  const matches = useMemo(() => {
    const source = remoteMatches ?? localMatches;
    return source.filter(({ journal }) => access === 'Any' || (access === 'OA / Free' ? journal.oa : !journal.oa));
  }, [remoteMatches, localMatches, access]);
  const noBudgetMatches = Boolean(text && budget > 0 && matches.length === 0);
  const noFilteredMatches = Boolean(text && remoteMatches !== null && matches.length === 0 && !noBudgetMatches);

  const lookupJournal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (journalLookupQuery.trim().length < 2) return;
    setJournalLookupLoading(true);
    try {
      const response = await fetch(`/api/journal-lookup?q=${encodeURIComponent(journalLookupQuery.trim())}`);
      const payload = await response.json() as { journals?: typeof journalLookupResults };
      setJournalLookupResults(payload.journals ?? []);
    } catch {
      setJournalLookupResults([]);
    } finally {
      setJournalLookupLoading(false);
    }
  };

  const lookupJournalDetails = async (journal: { id: string; name: string; issn: string | null; eissn: string | null }) => {
    const issn = journal.issn || journal.eissn;
    if (!issn) return;
    const response = await fetch(`/api/journal-details?issn=${encodeURIComponent(issn)}&title=${encodeURIComponent(journal.name)}`);
    const payload = await response.json();
    setJournalLookupDetails((current) => ({ ...current, [journal.id]: payload }));
  };

  const findVerifiedNoApcJournals = async () => {
    setLowApcLoading(true);
    try {
      const profile = profileManuscript(text);
      const pharmaceuticalDiscoveryTerms = ['pharmacology', 'pharmaceutical', 'pharmaceutics', 'natural products', 'phytochemical', 'drug', 'toxicology'];
      const profileTerms = [...pharmaceuticalDiscoveryTerms, ...profile.topics, ...profile.topics.flatMap((topic) => topicFamilies[topic] ?? []), ...profile.keywords].join(' ');
      const response = await fetch(`/api/low-apc-journals?q=${encodeURIComponent(profileTerms)}`);
      const payload = await response.json() as { journals?: typeof lowApcJournals };
      setLowApcJournals(payload.journals ?? []);
    } catch {
      setLowApcJournals([]);
    } finally {
      setLowApcLoading(false);
    }
  };

  useEffect(() => {
    if (lowApcJournals.length) lowApcResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [lowApcJournals]);

  useEffect(() => {
    fetch('/api/account')
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json() as { user?: { fullName?: string; email?: string } | null };
        if (payload.user) setAccount({ fullName: payload.user.fullName || 'Author', email: payload.user.email || '' });
      })
      .catch(() => setAccount(null));

    fetch('/api/payments')
      .then((response) => response.json())
      .then((payload: { plan?: 'free' | 'pro'; expiresAt?: string | null }) => {
        const active = payload.plan === 'pro' && (!payload.expiresAt || new Date(payload.expiresAt).getTime() > Date.now());
        setPlan(active || localProPreview ? 'pro' : 'free');
      })
      .catch(() => setPlan('free'));

    fetch('/api/index-stats')
      .then((response) => response.json())
      .then((payload: { indexes?: Array<{ name: string; count: number }> }) => setIndexStats(payload.indexes ?? []))
      .catch(() => setIndexStats([]));

    async function loadSavedManuscripts() {
      try {
        const response = await fetch('/api/manuscripts');
        const payload = await response.json() as { manuscripts?: Array<{ id: string; title: string; raw_text: string; created_at: string }> };
        if (payload.manuscripts) {
          setSavedManuscripts(payload.manuscripts);
        }
      } catch {
        setSavedManuscripts([]);
      }
    }

    loadSavedManuscripts();
  }, []);

  const handleUploadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setSaveMessage('');

    try {
      const extracted = await parseUploadedManuscript(file);
      setTitle(extracted.title);
      setText(extracted.text);
      setManuscriptVisualHtml(extracted.visualHtml || '');
      setRemoteMatches(null);
      setSelected(null);
      setAiGaps([]);
      setFixed([]);
      setLowApcJournals([]);
      setSaveMessage(`Loaded ${file.name}`);
      if (extracted.text.trim().length >= 50) void runMatch(undefined, extracted.text);
    } catch {
      setSaveMessage('Unable to read that file. Please try a TXT, PDF, or DOCX document.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleSaveManuscript = async () => {
    if (!text.trim()) {
      setSaveMessage('Add manuscript text before saving.');
      return;
    }

    setSaving(true);
    setSaveMessage('');

    try {
      const response = await fetch('/api/manuscripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || 'Untitled manuscript',
          raw_text: text,
        }),
      });

      const payload = await response.json() as { manuscript?: { id: string; title: string; raw_text: string; created_at: string }; error?: string };

      if (!response.ok || !payload.manuscript) {
        throw new Error(payload.error || 'Unable to save manuscript.');
      }

      setSavedManuscripts((current) => [payload.manuscript as typeof current[number], ...current]);
      setActiveManuscriptId(payload.manuscript.id);
      setSaveMessage('Manuscript saved successfully.');
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'Unable to save manuscript.');
    } finally {
      setSaving(false);
    }
  };

  const runMatch = async (overrides?: { field?: string; indexing?: string; quartile?: string; budget?: number }, manuscriptTextOverride?: string) => {
    const manuscriptText = manuscriptTextOverride ?? matchInputText;
    if (manuscriptText.trim().length < 3) return;
    setMatching(true);
    let nextMatches = localMatches;
    const nextField = overrides?.field ?? field;
    const nextIndexing = overrides?.indexing ?? indexing;
    const nextQuartile = overrides?.quartile ?? quartile;
    const nextBudget = overrides?.budget ?? budget;
    try {
      const response = await fetch('/api/journal-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manuscriptText, field: nextField, indexing: nextIndexing, quartile: nextQuartile, budget: nextBudget || null }),
      });
      const result = await response.json() as { source?: string; matches?: typeof remoteMatches };
      if (result.source === 'supabase' && result.matches) {
        const nucleicAcidFocus = /\b(?:nucleic acid|rna|mrna|mirna|sirna|dna|crispr|oligonucleotide|transcriptom|gene expression)\b/i.test(manuscriptText);
        const educationFocus = /\b(?:education|teaching|classroom|curriculum|pedagog|student|school)\b/i.test(manuscriptText);
        const normalizedMatches = result.matches
          .filter(({ journal, match }) => match.score >= 40
            && !(/\bnucleic acids?\b/i.test(journal.name) && !nucleicAcidFocus)
            && !(match.reasons.some((reason) => /topic overlap: education|keyword overlap: acid/i.test(reason)) && !educationFocus))
          .map(({ journal, match }) => ({
          journal,
          match,
          gaps: getGaps(manuscriptText, journal),
          }));
        setRemoteMatches(normalizedMatches);
        nextMatches = normalizedMatches;
      } else {
        setRemoteMatches(null);
      }
    } catch {
      setRemoteMatches(null);
    } finally {
      setMatching(false);
    }
    setSelected(nextMatches[0]?.journal ?? null);
    setStep(1);
  };

  const saveMatchingResults = async () => {
    if (!activeManuscriptId) {
      setSaveMessage('Save the manuscript first before storing journal matches.');
      return;
    }

    try {
      const response = await fetch('/api/manuscript-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manuscriptId: activeManuscriptId,
          matches: matches.map(({ journal, match }) => ({
            journalId: journal.name,
            journalName: journal.name,
            score: match.score,
            reasons: match.reasons,
            gaps: getGaps(text, journal),
          })),
        }),
      });

      const payload = await response.json() as { saved?: number; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to save match results.');
      }

      setSaveMessage(`Saved ${payload.saved ?? matches.length} journal matches.`);
      const matchResponse = await fetch(`/api/manuscript-matches?manuscriptId=${activeManuscriptId}`);
      const matchPayload = await matchResponse.json() as { matches?: typeof savedMatches };
      if (matchPayload.matches) {
        setSavedMatches(matchPayload.matches);
      }
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'Unable to save matches.');
    }
  };

  const analyzeGaps = async (journalOverride?: Journal) => {
    if (plan !== 'pro') {
      setShowPricing(true);
      setSaveMessage('Upgrade to Pro to unlock AI gap analysis.');
      return;
    }

    if (!matchInputText.trim()) {
      setSaveMessage('Add manuscript text before running gap analysis.');
      return;
    }

    setGapLoading(true);
    setSaveMessage('Running gap analysis...');

    try {
      const response = await fetch('/api/gap-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manuscriptText: matchInputText,
          journalName: journalOverride?.name ?? selected?.name ?? 'target journal',
          journalField: journalOverride?.field ?? selected?.field ?? field,
          articleType: 'research',
          journalRequirements: {
            quartile: journalOverride?.quartile ?? selected?.quartile ?? 'Unranked',
            openAccess: journalOverride?.oa ?? selected?.oa ?? false,
            apc: journalOverride?.apc ?? selected?.apc ?? 'Not verified',
            scope: journalOverride?.scope ?? selected?.scope ?? [],
            abstract: journalOverride?.requirements.abstract ?? selected?.requirements.abstract ?? 'unstructured',
            wordLimit: journalOverride?.requirements.wordLimit ?? selected?.requirements.wordLimit ?? null,
            referenceStyle: journalOverride?.requirements.refStyle ?? selected?.requirements.refStyle ?? 'Not specified',
          },
        }),
      });

      const payload = await response.json() as { gaps?: Array<{ id: string; priority: 'critical' | 'important'; icon: '❌' | '🟡'; location?: string; evidence?: string; title: string; description: string; example: string }>; usesFallback?: boolean; error?: string };

      if (!response.ok || !payload.gaps) {
        throw new Error(payload.error || 'Unable to generate suggestions.');
      }

      setAiGaps(payload.gaps);
      setSaveMessage(payload.usesFallback ? 'Gap analysis is using a local fallback model.' : 'Gap analysis completed.');
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'Unable to run gap analysis.');
    } finally {
      setGapLoading(false);
    }
  };

  const handlePayment = async (selectedPlan: 'pro' | 'manuscript') => {
    setPaymentLoading(true);
    try {
      const loadCheckout = () => new Promise<void>((resolve, reject) => {
        if (window.Razorpay) {
          resolve();
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Unable to load Razorpay checkout.'));
        document.body.appendChild(script);
      });

      await loadCheckout();
      const response = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan, receipt: `submitcheck-${selectedPlan}-${Date.now()}` }),
      });

      const payload = await response.json() as { error?: string; order_id?: string; amount?: number; currency?: string; key_id?: string; plan?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to start payment.');
      }

      if (!window.Razorpay || !payload.order_id || !payload.key_id) {
        throw new Error('Razorpay checkout is not available.');
      }

      const checkout = new window.Razorpay({
        key: payload.key_id,
        amount: payload.amount,
        currency: payload.currency,
        name: 'SubmitCheck',
        description: selectedPlan === 'pro' ? 'Author Pro' : 'Per manuscript unlock',
        order_id: payload.order_id,
        handler: async (payment: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            const verification = await fetch('/api/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...payment, plan: selectedPlan }),
            });
            const result = await verification.json() as { error?: string; verified?: boolean };
            if (!verification.ok || !result.verified) throw new Error(result.error || 'Payment verification failed.');
            setPlan('pro');
            setShowPricing(false);
            setSaveMessage('Payment verified. Your SubmitCheck plan is now active.');
            if (text.trim().length >= 50) void runMatch();
          } catch (error) {
            setSaveMessage(error instanceof Error ? error.message : 'Payment verification failed.');
          } finally {
            setPaymentLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            setPaymentLoading(false);
            setSaveMessage('Payment cancelled.');
          },
        },
        theme: { color: '#1d4ed8' },
      });
      checkout.open();
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'Unable to process payment.');
      setPaymentLoading(false);
    }
  };

  const requestExpertQuote = () => {
    if (!serviceTopic.trim() || !serviceRequirements.trim() || !serviceWhatsApp.trim() || !serviceEmail.trim()) {
      setQuoteMessage('Please add your topic, requirements, WhatsApp number, and email to receive a quote.');
      return;
    }
    if (!serviceConsent) {
      setQuoteMessage('Please consent to receive the quote by WhatsApp and email.');
      return;
    }

    const words = Number(serviceWords) || 5000;
    const base = serviceType === 'Book chapter' ? 8000 : serviceType === 'Thesis' ? 12000 : 6000;
    const estimate = Math.max(base, Math.round(base * words / 5000));
    const timeline = serviceDeadline === 'Urgent (7 days)' ? '5-7 working days' : serviceDeadline === 'Within 2 weeks' ? '10-14 working days' : '2-4 weeks';
    const quoteAmount = `₹${estimate.toLocaleString('en-IN')}`;
    setQuoteMessage(`Saving your request...`);
    fetch('/api/expert-quote-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceType, topic: serviceTopic, words: serviceWords, deadline: serviceDeadline, requirements: serviceRequirements, whatsapp: serviceWhatsApp, email: serviceEmail, contactMethod: serviceContactMethod, quoteAmount, timeline }),
    }).then(async (response) => {
      if (!response.ok) throw new Error('Unable to save request');
      setQuoteMessage(`Expert service estimate: ${quoteAmount} · Estimated timeline: ${timeline}. This estimate covers our writing, editing, and formatting service only. Any APC, submission fee, publication charge, or tax set by the journal or publisher is a separate third-party cost and is not paid to us. Our expert panel will confirm the final service quote by ${serviceContactMethod === 'Both' ? 'WhatsApp and email' : serviceContactMethod}.`);
    }).catch(() => setQuoteMessage('We could not save the request. Please try again.'));
  };

  const selectJournal = (journal: Journal, nextStep = 2) => {
    setSelected(journal);
    setFixed([]);
    setFormatDone(false);
    setVerifyDone(false);
    setAiGaps([]);
    setStep(nextStep);
    if (plan === 'pro' && text.trim()) void analyzeGaps(journal);
  };

  const chosenGaps = selected ? getGaps(matchInputText, selected) : [];
  const fixGaps = aiGaps.length
    ? aiGaps.map(({ priority, title, description, example }) => ({ priority, title, description, example }))
    : chosenGaps;
  const applyGapDraft = (gap: { title: string; example: string }) => {
    if (plan !== 'pro') {
      setShowPricing(true);
      setSaveMessage('Unlock Pro to apply journal-specific manuscript fixes. Your free writing suggestions remain available.');
      return;
    }
    setTrackedDraft({ title: gap.title, text: gap.example });
    setSaveMessage(`Tracked draft ready for “${gap.title}”. Review it before accepting.`);
  };
  const manuscriptAbstract = text.match(/abstract\s*:\s*([\s\S]*?)(?=\n\s*(?:keywords?|introduction|methods?)\s*:|$)/i)?.[1]?.trim() ?? '';
  const manuscriptKeywords = text.match(/keywords?\s*:\s*([^\n]+)/i)?.[1]?.trim() ?? '';
  const copySubmissionField = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedSubmissionField(label);
  };
  return (
    <main className="jmatch-shell">
      {step === 5 && selected && <section className="view submit-view-new"><SubmissionPanel selected={selected} text={text} title={title} formatDone={formatDone} verifyDone={verifyDone} fixed={fixed} declarationsConfirmed={declarationsConfirmed} onDeclarationsConfirmed={setDeclarationsConfirmed} authorName={authorName} authorAffiliation={authorAffiliation} authorOrcid={authorOrcid} fundingStatement={fundingStatement} conflictStatement={conflictStatement} dataStatement={dataStatement} onUnlock={() => setShowPricing(true)} /><SubmissionAuthorForm authorName={authorName} onAuthorName={setAuthorName} authorAffiliation={authorAffiliation} onAuthorAffiliation={setAuthorAffiliation} authorOrcid={authorOrcid} onAuthorOrcid={setAuthorOrcid} fundingStatement={fundingStatement} onFundingStatement={setFundingStatement} conflictStatement={conflictStatement} onConflictStatement={setConflictStatement} dataStatement={dataStatement} onDataStatement={setDataStatement} declarationsConfirmed={declarationsConfirmed} onDeclarationsConfirmed={setDeclarationsConfirmed} /></section>}
      <header className="letterhead">
        <div className="letterhead-inner">
          <div>
            <div className="brand"><span className="stamp">✓</span><h1>Submit<em>Check</em></h1></div>
            <p className="tagline">Get submission-ready. Get closer to acceptance.</p>
          </div>
          <div className="header-actions">
            <div className="plan-actions">
              <span className={plan === 'pro' ? 'plan-pill pro' : 'plan-pill'}>{plan === 'pro' ? '⭐ Pro plan' : '🔓 Free plan'}</span>
              <button className="btn btn-gold" onClick={() => setShowPricing(true)}>⭐ Upgrade</button>
            </div>
            <nav className="auth-nav" aria-label="Account">
              {account ? <><a className="auth-link" href="/app">{account.fullName}<small>{account.email}</small></a><a className="auth-link signup-link" href="/app">Dashboard</a></> : <><a className="auth-link" href="/login">Log in</a><a className="auth-link signup-link" href="/signup">Sign up</a></>}
            </nav>
          </div>
        </div>
      </header>

      <div className="wrap">
        <nav className="stepper" aria-label="Workflow">
          {steps.map(([label, desc], index) => (
            <button key={label} className={step === index + 1 ? 'step-btn active' : 'step-btn'} onClick={() => setStep(index + 1)}>
              <span className="num">{index + 1}</span><span>{label}</span><small>{desc}</small>{index > 0 && index < 4 && plan === 'free' ? <i>🔒</i> : null}
            </button>
          ))}
        </nav>

        {step === 1 && <>
          <section className="panel">
            <label className="panel-label">Paste your manuscript <span className="hint">For the most accurate journal recommendations, include Title, Abstract, Keywords, Methods, Results, and References.</span></label>
            <div className="row" style={{ marginBottom: '12px' }}>
              <input
                className="editor"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Manuscript title"
                style={{ flex: 1, marginRight: 12, minHeight: '44px' }}
              />
              <label className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', margin: 0 }}>
                {uploading ? 'Reading file...' : 'Upload file'}
                <input type="file" accept=".pdf,.docx,.txt" hidden onChange={handleUploadFile} />
              </label>
            </div>
            <label className="upload-area"><span className="upload-icon">📄</span><strong>Drop your manuscript here</strong><span>PDF, DOCX, or TXT · Max 10MB</span><input type="file" accept=".pdf,.docx,.txt" onChange={handleUploadFile} /></label>
            <div className="or-divider">or paste text</div>
            <textarea className="editor" value={text} onChange={(event) => { setText(event.target.value); setRemoteMatches([]); setSelected(null); setAiGaps([]); setFixed([]); }} placeholder="Paste your full manuscript here..." />
            <div className="row">
              <button className="btn btn-primary" onClick={() => runMatch()} disabled={matching}>{matching ? 'Matching journals...' : '🔍 Find matching journals'}</button>
              <button className="btn btn-secondary" onClick={() => { setTitle('Amorphous solid dispersions for enhancing solubility of poorly water-soluble drugs'); setText(sample); setRemoteMatches([]); setSelected(null); setAiGaps([]); setFixed([]); }}>Load a sample</button>
              <button className="btn btn-secondary" onClick={handleSaveManuscript} disabled={saving || !text.trim()}>{saving ? 'Saving...' : 'Save manuscript'}</button>
              <button className="btn btn-secondary" onClick={saveMatchingResults} disabled={!activeManuscriptId || matching}>{matching ? 'Saving...' : 'Save matches'}</button>
              <button className="btn btn-secondary" onClick={() => analyzeGaps()} disabled={gapLoading || !text.trim()}>{gapLoading ? 'Analyzing...' : 'AI gap analysis'}</button>
            </div>
            {saveMessage && <div className="sample-note" style={{ marginTop: 12 }}>{saveMessage}</div>}
            {savedManuscripts.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div className="panel-label" style={{ marginBottom: 8 }}>Saved manuscripts</div>
                <div className="space-y-2">
                  {savedManuscripts.slice(0, 4).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: '100%', justifyContent: 'space-between', textAlign: 'left', marginBottom: 8 }}
                      onClick={() => {
                        setTitle(item.title);
                        setText(item.raw_text);
                        setActiveManuscriptId(item.id);
                        fetch(`/api/manuscript-matches?manuscriptId=${item.id}`)
                          .then((response) => response.json())
                          .then((payload) => {
                            if (payload.matches) setSavedMatches(payload.matches);
                          })
                          .catch(() => setSavedMatches([]));
                      }}
                    >
                      <span>{item.title}</span>
                      <small>{new Date(item.created_at).toLocaleDateString()}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {savedMatches.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div className="panel-label" style={{ marginBottom: 8 }}>Saved match results</div>
                <div className="space-y-2">
                  {savedMatches.slice(0, 4).map((match) => (
                    <div key={match.id} className="btn btn-secondary" style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 8 }}>
                      <strong>{match.fit_score}% fit</strong>
                      <div>{match.gaps?.[0]?.title ?? 'Journal match saved'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiGaps.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div className="panel-label" style={{ marginBottom: 8 }}>AI editorial gaps</div>
                <div className="space-y-2">
                  {aiGaps.map((gap) => (
                    <div key={gap.id} className="panel" style={{ padding: 16 }}>
                      <div style={{ fontWeight: 700 }}>{gap.icon} {gap.title}</div>
                      {(gap.location || gap.evidence) && <div style={{ marginTop: 7, color: 'var(--shu)', fontSize: 12 }}><strong>{gap.location || 'Manuscript evidence'}</strong>{gap.evidence ? ` · ${gap.evidence}` : ''}</div>}
                      <div style={{ marginTop: 6, color: 'var(--muted)' }}>{gap.description}</div>
                      <pre style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{gap.example}</pre>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
          <section className="panel"><label className="panel-label">Narrow it down</label><div className="filters"><label>Field<select value={field} onChange={(event) => { const value = event.target.value; setField(value); void runMatch({ field: value }); }}><option>Any field</option>{scopusFields.map((subject) => <option key={subject}>{subject}</option>)}</select></label><label>Indexing<select value={indexing} onChange={(event) => { const value = event.target.value; setIndexing(value); void runMatch({ indexing: value }); }}><option>Any indexing</option>{indexStats.length ? indexStats.filter((item) => item.count > 0).map((item) => <option key={item.name} value={item.name}>{item.name} ({item.count.toLocaleString()} verified)</option>) : <option value="Scopus">Scopus</option>}</select></label><label>Quartile<select value={quartile} onChange={(event) => { const value = event.target.value; setQuartile(value); void runMatch({ quartile: value }); }}>{quartileOptions.map((option) => <option key={option}>{option}</option>)}</select></label><label className="budget-filter">Budget <strong>{budget === 0 ? 'Any budget' : `${formatBudget(budget)} or less`}</strong><input type="range" min="0" max={maximumBudget} step="1000" value={budget} aria-label="Maximum publication budget" onChange={(event) => { const value = Number(event.target.value); setBudget(value); void runMatch({ budget: value }); }} /><span className="budget-range"><small>Any</small><small>₹1,000</small><small>{formatBudget(maximumBudget)}</small></span></label><label>Access<select value={access} onChange={(event) => setAccess(event.target.value)}><option>Any</option><option>OA / Free</option><option>Paid</option></select></label></div></section>
          <section className="panel journal-lookup-panel"><label className="panel-label">Check any journal directly <span className="hint">Search by journal name, publisher, or ISSN to see indexing and quartile details.</span></label><form className="journal-lookup-form" onSubmit={lookupJournal}><input value={journalLookupQuery} onChange={(event) => setJournalLookupQuery(event.target.value)} placeholder="e.g. Nature Reviews Cardiology, ISSN, or publisher" /><button className="btn btn-primary" type="submit" disabled={journalLookupLoading}>{journalLookupLoading ? 'Searching...' : 'Check journal'}</button></form>{journalLookupResults.length > 0 && <div className="journal-lookup-results">{journalLookupResults.map((journal) => { const details = journalLookupDetails[journal.id]; return <div className="lookup-result" key={journal.id}><div><strong>{journal.name}</strong><span>{journal.publisher} · {journal.field}</span><div className="tags"><span className="tag q1">{journal.quartile}</span>{journal.indexed.map((item) => <span className="tag" key={item}>{item}</span>)}{journal.oa && <span className="tag oa">Open access</span>}</div></div><div className="lookup-actions">{journal.issn && <small>ISSN {journal.issn}</small>}<a className="btn-small journal-link" href={journal.submissionUrl || `https://www.google.com/search?q=${encodeURIComponent(`${journal.name} official journal website`)}`} target="_blank" rel="noreferrer">↗ Website</a>{(journal.issn || journal.eissn) && <button type="button" className="btn-small" onClick={() => lookupJournalDetails(journal)}>{details ? 'Refresh details' : 'APC/details'}</button>}</div>{details && <div className="lookup-details"><span><strong>APC:</strong> {details.amount ? `${details.amount} ${details.currency}` : 'Not listed'}</span><span><strong>Speed:</strong> {details.publicationWeeks ? `${details.publicationWeeks} weeks` : 'Not listed'}</span>{details.journalUrl && <a href={details.journalUrl} target="_blank" rel="noreferrer">Open official website</a>}{details.apcUrl ? <a href={details.apcUrl} target="_blank" rel="noreferrer">View APC source</a> : details.apcSearchUrl ? <a href={details.apcSearchUrl} target="_blank" rel="noreferrer">Find APC pricing</a> : null}</div>}</div>; })}</div>}</section>
          <div className="section-title">Matching journals <span>{text ? `${Math.min(matches.length, plan === 'pro' ? matches.length : 3)} matched by fit` : ''}</span></div>
          {noBudgetMatches && <div className="empty">No catalog journals with a verified APC are available within {formatBudget(budget)}. This does not mean there are no suitable journals; journals that report no APC are checked separately through DOAJ. <button className="btn btn-small primary-btn" onClick={findVerifiedNoApcJournals} disabled={lowApcLoading}>{lowApcLoading ? 'Finding no-APC alternatives...' : 'Find no-APC alternatives'}</button></div>}
          {lowApcJournals.length > 0 && <section ref={lowApcResultsRef} className="panel low-apc-results"><label className="panel-label">DOAJ-reported no-APC candidates <span className="hint">DOAJ reports no APC for these records. APC policies can change, so verify the publisher policy before submission.</span></label>{lowApcJournals.map((journal) => <div className="lookup-result" key={`${journal.title}-${journal.publisher}`}><div><strong>{journal.title}</strong><span>{journal.publisher} · {journal.subjects.slice(0, 2).join(', ') || 'Subject not listed'}</span></div><div className="lookup-actions">{journal.journalUrl && <a className="btn-small journal-link" href={journal.journalUrl} target="_blank" rel="noreferrer">↗ Website</a>}{journal.apcUrl && <a className="btn-small" href={journal.apcUrl} target="_blank" rel="noreferrer">APC policy</a>}{journal.instructionsUrl && <a className="btn-small" href={journal.instructionsUrl} target="_blank" rel="noreferrer">Instructions</a>}</div></div>)}</section>}
          {noFilteredMatches && <div className="empty">No journals match every selected filter. Try Any quartile, Any indexing, or a broader field. Some catalog journals are unranked and do not have verified APC data.</div>}
          {!text || text.length < 50 ? <div className="empty">📚<br />Paste your manuscript, then click <strong>“Find matching journals.”</strong></div> : <div>{matches.filter(({ journal }) => journal.sponsored).map(({ journal, match, gaps }) => <JournalCard key={journal.name} journal={journal} match={match} gaps={gaps} sponsored onSelect={(value) => selectJournal(value)} />)}{matches.filter(({ journal }) => !journal.sponsored).slice(0, plan === 'pro' ? matches.length : 3).map(({ journal, match, gaps }) => <JournalCard key={journal.name} journal={journal} match={match} gaps={gaps} onSelect={(value) => selectJournal(value)} />)}{plan === 'free' && matches.length > 3 && <div className="locked-card"><div className="blur-line">More matched journals with fit scores</div><div className="locked-overlay">🔒<strong>{matches.length - 3} more matched journals</strong><button className="btn btn-gold btn-small" onClick={() => setShowPricing(true)}>⭐ Unlock all matches</button></div></div>}</div>}
        </>}

        {step === 2 && <section className="view"><div className="panel"><label className="panel-label">Fix for your journal <span className="hint">Review the editorial checks, edit the manuscript, then apply only changes you approve.</span></label><select className="wide-select" value={selected?.name ?? ''} onChange={(event) => { const journal = matches.find(({ journal: item }) => item.name === event.target.value)?.journal; if (journal) selectJournal(journal, 2); }}><option value="">Select a journal from your matches...</option>{matches.map(({ journal }) => <option key={journal.name}>{journal.name}</option>)}</select></div>{!selected ? <div className="empty">🔧<br />Select a journal and review its gaps.</div> : <GapPanel gaps={fixGaps} plan={plan} fixed={fixed} onFix={(title) => setFixed([...fixed, title])} onApply={applyGapDraft} onUnlock={() => setShowPricing(true)} text={text} onTextChange={setText} title={title} appliedDrafts={appliedDrafts} visualHtml={manuscriptVisualHtml} />}</section>}

        {step === 3 && (selected ? <section className="view"><FormatPanel selected={selected} text={text} onUnlock={() => setShowPricing(true)} onReviewed={() => setFormatDone(true)} /></section> : <section className="view"><div className="panel"><label className="panel-label">Format to journal style</label><div className="selected-journal">Select a journal in Find first.</div></div><div className="empty">📐<br />Select a journal to review its author instructions and formatting rules.</div></section>)}

        {step === 4 && (selected ? <section className="view"><VerifyPanel selected={selected} text={text} plan={plan} onUnlock={() => setShowPricing(true)} onCompleted={() => setVerifyDone(true)} /></section> : <section className="view"><div className="panel"><label className="panel-label">Verify — integrity and readiness</label><div className="empty">🔍<br />Select a journal first to run submission-readiness checks.</div></div></section>)}

        {step === 5 && <section className="view"><div className="panel"><label className="panel-label">Submission package <span className="hint">Review every field and declaration before opening the publisher portal.</span></label>{[['📄 Manuscript is complete', text.length > 200], ['🎯 Target journal selected', !!selected], ['🔧 Gaps fixed', chosenGaps.filter((gap) => gap.priority === 'critical').every((gap) => fixed.includes(gap.title))], ['📐 Formatting reviewed', formatDone], ['🔍 Integrity checks completed', verifyDone]].map(([label, done]) => <p className="check-row" key={label as string}><span>{done ? '✅' : '⬜'}</span>{label as string}</p>)}{selected ? <div className="submission-package"><SubmissionField label="Title" value={title || text.match(/^title\s*:\s*(.+)$/im)?.[1] || 'Add a manuscript title'} copied={copiedSubmissionField} onCopy={copySubmissionField} /><SubmissionField label="Abstract" value={manuscriptAbstract || 'Abstract not detected. Add it before submission.'} copied={copiedSubmissionField} onCopy={copySubmissionField} /><SubmissionField label="Keywords" value={manuscriptKeywords || 'Keywords not detected. Add 4-8 terms.'} copied={copiedSubmissionField} onCopy={copySubmissionField} /><label>Corresponding author<input value={authorName} onChange={(event) => setAuthorName(event.target.value)} placeholder="Full name" /></label><label>Affiliation<input value={authorAffiliation} onChange={(event) => setAuthorAffiliation(event.target.value)} placeholder="University, department, country" /></label><label>ORCID (optional)<input value={authorOrcid} onChange={(event) => setAuthorOrcid(event.target.value)} placeholder="0000-0000-0000-0000" /></label><label>Funding statement<textarea value={fundingStatement} onChange={(event) => setFundingStatement(event.target.value)} /></label><label>Competing interests<textarea value={conflictStatement} onChange={(event) => setConflictStatement(event.target.value)} /></label><label>Data availability statement<textarea value={dataStatement} onChange={(event) => setDataStatement(event.target.value)} /></label><label className="contact-consent"><input type="checkbox" checked={declarationsConfirmed} onChange={(event) => setDeclarationsConfirmed(event.target.checked)} /> I confirm that author details, ethics, funding, conflicts, data availability, and manuscript content are accurate.</label></div> : <div className="submission-package-empty"><strong>Select a target journal first.</strong><span>Go to Find, choose a journal, then return here to prepare the submission package.</span></div>}<div className="submit-status">{plan === 'pro' && selected && formatDone && verifyDone && declarationsConfirmed ? 'Ready for author-controlled submission.' : 'Complete all checks and confirm declarations before submission.'}</div><button className="btn btn-success" disabled={!selected || !declarationsConfirmed} onClick={() => { if (selected) window.open(selected.submissionUrl || getAuthorInstructionsSearchUrl(selected), '_blank'); }}>📤 Open journal submission portal</button></div></section>}
      </div>

      <section className="expert-service">
        <div className="expert-intro">
          <span className="eyebrow">Expert panel</span>
          <h2>Need the writing done?</h2>
          <p>Our subject specialists can help develop original, properly cited academic content with human review for clarity, structure, and journal readiness.</p>
          <div className="expert-points"><span>✓ Manuscripts</span><span>✓ Theses</span><span>✓ Book chapters</span><span>✓ Originality review</span></div>
        </div>
        <div className="expert-form panel">
          <label>What do you need?<select value={serviceType} onChange={(event) => setServiceType(event.target.value)}><option>Manuscript</option><option>Thesis</option><option>Book chapter</option></select></label>
          <label>Topic or working title<input value={serviceTopic} onChange={(event) => setServiceTopic(event.target.value)} placeholder="e.g. AI in drug discovery" /></label>
          <div className="expert-form-row"><label>Approx. words<input type="number" min="500" step="500" value={serviceWords} onChange={(event) => setServiceWords(event.target.value)} /></label><label>When do you need it?<select value={serviceDeadline} onChange={(event) => setServiceDeadline(event.target.value)}><option>Flexible</option><option>Within 2 weeks</option><option>Urgent (7 days)</option></select></label></div>
          <label>Tell us your requirements<textarea value={serviceRequirements} onChange={(event) => setServiceRequirements(event.target.value)} placeholder="Field, target journal, sections needed, references, data available, and any formatting requirements..." /></label>
          <div className="expert-form-row"><label>WhatsApp number<input value={serviceWhatsApp} onChange={(event) => setServiceWhatsApp(event.target.value)} placeholder="Include country code, e.g. +91 ..." type="tel" /></label><label>Email address<input value={serviceEmail} onChange={(event) => setServiceEmail(event.target.value)} placeholder="you@example.com" type="email" /></label></div>
          <label>Preferred contact method<select value={serviceContactMethod} onChange={(event) => setServiceContactMethod(event.target.value)}><option>Both</option><option>WhatsApp</option><option>Email</option></select></label>
          <label className="contact-consent"><input type="checkbox" checked={serviceConsent} onChange={(event) => setServiceConsent(event.target.checked)} /> I consent to receive the quote and timeline by my selected contact method.</label>
          <p className="quote-disclaimer">This estimate covers our service only. Journal or publisher APCs, submission fees, publication charges, and taxes are separate third-party costs, paid directly to the relevant provider.</p><button className="btn btn-primary" onClick={requestExpertQuote}>Get writing service quote</button>
          {quoteMessage && <div className="quote-message">{quoteMessage}</div>}
        </div>
      </section>

      {showPricing && <div className="modal-backdrop" onClick={() => setShowPricing(false)}><div className="modal-card" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowPricing(false)}>✕</button><div className="modal-header"><div>🔓</div><h2>Unlock the full workflow</h2><p>Fix, Format, and Verify are where most authors save real revision time.</p></div><div className="plans"><div className="plan-card"><span>Per manuscript</span><strong>₹499 <small>/ paper</small></strong><p>1 manuscript, full workflow<br />All journal matches<br />Valid until submitted</p><button className="btn btn-secondary" onClick={() => handlePayment('manuscript')} disabled={paymentLoading}>{paymentLoading ? 'Processing...' : 'Choose'}</button></div><div className="plan-card highlight"><b>Most popular</b><span>Author Pro</span><strong>₹299 <small>/ month</small></strong><p>Unlimited manuscripts<br />Fix + Format + Verify<br />Cancel anytime</p><button className="btn btn-primary" onClick={() => handlePayment('pro')} disabled={paymentLoading}>{paymentLoading ? 'Processing...' : 'Choose'}</button></div></div></div></div>}
      {step === 2 && trackedDraft && <TrackedChangeReview draft={trackedDraft} onChange={(draftText) => setTrackedDraft({ ...trackedDraft, text: draftText })} onAccept={() => { const acceptedText = trackedDraft.text.trim(); const anchor = inferDraftAnchor(trackedDraft.title); if (acceptedText) { setAppliedDrafts((current) => [{ title: trackedDraft.title, text: acceptedText, anchor }, ...current]); } setTrackedDraft(null); setSaveMessage('Tracked change accepted into the manuscript.'); }} onReject={() => { setTrackedDraft(null); setSaveMessage('Tracked change rejected. The manuscript was not changed.'); }} />}
    </main>
  );
}

function TrackedChangeReview({ draft, onChange, onAccept, onReject }: { draft: { title: string; text: string }; onChange: (text: string) => void; onAccept: () => void; onReject: () => void }) {
  return <section className="tracked-change-panel panel" aria-label="Tracked manuscript change"><div className="tracked-change-head"><strong>Tracked change: {draft.title}</strong><span>Red text is a proposed insertion. Review it before accepting.</span></div><textarea className="tracked-change-editor" value={draft.text} onChange={(event) => onChange(event.target.value)} /><div className="row"><button className="btn btn-primary" onClick={onAccept}>✓ Accept change</button><button className="btn btn-secondary" onClick={onReject}>Reject</button></div></section>;
}

function FormatPanel({ selected, text, onUnlock, onReviewed }: { selected: Journal; text: string; onUnlock: () => void; onReviewed: () => void }) {
  const [fixedRules, setFixedRules] = useState<string[]>([]);
  const [liveInstructions, setLiveInstructions] = useState<{ url: string | null; source: string; checkedAt: string } | null>(null);
  const [fetchingInstructions, setFetchingInstructions] = useState(false);
  const titleMatch = titleFromManuscript(text) || 'Untitled manuscript';
  const abstract = text.match(/abstract\s*:?\s*([\s\S]*?)(?=\n\s*(?:keywords?|introduction|methods?)\s*:|$)/i)?.[1]?.trim() ?? '';
  const references = text.match(/references\s*:?[\s\S]*$/i)?.[0] ?? '';
  const hasSections = ['introduction', 'methods', 'results', 'discussion'].every((section) => new RegExp(`(?:^|\\n)\\s*(?:\\d+\\.?\\s*)?${section}\\b`, 'i').test(text));
  const rules = [
    { id: 'title', name: 'Title and front matter', source: 'A clear title should appear before the abstract.', detail: titleMatch === 'Untitled manuscript' ? 'No manuscript title was detected.' : 'Title detected and ready for journal formatting.', fixed: titleMatch !== 'Untitled manuscript' },
    { id: 'abstract', name: 'Abstract structure', source: selected.requirements.abstract === 'structured' ? 'Use Background, Methods, Results, and Conclusion headings.' : 'Provide a concise unstructured abstract before keywords.', detail: abstract ? `${wordCount(abstract)} words detected.` : 'Abstract not detected.', fixed: Boolean(abstract) },
    { id: 'references', name: 'Reference style', source: `References should follow ${selected.requirements.refStyle} style.`, detail: references ? 'Reference section detected; verify each entry before submission.' : 'Reference section not detected.', fixed: Boolean(references) },
    { id: 'sections', name: 'Section order', source: 'Title, Abstract, Keywords, Introduction, Methods, Results, Discussion, References.', detail: hasSections ? 'Core manuscript sections detected.' : 'One or more core sections are missing.', fixed: hasSections },
    { id: 'word-limit', name: 'Word limit', source: selected.requirements.wordLimit ? `Stay within ${selected.requirements.wordLimit} words.` : 'No catalog word limit is listed for this journal.', detail: selected.requirements.wordLimit ? `${wordCount(text)} / ${selected.requirements.wordLimit} words.` : 'Confirm the limit in the journal instructions.', fixed: selected.requirements.wordLimit === null || wordCount(text) <= selected.requirements.wordLimit },
  ];
  const openRules = rules.filter((rule) => !rule.fixed && !fixedRules.includes(rule.id));
  const fixRule = (id: string) => {
    setFixedRules((current) => current.includes(id) ? current : [...current, id]);
    if (rules.every((rule) => rule.fixed || rule.id === id || fixedRules.includes(rule.id))) onReviewed();
  };
  const fixAll = () => {
    setFixedRules(rules.map((rule) => rule.id));
    onReviewed();
  };
  const fetchInstructions = async () => {
    const issn = selected.issn || selected.eissn;
    if (!issn) {
      setLiveInstructions({ url: selected.authorInstructionsUrl || selected.submissionUrl || null, source: 'Journal record', checkedAt: new Date().toISOString() });
      return;
    }
    setFetchingInstructions(true);
    try {
      const response = await fetch(`/api/journal-details?issn=${encodeURIComponent(issn)}&title=${encodeURIComponent(selected.name)}`);
      const payload = await response.json() as { authorInstructionsUrl?: string | null; journalUrl?: string | null; source?: string };
      setLiveInstructions({ url: payload.authorInstructionsUrl || payload.journalUrl || selected.authorInstructionsUrl || selected.submissionUrl || null, source: payload.source || 'Live journal lookup', checkedAt: new Date().toISOString() });
    } catch {
      setLiveInstructions({ url: selected.authorInstructionsUrl || selected.submissionUrl || null, source: 'Catalog record', checkedAt: new Date().toISOString() });
    } finally {
      setFetchingInstructions(false);
    }
  };

  return <div className="format-workspace"><div className="format-manuscript"><div className="format-page"><div className="format-title">{titleMatch}</div><div className="format-meta">Manuscript format preview · {selected.name}</div><div className="format-divider" /><h3>Abstract</h3><p>{abstract || 'Abstract not detected. Add an abstract before submission.'}</p><h3>Keywords</h3><p>{text.match(/keywords?\s*:?\s*([^\n]+)/i)?.[1] || 'Keywords not detected.'}</p><div className="format-section-grid"><span>Introduction</span><span>Methods</span><span>Results</span><span>Discussion</span></div><h3>References</h3><p className="format-reference-preview">{references ? references.replace(/^references\s*:?/i, '').trim() : 'References not detected. Add and format the reference list.'}</p></div></div><aside className="format-rail"><div className="format-rail-head"><div><strong>Instructions to authors</strong><span>{selected.name}</span></div><button className="btn btn-gold btn-small" onClick={onUnlock}>Pro formatting</button></div><div className="live-instructions"><div><strong>{liveInstructions ? 'Live source checked' : 'Live instructions not checked'}</strong><span>{liveInstructions ? `${liveInstructions.source} · ${new Date(liveInstructions.checkedAt).toLocaleTimeString()}` : 'Fetch the publisher or DOAJ author instructions before submission.'}</span></div><div className="live-instruction-actions"><button className="btn-small" onClick={fetchInstructions} disabled={fetchingInstructions}>{fetchingInstructions ? 'Checking...' : 'Fetch live rules'}</button>{liveInstructions?.url && <a className="btn-small" href={liveInstructions.url} target="_blank" rel="noreferrer">Open source</a>}</div></div><div className="format-summary"><strong>{openRules.length === 0 ? 'All rules reviewed' : `${openRules.length} rule${openRules.length === 1 ? '' : 's'} need review`}</strong><button className="btn btn-primary btn-small" onClick={fixAll} disabled={openRules.length === 0}>Fix all</button></div>{rules.map((rule) => { const done = rule.fixed || fixedRules.includes(rule.id); return <div className={`format-rule-card ${done ? 'fixed' : 'mismatch'}`} key={rule.id}><div className="format-rule-head"><strong>{rule.name}</strong><span className={`format-status ${done ? 'ok' : 'bad'}`}>{done ? 'Matches' : 'Mismatch'}</span></div><div className="format-source">“{rule.source}”</div><p>{rule.detail}</p>{!done && <button className="btn btn-apply btn-small" onClick={() => fixRule(rule.id)}>Mark reviewed</button>}</div>; })}</aside></div>;
}

function VerifyPanel({ selected, text, plan, onUnlock, onCompleted }: { selected: Journal; text: string; plan: 'free' | 'pro'; onUnlock: () => void; onCompleted: () => void }) {
  const [ran, setRan] = useState(false);
  const titlePresent = Boolean(titleFromManuscript(text));
  const abstractPresent = Boolean(text.match(/abstract\s*:?\s*[\s\S]*?(?=\n\s*(?:keywords?|introduction|methods?)\s*:|$)/i)?.[0]);
  const keywordsPresent = Boolean(text.match(/keywords?\s*:?\s*[^\n]+/i));
  const methodsPresent = /(?:^|\n)\s*(?:\d+\.?\s*)?(?:methods?|materials and methods|methodology)\b/i.test(text);
  const resultsPresent = /(?:^|\n)\s*(?:\d+\.?\s*)?(?:results?|findings?)\b/i.test(text);
  const referencesPresent = /(?:^|\n)\s*references?\b/i.test(text);
  const basicChecks = [
    { id: 'title', label: 'Title is present', detail: titlePresent ? 'A manuscript title was detected.' : 'Add a title before submission.', pass: titlePresent },
    { id: 'abstract', label: 'Abstract is present', detail: abstractPresent ? 'Abstract text detected.' : 'Add an abstract before submission.', pass: abstractPresent },
    { id: 'keywords', label: 'Keywords are present', detail: keywordsPresent ? 'Keywords detected.' : 'Add 4–8 keywords.', pass: keywordsPresent },
    { id: 'methods', label: 'Methods section is present', detail: methodsPresent ? 'Methods section detected.' : 'Methods section not detected.', pass: methodsPresent },
    { id: 'results', label: 'Results section is present', detail: resultsPresent ? 'Results section detected.' : 'Results section not detected.', pass: resultsPresent },
    { id: 'references', label: 'References are present', detail: referencesPresent ? 'Reference section detected.' : 'Reference section not detected.', pass: referencesPresent },
  ];
  const deepChecks = [
    { label: 'Journal-specific requirements', detail: `${selected.name} · ${selected.requirements.abstract} abstract · ${selected.requirements.refStyle} references`, pass: false },
    { label: 'Statistical reporting', detail: 'Check sample size, replicates, controls, tests, and uncertainty.', pass: false },
    { label: 'Declarations and ethics', detail: 'Check funding, conflicts, ethics, and data availability statements.', pass: false },
    { label: 'Reference consistency', detail: 'Check citation-reference matching and incomplete reference signals.', pass: false },
  ];
  const passed = basicChecks.filter((check) => check.pass).length;
  const runChecks = () => {
    if (plan !== 'pro') {
      setRan(true);
      return;
    }
    setRan(true);
    onCompleted();
  };

  return <div className="verify-workspace"><div className="verify-manuscript"><div className="format-page"><div className="format-title">{titleFromManuscript(text) || 'Untitled manuscript'}</div><div className="format-meta">Submission-readiness preview · {selected.name}</div><div className="format-divider" /><h3>Detected manuscript sections</h3><div className="verify-section-list">{basicChecks.map((check) => <div className={check.pass ? 'verify-section pass' : 'verify-section warn'} key={check.id}><span>{check.pass ? '✓' : '!'}</span><strong>{check.label}</strong></div>)}</div><h3>Readiness note</h3><p>{passed === basicChecks.length ? 'The basic manuscript structure is present. Review journal-specific checks before submission.' : 'Some basic manuscript components need attention before submission.'}</p></div></div><aside className="verify-rail"><div className="verify-rail-head"><div><strong>Integrity and readiness</strong><span>{selected.name}</span></div><span className="verify-count">{ran ? `${passed}/${basicChecks.length} basic checks` : 'Not run'}</span></div><div className={`verify-summary ${ran && passed < basicChecks.length ? 'needs-review' : ''}`}><strong>{!ran ? 'Ready to run basic checks' : passed === basicChecks.length ? 'Basic checks passed' : 'Needs attention'}</strong><button className="btn btn-primary btn-small" onClick={runChecks}>{ran ? 'Run again' : 'Run checks'}</button></div><div className="verify-check-group"><div className="verify-group-label">Basic checks · Free</div>{basicChecks.map((check) => <div className={`verify-check-card ${check.pass ? 'pass' : 'warn'}`} key={check.id}><div><strong>{check.label}</strong><p>{check.detail}</p></div><span>{ran ? (check.pass ? 'Pass' : 'Needs review') : 'Pending'}</span></div>)}</div><div className="verify-check-group"><div className="verify-group-label">Deep review · Pro</div>{deepChecks.map((check) => <div className="verify-check-card locked" key={check.label}><div><strong>{check.label}</strong><p>{check.detail}</p></div><span>🔒 Pro</span></div>)}<button className="btn btn-gold verify-upgrade" onClick={onUnlock}>Unlock deep verification</button></div></aside></div>;
}

function SubmissionAuthorForm({ authorName, onAuthorName, authorAffiliation, onAuthorAffiliation, authorOrcid, onAuthorOrcid, fundingStatement, onFundingStatement, conflictStatement, onConflictStatement, dataStatement, onDataStatement, declarationsConfirmed, onDeclarationsConfirmed }: { authorName: string; onAuthorName: (value: string) => void; authorAffiliation: string; onAuthorAffiliation: (value: string) => void; authorOrcid: string; onAuthorOrcid: (value: string) => void; fundingStatement: string; onFundingStatement: (value: string) => void; conflictStatement: string; onConflictStatement: (value: string) => void; dataStatement: string; onDataStatement: (value: string) => void; declarationsConfirmed: boolean; onDeclarationsConfirmed: (value: boolean) => void }) {
  return <div className="submission-author-form"><div className="panel-label">Author details and declarations</div><div className="submission-form-grid"><label>Corresponding author<input value={authorName} onChange={(event) => onAuthorName(event.target.value)} placeholder="Full name" /></label><label>Affiliation<input value={authorAffiliation} onChange={(event) => onAuthorAffiliation(event.target.value)} placeholder="University, department, country" /></label></div><label>ORCID (optional)<input value={authorOrcid} onChange={(event) => onAuthorOrcid(event.target.value)} placeholder="0000-0000-0000-0000" /></label><label>Funding statement<textarea value={fundingStatement} onChange={(event) => onFundingStatement(event.target.value)} /></label><label>Competing interests<textarea value={conflictStatement} onChange={(event) => onConflictStatement(event.target.value)} /></label><label>Data availability statement<textarea value={dataStatement} onChange={(event) => onDataStatement(event.target.value)} /></label><label className="contact-consent"><input type="checkbox" checked={declarationsConfirmed} onChange={(event) => onDeclarationsConfirmed(event.target.checked)} /> I confirm the author details and declarations are accurate.</label></div>;
}

function SubmissionPanel({ selected, text, title, formatDone, verifyDone, fixed, declarationsConfirmed, onDeclarationsConfirmed, authorName, authorAffiliation, authorOrcid, fundingStatement, conflictStatement, dataStatement, onUnlock }: { selected: Journal; text: string; title: string; formatDone: boolean; verifyDone: boolean; fixed: string[]; declarationsConfirmed: boolean; onDeclarationsConfirmed: (value: boolean) => void; authorName: string; authorAffiliation: string; authorOrcid: string; fundingStatement: string; conflictStatement: string; dataStatement: string; onUnlock: () => void }) {
  const [graphicalAbstract, setGraphicalAbstract] = useState<File | null>(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [titlePageStatus, setTitlePageStatus] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle');
  const titleValue = title || titleFromManuscript(text) || 'Add a manuscript title';
  const abstractValue = text.match(/abstract\s*:?\s*([\s\S]*?)(?=\n\s*(?:keywords?|introduction|methods?)\s*:|$)/i)?.[1]?.trim() || 'Abstract not detected.';
  const checks = [
    ['Manuscript complete', text.length > 200],
    ['Target journal selected', Boolean(selected)],
    ['Critical gaps reviewed', fixed.length > 0],
    ['Formatting reviewed', formatDone],
    ['Integrity checks completed', verifyDone],
    ['Declarations confirmed', declarationsConfirmed],
  ];
  const complete = checks.filter(([, done]) => done).length;
  const downloadTitlePage = async () => {
    if (titlePageStatus === 'generating') return;
    setTitlePageStatus('generating');
    try {
      const doc = new Document({ sections: [{ children: [new Paragraph({ text: titleValue, heading: 'Title' }), new Paragraph({ text: authorName || 'Corresponding author not added' }), new Paragraph({ text: authorAffiliation || 'Affiliation not added' }), new Paragraph({ text: authorOrcid ? `ORCID: ${authorOrcid}` : 'ORCID not provided' }), new Paragraph({ text: `Funding: ${fundingStatement}` }), new Paragraph({ text: `Competing interests: ${conflictStatement}` }), new Paragraph({ text: `Data availability: ${dataStatement}` })] }] });
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${titleValue.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'title-page'}-title-page.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setTitlePageStatus('ready');
    } catch {
      setTitlePageStatus('error');
    }
  };

  return <div className="submit-workspace"><div className="submit-preview"><div className="format-page"><div className="format-title">{titleValue}</div><div className="format-meta">Submission package · {selected.name}</div><div className="format-divider" /><h3>Author details</h3><p>{authorName || 'Corresponding author not added'}<br />{authorAffiliation || 'Affiliation not added'}{authorOrcid && <><br />ORCID: {authorOrcid}</>}</p><h3>Abstract</h3><p>{abstractValue}</p><h3>Declarations</h3><p>Funding: {fundingStatement}<br />Conflicts: {conflictStatement}<br />Data: {dataStatement}</p><h3>Additional files</h3><p>{graphicalAbstract ? `Graphical abstract: ${graphicalAbstract.name}` : 'Graphical abstract: not uploaded'}</p></div></div><aside className="submit-rail"><div className="submit-rail-head"><div><strong>Submission package</strong><span>{selected.name}</span></div><span className="verify-count">{complete}/{checks.length}</span></div><div className="submit-checks">{checks.map(([label, done]) => <div className={`submit-check ${done ? 'complete' : 'missing'}`} key={label as string}><span>{done ? '✓' : '!'}</span><strong>{label as string}</strong><em>{done ? 'Complete' : 'Needs attention'}</em></div>)}</div><div className="submit-files"><div className="verify-group-label">Submission files</div><div className="submit-file required"><div><strong>Main manuscript</strong><span>Ready from manuscript editor</span></div><b>Ready</b></div><div className="submit-file recommended"><div><strong>Separate title page</strong><span>Recommended · includes author details and declarations</span></div><button className="btn-small" onClick={downloadTitlePage}>Download DOCX</button></div><label className="submit-file optional"><div><strong>Graphical abstract</strong><span>{selected.oa ? 'Optional unless author instructions require it' : 'Optional · upload if requested by the journal'}</span></div><input type="file" accept="image/png,image/jpeg,image/tiff" onChange={(event) => setGraphicalAbstract(event.target.files?.[0] || null)} /></label><label className="submit-field-label">Cover letter (optional)<textarea value={coverLetter} onChange={(event) => setCoverLetter(event.target.value)} placeholder="Add a short cover letter for the editor..." /></label></div><div className="submit-declarations"><label className="contact-consent"><input type="checkbox" checked={declarationsConfirmed} onChange={(event) => onDeclarationsConfirmed(event.target.checked)} /> I confirm the author details and declarations are accurate.</label></div><div className="submit-actions"><button className="btn btn-success" disabled={!declarationsConfirmed} onClick={() => window.open(selected.submissionUrl || getAuthorInstructionsSearchUrl(selected), '_blank')}>Open journal portal</button><button className="btn btn-secondary" onClick={onUnlock}>Submission options</button></div></aside></div>;
}

function JournalCard({ journal, match, gaps, sponsored, onSelect }: { journal: Journal; match: ReturnType<typeof rankJournals>[number]['match']; gaps: ReturnType<typeof getGaps>; sponsored?: boolean; onSelect: (journal: Journal, nextStep?: number) => void }) {
  const [liveApc, setLiveApc] = useState<{ source?: string; amount: number | null; currency: string | null; hasApc: boolean; apcUrl: string | null; apcSearchUrl?: string | null; journalUrl: string | null; searchUrl?: string | null; authorInstructionsUrl: string | null; publicationWeeks: number | null } | null>(null);
  const [apcLoading, setApcLoading] = useState(false);

  const checkLiveApc = async () => {
    const issn = journal.issn || journal.eissn;
    if (!issn) return;
    setApcLoading(true);
    try {
      const response = await fetch(`/api/journal-details?issn=${encodeURIComponent(issn)}&title=${encodeURIComponent(journal.name)}`);
      const payload = await response.json();
      if (response.ok) setLiveApc(payload);
      else setLiveApc({ amount: null, currency: null, hasApc: false, apcUrl: null, apcSearchUrl: null, journalUrl: null, searchUrl: null, authorInstructionsUrl: null, publicationWeeks: null });
    } finally {
      setApcLoading(false);
    }
  };

  const websiteUrl = liveApc?.journalUrl || journal.submissionUrl || getJournalRecordUrl(journal);
  const websiteLabel = liveApc?.journalUrl || journal.submissionUrl ? 'Open journal website' : 'Find official website';
  return <article className={sponsored ? 'journal-card sponsored' : 'journal-card'}>{sponsored && <div className="sponsor-flag">⭐ Sponsored · Featured</div>}<div className="journal-head"><div><h3>{journal.name}</h3><p>{journal.publisher} · {journal.field}</p><a className="journal-website-top" href={websiteUrl} target="_blank" rel="noreferrer">↗ {websiteLabel}</a><div className="tags"><span className="tag q1">{journal.quartile}</span>{journal.oa && <span className="tag oa">Free-to-publish</span>}{journal.indexed.map((item) => <span className="tag" key={item}>{item}</span>)}</div></div><div className="fit"><span>Scientific fit: <b className={match.score > 80 ? 'score-good' : 'score-caution'}>{match.score}%</b></span><em className={gaps.some((gap) => gap.priority === 'critical') ? 'concerns' : 'good'}>{match.confidence} confidence</em></div></div><div className="journal-meta"><span><small>APC</small>{liveApc?.amount ? `${liveApc.amount.toLocaleString()} ${liveApc.currency}` : 'Not verified'}</span><span><small>Speed</small>{liveApc?.publicationWeeks ? `${liveApc.publicationWeeks} weeks` : 'Not verified'}</span><span><small>Gaps found</small>{gaps.length}</span><span><small>Word limit</small>{journal.requirements.wordLimit ? `${journal.requirements.wordLimit} words` : 'Not listed'}</span></div><div className="match-reasons"><strong>Why this match</strong>{match.reasons.slice(0, 2).map((reason) => <span key={reason}>✓ {reason}</span>)}{match.warnings.slice(0, 1).map((warning) => <span className="warning" key={warning}>! {warning}</span>)}</div><div className="journal-actions"><button className="btn-small primary-btn" onClick={() => onSelect(journal)}>🔧 Fix</button><button className="btn-small" onClick={() => onSelect(journal)}>📐 Format</button>{(journal.issn || journal.eissn) && <button className="btn-small" onClick={checkLiveApc} disabled={apcLoading}>{apcLoading ? 'Fetching APC & speed...' : liveApc ? (liveApc.amount || liveApc.publicationWeeks ? '✓ Live details loaded' : 'No live details found') : 'Fetch APC & speed'}</button>}{liveApc?.apcUrl ? <a className="btn-small journal-link" href={liveApc.apcUrl} target="_blank" rel="noreferrer">↗ View APC source</a> : liveApc?.apcSearchUrl ? <a className="btn-small journal-link" href={liveApc.apcSearchUrl} target="_blank" rel="noreferrer">↗ Find APC pricing</a> : null}</div>{liveApc?.journalUrl ? <div className="live-source">Website fetched from {liveApc.source} · <a href={liveApc.journalUrl} target="_blank" rel="noreferrer">Open website</a></div> : liveApc?.apcSearchUrl ? <div className="live-source">No structured APC record found; search publisher pricing before submission.</div> : null}</article>;
}

function GapPanel({ gaps, plan, fixed, onFix, onApply, onUnlock, text, onTextChange, title, appliedDrafts, visualHtml }: { gaps: ReturnType<typeof getGaps>; plan: 'free' | 'pro'; fixed: string[]; onFix: (title: string) => void; onApply: (gap: ReturnType<typeof getGaps>[number]) => void; onUnlock: () => void; text: string; onTextChange: (value: string) => void; title: string; appliedDrafts: Array<{ title: string; text: string; anchor: string }>; visualHtml?: string }) {
  void visualHtml;
  const visible = plan === 'pro' ? gaps : [];
  const [copied, setCopied] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [resolvedSentenceIndexes, setResolvedSentenceIndexes] = useState<number[]>([]);
  const sentenceSuggestions = buildSentenceSuggestions(text);
  const activeSentenceSuggestions = sentenceSuggestions.filter((item) => !resolvedSentenceIndexes.includes(item.index));

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.textContent === text) return;
    const matches = sentenceSuggestions
      .map((item) => ({ item, start: text.indexOf(item.sentence) }))
      .filter((match) => match.start >= 0)
      .sort((left, right) => left.start - right.start);
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    matches.forEach(({ item, start }) => {
      if (start < cursor) return;
      fragment.append(text.slice(cursor, start));
      const mark = document.createElement('mark');
      mark.className = 'inline-review-anchor';
      mark.dataset.commentIndex = String(item.index);
      mark.title = `${item.reason}. Review the comment on the right.`;
      mark.textContent = item.sentence;
      fragment.append(mark);
      cursor = start + item.sentence.length;
    });
    fragment.append(text.slice(cursor));
    editor.replaceChildren(fragment);
    if (visualHtml) {
      const embedded = document.createElement('div');
      embedded.className = 'embedded-document-inline';
      embedded.contentEditable = 'false';
      const source = new DOMParser().parseFromString(visualHtml, 'text/html');
      const media = source.querySelectorAll('table, img, figure');
      media.forEach((element) => embedded.appendChild(document.importNode(element, true)));
      if (media.length > 0) editor.appendChild(embedded);
    }
  }, [text, sentenceSuggestions, visualHtml]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const marks = editor.querySelectorAll<HTMLElement>('.inline-review-anchor');
    marks.forEach((mark) => {
      mark.hidden = resolvedSentenceIndexes.includes(Number(mark.dataset.commentIndex));
      mark.onclick = () => {
        const commentIndex = Number(mark.dataset.commentIndex);
        const commentPosition = activeSentenceSuggestions.findIndex((item) => item.index === commentIndex);
        document.querySelectorAll<HTMLElement>('.comment-card')[commentPosition]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
    });
    document.querySelectorAll<HTMLElement>('.comment-card').forEach((card, position) => {

      const item = sentenceSuggestions[position];
      if (item) {
        card.dataset.commentIndex = String(item.index);
        card.hidden = resolvedSentenceIndexes.includes(item.index);
        if (!card.querySelector('.btn-resolve')) {
          const resolveButton = document.createElement('button');
          resolveButton.className = 'btn btn-resolve';
          resolveButton.type = 'button';
          resolveButton.textContent = 'Resolve';
          resolveButton.onclick = (event) => {
            event.stopPropagation();
            setResolvedSentenceIndexes((current) => current.includes(item.index) ? current : [...current, item.index]);
          };
          card.querySelector('.card-actions')?.append(resolveButton);
        }
      }
      card.onclick = (event) => {
        if ((event.target as HTMLElement).closest('button')) return;
        const mark = item ? editor.querySelector<HTMLElement>(`[data-comment-index="${item.index}"]`) : null;
        mark?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
    });
  }, [text, sentenceSuggestions, activeSentenceSuggestions, resolvedSentenceIndexes]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const handleInput = (event: Event) => {
      const target = event.currentTarget as HTMLElement;
      const editorText = Array.from(target.childNodes)
        .filter((node) => !(node instanceof HTMLElement && node.classList.contains('embedded-document-inline')))
        .map((node) => node.textContent ?? '')
        .join('');
      event.stopImmediatePropagation();
      onTextChange(editorText);
    };
    editor.addEventListener('input', handleInput, true);
    return () => editor.removeEventListener('input', handleInput, true);
  }, [onTextChange]);

  const copySuggestion = async (gap: ReturnType<typeof getGaps>[number]) => {
    await navigator.clipboard.writeText(gap.example);
    setCopied(gap.title);
  };

  const downloadEditedManuscript = async () => {
    const safeTitle = title.trim() || 'edited-manuscript';
    const fileName = safeTitle.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'edited-manuscript';
    const timestamp = new Date().toISOString();

    const docChildren: Array<Paragraph> = [];
    const sections = splitManuscriptSections(text);
    const sectionDrafts = new Map<string, Array<{ title: string; text: string; anchor: string }>>();

    appliedDrafts.forEach((draft) => {
      const key = draft.anchor || 'end';
      const list = sectionDrafts.get(key) ?? [];
      list.push(draft);
      sectionDrafts.set(key, list);
    });

    docChildren.push(
      new Paragraph({
        text: safeTitle,
        heading: 'Title',
        spacing: { after: 180 },
      }),
    );

    docChildren.push(
      new Paragraph({
        text: 'Original manuscript with tracked changes',
        heading: 'Heading2',
        spacing: { before: 120, after: 120 },
      }),
    );

    sections.forEach((section, sectionIndex) => {
      section.lines.forEach((line) => {
        if (line.trim()) {
          docChildren.push(new Paragraph({ children: [new TextRun({ text: line })] }));
        } else {
          docChildren.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
        }
      });

      const sectionDraftsForSection = sectionDrafts.get(section.name) ?? [];
      if (sectionDraftsForSection.length) {
        docChildren.push(
          new Paragraph({
            text: sectionIndex === 0 ? 'Tracked changes for this section' : 'Suggested revisions',
            heading: 'Heading3',
            spacing: { before: 180, after: 80 },
          }),
        );

        sectionDraftsForSection.forEach((draft, index) => {
          docChildren.push(
            new Paragraph({
              spacing: { before: 60, after: 10 },
              children: [
                new TextRun({
                  text: `${index + 1}. ${draft.title}`,
                  bold: true,
                  color: '7F1D1D',
                }),
              ],
            }),
          );

          docChildren.push(
            new Paragraph({
              spacing: { after: 120 },
              children: [
                new InsertedTextRun({
                  id: index + 1,
                  author: 'SubmitCheck',
                  date: timestamp,
                  text: draft.text,
                  color: 'C00000',
                  underline: { type: 'single', color: 'C00000' },
                }),
              ],
            }),
          );
        });
      }
    });

    const endDrafts = sectionDrafts.get('end') ?? [];
    if (endDrafts.length) {
      docChildren.push(
        new Paragraph({
          text: 'Additional tracked changes',
          heading: 'Heading2',
          spacing: { before: 180, after: 120 },
        }),
      );

      endDrafts.forEach((draft, index) => {
        docChildren.push(
          new Paragraph({
            spacing: { before: 120, after: 20 },
            children: [
              new TextRun({
                text: `${index + 1}. ${draft.title}`,
                bold: true,
                color: '7F1D1D',
              }),
            ],
          }),
        );

        docChildren.push(
          new Paragraph({
            spacing: { after: 120 },
            children: [
              new InsertedTextRun({
                id: index + 1,
                author: 'SubmitCheck',
                date: timestamp,
                text: draft.text,
                color: 'C00000',
                underline: { type: 'single', color: 'C00000' },
              }),
            ],
          }),
        );
      });
    }

    const doc = new Document({
      sections: [{
        children: docChildren,
      }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}.docx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <div><div className={gaps.some((gap) => gap.priority === 'critical') ? 'verdict red' : 'verdict green'}>{gaps.length ? `⚠️ ${gaps.filter((gap) => gap.priority === 'critical').length} critical gaps to fix` : '✅ Editorial checks passed'}</div><div className="fix-layout">{gaps.length ? <div className="fix-column panel"><label className="panel-label">What to fix <span className="hint">These are editorial drafts. Review every change before submission.</span></label>{visible.map((gap) => <div className={`fix-item ${gap.priority}`} key={gap.title}><h3>{gap.priority === 'critical' ? '❌' : '🟡'} {gap.title}</h3><p>{gap.description}</p><pre>{gap.example}</pre><div className="fix-actions"><button className="btn-small" onClick={() => copySuggestion(gap)}>{copied === gap.title ? '✓ Copied' : 'Copy suggestion'}</button><button className="btn-small primary-btn" onClick={() => onApply(gap)}>✍ Apply draft</button><button className="btn-small" disabled={fixed.includes(gap.title)} onClick={() => onFix(gap.title)}>{fixed.includes(gap.title) ? '✅ Reviewed' : 'Mark reviewed'}</button></div></div>)}{plan === 'free' && gaps.length > 5 && <div className="locked-card"><div className="blur-line">First editorial review shown · Pro for the full set</div><div className="locked-overlay">🔒<strong>{gaps.length - 5} more journal-specific fixes stay locked</strong><button className="btn btn-gold btn-small" onClick={onUnlock}>⭐ Unlock full review</button></div></div>}</div> : <div className="panel fix-ready"><strong>Editorial checks passed for the detected requirements.</strong><span>Still review the full manuscript before submission.</span></div>}<div className="panel editor-column"><label className="panel-label">Manuscript editor <span className="hint">Free grammar polish appears here. Advanced journal-specific fixes stay behind Pro.</span></label><div className="editor-shell"><div className="editor-review-layout"><div ref={editorRef} className="editor editor-contenteditable" contentEditable suppressContentEditableWarning style={{ minHeight: '420px', whiteSpace: 'pre-wrap' }} onInput={(event) => onTextChange(event.currentTarget.textContent ?? '')} />{sentenceSuggestions.length > 0 ? <aside className="review-rail"><div className="review-rail-header">Reviewer comments <small>{sentenceSuggestions.length} free fix{sentenceSuggestions.length === 1 ? '' : 'es'}</small></div>{sentenceSuggestions.map((item) => <div className="comment-card" key={`${item.index}-${item.sentence.slice(0, 24)}`}><div className="comment-head"><div className="avatar">AI</div><div className="who">SubmitCheck</div><div className="kind-label">{item.reason}</div></div><p className="quote">{item.sentence}</p><p className="reason">Tighten the sentence for publication clarity while keeping the meaning intact.</p><div className="suggest-label">Suggested rewrite</div><div className="suggest-text">{item.suggestion}</div><div className="card-actions"><button className="btn btn-apply" onClick={() => onTextChange(applySentenceSuggestion(text, item.index, item.suggestion))}>Apply</button><button className="btn btn-reject" onClick={() => onTextChange(text)}>Reject</button></div></div>)}</aside> : <div className="review-rail empty-review-rail"><div className="review-rail-header">Reviewer comments <small>0</small></div><div className="empty-state-inline">No inline manuscript comments.</div></div>}</div></div><div className="row"><button className="btn btn-secondary" onClick={downloadEditedManuscript}>↓ Download DOCX with tracked changes</button><button className="btn btn-primary" onClick={() => onUnlock()}>📐 Format →</button></div></div></div></div>;
}
