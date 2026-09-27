export type AdversarialFixture = {
  id: string;
  name: string;
  expectedField: string;
  manuscript: string;
  expected: string[];
  notes: string;
};

export const adversarialFixtures: AdversarialFixture[] = [
  {
    id: 'env-wastewater-vs-general-environment',
    name: 'Environmental Science: wastewater specificity',
    expectedField: 'Environmental Science',
    manuscript: 'Title: Microplastic removal and ecosystem risk in municipal wastewater\nAbstract: We quantify microplastic abundance, pollutant removal efficiency, and ecological risk in wastewater treatment plants. The study evaluates water quality, nutrient loading, and ecosystem exposure under seasonal discharge conditions.',
    expected: ['Water Research', 'Environmental Science & Technology', 'Journal of Environmental Chemistry'],
    notes: 'Adversarial near-neighbor pair: distinguish wastewater-focused environmental journals from broader environmental coverage.',
  },
  {
    id: 'pharma-hplc-vs-analytical-bioanalytical',
    name: 'Analytical Chemistry: HPLC method validation',
    expectedField: 'Analytical Chemistry',
    manuscript: 'Title: HPLC method validation for pharmaceutical impurity profiling\nAbstract: We optimize chromatographic separation, retention times, and validation parameters for drug impurity analysis. The method targets assay precision, specificity, and regulatory quality by design for pharmaceutical products.',
    expected: ['Journal of Pharmaceutical Analysis', 'Analytical and Bioanalytical Chemistry'],
    notes: 'Discriminate pharmaceutical analysis journals from generic analytical chemistry journals.',
  },
  {
    id: 'quantum-optics-vs-general-physics',
    name: 'Physics: quantum optics discrimination',
    expectedField: 'Physics',
    manuscript: 'Title: Quantum entanglement and photon interference in integrated photonic systems\nAbstract: We report wavefunction evolution, photon interference, and entanglement measurements in a photonic device. The experiment analyzes coherence, optical modes, and quantum-state tomography.',
    expected: ['Physical Review A', 'Optics Express'],
    notes: 'Same-field challenge: quantum optics should beat generic physics and optics journals by stronger entanglement vocabulary.',
  },
  {
    id: 'neuroscience-cognition-vs-general-medical',
    name: 'Neuroscience: cognitive circuit mapping',
    expectedField: 'Neuroscience',
    manuscript: 'Title: Synaptic plasticity and neural oscillations during working memory\nAbstract: We record neuronal activity in cortical circuits and analyze synaptic plasticity, network oscillations, and memory-related firing patterns. The study combines electrophysiology with cognitive task performance.',
    expected: ['Journal of Neuroscience', 'Brain Research'],
    notes: 'High-signal neuroscience manuscript should outrank general medical journals despite shared clinical vocabulary.',
  },
  {
    id: 'econ-cost-effectiveness-vs-health-policy',
    name: 'Economics: cost-effectiveness analysis',
    expectedField: 'Economics',
    manuscript: 'Title: Incremental cost-effectiveness of vaccination delivery strategies\nAbstract: This health economics study estimates QALYs, incremental cost-effectiveness ratios, and budget impact for a vaccination program. We compare reimbursement scenarios and model healthcare utilization under alternative pricing structures.',
    expected: ['Health Economics Review', 'PharmacoEconomics'],
    notes: 'Reject overlap with general health policy journals by favoring explicit economic evaluation language.',
  },
  {
    id: 'ml-classifier-vs-computer-vision',
    name: 'Computer Science: neural classification',
    expectedField: 'Computer Science',
    manuscript: 'Title: Deep learning classifier for lesion segmentation in medical imaging\nAbstract: We train a convolutional neural network on a benchmark dataset and compare classifier performance, validation accuracy, and feature saliency maps against baseline machine learning models.',
    expected: ['Pattern Recognition', 'IEEE Transactions on Neural Networks and Learning Systems'],
    notes: 'Near-neighbor challenge: classifier + benchmark + deep learning should win over broad vision journals.',
  },
  {
    id: 'polymer-synthesis-vs-generic-chem',
    name: 'Chemistry: polymer synthesis',
    expectedField: 'Chemistry',
    manuscript: 'Title: Catalytic synthesis and characterization of biodegradable polymer films\nAbstract: We investigate catalyst-driven polymerization, molecular structure, spectral characterization, and thermal properties of biodegradable films for controlled material performance.',
    expected: ['Macromolecular Chemistry and Physics', 'Journal of Polymer Science'],
    notes: 'Distinguish polymer-specific chemistry journals from broad general chemistry venues.',
  },
  {
    id: 'topology-proof-vs-general-math',
    name: 'Mathematics: nonlinear PDE topology',
    expectedField: 'Mathematics',
    manuscript: 'Title: Topological invariants for nonlinear boundary-value problems\nAbstract: We prove existence and uniqueness for nonlinear differential equations using algebraic topology, variational methods, and rigorous analysis of boundary conditions.',
    expected: ['Journal of Mathematical Analysis', 'Journal of Differential Equations'],
    notes: 'Same-field near-neighbor challenge between analysis and differential-equation journals.',
  },
  {
    id: 'education-survey-vs-general-psych',
    name: 'Social Sciences: educational evaluation',
    expectedField: 'Social Sciences',
    manuscript: 'Title: Classroom interventions and student engagement in multilingual learning\nAbstract: We use surveys and interviews to assess classroom behavior, teaching quality, and educational policy effects on student engagement in multilingual schools.',
    expected: ['Studies in Educational Evaluation', 'Journal of School Psychology'],
    notes: 'Discriminate educational evaluation from general psychology journals using policy and classroom terminology.',
  },
  {
    id: 'robotics-control-vs-general-mechanics',
    name: 'Engineering: robotic control systems',
    expectedField: 'Engineering',
    manuscript: 'Title: Feedback control and sensor integration for autonomous structural inspection\nAbstract: We develop a mechanical prototype and feedback control system for autonomous structural inspection. The design integrates robotics, sensor calibration, and state estimation for error correction.',
    expected: ['Robotics and Autonomous Systems', 'IEEE/ASME Transactions on Mechatronics'],
    notes: 'Confounders: general mechanics or industrial systems journals should lose to robotics-specific journals.',
  },
  {
    id: 'agriculture-soil-vs-general-environment',
    name: 'Agriculture: soil productivity and crop response',
    expectedField: 'Agriculture',
    manuscript: 'Title: Soil amendment effects on crop yield and water-use efficiency\nAbstract: This agronomic study evaluates crop responses to soil amendments, irrigation scheduling, and nutrient management. We measure plant growth, yield, and soil properties across seasons.',
    expected: ['Field Crops Research', 'Agronomy for Sustainable Development'],
    notes: 'Protect against environmental-science journals that mention soil and water but lack agricultural yield terms.',
  },
  {
    id: 'negative-no-match-rare-virus',
    name: 'Negative case: no valid journal in catalog',
    expectedField: 'Medicine',
    manuscript: 'Title: Comparative study of ancient bone pathology in pre-industrial populations\nAbstract: The manuscript discusses skeletal morphology, burial archaeology, and historical recovery of funerary remains. It does not focus on clinical diagnosis, patient care, or modern epidemiology.',
    expected: [],
    notes: 'Negative test: should return empty or all Low confidence because the catalog lacks a true fit for archaeology-focused human skeletal pathology.',
  },
  {
    id: 'negative-no-match-cryptographic-systems',
    name: 'Negative case: no valid journal in catalog',
    expectedField: 'Computer Science',
    manuscript: 'Title: Formal verification of lattice-based post-quantum key exchange\nAbstract: We analyze security assumptions, protocol composition, and cryptographic proofs for a post-quantum key-exchange scheme. The work addresses protocol semantics and theorem-based validation rather than application systems.',
    expected: [],
    notes: 'Negative test: should not drift toward general ML or systems journals when the subject is cryptographic theory with no matching catalog entry.',
  },
  {
    id: 'negative-no-match-archaeology-linguistics',
    name: 'Negative case: no valid journal in catalog',
    expectedField: 'Arts and Humanities',
    manuscript: 'Title: Sound symbolism in Indigenous oral traditions and comparative lexicography\nAbstract: This linguistic anthropology manuscript traces oral narratives, ritual speech, and lexical semantics across Indigenous communities. It emphasizes cultural transmission and historical language change.',
    expected: [],
    notes: 'Negative test: should reject generic humanities journals when the manuscript is a niche cultural-linguistic study with no direct fit in the catalog.',
  },
];

export const adversarialManuscripts = adversarialFixtures.map((fixture) => ({
  id: fixture.id,
  field: fixture.expectedField,
  text: fixture.manuscript,
}));

export const adversarialExpected: Record<string, string[]> = Object.fromEntries(
  adversarialFixtures.map((fixture) => [fixture.id, fixture.expected]),
);
