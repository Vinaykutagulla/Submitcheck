import { getBandedMatches, rankJournals } from '../src/utils/decisionTreeMatcher';
import { adversarialExpected, adversarialManuscripts } from './adversarial';
import { fixtureJournals } from './journals';
import { fixtureManuscripts } from './manuscripts';
import { expectedMatches } from './expected';

const allManuscripts = [...fixtureManuscripts, ...adversarialManuscripts];
const allExpected = { ...expectedMatches, ...adversarialExpected };

type PerManuscriptResult = {
  id: string;
  field: string;
  expectedFoundAt10: boolean;
  expectedRank: number | null;
  top5: string[];
  maxScore: number;
  p5: number;
  r10: number;
  rr: number;
  bands: { strong: number; possible: number; low: number };
};
const precisionAtK = (ranked: string[], expected: Set<string>, k: number) => { const top = ranked.slice(0, k); return top.length ? top.filter((name) => expected.has(name)).length / top.length : 0; };
const recallAtK = (ranked: string[], expected: Set<string>, k: number) => expected.size ? ranked.slice(0, k).filter((name) => expected.has(name)).length / expected.size : 0;
const reciprocalRank = (ranked: string[], expected: Set<string>) => { const index = ranked.findIndex((name) => expected.has(name)); return index < 0 ? 0 : 1 / (index + 1); };

export function runMetrics() {
  const results: PerManuscriptResult[] = allManuscripts.map((manuscript) => {
    const expected = new Set(allExpected[manuscript.id] ?? []);
    const ranked = rankJournals(manuscript.text, fixtureJournals);
    const names = ranked.map(({ journal }) => journal.name);
    const banded = getBandedMatches(manuscript.text, fixtureJournals);
    const expectedRank = ranked.findIndex(({ journal }) => expected.has(journal.name)) + 1;
    return {
      id: manuscript.id,
      field: manuscript.field,
      expectedFoundAt10: expectedRank > 0 && expectedRank <= 10,
      expectedRank: expectedRank > 0 ? expectedRank : null,
      top5: names.slice(0, 5),
      maxScore: ranked[0]?.match.score ?? 0,
      p5: precisionAtK(names, expected, 5),
      r10: recallAtK(names, expected, 10),
      rr: reciprocalRank(names, expected),
      bands: { strong: banded.strong.length, possible: banded.possible.length, low: banded.lowConfidence.length },
    };
  });
  const average = (key: 'p5' | 'r10' | 'rr') => results.reduce((sum, result) => sum + result[key], 0) / results.length;
  const positives = results.filter((result) => (allExpected[result.id] ?? []).length > 0);
  const positivesHit = positives.filter((result) => result.expectedFoundAt10).length;
  const negatives = results.filter((result) => (allExpected[result.id] ?? []).length === 0);
  const negativesPassing = negatives.filter((result) => result.maxScore < 45).length;
  const positiveRecallAt10 = positives.length ? positivesHit / positives.length : 0;
  const negativePassRate = negatives.length ? negativesPassing / negatives.length : 0;
  return {
    overall: {
      manuscriptCount: results.length,
      journalCount: fixtureJournals.length,
      precisionAt5: average('p5'),
      recallAt10: positiveRecallAt10,
      negativePassRate,
      mrr: average('rr'),
      positives,
      positivesHit,
      positivesMissed: positives.length - positivesHit,
      negatives,
      negativesPassing,
    },
    results,
  };
}

if (require.main === module) {
  const report = runMetrics();
  const assertMode = process.argv.includes('--assert');
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
  const positives = report.results.filter((result) => (allExpected[result.id] ?? []).length > 0);
  const positivesHit = positives.filter((result) => result.expectedFoundAt10).length;
  const positivesMissed = positives.filter((result) => !result.expectedFoundAt10);
  const negatives = report.results.filter((result) => (allExpected[result.id] ?? []).length === 0);
  const negativesPassing = negatives.filter((result) => result.maxScore < 45).length;
  const fieldBreakdown = Array.from(new Map(report.results.map((result) => [result.field, [] as typeof report.results])).keys()).map((field) => {
    const fieldResults = report.results.filter((result) => result.field === field);
    const mrr = fieldResults.reduce((sum, result) => sum + result.rr, 0) / fieldResults.length;
    const recallAt10 = fieldResults.reduce((sum, result) => sum + result.r10, 0) / fieldResults.length;
    const precisionAt5 = fieldResults.reduce((sum, result) => sum + result.p5, 0) / fieldResults.length;
    return { field, mrr, recallAt10, precisionAt5, manuscripts: fieldResults.length, worst: fieldResults.map((result) => ({ id: result.id, rr: result.rr, r10: result.r10, p5: result.p5 })) };
  }).sort((left, right) => left.mrr - right.mrr || left.recallAt10 - right.recallAt10);

  if (assertMode) {
    const positives = report.results.filter((result) => (allExpected[result.id] ?? []).length > 0);
    const positivesHit = positives.filter((result) => result.expectedFoundAt10).length;
    const positivesMissed = positives.length - positivesHit;
    if (positivesMissed > 0) {
      console.error(`Fixture assertion failed: positive recall fell below 100% (${positivesHit}/${positives.length} hits).`);
      process.exit(1);
    }
    if (report.overall.mrr < 0.85) {
      console.error(`Fixture assertion failed: MRR below 0.85 (${report.overall.mrr.toFixed(3)}).`);
      process.exit(1);
    }
  }

  console.log('=== OVERALL ===');
  console.log(`Manuscripts: ${report.overall.manuscriptCount}`);
  console.log(`Fixture journals: ${report.overall.journalCount}`);
  console.log(`Precision@5: ${percent(report.overall.precisionAt5)}`);
  console.log(`Positive Recall@10: ${percent(report.overall.recallAt10)}`);
  console.log(`Negative pass rate: ${percent(report.overall.negativePassRate)}`);
  console.log(`MRR: ${report.overall.mrr.toFixed(3)}`);
  console.log(`\n=== EXPLICIT POSITIVE/NEGATIVE COUNTS ===`);
  console.log(`positives: ${positives.length}`);
  console.log(`positivesHit@10: ${positivesHit}`);
  console.log(`positivesMissed@10: ${positivesMissed.length}`);
  console.log(`positivesMissedIds: ${positivesMissed.map((result) => result.id).join(', ') || 'none'}`);
  console.log(`negatives: ${negatives.length}`);
  console.log(`negativePass: ${negativesPassing}/${negatives.length}`);
  console.log(`negativePassIds: ${negatives.filter((result) => result.maxScore < 45).map((result) => result.id).join(', ') || 'none'}`);
  console.log('\n=== PER FIELD (worst first) ===');
  for (const field of fieldBreakdown) {
    console.log(`${field.field}: manuscripts=${field.manuscripts} MRR=${field.mrr.toFixed(3)} Recall@10=${percent(field.recallAt10)} P@5=${percent(field.precisionAt5)}`);
  }
  console.log('\n=== ADVERSARIAL MISSES ===');
  const adversarialMisses = report.results.filter((result) => Object.prototype.hasOwnProperty.call(adversarialExpected, result.id) && result.rr < 1);
  if (adversarialMisses.length === 0) {
    console.log('None');
  } else {
    for (const result of adversarialMisses) {
      const ranked = rankJournals(allManuscripts.find((item) => item.id === result.id)?.text ?? '', fixtureJournals);
      const top3 = ranked.slice(0, 3).map(({ journal, match }) => `${journal.name} (score=${match.score})`).join(' | ');
      console.log(`${result.id} (${result.field}): rr=${result.rr.toFixed(3)} top3=${top3}`);
    }
  }
  console.log('\n=== PER MANUSCRIPT ===');
  for (const result of report.results) {
    console.log(`${result.id} | expectedFound@10=${result.expectedFoundAt10} | expectedRank=${result.expectedRank ?? 'null'} | top5Names=${result.top5.join(' | ')}`);
  }
}
