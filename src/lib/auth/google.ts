import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getEnv } from '@/lib/env';

export const GOOGLE_OAUTH_COOKIE = 'rancang_oauth_google';
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleProfile {
  email: string;
  name: string;
  avatarUrl: string | null;
}

export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const env = getEnv();
  const clientId = (env.GOOGLE_CLIENT_ID || env.AUTH_GOOGLE_ID || '').trim();
  const clientSecret = (env.GOOGLE_CLIENT_SECRET || env.AUTH_GOOGLE_SECRET || '').trim();
  if (!clientId || !clientSecret) return null;
  const baseUrl = env.APP_URL.replace(/\/+$/, '');
  return {
    clientId,
    clientSecret,
    redirectUri: `${baseUrl}/api/v1/auth/google/callback`,
  };
}

export function isGoogleOAuthConfigured(): boolean {
  return getGoogleOAuthConfig() !== null;
}

export function generatePkceChallenge(): {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
} {
  const state = randomBytes(24).toString('base64url');
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { state, codeVerifier, codeChallenge };
}

export function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Only allow safe in-app relative redirect paths (blocks protocol-relative or external URLs). */
export function sanitizeReturnTo(raw: string | null | undefined): string {
  if (!raw) return '/studio';
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/api/')) {
    return '/studio';
  }
  if (/[\r\n\\]/.test(trimmed)) return '/studio';
  return trimmed;
}

export function buildGoogleAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export function googleOAuthCookieHeader(value: string, maxAgeSeconds = 600): string {
  const secure = getEnv().APP_URL.startsWith('https');
  const encoded = encodeURIComponent(value);
  return `${GOOGLE_OAUTH_COOKIE}=${encoded}; Path=/api/v1/auth/google; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}

export function clearedGoogleOAuthCookieHeader(): string {
  const secure = getEnv().APP_URL.startsWith('https');
  return `${GOOGLE_OAUTH_COOKIE}=; Path=/api/v1/auth/google; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

export async function exchangeGoogleCode(input: {
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{ ok: true; profile: GoogleProfile } | { ok: false; code: 'google_failed' | 'google_unverified' }> {
  const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    }).toString(),
  });

  if (!tokenRes.ok) {
    return { ok: false, code: 'google_failed' };
  }

  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) {
    return { ok: false, code: 'google_failed' };
  }

  const infoRes = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!infoRes.ok) {
    return { ok: false, code: 'google_failed' };
  }

  const info = (await infoRes.json()) as {
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  const email = info.email?.trim().toLowerCase() ?? '';
  if (!email) {
    return { ok: false, code: 'google_failed' };
  }
  if (info.email_verified !== true) {
    return { ok: false, code: 'google_unverified' };
  }

  return {
    ok: true,
    profile: {
      email,
      name: info.name?.trim() || email.split('@')[0] || 'Pengguna',
      avatarUrl: info.picture?.trim() || null,
    },
  };
}
