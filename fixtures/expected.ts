import { fixtures } from '../scripts/evaluate-matcher';

export const expectedMatches: Record<string, string[]> = Object.fromEntries(
  fixtures.map((fixture) => [
    fixture.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    fixture.name === 'Environmental Science'
      ? [fixture.target.name, 'Journal of Environmental Chemistry']
      : [fixture.target.name],
  ]),
);
