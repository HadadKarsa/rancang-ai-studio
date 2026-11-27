import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '@libsql/client';
import path from 'node:path';
import { setEnvForTest } from '@/lib/env';
import { setDbForTest, queryOne } from '@/lib/db/client';
import { runMigrations } from '@/lib/db/migrate';
import {
  buildGoogleAuthUrl,
  generatePkceChallenge,
  getGoogleOAuthConfig,
  isGoogleOAuthConfigured,
  safeEqualStrings,
  sanitizeReturnTo,
} from '@/lib/auth/google';
import { getSession } from '@/lib/auth/session';
import { createUser, upsertGoogleUser } from '@/lib/db/repositories/users';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../migrations');

const BASE_ENV = {
  APP_URL: 'https://rancang.example.com',
  DATABASE_URL: 'file::memory:?cache=shared',
  AUTH_MODE: 'local',
  AUTH_SECRET: 'test-auth-secret-32-chars-minimum-1234',
  ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
  GOOGLE_CLIENT_ID: undefined,
  GOOGLE_CLIENT_SECRET: undefined,
  AUTH_GOOGLE_ID: undefined,
  AUTH_GOOGLE_SECRET: undefined,
};

describe('v0.2.6 Hybrid Auth (Google OAuth + Manual Piloting + Cloud Gate)', () => {
  beforeEach(async () => {
    setEnvForTest(BASE_ENV);
    const client = createClient({ url: ':memory:' });
    setDbForTest(client);
    await runMigrations(MIGRATIONS_DIR);
  });

  afterEach(() => {
    setEnvForTest(BASE_ENV);
  });

  it('detects Google OAuth config cleanly and builds a PKCE authorization URL', () => {
    expect(isGoogleOAuthConfigured()).toBe(false);
    expect(getGoogleOAuthConfig()).toBeNull();

    setEnvForTest({
      ...BASE_ENV,
      GOOGLE_CLIENT_ID: 'client-123.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'secret-xyz',
    });

    const cfg = getGoogleOAuthConfig();
    expect(cfg).toEqual({
      clientId: 'client-123.apps.googleusercontent.com',
      clientSecret: 'secret-xyz',
      redirectUri: 'https://rancang.example.com/api/v1/auth/google/callback',
    });

    const pkce = generatePkceChallenge();
    expect(pkce.state.length).toBeGreaterThan(20);
    expect(pkce.codeVerifier.length).toBeGreaterThan(30);
    expect(pkce.codeChallenge.length).toBeGreaterThan(30);
    expect(safeEqualStrings(pkce.state, pkce.state)).toBe(true);
    expect(safeEqualStrings(pkce.state, 'tampered')).toBe(false);

    const url = new URL(
      buildGoogleAuthUrl({
        clientId: cfg!.clientId,
        redirectUri: cfg!.redirectUri,
        state: pkce.state,
        codeChallenge: pkce.codeChallenge,
      }),
    );
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('redirect_uri')).toBe('https://rancang.example.com/api/v1/auth/google/callback');
  });

  it('sanitizes returnTo paths against open redirects', () => {
    expect(sanitizeReturnTo('/studio')).toBe('/studio');
    expect(sanitizeReturnTo('/projects/prj_123?mode=documents')).toBe('/projects/prj_123?mode=documents');
    expect(sanitizeReturnTo('https://evil.example')).toBe('/studio');
    expect(sanitizeReturnTo('//evil.example/phish')).toBe('/studio');
    expect(sanitizeReturnTo('/api/v1/auth/logout')).toBe('/studio');
    expect(sanitizeReturnTo(null)).toBe('/studio');
  });

  it('upserts new Google users as member with settings and preserves owner role for existing admin email', async () => {
    const member = await upsertGoogleUser({
      email: 'PilotUser@Example.com',
      name: 'Pilot User',
      avatarUrl: 'https://lh3.googleusercontent.com/avatar.png',
    });
    expect(member.email).toBe('pilotuser@example.com');
    expect(member.role).toBe('member');
    expect(member.authProvider).toBe('google');
    expect(member.emailVerifiedAt).not.toBeNull();

    const memberSettings = await queryOne<{ id: string }>(
      'SELECT id FROM user_settings WHERE user_id = ?',
      [member.id],
    );
    expect(memberSettings).not.toBeNull();

    // Existing admin owner signing in with Google must retain owner role
    const owner = await createUser({
      email: 'admin@rancang.local',
      name: 'Admin Owner',
      authProvider: 'local',
      role: 'owner',
    });
    const linked = await upsertGoogleUser({
      email: 'admin@rancang.local',
      name: 'Admin Google Name',
      avatarUrl: 'https://lh3.googleusercontent.com/owner.png',
    });
    expect(linked.id).toBe(owner.id);
    expect(linked.role).toBe('owner');
    expect(linked.emailVerifiedAt).not.toBeNull();
  });

  it('fails closed in AUTH_MODE=cloud when no session cookie is present', async () => {
    setEnvForTest({
      ...BASE_ENV,
      AUTH_MODE: 'cloud',
    });
    const session = await getSession();
    expect(session).toBeNull();
  });
});
