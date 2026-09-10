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
    const terms = query.toLowerCase().split(/\s+/)
      .map((term) => term.replace(/[^a-z-]/g, ''))
      .filter((term) => term.length >= 5)
      .filter((term) => !['molecular', 'dynamics', 'network', 'simulation', 'research', 'analysis', 'based', 'using', 'medical', 'medicine', 'health', 'clinical'].includes(term));
    const subjectQuery = terms.slice(0, 10).map((term) => `bibjson.subject.term:${term}`).join(' OR ');
    const searchPath = subjectQuery
      ? `bibjson.apc.has_apc:false AND (${subjectQuery})`
      : 'bibjson.apc.has_apc:false';
    const response = await fetch(`https://doaj.org/api/search/journals/${encodeURIComponent(searchPath)}?page=1&pageSize=100`, {
      headers: { Accept: 'application/json', 'User-Agent': 'SubmitCheck/1.0 low APC discovery' },
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error(`DOAJ returned ${response.status}`);
    const payload = await response.json() as { results?: DoajJournal[]; total?: number };
    const records = payload.results ?? [];
    const journals = records.map((record) => {
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
    }).map((journal) => ({
      journal,
      relevance: terms.reduce((total, term) => {
        const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return total + (new RegExp(`\\b${escapedTerm}\\b`, 'i').test(`${journal.title} ${journal.subjects.join(' ')}`) ? 1 : 0);
      }, 0),
    })).filter(({ journal, relevance }) => relevance >= 2 && !/\bopen\b/i.test(journal.title)).sort((left, right) => {
      return right.relevance - left.relevance;
    }).slice(0, 30).map(({ journal }) => journal);

    return NextResponse.json({ source: 'DOAJ', reportedNoApc: true, total: payload.total ?? journals.length, journals });
  } catch {
    return NextResponse.json({ error: 'Low-APC journal discovery is temporarily unavailable.' }, { status: 502 });
  }
}
