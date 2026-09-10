import { NextResponse } from 'next/server';
import { anthropic } from '@/lib/claude';

type GapAnalysisRequest = {
  manuscriptText?: unknown;
  journalName?: unknown;
  journalField?: unknown;
  articleType?: unknown;
  journalRequirements?: unknown;
};

export async function POST(request: Request) {
  let body: GapAnalysisRequest;

  try {
    body = (await request.json()) as GapAnalysisRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const manuscriptText = typeof body.manuscriptText === 'string' ? body.manuscriptText : '';
  const journalName = typeof body.journalName === 'string' ? body.journalName : 'target journal';
  const journalField = typeof body.journalField === 'string' ? body.journalField : 'general research';
  const articleType = typeof body.articleType === 'string' ? body.articleType : 'research';
  const journalRequirements = body.journalRequirements && typeof body.journalRequirements === 'object'
    ? JSON.stringify(body.journalRequirements)
    : '{}';

  try {

    if (!manuscriptText.trim()) {
      return NextResponse.json({ error: 'Manuscript text is required.' }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        usesFallback: true,
        gaps: heuristicallyGenerateGaps(manuscriptText, journalName, journalField),
      });
    }

    const prompt = `
You are an academic editorial reviewer.
Return only valid JSON with an array called "gaps".
Each item must contain:
- id: short string
- priority: "critical" or "important"
- icon: "❌" or "🟡"
- location: section name or "whole manuscript"
- evidence: short exact quote or precise description of what is present/missing
- title: a specific issue tied to this manuscript section
- description: explain what the manuscript currently says or omits, why it conflicts with the target journal, and what to change
- example: replacement-ready wording, structure, or concrete edit; never use a generic placeholder like "add more detail"

Goal: identify missing or weak manuscript elements for the journal ${journalName} in ${journalField}.
Manuscript type: ${articleType}

Target journal requirements (treat these as constraints):
${journalRequirements}

Manuscript text (read the complete supplied text; references are included only when checking citation and reference quality):
${manuscriptText.slice(0, 90000)}

Read the manuscript closely before answering. First identify its actual study design, biological material or dataset, methods, controls, primary outcomes, statistics, limitations, and main claim. Then compare those details against the target journal scope and requirements. Identify exact sections or phrases when possible. Do not return generic checks such as "improve clarity" or "add more detail". Every fix must name the manuscript section, cite a short exact phrase or state that a required item is absent, explain the publication risk for this journal, and give a concrete replacement paragraph, sentence, table, or analysis request. Prioritize issues that could cause editorial rejection, then scientific reporting gaps, then journal-format mismatches. Return at most 6 high-value fixes.
`;

    const completion = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      temperature: 0.3,
      system: 'You are a strict academic editor helping plan manuscript revisions. Output valid JSON only.',
      messages: [{ role: 'user', content: prompt }],
    });

    const content = completion.content?.[0]?.type === 'text' ? completion.content[0].text : '';
    const parsed = safeJsonParse(content);
    const gaps = Array.isArray(parsed?.gaps) && parsed.gaps.length ? parsed.gaps : heuristicallyGenerateGaps(manuscriptText, journalName, journalField);

    return NextResponse.json({ usesFallback: false, gaps });
  } catch (error) {
    if (error instanceof Error) {
      console.error('Claude gap analysis failed:', error.message);
    }

    return NextResponse.json({
      usesFallback: true,
      gaps: heuristicallyGenerateGaps(
        manuscriptText,
        journalName,
        journalField,
      ),
    });
  }
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value.replace(/```json|```/gi, '').trim());
  } catch {
    return null;
  }
}

function heuristicallyGenerateGaps(
  manuscriptText: string,
  journalName: string,
  journalField: string,
) {
  const text = manuscriptText.replace(/\r\n?/g, '\n');
  const lower = text.toLowerCase();
  const gaps = [] as Array<{ id: string; priority: 'critical' | 'important'; icon: '❌' | '🟡'; location: string; evidence: string; title: string; description: string; example: string }>;
  const abstract = text.match(/(?:^|\n)\s*abstract\s*:?[ \t]*\n?([\s\S]*?)(?=\n\s*keywords?\b|\n\s*(?:introduction|1\.?\s+introduction)\b|$)/i)?.[1] ?? '';

  if (!abstract.trim()) gaps.push({ id: 'abstract', priority: 'critical', icon: '❌', location: 'Abstract', evidence: 'No abstract block detected.', title: `Add a complete abstract for ${journalName}`, description: 'Summarize the extract, LC-HRMS profiling, docking/ADMET workflow, RAW 264.7 experiment, quantitative findings, and conclusion.', example: 'Write 200-300 words covering objective, methods, key numerical results, limitations, and conclusion.' });
  else if (!/(methods?|results?|conclusion|findings?)/i.test(abstract)) gaps.push({ id: 'abstract-evidence', priority: 'critical', icon: '❌', location: 'Abstract', evidence: `Abstract begins: "${abstract.trim().slice(0, 180)}"`, title: 'Make the abstract evidence-led', description: `The abstract does not clearly expose methods, results, and conclusion for ${journalName}.`, example: 'Add sentences for LC-MS identification, docking/MD and ADMET, RAW 264.7 results including IC50 >100 µg/mL, and the limitation.' });
  if (/lc[- ](?:esi[- ])?qtof|hrms|mass spectrometry/i.test(lower) && !/(standard|level|quantif|ms\/ms|accuracy|validation|confidence)/i.test(lower)) gaps.push({ id: 'analytical-validation', priority: 'critical', icon: '❌', location: 'Phytochemical profiling / Methods', evidence: 'LC-HRMS profiling is present, but validation or identification confidence is not detected.', title: 'Support compound identification with analytical evidence', description: `For ${journalName}, distinguish tentative database annotation from confirmed identification using mass error, adducts, fragments, standards, and identification level.`, example: 'Add a table with m/z, retention time, mass error, diagnostic fragments, identification level, source, and confidence.' });
  if (/molecular docking|molecular dynamics|admet/i.test(lower) && !/(software|version|pdb|validation|redocking|rmsd|parameter|random seed)/i.test(lower)) gaps.push({ id: 'computational-reproducibility', priority: 'critical', icon: '❌', location: 'Molecular docking / MD / ADMET', evidence: 'Computational methods are claimed, but reproducibility details are incomplete.', title: 'Add computational reproducibility and validation', description: `For ${journalField} readers, report protein preparation, PDB ID, ligand preparation, software/version, grid settings, redocking/reference validation, MD parameters, and ADMET tool versions.`, example: 'Include PDB ID, grid coordinates, exhaustiveness, reference-ligand RMSD, force field, water model, trajectory length, and ADMET platform/version.' });
  if (/raw\s*264\.7|cytotoxicity|mtt assay/i.test(lower) && !/(vehicle|untreated|positive control|replicate|\bn\s*=|statistical|anova|error bar|dose[- ]response)/i.test(lower)) gaps.push({ id: 'cell-assay-reporting', priority: 'critical', icon: '❌', location: 'RAW 264.7 / In-vitro assay', evidence: 'Cell assay is present, but controls, replicates, dose-response, or statistics are not clearly detected.', title: 'Complete RAW 264.7 assay reporting', description: 'Report cell source/passage, treatment duration, controls, biological replicates, concentration-response model, statistical test, and IC50 uncertainty before making an anti-inflammatory claim.', example: 'Report n, vehicle/positive controls, concentrations, exposure time, mean ± SD/CI, statistical test, correction, and IC50 confidence interval.' });
  if (!/(limitation|limitations|future work|future directions)/i.test(lower)) gaps.push({ id: 'limitations', priority: 'important', icon: '🟡', location: 'Discussion / Conclusion', evidence: 'No explicit limitations section detected.', title: 'Add limitations specific to this evidence chain', description: 'State that compound assignments may be tentative, docking/ADMET are predictive, and RAW 264.7 results do not establish in-vivo efficacy.', example: 'Add limitations on annotation confidence, computational prediction, cell-line scope, lack of in-vivo confirmation, and next validation experiment.' });
  if (!/(novel|new|original|first|contribution|innovation)/i.test(abstract || text.slice(0, 6000))) gaps.push({ id: 'novelty', priority: 'important', icon: '🟡', location: 'Abstract / Introduction', evidence: 'No concise novelty claim tied to Cyanthillium, Akt, and the integrated workflow detected.', title: 'State the original contribution precisely', description: 'Define what this study adds beyond prior Cyanthillium or phytochemical reports instead of making a broad anti-inflammatory claim.', example: 'State whether the contribution is an integrated LC-HRMS-to-Akt workflow, RAW 264.7 validation, or a prioritized compound-target hypothesis, with the closest prior citation.' });
  return gaps.slice(0, 6);
}
