import { NextResponse } from 'next/server';

type DoajRecord = {
  bibjson?: {
    title?: string;
    apc?: {
      has_apc?: boolean;
      max?: Array<{ price?: number; currency?: string }>;
      url?: string;
    };
    ref?: {
      journal?: string;
      author_instructions?: string;
    };
    publication_time_weeks?: number;
  };
};

async function lookupCrossref(issn: string) {
  const response = await fetch(`https://api.crossref.org/journals/${encodeURIComponent(issn)}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'SubmitCheck/1.0 (journal metadata lookup)' },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 86400 },
  });

  if (!response.ok) return null;
  const payload = await response.json() as { message?: { title?: string; publisher?: string; URL?: string } };
  return payload.message ?? null;
}

export async function GET(request: Request) {
  const issn = new URL(request.url).searchParams.get('issn')?.trim();
  const requestedTitle = new URL(request.url).searchParams.get('title')?.trim() || issn || '';
  if (!issn || !/^\d{4}-?\d{3}[\dXx]$/.test(issn)) {
    return NextResponse.json({ error: 'A valid ISSN is required.' }, { status: 400 });
  }

  try {
    const searchUrl = (title: string) => `https://www.google.com/search?q=${encodeURIComponent(`${title} official journal website`)}`;
    const apcSearchUrl = (title: string) => `https://www.google.com/search?q=${encodeURIComponent(`${title} article processing charge APC`)}`;
    const response = await fetch(`https://doaj.org/api/search/journals/issn:${encodeURIComponent(issn)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 },
    });

    if (response.ok) {
      const payload = await response.json() as { results?: DoajRecord[] };
      const journal = payload.results?.[0]?.bibjson;
      if (journal) {
        const price = journal.apc?.max?.[0];
        return NextResponse.json({
          source: 'DOAJ',
          found: Boolean(journal.ref?.journal),
          title: journal.title,
          hasApc: Boolean(journal.apc?.has_apc),
          amount: typeof price?.price === 'number' ? price.price : null,
          currency: price?.currency ?? null,
          apcUrl: journal.apc?.url ?? null,
          apcSearchUrl: journal.apc?.url ? null : apcSearchUrl(journal.title ?? requestedTitle),
          journalUrl: journal.ref?.journal ?? null,
          searchUrl: journal.ref?.journal ? null : searchUrl(journal.title ?? issn),
          authorInstructionsUrl: journal.ref?.author_instructions ?? null,
          publicationWeeks: journal.publication_time_weeks ?? null,
          checkedAt: new Date().toISOString(),
        });
      }
    }

    const crossref = await lookupCrossref(issn);
    return NextResponse.json({
      source: 'Crossref',
      found: Boolean(crossref?.URL),
      title: crossref?.title ?? null,
      hasApc: false,
      amount: null,
      currency: null,
      apcUrl: null,
      apcSearchUrl: apcSearchUrl(crossref?.title ?? requestedTitle),
      journalUrl: crossref?.URL ?? null,
      searchUrl: crossref?.URL ? null : searchUrl(crossref?.title ?? requestedTitle),
      authorInstructionsUrl: null,
      publicationWeeks: null,
      checkedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: 'Journal website lookup is temporarily unavailable.' }, { status: 502 });
  }
}
