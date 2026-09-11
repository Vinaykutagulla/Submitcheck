export function parseApcInr(rawApc: string | undefined | null) {
  if (!rawApc) return null;

  const normalized = rawApc.trim().toLowerCase();
  if (/^(free|no apc|no publication fee|ไม่มีค่าใช้จ่าย)$/.test(normalized)) return 0;
  if (normalized.includes('check') || normalized.includes('contact')) return null;

  const hasNonInrCurrency = /\$|usd|€|eur|£|gbp|aud|cad|cny|jpy|¥|\b[a-z]{3}\b/.test(normalized);
  const hasInrCurrency = /₹|inr|rs\.?|rupees?/.test(normalized);
  if (hasNonInrCurrency && !hasInrCurrency) return null;

  const numericValue = Number(normalized.replace(/[^0-9.]/g, ''));
  return Number.isFinite(numericValue) ? numericValue : null;
}