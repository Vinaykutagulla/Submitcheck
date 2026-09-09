import { NextResponse } from 'next/server';

type DoajJournal = {
  bibjson?: {
    title?: string;
    identifier?: Array<{ type?: string; id?: string }>;
    publisher?: { name?: string };
    subject?: Array<{ term?: string }>;
    ref?: { journal?: string; author_instructions?: string };
    apc?: { has_apc?: boolean; max?: Array<{ price?: number; currency?: string }>; url?: string };
  };
};

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim() || '';

  try {
    const response = await fetch('https://doaj.org/api/search/journals/bibjson.apc.has_apc:false?page=1&pageSize=100', {
      headers: { Accept: 'application/json', 'User-Agent': 'SubmitCheck/1.0 low APC discovery' },
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error(`DOAJ returned ${response.status}`);
    const payload = await response.json() as { results?: DoajJournal[]; total?: number };

    const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length >= 4);
    const journals = (payload.results ?? []).map((record) => {
      const bibjson = record.bibjson ?? {};
      const issn = bibjson.identifier?.find((item) => item.type === 'pissn' || item.type === 'eissn')?.id ?? null;
      return {
        title: bibjson.title ?? 'Untitled journal',
        issn,
        publisher: bibjson.publisher?.name ?? 'Publisher not listed',
        subjects: (bibjson.subject ?? []).map((item) => item.term).filter(Boolean),
        journalUrl: bibjson.ref?.journal ?? null,
        instructionsUrl: bibjson.ref?.author_instructions ?? null,
        apcUrl: bibjson.apc?.url ?? null,
        apc: bibjson.apc?.max?.[0] ?? null,
      };
    }).sort((left, right) => {
      const score = (journal: typeof left) => terms.reduce((total, term) => total + (`${journal.title} ${journal.subjects.join(' ')}`.toLowerCase().includes(term) ? 1 : 0), 0);
      return score(right) - score(left);
    });

    return NextResponse.json({ source: 'DOAJ', verifiedNoApc: true, total: payload.total ?? journals.length, journals });
  } catch {
    return NextResponse.json({ error: 'Low-APC journal discovery is temporarily unavailable.' }, { status: 502 });
  }
}
