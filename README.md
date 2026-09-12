This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Match Engine — Verified Status

### Measured performance (fixture: 25 positives, 3 negatives, 33 journals)
- Positive Recall@10: 100% (all correct journals found in the top 10)
- MRR: 0.893 (the correct journal typically ranks first)
- Negative pass rate: 2 of 3 (the engine abstains on 2 known "no valid match" cases)

### Known limitations
1. Ambiguous vocabulary across domains. When a manuscript has no valid match but shares generic terms such as `syntax`, `language`, `heritage`, `semantics`, or `discourse` with a catalog domain, the engine may rank a semantically adjacent journal as a possible match instead of abstaining.
2. Fixture coverage. The current benchmark covers 28 manuscripts across roughly 14 Scopus fields. Coverage of the remaining fields is untested.
3. Negative abstention is measured on only 3 cases. Broader negative coverage would give a more precise number.

### Design boundaries
The engine uses term-frequency matching against journal scope statements. It cannot distinguish two uses of the same word across domains without additional contextual signal. This is a design boundary, not a bug.

The remaining failure is the archaeology/linguistics negative case. In the current implementation, `Journal of Linguistics` ranks strongly on real linguistics manuscripts, weakly on programming-language negatives, and still above the abstention threshold on the archaeology negative. That is a general limitation of bag-of-words matching with weak contextual signals, not a fixture-specific bug.

We intentionally do not add more targeted rules for this ambiguity class. Each new special case improves the one failing fixture but overfits the engine and breaks the next harder manuscript. The only global change that was tested was raising the abstention floor; that was rejected because it would suppress legitimate positives in the current fixture set.

A real fix would require a contextual disambiguation layer (for example, a semantic profile or co-occurring domain signals) rather than another exclusion list or one-off rule.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Import SCImago metadata

Export a SCImago journal list as CSV or XLSX with journal title or ISSN, quartile, and APC columns, then run:

```bash
npm run import:scimago -- "C:\path\to\scimago-export.xlsx"
```

The importer matches journals by ISSN first, then title, and updates quartile, APC, and publisher URL metadata used by the filters. Keep the export local because it can contain licensed metadata.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
