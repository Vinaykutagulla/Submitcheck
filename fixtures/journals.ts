import type { MatchJournal } from '../src/utils/decisionTreeMatcher';
import { fixtures } from '../scripts/evaluate-matcher';

const requirements = { abstract: 'unstructured' as const, wordLimit: null, refStyle: 'Numbered' };
const journal = (name: string, field: string, scope: string[], asjcCodes: string[] = []): MatchJournal => ({ name, field, scope, asjcCodes, requirements });

const journals = fixtures.flatMap(({ target, distractor }) => [target, distractor]);

const adversarialCatalogJournals: MatchJournal[] = [
  journal('Journal of Neuroscience', 'Neuroscience', ['neuroscience', 'cognitive neuroscience', 'synaptic plasticity', 'neural oscillations', 'brain circuits'], ['2800']),
  journal('Brain Research', 'Neuroscience', ['brain', 'neural circuits', 'cognitive neuroscience', 'memory'], ['2800']),
  journal('Field Crops Research', 'Agriculture', ['crop science', 'agronomy', 'soil fertility', 'yield'], ['1101']),
  journal('Agronomy for Sustainable Development', 'Agriculture', ['agriculture', 'sustainable agriculture', 'crop production', 'soil health'], ['1102']),
  journal('Optics Express', 'Physics', ['optics', 'photonics', 'laser', 'wave optics'], ['3101']),
];

export const fixtureJournals: MatchJournal[] = [...new Map([...journals, ...adversarialCatalogJournals].map((journal) => [journal.name, journal])).values()];
