'use client';

import { useEffect, useMemo, useState } from 'react';
import { parseUploadedManuscript } from '@/lib/upload-utils';
import { rankJournals } from '@/utils/decisionTreeMatcher';
import { SubmissionField } from '@/components/SubmissionField';

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

const indexingServices = ['Any indexing', 'Scopus', 'WoS', 'PubMed', 'Embase', 'DOAJ', 'CINAHL', 'ERIC', 'PsycINFO', 'INSPEC', 'Ei Compendex', 'MathSciNet', 'EBSCO'];
const quartileOptions = ['Any quartile', 'Q1 only', 'Q2+', 'Q3+', 'Q4+'];
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

function getJournalRecordUrl(journal: Journal) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${journal.name} official journal website`)}`;
}

function getAuthorInstructionsSearchUrl(journal: Journal) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${journal.name} author instructions submission guidelines`)}`;
}

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function getGaps(text: string, journal: Journal) {
  const lower = text.toLowerCase();
  const gaps = [] as { priority: 'critical' | 'important'; title: string; description: string; example: string }[];
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
  const [plan, setPlan] = useState<'free' | 'pro'>('free');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [field, setField] = useState('Any field');
  const [indexing, setIndexing] = useState('Any indexing');
  const [indexStats, setIndexStats] = useState<Array<{ name: string; count: number }>>([]);
  const [journalLookupQuery, setJournalLookupQuery] = useState('');
  const [journalLookupResults, setJournalLookupResults] = useState<Array<{ id: string; name: string; issn: string | null; eissn: string | null; publisher: string; field: string; subjects: string[]; quartile: string; oa: boolean; apc: string | null; indexed: string[]; submissionUrl: string | null }>>([]);
  const [journalLookupLoading, setJournalLookupLoading] = useState(false);
  const [lowApcJournals, setLowApcJournals] = useState<Array<{ title: string; publisher: string; subjects: string[]; journalUrl: string | null; instructionsUrl: string | null }>>([]);
  const [lowApcLoading, setLowApcLoading] = useState(false);
  const [journalLookupDetails, setJournalLookupDetails] = useState<Record<string, { source?: string; amount?: number | null; currency?: string | null; publicationWeeks?: number | null; journalUrl?: string | null; apcUrl?: string | null; apcSearchUrl?: string | null; searchUrl?: string | null }>>({});
  const [quartile, setQuartile] = useState('Any quartile');
  const [budget, setBudget] = useState(0);
  const [selected, setSelected] = useState<Journal | null>(null);
  const [fixed, setFixed] = useState<string[]>([]);
  const [formatDone, setFormatDone] = useState(false);
  const [formatLoading, setFormatLoading] = useState(false);
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
  const [aiGaps, setAiGaps] = useState<Array<{ id: string; priority: 'critical' | 'important'; icon: '❌' | '🟡'; title: string; description: string; example: string }>>([]);
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

  const localMatches = useMemo(() => rankJournals(text, journals
      .filter((journal) => field === 'Any field' || journal.field === field)
    .filter((journal) => indexing === 'Any indexing' || journal.indexed.includes(indexing))
    .filter((journal) => {
      const maxBudget = budget === 0 ? null : budget;
      if (!maxBudget) return true;
      const apc = parseApcToNumber(journal.apc);
      return apc !== null && apc <= maxBudget;
    })
    .filter((journal) => {
      if (quartile === 'Any quartile' || journal.quartile === 'Unranked') return true;
      const rank = Number(journal.quartile.replace('Q', ''));
      const minimum = Number(quartile.replace('Q', '').replace('+', '').replace(' only', ''));
      return quartile === 'Q1 only' ? rank === 1 : rank <= minimum;
    }))
    .map(({ journal, match }) => ({ journal, match, gaps: getGaps(text, journal) })), [text, field, indexing, quartile, budget]);
  const matches = remoteMatches !== null ? remoteMatches : localMatches;
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
      const profileTerms = text.toLowerCase().match(/[a-z][a-z-]{4,}/g)?.slice(0, 5).join(' ') || '';
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
      setRemoteMatches([]);
      setSelected(null);
      setAiGaps([]);
      setFixed([]);
      setSaveMessage(`Loaded ${file.name}`);
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

  const runMatch = async (overrides?: { field?: string; indexing?: string; quartile?: string; budget?: number }) => {
    if (text.trim().length < 50) return;
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
        body: JSON.stringify({ manuscriptText: text, field: nextField, indexing: nextIndexing, quartile: nextQuartile, budget: nextBudget || null }),
      });
      const result = await response.json() as { source?: string; matches?: typeof remoteMatches };
      if (result.source === 'supabase' && result.matches) {
        const normalizedMatches = result.matches.map(({ journal, match }) => ({
          journal,
          match,
          gaps: getGaps(text, journal),
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

    if (!text.trim()) {
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
          manuscriptText: text,
          journalName: journalOverride?.name ?? selected?.name ?? 'target journal',
          journalField: journalOverride?.field ?? selected?.field ?? field,
          articleType: 'research',
        }),
      });

      const payload = await response.json() as { gaps?: Array<{ id: string; priority: 'critical' | 'important'; icon: '❌' | '🟡'; title: string; description: string; example: string }>; usesFallback?: boolean; error?: string };

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
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan, receipt: `submitcheck-${selectedPlan}-${Date.now()}` }),
      });

      const payload = await response.json() as { demo?: boolean; error?: string; plan?: string; message?: string; order?: { id?: string; amount?: number } };
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to start payment.');
      }

      setPlan(selectedPlan === 'manuscript' ? 'pro' : 'pro');
      setShowPricing(false);
      setSaveMessage(payload.demo ? payload.message || 'Demo checkout approved.' : `Payment initiated for ${payload.plan ?? selectedPlan}.`);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'Unable to process payment.');
    } finally {
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

  const loadFormatRules = async () => {
    if (plan !== 'pro') {
      setShowPricing(true);
      return;
    }
    if (!selected) return;

    setFormatLoading(true);
    try {
      const issn = selected.issn || selected.eissn;
      if (issn) {
        const response = await fetch(`/api/journal-details?issn=${encodeURIComponent(issn)}&title=${encodeURIComponent(selected.name)}`);
        const payload = await response.json() as { authorInstructionsUrl?: string | null; journalUrl?: string | null };
        if (response.ok && (payload.authorInstructionsUrl || payload.journalUrl)) {
          setSelected({ ...selected, authorInstructionsUrl: payload.authorInstructionsUrl ?? undefined, submissionUrl: payload.journalUrl ?? selected.submissionUrl });
        }
      }
      setFormatDone(true);
    } finally {
      setFormatLoading(false);
    }
  };

  const chosenGaps = selected ? getGaps(text, selected) : [];
  const fixGaps = aiGaps.length
    ? aiGaps.map(({ priority, title, description, example }) => ({ priority, title, description, example }))
    : chosenGaps;
  const manuscriptAbstract = text.match(/abstract\s*:\s*([\s\S]*?)(?=\n\s*(?:keywords?|introduction|methods?)\s*:|$)/i)?.[1]?.trim() ?? '';
  const manuscriptKeywords = text.match(/keywords?\s*:\s*([^\n]+)/i)?.[1]?.trim() ?? '';
  const copySubmissionField = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedSubmissionField(label);
  };
  const allChecks = [
    ['Manuscript has enough content', text.trim().length > 500],
    ['Title is present', title.trim().length > 3 || /^title\s*:/im.test(text)],
    ['Abstract present', /abstract\s*:/i.test(text)],
    ['Keywords present', /keywords?\s*:/i.test(text)],
    ['Methods or study design present', /methods?|study design|methodology/i.test(text)],
    ['Results or findings present', /results?|findings?|outcomes?/i.test(text)],
    ['References present', /references?/i.test(text)],
    ['Novelty statement present', /novel|original|first|contribution|innovation/i.test(text)],
    ['Limitations discussed', /limitation|future work|future directions/i.test(text)],
    ['Formatting reviewed', formatDone],
    ['Target journal selected', Boolean(selected)],
  ];

  return (
    <main className="jmatch-shell">
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
              <a className="auth-link" href="/login">Log in</a>
              <a className="auth-link signup-link" href="/signup">Sign up</a>
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
                      <div style={{ marginTop: 6, color: 'var(--muted)' }}>{gap.description}</div>
                      <pre style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{gap.example}</pre>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
          <section className="panel"><label className="panel-label">Narrow it down</label><div className="filters"><label>Field<select value={field} onChange={(event) => { const value = event.target.value; setField(value); void runMatch({ field: value }); }}><option>Any field</option>{scopusFields.map((subject) => <option key={subject}>{subject}</option>)}</select></label><label>Indexing<select value={indexing} onChange={(event) => { const value = event.target.value; setIndexing(value); void runMatch({ indexing: value }); }}><option>Any indexing</option>{indexStats.length ? indexStats.filter((item) => item.count > 0).map((item) => <option key={item.name} value={item.name}>{item.name} ({item.count.toLocaleString()} verified)</option>) : <option value="Scopus">Scopus</option>}</select></label><label>Quartile<select value={quartile} onChange={(event) => { const value = event.target.value; setQuartile(value); void runMatch({ quartile: value }); }}>{quartileOptions.map((option) => <option key={option}>{option}</option>)}</select></label><label className="budget-filter">Budget <strong>{budget === 0 ? 'Any budget' : `${formatBudget(budget)} or less`}</strong><input type="range" min="0" max={maximumBudget} step="1000" value={budget} aria-label="Maximum publication budget" onChange={(event) => { const value = Number(event.target.value); setBudget(value); void runMatch({ budget: value }); }} /><span className="budget-range"><small>Any</small><small>₹1,000</small><small>{formatBudget(maximumBudget)}</small></span></label><label>Access<select><option>Any</option><option>OA / Free</option><option>Paid</option></select></label></div></section>
          <section className="panel journal-lookup-panel"><label className="panel-label">Check any journal directly <span className="hint">Search by journal name, publisher, or ISSN to see indexing and quartile details.</span></label><form className="journal-lookup-form" onSubmit={lookupJournal}><input value={journalLookupQuery} onChange={(event) => setJournalLookupQuery(event.target.value)} placeholder="e.g. Nature Reviews Cardiology, ISSN, or publisher" /><button className="btn btn-primary" type="submit" disabled={journalLookupLoading}>{journalLookupLoading ? 'Searching...' : 'Check journal'}</button></form>{journalLookupResults.length > 0 && <div className="journal-lookup-results">{journalLookupResults.map((journal) => { const details = journalLookupDetails[journal.id]; return <div className="lookup-result" key={journal.id}><div><strong>{journal.name}</strong><span>{journal.publisher} · {journal.field}</span><div className="tags"><span className="tag q1">{journal.quartile}</span>{journal.indexed.map((item) => <span className="tag" key={item}>{item}</span>)}{journal.oa && <span className="tag oa">Open access</span>}</div></div><div className="lookup-actions">{journal.issn && <small>ISSN {journal.issn}</small>}<a className="btn-small journal-link" href={journal.submissionUrl || `https://www.google.com/search?q=${encodeURIComponent(`${journal.name} official journal website`)}`} target="_blank" rel="noreferrer">↗ Website</a>{(journal.issn || journal.eissn) && <button type="button" className="btn-small" onClick={() => lookupJournalDetails(journal)}>{details ? 'Refresh details' : 'APC/details'}</button>}</div>{details && <div className="lookup-details"><span><strong>APC:</strong> {details.amount ? `${details.amount} ${details.currency}` : 'Not listed'}</span><span><strong>Speed:</strong> {details.publicationWeeks ? `${details.publicationWeeks} weeks` : 'Not listed'}</span>{details.journalUrl && <a href={details.journalUrl} target="_blank" rel="noreferrer">Open official website</a>}{details.apcUrl ? <a href={details.apcUrl} target="_blank" rel="noreferrer">View APC source</a> : details.apcSearchUrl ? <a href={details.apcSearchUrl} target="_blank" rel="noreferrer">Find APC pricing</a> : null}</div>}</div>; })}</div>}</section>
          <div className="section-title">Matching journals <span>{text ? `${Math.min(matches.length, plan === 'pro' ? matches.length : 3)} matched by fit` : ''}</span></div>
          {noBudgetMatches && <div className="empty">No journals with a verified APC are available under {formatBudget(budget)}. The Scopus catalog does not contain APC prices. <button className="btn btn-small primary-btn" onClick={findVerifiedNoApcJournals} disabled={lowApcLoading}>{lowApcLoading ? 'Finding verified no-APC journals...' : 'Find verified no-APC journals'}</button></div>}
          {lowApcJournals.length > 0 && <section className="panel low-apc-results"><label className="panel-label">Verified no-APC journals <span className="hint">Source: DOAJ. These journals report no APC in their DOAJ record; confirm current publisher policies before submission.</span></label>{lowApcJournals.map((journal) => <div className="lookup-result" key={`${journal.title}-${journal.publisher}`}><div><strong>{journal.title}</strong><span>{journal.publisher} · {journal.subjects.slice(0, 2).join(', ') || 'Subject not listed'}</span></div><div className="lookup-actions">{journal.journalUrl && <a className="btn-small journal-link" href={journal.journalUrl} target="_blank" rel="noreferrer">↗ Website</a>}{journal.instructionsUrl && <a className="btn-small" href={journal.instructionsUrl} target="_blank" rel="noreferrer">Instructions</a>}</div></div>)}</section>}
          {noFilteredMatches && <div className="empty">No journals match every selected filter. Try Any quartile, Any indexing, or a broader field. Some catalog journals are unranked and do not have verified APC data.</div>}
          {!text || text.length < 50 ? <div className="empty">📚<br />Paste your manuscript, then click <strong>“Find matching journals.”</strong></div> : <div>{matches.filter(({ journal }) => journal.sponsored).map(({ journal, match, gaps }) => <JournalCard key={journal.name} journal={journal} match={match} gaps={gaps} sponsored onSelect={(value) => selectJournal(value)} />)}{matches.filter(({ journal }) => !journal.sponsored).slice(0, plan === 'pro' ? matches.length : 3).map(({ journal, match, gaps }) => <JournalCard key={journal.name} journal={journal} match={match} gaps={gaps} onSelect={(value) => selectJournal(value)} />)}{plan === 'free' && matches.length > 3 && <div className="locked-card"><div className="blur-line">More matched journals with fit scores</div><div className="locked-overlay">🔒<strong>{matches.length - 3} more matched journals</strong><button className="btn btn-gold btn-small" onClick={() => setShowPricing(true)}>⭐ Unlock all matches</button></div></div>}</div>}
        </>}

        {step === 2 && <section className="view"><div className="panel"><label className="panel-label">Fix for your journal <span className="hint">This is where most of the revision time gets saved</span></label><select className="wide-select" value={selected?.name ?? ''} onChange={(event) => { const journal = matches.find(({ journal: item }) => item.name === event.target.value)?.journal; if (journal) selectJournal(journal, 2); }}><option value="">Select a journal from your matches...</option>{matches.map(({ journal }) => <option key={journal.name}>{journal.name}</option>)}</select></div>{!selected ? <div className="empty">🔧<br />Select a journal and review its gaps.</div> : <GapPanel gaps={fixGaps} plan={plan} fixed={fixed} onFix={(title) => setFixed([...fixed, title])} onUnlock={() => setShowPricing(true)} />}</section>}

        {step === 3 && <section className="view"><div className="panel"><label className="panel-label">Format to journal style</label><div className="selected-journal">{selected?.name ?? 'Select a journal in Find first.'}</div><button className="btn btn-primary" onClick={() => plan === 'pro' ? setFormatDone(true) : setShowPricing(true)}>📐 Get formatting rules</button></div>{formatDone && selected ? <div className="panel rules"><div className="verdict green">📐 Formatting rules <small>for {selected.name}</small></div><p><strong>Abstract</strong><span>{selected.requirements.abstract === 'structured' ? 'Structured (Background/Methods/Results/Conclusion)' : 'Unstructured, ~250 words'}</span></p><p><strong>Word limit</strong><span>{selected.requirements.wordLimit} words</span></p><p><strong>References</strong><span>{selected.requirements.refStyle} style</span></p><p><strong>Section order</strong><span>Title, Abstract, Keywords, Introduction, Methods, Results, Discussion, References</span></p></div> : <div className="locked-card"><div className="blur-line tall">Title, abstract, reference style, word limit and section order</div><div className="locked-overlay">🔒<strong>Formatting rules are a Pro feature</strong><button className="btn btn-gold btn-small" onClick={() => setShowPricing(true)}>⭐ Unlock formatting</button></div></div>}</section>}

        {step === 4 && <section className="view"><div className="panel"><label className="panel-label">Verify — integrity and readiness</label><div className="quick-tip">We check what matters. No fake AI-detection percentages — honest signals and readiness checks.</div><button className="btn btn-primary" onClick={() => plan === 'pro' ? setVerifyDone(true) : setShowPricing(true)}>🔍 Run checks</button></div>{verifyDone ? <div className="panel rules"><div className="verdict yellow">{allChecks.filter(([, done]) => done).length}/{allChecks.length} checks passed</div>{allChecks.map(([label, done]) => <p key={label as string}><span>{label as string}</span><strong className={done ? 'pass' : 'warn'}>{done ? '✅ Pass' : '⚠️ Check'}</strong></p>)}</div> : <div className="locked-card"><div className="blur-line tall">Completeness, references, declarations, and writing-quality signals</div><div className="locked-overlay">🔒<strong>Integrity checks are a Pro feature</strong><button className="btn btn-gold btn-small" onClick={() => setShowPricing(true)}>⭐ Unlock verify</button></div></div>}</section>}

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
          <div className="expert-form-row"><label>WhatsApp number<input value={serviceWhatsApp} onChange={(event) => setServiceWhatsApp(event.target.value)} placeholder="+91 98765 43210" type="tel" /></label><label>Email address<input value={serviceEmail} onChange={(event) => setServiceEmail(event.target.value)} placeholder="you@example.com" type="email" /></label></div>
          <label>Preferred contact method<select value={serviceContactMethod} onChange={(event) => setServiceContactMethod(event.target.value)}><option>Both</option><option>WhatsApp</option><option>Email</option></select></label>
          <label className="contact-consent"><input type="checkbox" checked={serviceConsent} onChange={(event) => setServiceConsent(event.target.checked)} /> I consent to receive the quote and timeline by my selected contact method.</label>
          <p className="quote-disclaimer">This estimate covers our service only. Journal or publisher APCs, submission fees, publication charges, and taxes are separate third-party costs, paid directly to the relevant provider.</p><button className="btn btn-primary" onClick={requestExpertQuote}>Get writing service quote</button>
          {quoteMessage && <div className="quote-message">{quoteMessage}</div>}
        </div>
      </section>

      {showPricing && <div className="modal-backdrop" onClick={() => setShowPricing(false)}><div className="modal-card" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowPricing(false)}>✕</button><div className="modal-header"><div>🔓</div><h2>Unlock the full workflow</h2><p>Fix, Format, and Verify are where most authors save real revision time.</p></div><div className="plans"><div className="plan-card"><span>Per manuscript</span><strong>₹499 <small>/ paper</small></strong><p>1 manuscript, full workflow<br />All journal matches<br />Valid until submitted</p><button className="btn btn-secondary" onClick={() => handlePayment('manuscript')} disabled={paymentLoading}>{paymentLoading ? 'Processing...' : 'Choose'}</button></div><div className="plan-card highlight"><b>Most popular</b><span>Author Pro</span><strong>₹299 <small>/ month</small></strong><p>Unlimited manuscripts<br />Fix + Format + Verify<br />Cancel anytime</p><button className="btn btn-primary" onClick={() => handlePayment('pro')} disabled={paymentLoading}>{paymentLoading ? 'Processing...' : 'Choose'}</button></div></div></div></div>}
    </main>
  );
}

function JournalCard({ journal, match, gaps, sponsored, onSelect }: { journal: Journal; match: ReturnType<typeof rankJournals>[number]['match']; gaps: ReturnType<typeof getGaps>; sponsored?: boolean; onSelect: (journal: Journal) => void }) {
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

function GapPanel({ gaps, plan, fixed, onFix, onUnlock }: { gaps: ReturnType<typeof getGaps>; plan: 'free' | 'pro'; fixed: string[]; onFix: (title: string) => void; onUnlock: () => void }) {
  const visible = plan === 'pro' ? gaps : gaps.slice(0, 1);
  const [copied, setCopied] = useState<string | null>(null);
  const copySuggestion = async (gap: ReturnType<typeof getGaps>[number]) => {
    await navigator.clipboard.writeText(gap.example);
    setCopied(gap.title);
  };

  return <div><div className={gaps.some((gap) => gap.priority === 'critical') ? 'verdict red' : 'verdict green'}>{gaps.length ? `⚠️ ${gaps.filter((gap) => gap.priority === 'critical').length} critical gaps to fix` : '✅ Ready for this journal!'}</div>{gaps.length ? <div className="panel"><label className="panel-label">What to fix <span className="hint">Review the suggestion, copy it, then update your manuscript.</span></label>{visible.map((gap) => <div className={`fix-item ${gap.priority}`} key={gap.title}><h3>{gap.priority === 'critical' ? '❌' : '🟡'} {gap.title}</h3><p>{gap.description}</p><pre>{gap.example}</pre><div className="fix-actions"><button className="btn-small" onClick={() => copySuggestion(gap)}>{copied === gap.title ? '✓ Copied' : 'Copy suggestion'}</button><button className="btn-small primary-btn" disabled={fixed.includes(gap.title)} onClick={() => onFix(gap.title)}>{fixed.includes(gap.title) ? '✅ Applied!' : 'Mark as fixed'}</button></div></div>)}{plan === 'free' && gaps.length > 1 && <div className="locked-card"><div className="blur-line">More fixes with before/after examples</div><div className="locked-overlay">🔒<strong>{gaps.length - 1} more fixes for this journal</strong><button className="btn btn-gold btn-small" onClick={onUnlock}>⭐ Unlock all fixes</button></div></div>}</div> : <div className="panel fix-ready"><strong>No fixes required for this journal.</strong><span>Your manuscript matches the detected journal checks. Continue to formatting.</span></div>}<button className="btn btn-primary" onClick={() => onUnlock()}>📐 Format →</button></div>;
}
