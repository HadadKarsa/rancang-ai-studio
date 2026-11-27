import { withRoute } from '@/lib/api/middleware';
import {
  buildGoogleAuthUrl,
  generatePkceChallenge,
  getGoogleOAuthConfig,
  googleOAuthCookieHeader,
  sanitizeReturnTo,
} from '@/lib/auth/google';

/**
 * GET /api/v1/auth/google (v0.2.6)
 * Starts Google OAuth 2.0 Authorization Code flow with PKCE and CSRF state cookie.
 */
export const GET = withRoute(async (ctx) => {
  const cfg = getGoogleOAuthConfig();
  if (!cfg) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/login?error=google_not_configured',
        'Cache-Control': 'no-store',
      },
    });
  }

  const reqUrl = new URL(ctx.req.url);
  const next = sanitizeReturnTo(reqUrl.searchParams.get('next'));
  const { state, codeVerifier, codeChallenge } = generatePkceChallenge();

  const authUrl = buildGoogleAuthUrl({
    clientId: cfg.clientId,
    redirectUri: cfg.redirectUri,
    state,
    codeChallenge,
  });

  const payload = JSON.stringify({ state, codeVerifier, next });
  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl,
      'Set-Cookie': googleOAuthCookieHeader(payload),
      'Cache-Control': 'no-store',
    },
  });
}, { bucket: 'auth', public: true });

export const dynamic = 'force-dynamic';
