import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '@libsql/client';
import path from 'node:path';
import { setEnvForTest } from '@/lib/env';
import { setDbForTest } from '@/lib/db/client';
import { runMigrations } from '@/lib/db/migrate';
import {
  createUser,
  getPasswordHash,
  getUserById,
  hasUserPassword,
  updateUserPasswordHash,
  updateUserProfile,
  upsertGoogleUser,
} from '@/lib/db/repositories/users';
import { hashPassword, verifyPassword } from '@/lib/crypto/password';
import {
  createCredential,
  createPreset,
  updateCredentialAllowedModels,
} from '@/lib/db/repositories/credentials';
import { encryptKey } from '@/lib/crypto/keys';
import { getManagedPublicConfig, resolveManagedProvider } from '@/lib/llm/managed';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../migrations');

const BASE_ENV = {
  APP_URL: 'http://localhost:3100',
  DATABASE_URL: 'file::memory:?cache=shared',
  AUTH_MODE: 'local',
  ENCRYPTION_KEY: Buffer.alloc(32, 11).toString('base64'),
  MANAGED_API_KEY: undefined,
  MANAGED_BASE_URL: undefined,
  MANAGED_MODELS: undefined,
  MANAGED_DEFAULT_MODEL: undefined,
  MANAGED_LABEL: undefined,
};

describe('v0.2.7 Profile password-later & Admin managed model whitelist', () => {
  beforeEach(async () => {
    setEnvForTest(BASE_ENV);
    const client = createClient({ url: ':memory:' });
    setDbForTest(client);
    await runMigrations(MIGRATIONS_DIR);
  });

  afterEach(() => {
    setEnvForTest(BASE_ENV);
  });

  it('allows Google OAuth user to edit profile and set password later while keeping authProvider=google', async () => {
    const googleUser = await upsertGoogleUser({
      email: 'guser@example.com',
      name: 'Google Pilot',
      avatarUrl: null,
    });
    expect(await hasUserPassword(googleUser.id)).toBe(false);

    const updated = await updateUserProfile(googleUser.id, {
      name: 'Google Pilot Updated',
      email: 'guser-new@example.com',
    });
    expect(updated.name).toBe('Google Pilot Updated');
    expect(updated.email).toBe('guser-new@example.com');
    expect(updated.authProvider).toBe('google');

    const newHash = await hashPassword('secret-pilot-99');
    await updateUserPasswordHash(googleUser.id, newHash);

    expect(await hasUserPassword(googleUser.id)).toBe(true);
    const reloaded = await getUserById(googleUser.id);
    expect(reloaded?.authProvider).toBe('google');

    const storedHash = await getPasswordHash(googleUser.id);
    expect(storedHash).not.toBeNull();
    expect(await verifyPassword('secret-pilot-99', storedHash!)).toBe(true);
  });

  it('enforces admin model whitelist on managed public list and runtime resolution', async () => {
    const owner = await createUser({
      email: 'owner@rancang.local',
      name: 'Admin',
      authProvider: 'local',
      role: 'owner',
    });

    const enc = encryptKey('sk-admin-provider-key-1234');
    const cred = await createCredential({
      userId: owner.id,
      provider: 'custom',
      label: 'Kenari Admin',
      encryptedKeyB64: enc.encryptedKeyB64,
      keyIvB64: enc.keyIvB64,
      keyTagB64: enc.keyTagB64,
      keyLast4: '1234',
      baseUrl: 'https://api.kenari.id/v1',
      cachedModels: ['deepseek-v4-1-flash', 'gemini-4-neon', 'claude-opus-5-5'],
    });
    await createPreset({
      userId: owner.id,
      name: 'Kenari Admin',
      provider: 'custom',
      credentialId: cred.id,
      modelId: 'deepseek-v4-1-flash',
      isDefault: true,
    });

    // Initially unrestricted: all 3 models exposed
    const initialPublic = await getManagedPublicConfig();
    expect(initialPublic.models).toEqual(['deepseek-v4-1-flash', 'gemini-4-neon', 'claude-opus-5-5']);

    // Admin restricts whitelist to 2 cheaper models
    const patched = await updateCredentialAllowedModels(cred.id, owner.id, [
      'deepseek-v4-1-flash',
      'gemini-4-neon',
    ]);
    expect(patched?.allowedModels).toEqual(['deepseek-v4-1-flash', 'gemini-4-neon']);

    const restrictedPublic = await getManagedPublicConfig();
    expect(restrictedPublic.models).toEqual(['deepseek-v4-1-flash', 'gemini-4-neon']);
    expect(restrictedPublic.models).not.toContain('claude-opus-5-5');

    // Allowed model resolves cleanly
    const allowedCall = await resolveManagedProvider({ modelId: 'gemini-4-neon' });
    expect(allowedCall.modelId).toBe('gemini-4-neon');

    // Non-whitelisted model is rejected even though it is in cachedModels
    await expect(resolveManagedProvider({ modelId: 'claude-opus-5-5' })).rejects.toThrow(
      /tidak tersedia pada daftar model bawaan/,
    );

    // Clearing whitelist (null) restores all cached models
    await updateCredentialAllowedModels(cred.id, owner.id, null);
    const restoredPublic = await getManagedPublicConfig();
    expect(restoredPublic.models).toContain('claude-opus-5-5');
  });
});
