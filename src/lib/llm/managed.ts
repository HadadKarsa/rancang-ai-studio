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
import type { ProviderCredentialPublic } from '@/lib/db/types';
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
 * Effective exposed models for an admin-managed credential:
 * - If admin configured an explicit whitelist (`allowedModels !== null`), ONLY those models are exposed.
 * - Otherwise all cached models (plus linked preset model) are exposed.
 */
export function getExposedModelsForCredential(
  cred: ProviderCredentialPublic,
  presetModelIds: string[] = [],
): string[] {
  if (cred.allowedModels !== null) {
    return Array.from(new Set(cred.allowedModels.map((m) => m.trim()).filter(Boolean)));
  }
  return Array.from(
    new Set([...presetModelIds, ...(cred.cachedModels ?? [])].map((m) => m.trim()).filter(Boolean)),
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

  // Strict whitelist invariant (v0.2.8): if ANY active managed credential has an explicit
  // admin whitelist, ONLY whitelisted credentials contribute to Bawaan Rancang.ai.
  // Secondary/legacy unrestricted credentials never leak unfiltered models into the picker.
  const anyWhitelisted = validCreds.some((c) => c.allowedModels !== null && c.allowedModels.length > 0);
  const eligibleCreds = anyWhitelisted
    ? validCreds.filter((c) => c.allowedModels !== null && c.allowedModels.length > 0)
    : validCreds;

  const exposedByCred = new Map<string, string[]>();
  for (const cred of eligibleCreds) {
    const linkedModels = validPresets
      .filter((p) => p.credentialId === cred.id)
      .map((p) => p.modelId);
    exposedByCred.set(cred.id, getExposedModelsForCredential(cred, linkedModels));
  }

  const allExposed = Array.from(
    new Set(eligibleCreds.flatMap((c) => exposedByCred.get(c.id) ?? [])),
  );

  // Respect default preset model ONLY if it is inside the active whitelist.
  const defModelAllowed = activeDef && allExposed.includes(activeDef.modelId) ? activeDef.modelId : null;
  const orderedModels = defModelAllowed
    ? [defModelAllowed, ...allExposed.filter((m) => m !== defModelAllowed)]
    : allExposed;

  const defaultModelId = orderedModels[0] ?? null;
  if (!defaultModelId) return null;

  return {
    ownerId,
    validCreds: eligibleCreds,
    validPresets,
    activeDef,
    exposedByCred,
    defaultModelId,
    models: orderedModels,
  };
}

/**
 * Public metadata safe to return to any authenticated browser: never includes keys or URLs.
 * Owner's UI-saved active connections (and optional whitelist) take priority; MANAGED_* env acts as fallback.
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
 * Enforces the admin's configured model whitelist when present.
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

    const matchingCred =
      snapshot.validCreds.find((c) => (snapshot.exposedByCred.get(c.id) ?? []).includes(chosen)) ??
      snapshot.validCreds[0];
    const matchingPreset =
      snapshot.validPresets.find((p) => p.credentialId === matchingCred?.id && p.modelId === chosen) ??
      snapshot.validPresets.find((p) => p.credentialId === matchingCred?.id) ??
      snapshot.activeDef;

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

    const effort =
      opts?.reasoningEffort !== undefined ? opts.reasoningEffort : (matchingPreset?.reasoningEffort ?? null);

    return {
      provider: credRow.provider,
      modelId: chosen,
      apiKey,
      baseUrl: credRow.base_url ?? null,
      presetBaseUrl: matchingPreset?.baseUrl ?? null,
      temperature: matchingPreset?.temperature ?? 0.7,
      maxTokens: matchingPreset?.maxTokens ?? 8192,
      topP: matchingPreset?.topP ?? 1.0,
      systemPersona: matchingPreset?.systemPersona ?? null,
      presetId: matchingPreset?.id ?? null,
      credentialId: credRow.id,
      reasoningEffort: effort,
    };
  }

  return resolveManagedEnvProvider(opts);
}
