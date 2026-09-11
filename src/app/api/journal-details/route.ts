import { NextResponse } from 'next/server';
import { lookupLiveApc } from '@/lib/journal-apc';

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

type ParsedInstructions = {
  abstract: 'structured' | 'unstructured';
  wordLimit: number | null;
  refStyle: string;
  figuresTables: boolean | null;
  supplementaryFiles: boolean | null;
  declarations: boolean | null;
};

function parseInstructions(html: string): ParsedInstructions {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  const structured = /structured abstract|background.{0,80}(objectives?|methods?|results?|conclusion)|abstract.{0,100}(background|objectives?|methods?|results?|conclusion)/i.test(text);
  const wordMatch = text.match(/(?:abstract|manuscript|article|paper).{0,100}(?:maximum|max|up to|limited to|not exceed).{0,30}(\d[\d,]*)\s*words?/i)
    ?? text.match(/(\d[\d,]*)\s*words?.{0,50}(?:abstract|manuscript|article|paper)/i);
  const wordLimit = wordMatch ? Number(wordMatch[1].replace(/,/g, '')) : null;
  const refStyle = /vancouver|numbered references?|citation-sequence|superscript numerals?/i.test(text)
    ? 'Numbered/Vancouver'
    : /apa|author[- ]date|harvard/i.test(text)
      ? 'APA/author-date'
      : 'Not specified';
  return {
    abstract: structured ? 'structured' : 'unstructured',
    wordLimit: wordLimit && wordLimit >= 500 ? wordLimit : null,
    refStyle,
    figuresTables: /figures?.{0,80}(?:separate|high resolution|upload|file)|tables?.{0,80}(?:separate|upload|file)/i.test(text) ? true : null,
    supplementaryFiles: /supplementary|supporting information|additional file/i.test(text) ? true : null,
    declarations: /funding statement|conflict[s ]of interest|competing interests|data availability|ethical approval/i.test(text) ? true : null,
  };
}

async function fetchInstructionSignals(url: string | null) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const response = await fetch(url, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } });
    if (!response.ok) return null;
    return parseInstructions(await response.text());
  } catch {
    return null;
  }
}

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
        const publisherApc = typeof price?.price !== 'number'
          ? await lookupLiveApc(issn, journal.ref?.journal)
          : null;
        const authorInstructionsUrl = journal.ref?.author_instructions ?? null;
        const instructionSignals = await fetchInstructionSignals(authorInstructionsUrl);
        return NextResponse.json({
          source: publisherApc?.source ?? 'DOAJ',
          found: Boolean(journal.ref?.journal),
          title: journal.title,
          hasApc: Boolean(journal.apc?.has_apc || price?.price || publisherApc),
          amount: typeof price?.price === 'number' ? price.price : publisherApc?.amount ?? null,
          currency: price?.currency ?? publisherApc?.currency ?? null,
          apcUrl: journal.apc?.url ?? publisherApc?.url ?? null,
          apcSearchUrl: journal.apc?.url ? null : apcSearchUrl(journal.title ?? requestedTitle),
          journalUrl: journal.ref?.journal ?? null,
          searchUrl: journal.ref?.journal ? null : searchUrl(journal.title ?? issn),
          authorInstructionsUrl,
          instructionSignals,
          publicationWeeks: journal.publication_time_weeks ?? null,
          checkedAt: new Date().toISOString(),
        });
      }
    }

    const crossref = await lookupCrossref(issn);
    const publisherApc = await lookupLiveApc(issn, crossref?.URL);
    const instructionSignals = await fetchInstructionSignals(crossref?.URL ?? null);
    return NextResponse.json({
      source: publisherApc?.source ?? 'Crossref',
      found: Boolean(crossref?.URL),
      title: crossref?.title ?? null,
      hasApc: Boolean(publisherApc),
      amount: publisherApc?.amount ?? null,
      currency: publisherApc?.currency ?? null,
      apcUrl: publisherApc?.url ?? null,
      apcSearchUrl: apcSearchUrl(crossref?.title ?? requestedTitle),
      journalUrl: crossref?.URL ?? null,
      searchUrl: crossref?.URL ? null : searchUrl(crossref?.title ?? requestedTitle),
      authorInstructionsUrl: null,
      instructionSignals,
      publicationWeeks: null,
      checkedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: 'Journal website lookup is temporarily unavailable.' }, { status: 502 });
  }
}
