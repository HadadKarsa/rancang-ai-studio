import { getActiveCredentialForProvider, getPresetForUser, getDefaultPreset } from '@/lib/db/repositories/credentials';
import { decryptKey } from '@/lib/crypto/keys';
import { ProviderNotConfiguredError } from '@/lib/errors';
import type { ProviderId } from '@/lib/db/enums';

/**
 * Credential resolution (T-302). Ephemeral (session-only) keys bypass the DB.
 * Resolution order: explicit preset → project default → user default.
 */
export interface ResolvedProvider {
  provider: ProviderId;
  modelId: string;
  apiKey: string;
  baseUrl: string | null;
  presetBaseUrl: string | null;
  temperature: number;
  maxTokens: number;
  topP: number;
  systemPersona: string | null;
  presetId: string | null;
  credentialId: string | null;
}

export async function resolveApiKey(userId: string, provider: ProviderId, ephemeralKey?: string): Promise<string> {
  if (ephemeralKey) return ephemeralKey;
  const row = await getActiveCredentialForProvider(userId, provider);
  if (!row) throw new ProviderNotConfiguredError(provider);
  return decryptKey({
    encryptedKeyB64: row.encrypted_key_b64,
    keyIvB64: row.key_iv_b64,
    keyTagB64: row.key_tag_b64,
  });
}

export async function resolveProvider(input: {
  userId: string;
  presetId?: string | null;
  ephemeralKey?: string;
  /** Fallbacks when no preset resolves. */
  fallbackProvider?: ProviderId;
  fallbackModelId?: string;
  fallbackTemperature?: number;
  fallbackMaxTokens?: number;
}): Promise<ResolvedProvider> {
  const preset = input.presetId
    ? await getPresetForUser(input.presetId, input.userId)
    : await getDefaultPreset(input.userId);

  if (preset) {
    let apiKey: string;
    if (input.ephemeralKey) {
      apiKey = input.ephemeralKey;
    } else if (preset.credentialId) {
      const row = await getPresetForUser(preset.id, input.userId).then(async (p) => {
        if (!p?.credentialId) return null;
        const { getCredentialRowForUser } = await import('@/lib/db/repositories/credentials');
        return getCredentialRowForUser(p.credentialId, input.userId);
      }) ?? (await getActiveCredentialForProvider(input.userId, preset.provider));
      if (!row) throw new ProviderNotConfiguredError(preset.provider);
      apiKey = decryptKey({ encryptedKeyB64: row.encrypted_key_b64, keyIvB64: row.key_iv_b64, keyTagB64: row.key_tag_b64 });
    } else {
      apiKey = await resolveApiKey(input.userId, preset.provider, input.ephemeralKey);
    }
    return {
      provider: preset.provider,
      modelId: preset.modelId,
      apiKey,
      baseUrl: null,
      presetBaseUrl: preset.baseUrl,
      temperature: preset.temperature,
      maxTokens: preset.maxTokens,
      topP: preset.topP,
      systemPersona: preset.systemPersona,
      presetId: preset.id,
      credentialId: preset.credentialId,
    };
  }

  const provider = input.fallbackProvider;
  if (!provider) throw new ProviderNotConfiguredError('none');
  return {
    provider,
    modelId: input.fallbackModelId ?? '',
    apiKey: await resolveApiKey(input.userId, provider, input.ephemeralKey),
    baseUrl: null,
    presetBaseUrl: null,
    temperature: input.fallbackTemperature ?? 0.7,
    maxTokens: input.fallbackMaxTokens ?? 8192,
    topP: 1.0,
    systemPersona: null,
    presetId: null,
    credentialId: null,
  };
}
