import { supabaseAdmin } from '@/lib/supabase';

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

// Backed by the api_rate_limits table + increment_rate_limit() SQL function (see schema.sql) -
// a plain in-memory counter would not work correctly here since a single endpoint can run on
// multiple independent serverless function instances, each with its own memory. The SQL function
// performs the check-and-increment atomically in one statement to avoid a read-then-write race
// under concurrent requests from the same key.
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const { data, error } = await supabaseAdmin.rpc('increment_rate_limit', {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_limit: limit,
  });

  if (error) {
    // Fail open: if the rate-limit store itself is unavailable, do not block real users over an
    // infrastructure hiccup. This endpoint's primary defenses (cost ceilings, business logic) stay
    // intact either way - this is a deterrent against casual scripted abuse, not a hard boundary.
    console.error('Rate limit check failed, allowing request:', error.message);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { allowed: Boolean(row?.allowed ?? true), retryAfterSeconds: Number(row?.retry_after_seconds ?? 0) };
}

// Vercel/most proxies set x-forwarded-for as "client, proxy1, proxy2..." - the first entry is the
// original client. Falls back to a shared bucket if the header is absent (e.g. local dev), which
// is acceptable since this is a deterrent, not a security boundary.
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}
