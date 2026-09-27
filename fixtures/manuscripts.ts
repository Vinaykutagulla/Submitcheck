import { fixtures } from '../scripts/evaluate-matcher';

export type FixtureManuscript = {
  id: string;
  field: string;
  text: string;
};

export const fixtureManuscripts: FixtureManuscript[] = fixtures.map((fixture) => ({
  id: fixture.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  field: fixture.expectedField,
  text: fixture.manuscript,
}));
