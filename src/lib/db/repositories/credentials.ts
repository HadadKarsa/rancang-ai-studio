import { execute, query, queryOne } from '../client';
import { mapCredentialPublic, mapLlmPreset, type LlmPreset, type LlmPresetRow, type ProviderCredentialPublic, type ProviderCredentialRow } from '../types';
import type { ProviderId, ReasoningEffort } from '../enums';
import { newId, nowIso } from '@/lib/ids';

// ── provider_credentials ─────────────────────────────────────────────────────

export interface SaveCredentialInput {
  userId: string;
  provider: ProviderId;
  label: string;
  /** AES-256-GCM output, already split by the crypto module. */
  encryptedKeyB64: string;
  keyIvB64: string;
  keyTagB64: string;
  keyLast4: string;
  baseUrl?: string | null;
  /** Model ids already known for this key; the settings POST fills it from its test call. */
  cachedModels?: string[] | null;
}

export async function createCredential(input: SaveCredentialInput): Promise<ProviderCredentialPublic> {
  const id = newId('crd');
  const now = nowIso();
  await execute(
    `INSERT INTO provider_credentials
       (id, user_id, provider, label, encrypted_key_b64, key_iv_b64, key_tag_b64, key_last4, base_url, is_active, cached_models_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [id, input.userId, input.provider, input.label, input.encryptedKeyB64, input.keyIvB64, input.keyTagB64, input.keyLast4, input.baseUrl ?? null, serializeCachedModels(input.cachedModels), now, now],
  );
  const row = await getCredentialRowById(id);
  if (!row) throw new Error('credential insert vanished');
  return mapCredentialPublic(row);
}

export async function getCredentialRowById(id: string): Promise<ProviderCredentialRow | null> {
  return queryOne<ProviderCredentialRow>('SELECT * FROM provider_credentials WHERE id = ?', [id]);
}

/** Ownership-checked row with ciphertext — service layer decrypts, routes never see it. */
export async function getCredentialRowForUser(id: string, userId: string): Promise<ProviderCredentialRow | null> {
  return queryOne<ProviderCredentialRow>('SELECT * FROM provider_credentials WHERE id = ? AND user_id = ?', [id, userId]);
}

export async function listCredentialsForUser(userId: string): Promise<ProviderCredentialPublic[]> {
  const rows = await query<ProviderCredentialRow>(
    'SELECT * FROM provider_credentials WHERE user_id = ? ORDER BY created_at DESC',
    [userId],
  );
  return rows.map(mapCredentialPublic);
}

/** Active credential for a provider — newest valid one wins. */
export async function getActiveCredentialForProvider(userId: string, provider: ProviderId): Promise<ProviderCredentialRow | null> {
  return queryOne<ProviderCredentialRow>(
    'SELECT * FROM provider_credentials WHERE user_id = ? AND provider = ? AND is_active = 1 ORDER BY is_valid DESC, created_at DESC LIMIT 1',
    [userId, provider],
  );
}

export async function updateCredentialValidation(id: string, userId: string, isValid: boolean | null): Promise<void> {
  await execute(
    'UPDATE provider_credentials SET is_valid = ?, last_validated_at = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    [isValid === null ? null : isValid ? 1 : 0, nowIso(), nowIso(), id, userId],
  );
}

export async function updateCredentialBaseUrl(id: string, userId: string, baseUrl: string | null): Promise<void> {
  await execute('UPDATE provider_credentials SET base_url = ?, updated_at = ? WHERE id = ? AND user_id = ?', [baseUrl, nowIso(), id, userId]);
}

/** Persist the model list a successful test returned, so the form can offer it later without the key. */
export async function updateCredentialCachedModels(id: string, userId: string, models: string[]): Promise<void> {
  await execute(
    'UPDATE provider_credentials SET cached_models_json = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    [serializeCachedModels(models), nowIso(), id, userId],
  );
}

function serializeCachedModels(models: string[] | null | undefined): string | null {
  if (!models) return null;
  return JSON.stringify(models);
}

export async function deactivateCredential(id: string, userId: string): Promise<void> {
  await execute('UPDATE provider_credentials SET is_active = 0, updated_at = ? WHERE id = ? AND user_id = ?', [nowIso(), id, userId]);
}

export async function deleteCredential(id: string, userId: string): Promise<void> {
  await execute('DELETE FROM provider_credentials WHERE id = ? AND user_id = ?', [id, userId]);
}

// ── llm_presets ──────────────────────────────────────────────────────────────

export interface SavePresetInput {
  userId: string;
  name: string;
  description?: string | null;
  provider: ProviderId;
  credentialId?: string | null;
  modelId: string;
  baseUrl?: string | null;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  systemPersona?: string | null;
  reasoningEffort?: ReasoningEffort | null;
  isDefault?: boolean;
}

export async function createPreset(input: SavePresetInput): Promise<LlmPreset> {
  const id = newId('pre');
  const now = nowIso();
  await transactionalUpsertDefault(input.userId, input.isDefault === true, id);
  await execute(
    `INSERT INTO llm_presets
       (id, user_id, name, description, provider, credential_id, model_id, base_url, temperature, max_tokens, top_p, system_persona, reasoning_effort, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.userId, input.name, input.description ?? null, input.provider, input.credentialId ?? null, input.modelId, input.baseUrl ?? null,
     input.temperature ?? 0.7, input.maxTokens ?? 8192, input.topP ?? 1.0, input.systemPersona ?? null, input.reasoningEffort ?? null, input.isDefault === true ? 1 : 0, now, now],
  );
  const row = await getPresetRowById(id);
  if (!row) throw new Error('preset insert vanished');
  return mapLlmPreset(row);
}

/** Partial unique index allows only one default per user — clear the old one first. */
async function transactionalUpsertDefault(userId: string, makeDefault: boolean, exceptPresetId?: string): Promise<void> {
  if (!makeDefault) return;
  await execute('UPDATE llm_presets SET is_default = 0 WHERE user_id = ? AND id != ?', [userId, exceptPresetId ?? '']);
}

export async function getPresetRowById(id: string): Promise<LlmPresetRow | null> {
  return queryOne<LlmPresetRow>('SELECT * FROM llm_presets WHERE id = ?', [id]);
}

export async function getPresetForUser(id: string, userId: string): Promise<LlmPreset | null> {
  const row = await queryOne<LlmPresetRow>('SELECT * FROM llm_presets WHERE id = ? AND user_id = ?', [id, userId]);
  return row ? mapLlmPreset(row) : null;
}

export async function listPresetsForUser(userId: string): Promise<LlmPreset[]> {
  const rows = await query<LlmPresetRow>('SELECT * FROM llm_presets WHERE user_id = ? ORDER BY is_default DESC, created_at DESC', [userId]);
  return rows.map(mapLlmPreset);
}

export async function getDefaultPreset(userId: string): Promise<LlmPreset | null> {
  const row = await queryOne<LlmPresetRow>('SELECT * FROM llm_presets WHERE user_id = ? AND is_default = 1', [userId]);
  return row ? mapLlmPreset(row) : null;
}

export interface UpdatePresetPatch {
  name?: string;
  description?: string | null;
  provider?: ProviderId;
  credentialId?: string | null;
  modelId?: string;
  baseUrl?: string | null;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  systemPersona?: string | null;
  reasoningEffort?: ReasoningEffort | null;
  isDefault?: boolean;
}

export async function updatePreset(id: string, userId: string, patch: UpdatePresetPatch): Promise<void> {
  if (patch.isDefault === true) await transactionalUpsertDefault(userId, true, id);
  const sets: string[] = [];
  const params: unknown[] = [];
  const map: Record<string, string> = {
    name: 'name', description: 'description', provider: 'provider', credentialId: 'credential_id',
    modelId: 'model_id', baseUrl: 'base_url', temperature: 'temperature', maxTokens: 'max_tokens',
    topP: 'top_p', systemPersona: 'system_persona', reasoningEffort: 'reasoning_effort',
  };
  for (const [key, col] of Object.entries(map)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value !== undefined) { sets.push(`${col} = ?`); params.push(value); }
  }
  if (patch.isDefault !== undefined) { sets.push('is_default = ?'); params.push(patch.isDefault ? 1 : 0); }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  params.push(nowIso(), id, userId);
  await execute(`UPDATE llm_presets SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, params as never[]);
}

export async function deletePreset(id: string, userId: string): Promise<void> {
  await execute('DELETE FROM llm_presets WHERE id = ? AND user_id = ?', [id, userId]);
}
