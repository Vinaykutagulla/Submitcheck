# Matcher Fixtures

This benchmark runs the repository's labeled cross-domain fixture set against the real matcher. It is intentionally independent of Supabase and Anthropic.

Run it with:

```bash
npm run evaluate:fixtures
```

The current suite contains 14 representative domains and ranks each manuscript against the full fixture journal catalog rather than only its local target/distractor pair.

The fixture catalog is assembled in `journals.ts`, manuscripts in `manuscripts.ts`, and ground truth in `expected.ts`. The current repository does not contain a `src/lib/match-journal` module, so fixtures use the canonical `MatchJournal` type from `src/utils/decisionTreeMatcher`.

Metrics are diagnostic, not proof of production accuracy. The current cases use a small candidate set; add at least five candidates and multiple relevant journals per manuscript before treating Precision@5 as a production benchmark.
