import type { ProviderId } from '@/lib/db/enums';

/**
 * Provider metadata catalog (T-301) — drives the settings UI and validation.
 * Models listed here are static suggestions; the test-connection endpoint
 * (registry.testProviderConnection) returns the live list for the key.
 */
export interface ProviderCatalogEntry {
  id: ProviderId;
  label: string;
  authStyle: 'api-key' | 'none';
  keyPrefix: string;
  /** OpenAI-compatible base URL, when the provider speaks that protocol. */
  defaultBaseUrl: string | null;
  needsBaseUrl: boolean;
  suggestedModels: string[];
  docsUrl: string;
}

export const CONNECTION_PROVIDERS = ['custom', 'openai', 'openrouter', 'groq', 'ollama'] as const;

export function supportsNewConnection(provider: ProviderId): boolean {
  return CONNECTION_PROVIDERS.some((id) => id === provider);
}

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: 'openai', label: 'OpenAI', authStyle: 'api-key', keyPrefix: 'sk-',
    defaultBaseUrl: 'https://api.openai.com/v1', needsBaseUrl: false,
    suggestedModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'], docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic', label: 'Anthropic', authStyle: 'api-key', keyPrefix: 'sk-ant-',
    defaultBaseUrl: null, needsBaseUrl: false,
    suggestedModels: ['claude-sonnet-4-5', 'claude-3-7-sonnet', 'claude-3-5-haiku'], docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'google', label: 'Google Gemini', authStyle: 'api-key', keyPrefix: 'AIza',
    defaultBaseUrl: null, needsBaseUrl: false,
    suggestedModels: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'], docsUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'groq', label: 'Groq', authStyle: 'api-key', keyPrefix: 'gsk_',
    defaultBaseUrl: 'https://api.groq.com/openai/v1', needsBaseUrl: false,
    suggestedModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'], docsUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'openrouter', label: 'OpenRouter', authStyle: 'api-key', keyPrefix: 'sk-or-',
    defaultBaseUrl: 'https://openrouter.ai/api/v1', needsBaseUrl: false,
    suggestedModels: ['anthropic/claude-sonnet-4', 'deepseek/deepseek-chat'], docsUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'ollama', label: 'Ollama (local)', authStyle: 'none', keyPrefix: '',
    defaultBaseUrl: 'http://localhost:11434/v1', needsBaseUrl: true,
    suggestedModels: ['llama3.2', 'qwen2.5-coder'], docsUrl: 'https://ollama.com',
  },
  {
    id: 'custom', label: 'Custom OpenAI-compatible', authStyle: 'api-key', keyPrefix: '',
    defaultBaseUrl: null, needsBaseUrl: true,
    suggestedModels: [], docsUrl: '',
  },
];

export function providerEntry(id: ProviderId): ProviderCatalogEntry | undefined {
  return PROVIDER_CATALOG.find((p) => p.id === id);
}
