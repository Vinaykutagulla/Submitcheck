type ApcResult = {
  amount: number;
  currency: string;
  source: 'DOAJ' | 'publisher';
  url: string | null;
};

type DoajResponse = {
  results?: Array<{ bibjson?: { apc?: { has_apc?: boolean; max?: Array<{ price?: number; currency?: string }>; url?: string } } }>;
};

function normalizeCurrency(value: string) {
  const normalized = value.toUpperCase();
  if (normalized === '₹' || normalized === 'RS' || normalized === 'INR') return 'INR';
  if (normalized === '$' || normalized === 'USD') return 'USD';
  if (normalized === '€' || normalized === 'EUR') return 'EUR';
  if (normalized === '£' || normalized === 'GBP') return 'GBP';
  return normalized;
}

function extractPublisherApc(html: string, url: string): ApcResult | null {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const match = text.match(/(?:article\s+processing\s+charge|publication\s+fee|open\s+access\s+fee|APC)[^\d₹$€£]{0,100}(₹|Rs\.?|INR|USD|\$|EUR|€|GBP|£)\s*([\d,]+(?:\.\d{1,2})?)/i)
    || text.match(/(₹|Rs\.?|INR|USD|\$|EUR|€|GBP|£)\s*([\d,]+(?:\.\d{1,2})?)[^\w]{0,40}(?:article\s+processing\s+charge|publication\s+fee|open\s+access\s+fee|APC)/i);
  if (!match) return null;

  const amount = Number(match[2].replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, currency: normalizeCurrency(match[1]), source: 'publisher', url };
}

export async function lookupLiveApc(issn: string | undefined, publisherUrl: string | undefined) {
  let resolvedPublisherUrl = publisherUrl;

  if (issn) {
    try {
      const response = await fetch(`https://doaj.org/api/search/journals/issn:${encodeURIComponent(issn)}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
        next: { revalidate: 86400 },
      });
      if (response.ok) {
        const payload = await response.json() as DoajResponse;
        const price = payload.results?.[0]?.bibjson?.apc?.max?.[0];
        if (typeof price?.price === 'number' && price.price > 0 && price.currency) {
          return { amount: price.price, currency: normalizeCurrency(price.currency), source: 'DOAJ' as const, url: payload.results?.[0]?.bibjson?.apc?.url ?? null };
        }
      }
    } catch {
      // Publisher lookup below can still provide a result.
    }

    if (!resolvedPublisherUrl) {
      try {
        const response = await fetch(`https://api.crossref.org/journals/${encodeURIComponent(issn)}`, {
          headers: { Accept: 'application/json', 'User-Agent': 'SubmitCheck/1.0 (APC metadata lookup)' },
          signal: AbortSignal.timeout(5000),
          next: { revalidate: 86400 },
        });
        if (response.ok) {
          const payload = await response.json() as { message?: { URL?: string } };
          resolvedPublisherUrl = payload.message?.URL;
        }
      } catch {
        // There may be no public publisher URL for this ISSN.
      }

      if (!resolvedPublisherUrl) {
        try {
          const response = await fetch(`https://api.crossref.org/works?filter=issn:${encodeURIComponent(issn)}&rows=1&select=URL`, {
            headers: { Accept: 'application/json', 'User-Agent': 'SubmitCheck/1.0 (APC metadata lookup)' },
            signal: AbortSignal.timeout(5000),
            next: { revalidate: 86400 },
          });
          if (response.ok) {
            const payload = await response.json() as { message?: { items?: Array<{ URL?: string }> } };
            resolvedPublisherUrl = payload.message?.items?.[0]?.URL;
          }
        } catch {
          // A DOI landing page is not available for every journal.
        }
      }
    }
  }

  if (!resolvedPublisherUrl || !/^https?:\/\//i.test(resolvedPublisherUrl)) return null;
  try {
    const response = await fetch(resolvedPublisherUrl, {
      headers: { Accept: 'text/html', 'User-Agent': 'SubmitCheck/1.0 (APC metadata lookup)' },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 86400 },
    });
    if (!response.ok) return null;
    return extractPublisherApc(await response.text(), resolvedPublisherUrl);
  } catch {
    return null;
  }
}