import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { createClient } from '@libsql/client';
import path from 'node:path';
import { setEnvForTest } from '@/lib/env';
import { getManagedEnvConfig, getManagedPublicConfig, resolveManagedEnvProvider } from '@/lib/llm/managed';
import { parseRuntimeModelOverride } from '@/lib/llm/runtimeOverride';
import { resolveProvider } from '@/lib/llm/credentials';
import { setDbForTest } from '@/lib/db/client';
import { runMigrations } from '@/lib/db/migrate';
import { createUser } from '@/lib/db/repositories/users';
import { createCredential, createPreset } from '@/lib/db/repositories/credentials';
import { encryptKey } from '@/lib/crypto/keys';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../migrations');

const BASE_ENV = {
  APP_URL: 'http://localhost:3100',
  DATABASE_URL: 'file::memory:?cache=shared',
  AUTH_MODE: 'local',
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  MANAGED_API_KEY: undefined,
  MANAGED_BASE_URL: undefined,
  MANAGED_MODELS: undefined,
  MANAGED_DEFAULT_MODEL: undefined,
  MANAGED_LABEL: undefined,
};

describe('v0.2.5 Managed + Session-Only BYOK resolution', () => {
  beforeEach(async () => {
    setEnvForTest(BASE_ENV);
    const client = createClient({ url: ':memory:' });
    setDbForTest(client);
    await runMigrations(MIGRATIONS_DIR);
  });

  afterEach(() => {
    setEnvForTest(BASE_ENV);
  });

  it('parses session-only BYOK headers and resolves directly without touching DB', async () => {
    const req = new NextRequest('http://localhost:3100/api/v1/projects/prj_1/interview', {
      method: 'PUT',
      headers: {
        'x-rancang-model-mode': 'byok',
        'x-rancang-byok-key': 'sk-ephemeral-session-key-1234',
        'x-rancang-byok-base-url': 'https://api.openai.com/v1',
        'x-rancang-model-id': 'gpt-4o-mini',
        'x-rancang-reasoning-effort': 'low',
      },
    });

    const override = parseRuntimeModelOverride(req);
    expect(override).toEqual({
      mode: 'byok',
      apiKey: 'sk-ephemeral-session-key-1234',
      baseUrl: 'https://api.openai.com/v1',
      modelId: 'gpt-4o-mini',
      reasoningEffort: 'low',
    });

    const resolved = await resolveProvider({
      userId: 'usr_nonexistent_in_db',
      runtimeOverride: override,
    });
    expect(resolved.provider).toBe('custom');
    expect(resolved.apiKey).toBe('sk-ephemeral-session-key-1234');
    expect(resolved.baseUrl).toBe('https://api.openai.com/v1');
    expect(resolved.modelId).toBe('gpt-4o-mini');
    expect(resolved.reasoningEffort).toBe('low');
    expect(resolved.credentialId).toBeNull();
    expect(resolved.presetId).toBeNull();
  });

  it('rejects BYOK headers with invalid base URL', () => {
    const req = new NextRequest('http://localhost:3100/api/v1/projects/prj_1/interview', {
      method: 'PUT',
      headers: {
        'x-rancang-model-mode': 'byok',
        'x-rancang-byok-key': 'sk-valid-key-1234',
        'x-rancang-byok-base-url': 'not-a-valid-url',
        'x-rancang-model-id': 'gpt-4o',
      },
    });

    expect(() => parseRuntimeModelOverride(req)).toThrow(/Konfigurasi BYOK sesi tidak lengkap atau tidak valid/);
  });

  it('enforces MANAGED_MODELS allowlist when env fallback is active', async () => {
    setEnvForTest({
      ...BASE_ENV,
      MANAGED_API_KEY: 'sk-managed-server-secret',
      MANAGED_BASE_URL: 'https://api.kenari.id/v1',
      MANAGED_MODELS: 'deepseek-v4-1-flash, gpt-4o-mini',
      MANAGED_DEFAULT_MODEL: 'deepseek-v4-1-flash',
      MANAGED_LABEL: 'Rancang.ai',
    });

    const cfg = getManagedEnvConfig();
    expect(cfg).not.toBeNull();
    expect(cfg?.models).toEqual(['deepseek-v4-1-flash', 'gpt-4o-mini']);

    const resolved = await resolveProvider({
      userId: 'usr_any_member',
      runtimeOverride: { mode: 'managed', modelId: 'gpt-4o-mini', reasoningEffort: 'medium' },
    });
    expect(resolved.apiKey).toBe('sk-managed-server-secret');
    expect(resolved.baseUrl).toBe('https://api.kenari.id/v1');
    expect(resolved.modelId).toBe('gpt-4o-mini');
    expect(resolved.reasoningEffort).toBe('medium');

    expect(() => resolveManagedEnvProvider({ modelId: 'unlisted-expensive-model' })).toThrow(
      /tidak tersedia pada daftar model bawaan/,
    );
  });

  it('shares owner UI-configured connections as Managed Rancang.ai for member users without leaking secrets', async () => {
    const owner = await createUser({
      email: 'admin@rancang.local',
      name: 'Admin',
      authProvider: 'local',
      role: 'owner',
    });
    const member = await createUser({
      email: 'user@example.com',
      name: 'Regular User',
      authProvider: 'google',
      role: 'member',
    });

    const enc = encryptKey('sk-owner-managed-secret-9999');
    const cred = await createCredential({
      userId: owner.id,
      provider: 'custom',
      label: 'Kenari Admin',
      encryptedKeyB64: enc.encryptedKeyB64,
      keyIvB64: enc.keyIvB64,
      keyTagB64: enc.keyTagB64,
      keyLast4: '9999',
      baseUrl: 'https://api.kenari.id/v1',
      cachedModels: ['deepseek-v4-1-flash', 'gemini-4-neon'],
    });
    await createPreset({
      userId: owner.id,
      name: 'Kenari Admin',
      provider: 'custom',
      credentialId: cred.id,
      modelId: 'deepseek-v4-1-flash',
      isDefault: true,
    });

    const publicCfg = await getManagedPublicConfig();
    expect(publicCfg.enabled).toBe(true);
    expect(publicCfg.source).toBe('owner');
    expect(publicCfg.defaultModelId).toBe('deepseek-v4-1-flash');
    expect(publicCfg.models).toEqual(['deepseek-v4-1-flash', 'gemini-4-neon']);
    expect(JSON.stringify(publicCfg)).not.toContain('sk-owner-managed-secret-9999');
    expect(JSON.stringify(publicCfg)).not.toContain('kenari.id');

    // Member resolves Managed model via owner's encrypted credential without having any own presets
    const resolvedForMember = await resolveProvider({
      userId: member.id,
      runtimeOverride: { mode: 'managed', modelId: 'gemini-4-neon', reasoningEffort: 'low' },
    });
    expect(resolvedForMember.apiKey).toBe('sk-owner-managed-secret-9999');
    expect(resolvedForMember.baseUrl).toBe('https://api.kenari.id/v1');
    expect(resolvedForMember.modelId).toBe('gemini-4-neon');
    expect(resolvedForMember.reasoningEffort).toBe('low');

    // Member requesting an unlisted model under managed mode is rejected
    await expect(
      resolveProvider({
        userId: member.id,
        runtimeOverride: { mode: 'managed', modelId: 'secret-unlisted-model' },
      }),
    ).rejects.toThrow(/tidak tersedia pada daftar model bawaan/);
  });
});
