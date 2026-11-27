'use client';

import type { ReasoningEffort } from '@/lib/db/enums';

/**
 * Browser session-only BYOK & Managed model preference store (v0.2.5).
 *
 * BYOK keys live strictly in `sessionStorage` (cleared when the tab closes or on logout)
 * and are attached ONLY to LLM execution endpoints via HTTPS request headers.
 */
const BYOK_KEY = 'rancang.byok.session.v1';
const MANAGED_KEY = 'rancang.managed.selection.v1';
const MODE_KEY = 'rancang.model.mode.v1';
const OUTPUT_LANG_KEY = 'rancang.output.lang.v1';

export type ModelSourceMode = 'managed' | 'byok';
export type AiOutputLanguage = 'id' | 'en';

export function getAiOutputLanguage(): AiOutputLanguage {
  if (typeof window === 'undefined') return 'id';
  try {
    const raw = window.localStorage.getItem(OUTPUT_LANG_KEY);
    if (raw === 'en') return 'en';
  } catch {
    /* ignore */
  }
  return 'id';
}

export function setAiOutputLanguage(lang: AiOutputLanguage): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(OUTPUT_LANG_KEY, lang);
  } catch {
    /* ignore */
  }
}

export interface ByokSessionConfig {
  label: string;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  models: string[];
  reasoningEffort: ReasoningEffort | null;
}

export interface ManagedSelection {
  modelId: string;
  reasoningEffort: ReasoningEffort | null;
}

export function getModelSourceMode(): ModelSourceMode {
  if (typeof window === 'undefined') return 'managed';
  try {
    const raw = window.sessionStorage.getItem(MODE_KEY);
    if (raw === 'byok' && isByokSessionReady()) return 'byok';
  } catch {
    /* ignore private mode */
  }
  return 'managed';
}

export function setModelSourceMode(mode: ModelSourceMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function getByokSession(): ByokSessionConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(BYOK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ByokSessionConfig>;
    if (
      typeof parsed.baseUrl !== 'string' ||
      typeof parsed.apiKey !== 'string' ||
      typeof parsed.modelId !== 'string'
    ) {
      return null;
    }
    return {
      label: typeof parsed.label === 'string' && parsed.label.trim() ? parsed.label : 'OpenAI-Compatible',
      baseUrl: parsed.baseUrl,
      apiKey: parsed.apiKey,
      modelId: parsed.modelId,
      models: Array.isArray(parsed.models) ? parsed.models.filter((m): m is string => typeof m === 'string') : [],
      reasoningEffort: parsed.reasoningEffort ?? null,
    };
  } catch {
    return null;
  }
}

export function isByokSessionReady(): boolean {
  const cfg = getByokSession();
  return Boolean(cfg && cfg.apiKey.trim() && cfg.baseUrl.trim() && cfg.modelId.trim());
}

export function saveByokSession(cfg: ByokSessionConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(BYOK_KEY, JSON.stringify(cfg));
    window.sessionStorage.setItem(MODE_KEY, 'byok');
  } catch {
    /* ignore */
  }
}

export function clearByokSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(BYOK_KEY);
    window.sessionStorage.setItem(MODE_KEY, 'managed');
  } catch {
    /* ignore */
  }
}

export function getManagedSelection(): ManagedSelection | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(MANAGED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ManagedSelection>;
    if (typeof parsed.modelId !== 'string' || !parsed.modelId.trim()) return null;
    return {
      modelId: parsed.modelId,
      reasoningEffort: parsed.reasoningEffort ?? null,
    };
  } catch {
    return null;
  }
}

export function saveManagedSelection(sel: ManagedSelection): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(MANAGED_KEY, JSON.stringify(sel));
    window.sessionStorage.setItem(MODE_KEY, 'managed');
  } catch {
    /* ignore */
  }
}

/**
 * Headers attached ONLY to LLM execution endpoints (interview, generate-all, document generate).
 * Routine read/project/library requests never transmit BYOK keys.
 */
export function getRuntimeModelHeaders(): Record<string, string> {
  const outputLang = getAiOutputLanguage();
  const mode = getModelSourceMode();
  if (mode === 'byok') {
    const byok = getByokSession();
    if (byok && byok.apiKey.trim() && byok.baseUrl.trim() && byok.modelId.trim()) {
      const headers: Record<string, string> = {
        'X-Rancang-Model-Mode': 'byok',
        'X-Rancang-Byok-Key': byok.apiKey.trim(),
        'X-Rancang-Byok-Base-Url': byok.baseUrl.trim(),
        'X-Rancang-Model-Id': byok.modelId.trim(),
        'X-Rancang-Output-Lang': outputLang,
      };
      if (byok.reasoningEffort) {
        headers['X-Rancang-Reasoning-Effort'] = byok.reasoningEffort;
      }
      return headers;
    }
  }

  const managed = getManagedSelection();
  if (managed && managed.modelId.trim()) {
    const headers: Record<string, string> = {
      'X-Rancang-Model-Mode': 'managed',
      'X-Rancang-Model-Id': managed.modelId.trim(),
      'X-Rancang-Output-Lang': outputLang,
    };
    if (managed.reasoningEffort) {
      headers['X-Rancang-Reasoning-Effort'] = managed.reasoningEffort;
    }
    return headers;
  }

  return { 'X-Rancang-Output-Lang': outputLang };
}
