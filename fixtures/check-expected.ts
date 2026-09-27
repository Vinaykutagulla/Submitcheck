import { fixtureJournals } from './journals';
import { fixtureManuscripts } from './manuscripts';
import { expectedMatches } from './expected';
import { rankJournals } from '../src/utils/decisionTreeMatcher';
const ms = fixtureManuscripts.find((item) => item.id === 'environmental-science');
if (!ms) throw new Error('missing');
const expected = expectedMatches[ms.id];
const names = rankJournals(ms.text, fixtureJournals).map(({ journal }) => journal.name);
console.log({ id: ms.id, expected, top: names.slice(0, 10), hits: names.slice(0, 10).filter((name) => expected.includes(name)) });
