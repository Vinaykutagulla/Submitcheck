import assert from 'node:assert/strict';
import { profileManuscript, rankJournals, type MatchJournal } from '@/utils/decisionTreeMatcher';

export type Fixture = {
  name: string;
  expectedField: string;
  manuscript: string;
  target: MatchJournal;
  distractor: MatchJournal;
};

const requirements = { abstract: 'unstructured' as const, wordLimit: null, refStyle: 'Numbered' };
const journal = (name: string, field: string, scope: string[], asjcCodes: string[] = []): MatchJournal => ({ name, field, scope, asjcCodes, requirements });

export const fixtures: Fixture[] = [
  {
    name: 'Mathematics',
    expectedField: 'Mathematics',
    manuscript: 'Title: Topological properties of nonlinear differential equations\nAbstract: We prove a new theorem for boundary-value equations using algebraic topology, mathematical analysis, and rigorous proof techniques.',
    target: journal('Journal of Mathematical Analysis', 'Mathematics', ['mathematical analysis', 'differential equations', 'topology'], ['2601']),
    distractor: journal('Journal of Crop Science', 'Agriculture', ['crop science', 'plant growth'], ['1101']),
  },
  {
    name: 'Engineering',
    expectedField: 'Engineering',
    manuscript: 'Title: Robotic control system for structural inspection\nAbstract: We design and evaluate a mechanical prototype with a feedback control system, sensor integration, and robotics experiments.',
    target: journal('Robotics and Autonomous Systems', 'Engineering', ['robotics', 'control system', 'mechanical design'], ['2204']),
    distractor: journal('Journal of Social Psychology', 'Psychology', ['behavior', 'mental health'], ['3201']),
  },
  {
    name: 'Economics',
    expectedField: 'Economics',
    manuscript: 'Title: Cost-effectiveness of vaccination programs\nAbstract: This health economics study estimates QALYs, incremental cost-effectiveness ratios, reimbursement impact, and budget impact using a decision model.',
    target: journal('Health Economics Review', 'Economics', ['health economics', 'cost effectiveness', 'QALY', 'reimbursement'], ['2001']),
    distractor: journal('Journal of Molecular Biology', 'Biochemistry, Genetics and Molecular Biology', ['protein', 'enzyme', 'genomics'], ['1302']),
  },
  {
    name: 'Computer Science',
    expectedField: 'Computer Science',
    manuscript: 'Title: Neural network classifier for image recognition\nAbstract: We train a machine learning algorithm on a benchmark dataset and compare deep learning model accuracy and validation performance.',
    target: journal('Pattern Recognition', 'Computer Science', ['machine learning', 'neural network', 'classifier', 'algorithm'], ['1702']),
    distractor: journal('Journal of Environmental Chemistry', 'Environmental Science', ['pollution', 'water quality'], ['2301']),
  },
  {
    name: 'Environmental Science',
    expectedField: 'Environmental Science',
    manuscript: 'Title: Microplastic pollution in wastewater\nAbstract: We quantify environmental contamination in wastewater and assess ecosystem risk, water quality, and pollutant removal performance.',
    target: journal('Water Research', 'Environmental Science', ['wastewater', 'water quality', 'pollution', 'ecosystem'], ['2303']),
    distractor: journal('Journal of Supply Chain Management', 'Business, Management and Accounting', ['business', 'supply chain', 'forecasting'], ['1402']),
  },
  {
    name: 'Chemistry',
    expectedField: 'Chemistry',
    manuscript: 'Title: Catalytic synthesis of polymer materials\nAbstract: We investigate a chemical reaction pathway, catalyst performance, molecular structure, polymer characterization, and spectroscopy results.',
    target: journal('Macromolecular Chemistry and Physics', 'Chemistry', ['polymer', 'chemical synthesis', 'spectroscopy', 'molecular structure'], ['1604']),
    distractor: journal('Journal of Clinical Nursing', 'Nursing', ['nursing', 'patient care', 'clinical practice'], ['2901']),
  },
  {
    name: 'Social Sciences',
    expectedField: 'Social Sciences',
    manuscript: 'Title: Student behavior and classroom learning\nAbstract: We conducted a survey of students and teachers to study education policy, classroom behavior, qualitative interviews, and learning outcomes.',
    target: journal('Studies in Educational Evaluation', 'Social Sciences', ['education', 'student', 'classroom', 'survey', 'qualitative'], ['3304']),
    distractor: journal('Journal of Renewable Energy', 'Energy', ['solar', 'battery', 'fuel cell'], ['2102']),
  },
  {
    name: 'Analytical Chemistry',
    expectedField: 'Analytical Chemistry',
    manuscript: 'Title: HPLC method validation for pharmaceutical analysis\nAbstract: We develop and validate a chromatographic method using HPLC, retention time, method validation, quality control, and analytical quality by design.',
    target: journal('Journal of Pharmaceutical Analysis', 'Analytical Chemistry', ['HPLC', 'chromatography', 'method validation', 'pharmaceutical analysis'], ['1602']),
    distractor: journal('Journal of Theoretical Physics', 'Physics and Astronomy', ['quantum', 'particle', 'optical'], ['3101']),
  },
  {
    name: 'Physics',
    expectedField: 'Physics',
    manuscript: 'Title: Quantum entanglement in photonic systems\nAbstract: We study quantum mechanics, wavefunctions, photon interference, and entanglement using an optical experiment.',
    target: journal('Physical Review A', 'Physics and Astronomy', ['quantum physics', 'optics', 'photonics'], ['3101']),
    distractor: journal('Journal of Ancient History', 'Arts and Humanities', ['history', 'archive', 'medieval'], ['1201']),
  },
  {
    name: 'Earth and Planetary Sciences',
    expectedField: 'Earth and Planetary Sciences',
    manuscript: 'Title: Seismic evidence for planetary crust formation\nAbstract: We analyze geophysics, tectonic signals, meteorite composition, and planetary geology in the early solar system.',
    target: journal('Icarus', 'Earth and Planetary Sciences', ['planetary science', 'solar system', 'planetary geology'], ['1902']),
    distractor: journal('Journal of Corporate Strategy', 'Business, Management and Accounting', ['business', 'strategy', 'management'], ['1401']),
  },
  {
    name: 'History',
    expectedField: 'Arts and Humanities',
    manuscript: 'Title: Archival evidence from medieval trade networks\nAbstract: This historical study examines archives, medieval documents, historiography, and ancient economic institutions.',
    target: journal('Historical Research', 'Arts and Humanities', ['history', 'historical', 'archive', 'historiography'], ['1201']),
    distractor: journal('Journal of Quantum Physics', 'Physics and Astronomy', ['quantum', 'particle', 'wavefunction'], ['3101']),
  },
  {
    name: 'Literature',
    expectedField: 'Arts and Humanities',
    manuscript: 'Title: Narrative voice in contemporary novels\nAbstract: We use literary theory and textual analysis to examine poetry, narrative structure, and interpretation across modern novels.',
    target: journal('Modern Language Review', 'Arts and Humanities', ['literature', 'literary', 'textual analysis', 'narrative'], ['1202']),
    distractor: journal('Journal of Battery Technology', 'Energy', ['battery', 'solar', 'fuel cell'], ['2102']),
  },
  {
    name: 'Philosophy',
    expectedField: 'Arts and Humanities',
    manuscript: 'Title: Ethics and epistemology of artificial intelligence\nAbstract: This philosophical study examines moral theory, epistemology, ontology, and ethical reasoning in automated decision systems.',
    target: journal('Ethics and Information Technology', 'Arts and Humanities', ['philosophy', 'ethics', 'epistemology'], ['1203']),
    distractor: journal('Journal of Crop Protection', 'Agriculture', ['crop', 'pesticide', 'plant growth'], ['1104']),
  },
  {
    name: 'Linguistics',
    expectedField: 'Arts and Humanities',
    manuscript: 'Title: Syntax and phonology in multilingual speech\nAbstract: We analyze linguistic structure, semantics, phonology, syntax, and corpus evidence from multilingual speakers.',
    target: journal('Journal of Linguistics', 'Arts and Humanities', ['linguistics', 'syntax', 'phonology', 'semantics'], ['1204']),
    distractor: journal('Journal of Clinical Medicine', 'Medicine', ['patient', 'diagnosis', 'clinical treatment'], ['2701']),
  },
];

export function runRegressionChecks() {
  const unrelatedJournal = journal('Unrelated Journal', 'Physics and Astronomy', ['quantum', 'particle'], ['3101']);
  const fieldOnlyText = 'Title: General research study\nAbstract: This study presents a general research framework and discussion.';
  const fieldOnlyScore = rankJournals(fieldOnlyText, [unrelatedJournal])[0]?.match.score ?? 0;
  assert.ok(fieldOnlyScore <= 25, `field-only mismatch exceeded cap: ${fieldOnlyScore}`);

  const neuroscienceText = 'Title: Synaptic plasticity and neural oscillations during working memory\nAbstract: We record neuronal activity in cortical circuits and analyze synaptic plasticity, network oscillations, and memory-related firing patterns. The study combines electrophysiology with cognitive task performance.';
  const neuroscienceJournal = journal('Journal of Neuroscience', 'Neuroscience', ['neuroscience', 'cognitive neuroscience', 'synaptic plasticity', 'neural oscillations', 'brain circuits'], ['2800']);
  const neuroscienceMatch = rankJournals(neuroscienceText, [neuroscienceJournal])[0]?.match;
  assert.ok((neuroscienceMatch?.score ?? 0) > 25, `same-field neuroscience match was incorrectly zeroed: ${neuroscienceMatch?.score ?? 0}`);

  const quantumOpticsText = 'Title: Quantum entanglement and photon interference in integrated photonic systems\nAbstract: We report wavefunction evolution, photon interference, and entanglement measurements in a photonic device. The experiment analyzes coherence, optical modes, and quantum-state tomography.';
  const physicalReviewA = journal('Physical Review A', 'Physics and Astronomy', ['quantum physics', 'optics', 'photonics'], ['3101']);
  const quantumPhysicsJournal = journal('Journal of Quantum Physics', 'Physics and Astronomy', ['quantum', 'particle', 'wavefunction'], ['3101']);
  const quantumOpticsRanked = rankJournals(quantumOpticsText, [physicalReviewA, quantumPhysicsJournal]);
  assert.equal(quantumOpticsRanked[0]?.journal.name, 'Physical Review A', `quantum optics should rank Physical Review A above the more generic quantum physics journal`);

  const sameFieldJournal = journal('General Physics Letters', 'Physics and Astronomy', ['physics', 'quantum mechanics'], ['3101']);
  const sameFieldNoEvidenceText = 'Title: General physics study\nAbstract: This study presents a general physics framework.';
  const sameFieldNoEvidenceMatch = rankJournals(sameFieldNoEvidenceText, [sameFieldJournal])[0]?.match;
  assert.ok((sameFieldNoEvidenceMatch?.score ?? 99) <= 35, `same-field no-evidence cap exceeded: ${sameFieldNoEvidenceMatch?.score}`);
  const bodyTopicText = 'Title: General physics study\nAbstract: This study presents a general physics framework.\nMethods: The body discusses quantum mechanics and wavefunction measurements in detail.';
  const bodyTopicMatch = rankJournals(bodyTopicText, [sameFieldJournal])[0]?.match;
  assert.ok((bodyTopicMatch?.score ?? 0) > (sameFieldNoEvidenceMatch?.score ?? 0), 'body-text topic evidence was lost');

  return { fieldOnlyScore, neuroscienceScore: neuroscienceMatch?.score ?? 0, sameFieldNoEvidenceScore: sameFieldNoEvidenceMatch?.score ?? 0, bodyTopicScore: bodyTopicMatch?.score ?? 0 };
}

export function runFixtureEvaluation() {
  let fieldPasses = 0;
  let rankPasses = 0;
let precisionAt5Total = 0;
let recallAt10Total = 0;
let reciprocalRankTotal = 0;
const perFieldMetrics: Array<{ field: string; rank: number; score: number; reciprocalRank: number }> = [];
for (const fixture of fixtures) {
  const profile = profileManuscript(fixture.manuscript);
  const ranked = rankJournals(fixture.manuscript, [fixture.target, fixture.distractor]);
  const targetRank = ranked.findIndex(({ journal: item }) => item.name === fixture.target.name) + 1;
  const fieldPass = profile.field === fixture.expectedField;
  const rankPass = targetRank === 1;
  precisionAt5Total += targetRank > 0 && targetRank <= 5 ? 1 / 5 : 0;
  recallAt10Total += targetRank > 0 && targetRank <= 10 ? 1 : 0;
  reciprocalRankTotal += targetRank > 0 ? 1 / targetRank : 0;
  perFieldMetrics.push({ field: fixture.name, rank: targetRank, score: ranked[0]?.match.score ?? 0, reciprocalRank: targetRank > 0 ? 1 / targetRank : 0 });
  if (fieldPass) fieldPasses++;
  if (rankPass) rankPasses++;
  assert.equal(fieldPass, true, `${fixture.name}: expected field ${fixture.expectedField}, got ${profile.field}`);
  assert.equal(rankPass, true, `${fixture.name}: target journal did not rank first`);
}

  return { fieldPasses, rankPasses, precisionAt5: precisionAt5Total / fixtures.length, recallAt10: recallAt10Total / fixtures.length, mrr: reciprocalRankTotal / fixtures.length, perFieldMetrics };
}

if (require.main === module) {
  const checks = runRegressionChecks();
  const result = runFixtureEvaluation();
  console.log(`\nEvaluation complete: ${result.fieldPasses}/${fixtures.length} field profiles and ${result.rankPasses}/${fixtures.length} rankings passed.`);
  console.log(`Field-only mismatch cap: ${checks.fieldOnlyScore}`);
  console.log(`Same-field/no-evidence cap: ${checks.sameFieldNoEvidenceScore}`);
  console.log(`Body-topic score improvement: ${checks.bodyTopicScore}`);
  console.log(`Precision@5: ${result.precisionAt5.toFixed(3)}`);
  console.log(`Recall@10: ${result.recallAt10.toFixed(3)}`);
  console.log(`MRR: ${result.mrr.toFixed(3)}`);
  console.log('Per-field metrics:');
  for (const metric of result.perFieldMetrics) console.log(`  ${metric.field}: rank=${metric.rank}, score=${metric.score}, reciprocalRank=${metric.reciprocalRank.toFixed(3)}`);
}
