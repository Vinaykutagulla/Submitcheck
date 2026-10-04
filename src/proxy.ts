import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Refreshes the Supabase auth session on every request. Without this, the access token (which
// expires roughly every hour) is only ever refreshed opportunistically inside individual API
// route handlers - and under concurrent requests near expiry, that produced an intermittent
// "please log in" failure for users who were genuinely still logged in (their nav showed their
// name/plan from an earlier successful fetch, but a later API call's session check failed because
// the refresh race never completed). This is Supabase's own documented fix for that exact class of
// bug: https://supabase.com/docs/guides/auth/server-side/nextjs
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Do not add logic between createServerClient and getUser() - this call is what actually
  // performs the token refresh and must run unconditionally on every matched request.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Skip static assets and image optimization files - everything else (pages and API routes)
    // needs its session refreshed so server-side auth checks never see a stale access token.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
