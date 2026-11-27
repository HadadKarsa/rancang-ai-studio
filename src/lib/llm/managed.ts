import { getEnv } from '@/lib/env';
import {
  getCredentialRowForUser,
  getDefaultPreset,
  listCredentialsForUser,
  listPresetsForUser,
} from '@/lib/db/repositories/credentials';
import { getPrimaryOwnerUserId } from '@/lib/db/repositories/users';
import { decryptKey } from '@/lib/crypto/keys';
import { ProviderNotConfiguredError, ValidationError } from '@/lib/errors';
import type { ReasoningEffort } from '@/lib/db/enums';
import type { ResolvedProvider } from './credentials';

export interface ManagedEnvConfig {
  label: string;
  apiKey: string;
  baseUrl: string;
  models: string[];
  defaultModelId: string;
}

export interface ManagedPublicConfig {
  enabled: boolean;
  /** 'owner' = configured by admin in UI; 'env' = server MANAGED_* env fallback; 'none' = not configured. */
  source: 'owner' | 'env' | 'none';
  label: string;
  defaultModelId: string | null;
  models: string[];
}

function parseModelList(raw: string | undefined): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((m) => m.trim())
        .filter((m) => m.length > 0),
    ),
  );
}

/**
 * Optional server-managed OpenAI-compatible provider from env vars.
 * Used as fallback when the admin has not configured managed connections via UI.
 */
export function getManagedEnvConfig(): ManagedEnvConfig | null {
  const env = getEnv();
  const apiKey = env.MANAGED_API_KEY?.trim() ?? '';
  const baseUrl = env.MANAGED_BASE_URL?.trim() ?? '';
  if (!apiKey || !baseUrl) return null;

  const models = parseModelList(env.MANAGED_MODELS);
  const explicitDefault = env.MANAGED_DEFAULT_MODEL?.trim() ?? '';
  const defaultModelId = explicitDefault || models[0] || '';
  if (!defaultModelId) return null;

  const allowlist = models.includes(defaultModelId) ? models : [defaultModelId, ...models];
  return {
    label: env.MANAGED_LABEL?.trim() || 'Rancang.ai',
    apiKey,
    baseUrl,
    models: allowlist,
    defaultModelId,
  };
}

async function getOwnerManagedSnapshot() {
  const ownerId = await getPrimaryOwnerUserId();
  if (!ownerId) return null;

  const [credentials, presets, def] = await Promise.all([
    listCredentialsForUser(ownerId),
    listPresetsForUser(ownerId),
    getDefaultPreset(ownerId),
  ]);

  const validCreds = credentials.filter((c) => c.isActive && c.isValid !== false);
  if (validCreds.length === 0) return null;

  const validCredIds = new Set(validCreds.map((c) => c.id));
  const validPresets = presets.filter((p) => p.credentialId && validCredIds.has(p.credentialId));
  const activeDef = def && def.credentialId && validCredIds.has(def.credentialId) ? def : validPresets[0] ?? null;

  const models = Array.from(
    new Set([
      ...(activeDef ? [activeDef.modelId] : []),
      ...validPresets.map((p) => p.modelId),
      ...validCreds.flatMap((c) => c.cachedModels ?? []),
    ]),
  ).filter((m) => m.length > 0);

  const defaultModelId = activeDef?.modelId ?? models[0] ?? null;
  if (!defaultModelId) return null;

  return {
    ownerId,
    validCreds,
    validPresets,
    activeDef,
    defaultModelId,
    models,
  };
}

/**
 * Public metadata safe to return to any authenticated browser: never includes keys or URLs.
 * Owner's UI-saved active connections take priority; MANAGED_* env vars act as fallback.
 */
export async function getManagedPublicConfig(): Promise<ManagedPublicConfig> {
  const ownerSnapshot = await getOwnerManagedSnapshot();
  if (ownerSnapshot) {
    return {
      enabled: true,
      source: 'owner',
      label: 'Rancang.ai',
      defaultModelId: ownerSnapshot.defaultModelId,
      models: ownerSnapshot.models,
    };
  }

  const envCfg = getManagedEnvConfig();
  if (envCfg) {
    return {
      enabled: true,
      source: 'env',
      label: envCfg.label,
      defaultModelId: envCfg.defaultModelId,
      models: envCfg.models,
    };
  }

  return {
    enabled: false,
    source: 'none',
    label: 'Rancang.ai',
    defaultModelId: null,
    models: [],
  };
}

/**
 * Resolves a server-managed provider from env vars, strictly enforcing the configured allowlist.
 */
export function resolveManagedEnvProvider(opts?: {
  modelId?: string;
  reasoningEffort?: ReasoningEffort | null;
}): ResolvedProvider {
  const cfg = getManagedEnvConfig();
  if (!cfg) {
    throw new ProviderNotConfiguredError('managed', 'Model bawaan Rancang.ai belum dikonfigurasi di server');
  }
  const chosen = opts?.modelId?.trim() || cfg.defaultModelId;
  if (cfg.models.length > 0 && !cfg.models.includes(chosen)) {
    throw new ValidationError(`Model "${chosen}" tidak tersedia pada daftar model bawaan Rancang.ai`, {
      modelId: chosen,
      allowed: cfg.models,
    });
  }
  return {
    provider: 'custom',
    modelId: chosen,
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl,
    presetBaseUrl: null,
    temperature: 0.7,
    maxTokens: 8192,
    topP: 1.0,
    systemPersona: null,
    presetId: null,
    credentialId: null,
    reasoningEffort: opts?.reasoningEffort ?? null,
  };
}

/**
 * Resolves a Managed Rancang.ai provider call for ANY user (owner or member).
 * Uses the admin/owner's UI-saved connections first, falling back to MANAGED_* env vars.
 */
export async function resolveManagedProvider(opts?: {
  modelId?: string;
  reasoningEffort?: ReasoningEffort | null;
}): Promise<ResolvedProvider> {
  const snapshot = await getOwnerManagedSnapshot();
  if (snapshot) {
    const chosen = opts?.modelId?.trim() || snapshot.defaultModelId;
    if (snapshot.models.length > 0 && !snapshot.models.includes(chosen)) {
      throw new ValidationError(`Model "${chosen}" tidak tersedia pada daftar model bawaan Rancang.ai`, {
        modelId: chosen,
      });
    }

    // Prefer a matching owner preset, then a credential whose cached list includes the model, then default/first.
    const matchingPreset =
      snapshot.validPresets.find((p) => p.modelId === chosen) ??
      (snapshot.activeDef && snapshot.activeDef.modelId === chosen ? snapshot.activeDef : null);
    const matchingCred =
      (matchingPreset?.credentialId
        ? snapshot.validCreds.find((c) => c.id === matchingPreset.credentialId)
        : null) ??
      snapshot.validCreds.find((c) => c.cachedModels?.includes(chosen)) ??
      (snapshot.activeDef?.credentialId
        ? snapshot.validCreds.find((c) => c.id === snapshot.activeDef?.credentialId)
        : null) ??
      snapshot.validCreds[0];

    const credRow = matchingCred
      ? await getCredentialRowForUser(matchingCred.id, snapshot.ownerId)
      : null;
    if (!credRow) {
      throw new ProviderNotConfiguredError('managed', 'Koneksi bawaan Rancang.ai tidak ditemukan');
    }

    const apiKey = decryptKey({
      encryptedKeyB64: credRow.encrypted_key_b64,
      keyIvB64: credRow.key_iv_b64,
      keyTagB64: credRow.key_tag_b64,
    });

    const basePreset = matchingPreset ?? snapshot.activeDef;
    const effort =
      opts?.reasoningEffort !== undefined ? opts.reasoningEffort : (basePreset?.reasoningEffort ?? null);

    return {
      provider: credRow.provider,
      modelId: chosen,
      apiKey,
      baseUrl: credRow.base_url ?? null,
      presetBaseUrl: basePreset?.baseUrl ?? null,
      temperature: basePreset?.temperature ?? 0.7,
      maxTokens: basePreset?.maxTokens ?? 8192,
      topP: basePreset?.topP ?? 1.0,
      systemPersona: basePreset?.systemPersona ?? null,
      presetId: basePreset?.id ?? null,
      credentialId: credRow.id,
      reasoningEffort: effort,
    };
  }

  return resolveManagedEnvProvider(opts);
}
