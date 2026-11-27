import { z } from 'zod';
import { REASONING_EFFORTS, type ReasoningEffort } from '@/lib/db/enums';
import { ValidationError } from '@/lib/errors';

/**
 * Runtime model override headers (v0.2.5).
 * Session-only BYOK keys arrive strictly in HTTPS request headers on LLM routes,
 * stay in memory only for the active request/batch, and are never persisted or logged.
 */
export const HEADER_MODEL_MODE = 'x-rancang-model-mode';
export const HEADER_BYOK_KEY = 'x-rancang-byok-key';
export const HEADER_BYOK_BASE_URL = 'x-rancang-byok-base-url';
export const HEADER_MODEL_ID = 'x-rancang-model-id';
export const HEADER_REASONING_EFFORT = 'x-rancang-reasoning-effort';

export interface RuntimeModelOverride {
  mode: 'byok' | 'managed';
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
  reasoningEffort?: ReasoningEffort | null;
}

const byokSchema = z.object({
  mode: z.literal('byok'),
  apiKey: z.string().min(1, 'API key sesi wajib diisi').max(400),
  baseUrl: z
    .string()
    .url('Base URL tidak valid')
    .refine((u) => /^https?:\/\//i.test(u), 'Base URL harus menggunakan http atau https'),
  modelId: z.string().min(1, 'Model ID wajib diisi').max(200),
  reasoningEffort: z.enum(REASONING_EFFORTS).nullable().optional(),
});

const managedSchema = z.object({
  mode: z.literal('managed'),
  modelId: z.string().min(1).max(200).optional(),
  reasoningEffort: z.enum(REASONING_EFFORTS).nullable().optional(),
});

function parseEffort(raw: string | null): ReasoningEffort | null | undefined {
  if (raw === null) return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'default') return null;
  if ((REASONING_EFFORTS as readonly string[]).includes(trimmed)) {
    return trimmed as ReasoningEffort;
  }
  throw new ValidationError('Nilai reasoning effort tidak valid', { reasoningEffort: trimmed });
}

export function parseRuntimeModelOverride(req: Request): RuntimeModelOverride | undefined {
  const rawMode = req.headers.get(HEADER_MODEL_MODE)?.trim().toLowerCase();
  if (!rawMode) return undefined;

  const reasoningEffort = parseEffort(req.headers.get(HEADER_REASONING_EFFORT));

  if (rawMode === 'byok') {
    const candidate = {
      mode: 'byok' as const,
      apiKey: req.headers.get(HEADER_BYOK_KEY)?.trim() ?? '',
      baseUrl: req.headers.get(HEADER_BYOK_BASE_URL)?.trim() ?? '',
      modelId: req.headers.get(HEADER_MODEL_ID)?.trim() ?? '',
      reasoningEffort,
    };
    const parsed = byokSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new ValidationError('Konfigurasi BYOK sesi tidak lengkap atau tidak valid', parsed.error.flatten());
    }
    return parsed.data;
  }

  if (rawMode === 'managed') {
    const modelId = req.headers.get(HEADER_MODEL_ID)?.trim() || undefined;
    const parsed = managedSchema.safeParse({ mode: 'managed' as const, modelId, reasoningEffort });
    if (!parsed.success) {
      throw new ValidationError('Konfigurasi model bawaan tidak valid', parsed.error.flatten());
    }
    return parsed.data;
  }

  throw new ValidationError('Mode model tidak dikenal', { mode: rawMode });
}
