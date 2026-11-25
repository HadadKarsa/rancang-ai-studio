import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import { streamText } from 'ai';
import type { ProviderId, ReasoningEffort } from '@/lib/db/enums';

/**
 * `ai` imports ProviderOptions but does not re-export it, and @ai-sdk/provider-utils
 * is not a direct dependency. Take the type off the call it is passed to.
 */
type ProviderOptions = NonNullable<Parameters<typeof streamText>[0]['providerOptions']>;
import { ProviderError } from '@/lib/errors';

/**
 * Provider registry (T-300). The ONLY code that touches provider SDKs
 * (02_ARCHITECTURE invariant #3). Services call buildModel() and get a
 * LanguageModel; base URL overrides route through OpenAI-compatible endpoints.
 */

export const PROVIDER_DEFAULT_BASE_URLS: Partial<Record<ProviderId, string>> = {
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434/v1',
};

export interface BuildModelInput {  provider: ProviderId;
  modelId: string;
  apiKey: string;
  /** Credential-level base URL (custom/OpenAI-compatible). */
  baseUrl?: string | null;
  /** Preset-level override; wins over the credential's base URL (03_DATABASE §3.7). */
  presetBaseUrl?: string | null;
}

export function buildModel(input: BuildModelInput): LanguageModel {
  const { provider, modelId, apiKey } = input;
  const baseUrl = input.presetBaseUrl ?? input.baseUrl ?? PROVIDER_DEFAULT_BASE_URLS[provider] ?? undefined;

  switch (provider) {
    case 'openai':
      return createOpenAI({ apiKey, ...(baseUrl ? { baseURL: baseUrl } : {}) }).chat(modelId);
    case 'anthropic':
      return createAnthropic({ apiKey, ...(baseUrl ? { baseURL: baseUrl } : {}) })(modelId);
    case 'google':
      return createGoogleGenerativeAI({ apiKey, ...(baseUrl ? { baseURL: baseUrl } : {}) })(modelId);
    case 'groq':
    case 'openrouter':
    case 'custom':
      if (!baseUrl) {
        throw new ProviderError(`Provider ${provider} requires a base URL`);
      }
      return createOpenAI({ apiKey, baseURL: baseUrl }).chat(modelId);
    case 'ollama':
      return createOpenAI({ apiKey: apiKey || 'ollama', baseURL: baseUrl ?? 'http://localhost:11434/v1' }).chat(modelId);
    default: {
      const exhaustive: never = provider;
      throw new ProviderError(`Unknown provider: ${String(exhaustive)}`);
    }
  }
}

export function buildProviderOptions(
  provider: ProviderId,
  reasoningEffort: ReasoningEffort | null | undefined,
): ProviderOptions | undefined {
  if (!reasoningEffort) return undefined;

  switch (provider) {
    // OpenAI-compatible endpoints all read the `openai` provider key, because
    // buildModel() constructs them with createOpenAI.
    case 'openai':
    case 'groq':
    case 'openrouter':
    case 'custom':
    case 'ollama':
      return { openai: { reasoningEffort } };

    case 'google':
      // Gemini's off switch is a zero thinking budget; the levels are a name.
      return {
        google: {
          thinkingConfig: reasoningEffort === 'none'
            ? { thinkingBudget: 0 }
            : { thinkingLevel: reasoningEffort },
        },
      };

    case 'anthropic': {
      const budgetTokens = ANTHROPIC_THINKING_BUDGET[reasoningEffort];
      return {
        anthropic: {
          thinking: budgetTokens === null
            ? { type: 'disabled' }
            : { type: 'enabled', budgetTokens },
        },
      };
    }

    default: {
      const exhaustive: never = provider;
      throw new ProviderError(`Unknown provider: ${String(exhaustive)}`);
    }
  }
}

/** `none` disables thinking; the rest are Anthropic budget tokens. */
const ANTHROPIC_THINKING_BUDGET: Record<ReasoningEffort, number | null> = {
  none: null,
  low: 2048,
  medium: 8192,
  high: 16384,
};

/**
 * Validate a key + list available models (Ndan v2: test-connection endpoint).
 * Uses GET /models on OpenAI-compatible endpoints; Anthropic and Google get
 * their native model-list endpoints. Returns the model ids the key can see.
 */
export async function testProviderConnection(input: {
  provider: ProviderId;
  apiKey: string;
  baseUrl?: string | null;
}): Promise<{ ok: true; models: string[] } | { ok: false; reason: string }> {
  const { provider, apiKey } = input;
  const baseUrl = input.baseUrl ?? PROVIDER_DEFAULT_BASE_URLS[provider] ?? undefined;

  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  let url: string;
  switch (provider) {
    case 'openai':
    case 'groq':
    case 'openrouter':
    case 'ollama':
    case 'custom':
      url = `${(baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')}/models`;
      break;
    case 'anthropic':
      url = `${(baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '')}/v1/models`;
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      delete headers.Authorization;
      break;
    case 'google':
      url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
      delete headers.Authorization;
      break;
    default:
      return { ok: false, reason: `Unknown provider: ${provider}` };
  }

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: 'Key rejected by provider (401/403)' };
    }
    if (!res.ok) {
      return { ok: false, reason: `Provider returned ${res.status}` };
    }
    const body = (await res.json()) as { data?: Array<{ id?: string }>; models?: Array<{ name?: string }> };
    const raw: Array<{ id?: string; name?: string }> = [...(body.data ?? []), ...(body.models ?? [])];
    const models = raw
      .map((m) => m.id ?? m.name ?? '')
      .filter((id) => id.length > 0)
      .map((id) => id.replace(/^models\//, ''));
    return { ok: true, models };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Network failure' };
  }
}
