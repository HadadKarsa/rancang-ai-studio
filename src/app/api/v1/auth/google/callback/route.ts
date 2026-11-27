import { cookies } from 'next/headers';
import { withRoute } from '@/lib/api/middleware';
import {
  GOOGLE_OAUTH_COOKIE,
  clearedGoogleOAuthCookieHeader,
  exchangeGoogleCode,
  getGoogleOAuthConfig,
  safeEqualStrings,
  sanitizeReturnTo,
} from '@/lib/auth/google';
import { sessionCookie } from '@/lib/auth/session';
import { upsertGoogleUser } from '@/lib/db/repositories/users';
import { createSession } from '@/lib/db/repositories/sessions';

function redirectWithClear(targetPath: string, extraCookies: string[] = []): Response {
  const headers = new Headers({
    Location: targetPath,
    'Cache-Control': 'no-store',
  });
  headers.append('Set-Cookie', clearedGoogleOAuthCookieHeader());
  for (const c of extraCookies) headers.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers });
}

/**
 * GET /api/v1/auth/google/callback (v0.2.6)
 * Validates CSRF state, exchanges PKCE code for Google profile, upserts user, and sets session cookie.
 */
export const GET = withRoute(async (ctx) => {
  const cfg = getGoogleOAuthConfig();
  if (!cfg) {
    return redirectWithClear('/login?error=google_not_configured');
  }

  const reqUrl = new URL(ctx.req.url);
  if (reqUrl.searchParams.get('error')) {
    return redirectWithClear('/login?error=google_denied');
  }

  const code = reqUrl.searchParams.get('code')?.trim() ?? '';
  const state = reqUrl.searchParams.get('state')?.trim() ?? '';
  if (!code || !state) {
    return redirectWithClear('/login?error=google_state_invalid');
  }

  let cookiePayload: { state?: string; codeVerifier?: string; next?: string } | null = null;
  try {
    const raw = (await cookies()).get(GOOGLE_OAUTH_COOKIE)?.value;
    if (raw) {
      cookiePayload = JSON.parse(decodeURIComponent(raw)) as {
        state?: string;
        codeVerifier?: string;
        next?: string;
      };
    }
  } catch {
    cookiePayload = null;
  }

  if (
    !cookiePayload?.state ||
    !cookiePayload?.codeVerifier ||
    !safeEqualStrings(cookiePayload.state, state)
  ) {
    return redirectWithClear('/login?error=google_state_invalid');
  }

  const exchanged = await exchangeGoogleCode({
    code,
    codeVerifier: cookiePayload.codeVerifier,
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    redirectUri: cfg.redirectUri,
  });

  if (!exchanged.ok) {
    return redirectWithClear(`/login?error=${exchanged.code}`);
  }

  const user = await upsertGoogleUser(exchanged.profile);
  const { token } = await createSession(user.id);
  const next = sanitizeReturnTo(cookiePayload.next);

  return redirectWithClear(next, [sessionCookie(token)]);
}, { bucket: 'auth', public: true });

export const dynamic = 'force-dynamic';
