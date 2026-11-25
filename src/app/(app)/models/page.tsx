'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Plug,
  RefreshCw,
  Search,
  Star,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { Badge, Button, Popover, PopoverContent, PopoverTrigger, useToast } from '@/components/ui';
import { useAppShell } from '@/components/AppShellContext';
import { cn } from '@/lib/cn';

type ProviderId = 'openai' | 'anthropic' | 'google' | 'groq' | 'openrouter' | 'ollama' | 'custom';

/** v0.2.1: four choices only. The DB enum keeps every id, so legacy rows still resolve. */
const CHOICES: { id: ProviderId; label: string; hint: string }[] = [
  {
    id: 'custom',
    label: 'OpenAI-Compatible',
    hint: 'Kenari / DeepSeek / Ollama / lainnya',
  },
  { id: 'openai', label: 'OpenAI', hint: 'api.openai.com' },
  { id: 'anthropic', label: 'Anthropic', hint: 'Claude' },
  { id: 'google', label: 'Google Gemini', hint: 'generativelanguage' },
];

interface CatalogEntry {
  id: ProviderId;
  label: string;
  authStyle: 'api-key' | 'subscription' | 'none';
  keyPrefix: string;
  defaultBaseUrl: string | null;
  needsBaseUrl: boolean;
  suggestedModels: string[];
  docsUrl: string;
}

interface Credential {
  id: string;
  provider: ProviderId;
  label: string;
  keyLast4: string;
  baseUrl: string | null;
  isActive: boolean;
  isValid: boolean | null;
  lastValidatedAt: string | null;
  cachedModels: string[];
  createdAt: string;
}

type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

interface Preset {
  id: string;
  name: string;
  provider: ProviderId;
  credentialId: string | null;
  modelId: string;
  baseUrl: string | null;
  reasoningEffort: ReasoningEffort | null;
  isDefault: boolean;
}

interface TestResult {
  ok: boolean;
  reason?: string;
  models?: string[];
}

const PROVIDER_LABEL: Record<string, string> = {
  custom: 'OpenAI-Compatible',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google Gemini',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  ollama: 'Ollama',
};

/**
 * Reasoning effort is stored as null (provider default) or one of four levels.
 * The short label is what the top bar pill shows, so it has to stay short.
 */
const EFFORT_OPTIONS: { value: ReasoningEffort | null; label: string; short: string; hint: string }[] = [
  { value: null, label: 'Default', short: 'def', hint: 'Ikut penyedia' },
  { value: 'none', label: 'Off', short: 'off', hint: 'Tanpa penalaran' },
  { value: 'low', label: 'Low', short: 'low', hint: 'Cepat, dangkal' },
  { value: 'medium', label: 'Medium', short: 'med', hint: 'Seimbang' },
  { value: 'high', label: 'High', short: 'high', hint: 'Lambat, teliti' },
];

function effortMeta(value: ReasoningEffort | null | undefined) {
  return EFFORT_OPTIONS.find((o) => o.value === (value ?? null)) ?? EFFORT_OPTIONS[0];
}

/**
 * Which credential a preset actually resolves to, for display.
 * Backend rule (src/lib/llm/credentials.ts): a preset with a credentialId uses
 * that row; a preset with credentialId = null falls back to the provider's
 * active credential.
 */
function resolvedCredential(preset: Preset, credentials: Credential[]): Credential | undefined {
  if (preset.credentialId) {
    const explicit = credentials.find((c) => c.id === preset.credentialId);
    if (explicit) return explicit;
  }
  // Same ordering as getActiveCredentialForProvider: is_valid DESC, created_at DESC.
  const rank = (c: Credential) => (c.isValid === true ? 0 : c.isValid === false ? 1 : 2);
  return credentials
    .filter((c) => c.provider === preset.provider)
    .sort((a, b) => rank(a) - rank(b))[0];
}

/**
 * A credential is in use when a preset names it, OR when any preset of the same
 * provider has credentialId = null: that preset resolves to the provider's
 * active credential at call time, so deleting one can pull a key out from under
 * it. Both rules must clear before anything is hard-deleted.
 */
function isCredentialClaimed(
  credential: Credential,
  presets: Preset[],
  exceptPresetId?: string,
): boolean {
  return presets.some(
    (p) =>
      p.id !== exceptPresetId &&
      (p.credentialId === credential.id ||
        (p.credentialId === null && p.provider === credential.provider)),
  );
}

/**
 * Searchable model picker. The list comes from the credential's cached model
 * ids (filled by the last successful provider test), so opening it costs no
 * network call; the refresh button beside it is what asks the provider again.
 * A manual id stays available because some endpoints refuse GET /models.
 */
function ModelPicker({
  value,
  options,
  onSelect,
  label,
  disabled,
}: {
  value: string;
  options: string[];
  onSelect: (modelId: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [manual, setManual] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(value);
      setQuery('');
      setManual(options.length === 0);
    }
  }, [open, value, options.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((m) => m.toLowerCase().includes(q));
  }, [options, query]);

  function commitManual() {
    const next = draft.trim();
    if (!next) return;
    onSelect(next);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`${label}: ${value}`}
          className={cn(
            'inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-lg border border-line bg-canvas px-2.5 py-1.5',
            'font-mono text-xs text-ink transition-colors hover:border-line-strong hover:bg-subtle',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <span className="truncate">{value || 'Pilih model'}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2.5rem))] p-0">
        <div className="space-y-2 border-b border-line p-2.5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={options.length > 0 ? `Saring ${options.length} model` : 'Belum ada daftar model'}
              aria-label={`Saring model untuk ${label}`}
              className="min-h-9 w-full rounded-lg border border-line-strong bg-canvas pl-8 pr-2.5 py-1.5 text-xs text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        {!manual && (
          <ul role="listbox" aria-label={`Model untuk ${label}`} className="max-h-64 overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <li className="px-2.5 py-3 text-xs text-ink-2">
                Tidak ada model yang cocok. Pakai ID manual di bawah.
              </li>
            ) : (
              filtered.map((m) => {
                const selected = m === value;
                return (
                  <li key={m}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onSelect(m);
                        setOpen(false);
                      }}
                      className={cn(
                        'flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-mono text-xs transition-colors',
                        selected ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-subtle hover:text-ink',
                      )}
                    >
                      <Check
                        className={cn('h-3.5 w-3.5 shrink-0', selected ? 'opacity-100' : 'opacity-0')}
                        aria-hidden="true"
                      />
                      <span className="truncate">{m}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        )}

        <div className="space-y-2 border-t border-line p-2.5">
          {manual ? (
            <div className="space-y-1.5">
              <label htmlFor={`manual-${label}`} className="block text-[11px] font-medium text-ink-2">
                ID model
              </label>
              <div className="flex gap-1.5">
                <input
                  id={`manual-${label}`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitManual();
                    }
                  }}
                  placeholder="deepseek-chat"
                  className="min-h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-canvas px-2.5 py-1.5 font-mono text-xs text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
                />
                <Button size="sm" variant="secondary" onClick={commitManual} disabled={!draft.trim()}>
                  Pakai
                </Button>
              </div>
              {options.length > 0 && (
                <button
                  type="button"
                  onClick={() => setManual(false)}
                  className="text-[11px] font-medium text-accent-ink underline underline-offset-2"
                >
                  Kembali ke daftar
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setManual(true);
                setDraft(value);
              }}
              className="text-[11px] font-medium text-accent-ink underline underline-offset-2"
            >
              Model tidak ada di daftar? Isi ID manual
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Compact effort switcher: five values, one row, saved the moment it changes. */
function EffortSelect({
  value,
  onChange,
  label,
  busy,
}: {
  value: ReasoningEffort | null;
  onChange: (next: ReasoningEffort | null) => void;
  label: string;
  busy?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={`Reasoning effort ${label}`}
      className="inline-flex items-center rounded-lg border border-line bg-canvas p-0.5"
    >
      {EFFORT_OPTIONS.map((o) => {
        const active = (value ?? null) === o.value;
        return (
          <button
            key={o.short}
            type="button"
            aria-pressed={active}
            disabled={busy}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={cn(
              'min-h-8 rounded-[6px] px-2 text-[11px] font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
              'disabled:cursor-not-allowed disabled:opacity-50',
              active ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function ModelsPage() {
  const { toast } = useToast();
  const { refreshActiveModel } = useAppShell();

  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  // Add-provider form
  const [provider, setProvider] = useState<ProviderId | ''>('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [label, setLabel] = useState('');
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [selectedModel, setSelectedModel] = useState('');
  const [effort, setEffort] = useState<ReasoningEffort | null>(null);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // Per-row busy flags, keyed by preset id: a row refreshes and saves on its own.
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState((prev) => (prev === 'ready' ? prev : 'loading'));
    try {
      const [cat, creds, pre] = await Promise.all([
        api.get<{ providers: CatalogEntry[] }>('/providers/test'),
        api.get<{ credentials: Credential[] }>('/settings/credentials'),
        api.get<{ presets: Preset[] }>('/settings/presets'),
      ]);
      setCatalog(cat.providers);
      setCredentials(creds.credentials.filter((c) => c.isActive));
      setPresets(pre.presets);
      setState('ready');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal memuat pengaturan model');
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const entry = catalog.find((c) => c.id === provider);
  const needsBaseUrl = provider === 'custom' || entry?.needsBaseUrl === true;
  const canTest = provider !== '' && apiKey.trim().length > 0 && (!needsBaseUrl || baseUrl.trim().length > 0);
  const testPassed = test?.ok === true;
  // Saving no longer requires a passed connection test: a provider that refuses
  // GET /models can still be saved through its manual model id.
  const canSave = provider !== '' && selectedModel.trim().length > 0 && !saving;
  const models = testPassed && test?.models ? test.models : [];
  const hasDefault = presets.some((p) => p.isDefault);

  // One row per connected model: a preset is the row, its credential supplies last4.
  const rows = useMemo(
    () => presets.map((p) => ({ preset: p, credential: resolvedCredential(p, credentials) })),
    [presets, credentials],
  );

  /** Credentials no preset points at, shown so nothing is stranded and each can be deleted alone. */
  const orphanCredentials = useMemo(
    () => credentials.filter((c) => !isCredentialClaimed(c, presets)),
    [presets, credentials],
  );

  // With nothing connected the add form is the page, so it starts open.
  useEffect(() => {
    if (state === 'ready' && rows.length === 0) setAddOpen(true);
  }, [state, rows.length]);

  async function runTest() {
    if (!provider) return;
    setTesting(true);
    setTest(null);
    setSelectedModel('');
    setError(null);
    try {
      const body: Record<string, unknown> = { provider, apiKey: apiKey.trim() };
      if (baseUrl.trim()) body.baseUrl = baseUrl.trim();
      const r = await api.post<TestResult>('/providers/test', body);
      setTest(r);
      if (r.ok && r.models && r.models.length > 0) setSelectedModel(r.models[0] ?? '');
    } catch (e) {
      if (e instanceof ApiError) setTest({ ok: false, reason: e.message });
      else setTest({ ok: false, reason: 'Gagal menguji koneksi penyedia.' });
    }
    setTesting(false);
  }

  async function save() {
    const model = selectedModel.trim();
    if (!provider || !model) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<{ credential: Credential }>('/settings/credentials', {
        provider,
        label: label.trim() || PROVIDER_LABEL[provider] || provider,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || undefined,
        // The list the test already fetched rides along, so the row's dropdown
        // works on the next render without asking the provider again.
        cachedModels: models.length > 0 ? models : undefined,
        test: testPassed,
      });
      await api.post('/settings/presets', {
        name: label.trim() || PROVIDER_LABEL[provider] || provider,
        provider,
        credentialId: res.credential.id,
        modelId: model,
        reasoningEffort: effort,
        isDefault: true,
      });
      toast({
        tone: 'success',
        title: 'Model terhubung',
        description: `Model default sekarang ${model}.`,
      });
      setApiKey('');
      setLabel('');
      setBaseUrl('');
      setTest(null);
      setSelectedModel('');
      setEffort(null);
      setAddOpen(false);
      await load();
      refreshActiveModel();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan model');
    }
    setSaving(false);
  }

  async function patchPreset(id: string, patch: Record<string, unknown>, done: string) {
    setRowBusy(id);
    setError(null);
    try {
      await api.patch(`/settings/presets?id=${id}`, patch);
      toast({ tone: 'success', title: done });
      await load();
      refreshActiveModel();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menyimpan perubahan');
    }
    setRowBusy(null);
  }

  /**
   * Re-asks the provider for its model list with the stored key, and the route
   * writes the answer back onto the credential, so the dropdown is fresh when
   * the reload lands. No apiKey in the body: the route reads the saved one.
   */
  async function refreshModels(preset: Preset, credential: Credential | undefined) {
    if (!credential) {
      setError('Kredensial untuk model ini tidak ditemukan. Hapus lalu hubungkan ulang.');
      return;
    }
    setRefreshing(preset.id);
    setError(null);
    try {
      const r = await api.post<TestResult>('/providers/test', {
        provider: preset.provider,
        credentialId: credential.id,
      });
      if (!r.ok) {
        setError(r.reason ? `Gagal mengambil daftar model: ${r.reason}` : 'Gagal mengambil daftar model.');
      } else {
        const n = r.models?.length ?? 0;
        toast({
          tone: 'success',
          title: n > 0 ? `${n} model tersedia` : 'Penyedia tidak mengembalikan daftar model',
          description: n > 0 ? 'Dropdown sudah diperbarui.' : 'Pakai ID model manual.',
        });
        await load();
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal mengambil daftar model');
    }
    setRefreshing(null);
  }

  /** Deletes the preset, then the credential if nothing else references it. */
  async function removeRow(preset: Preset) {
    setError(null);
    try {
      await api.delete(`/settings/presets?id=${preset.id}`);
      const usedBy = credentials.find((c) => c.id === preset.credentialId);
      const stillUsed = usedBy ? isCredentialClaimed(usedBy, presets, preset.id) : false;
      if (preset.credentialId && !stillUsed) {
        await api.delete(`/settings/credentials?id=${preset.credentialId}&mode=hard`);
      }
      toast({ tone: 'info', title: 'Model dihapus' });
      await load();
      refreshActiveModel();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menghapus model');
    }
  }

  async function removeOrphan(id: string) {
    setError(null);
    try {
      const target = credentials.find((c) => c.id === id);
      const claimed = target ? isCredentialClaimed(target, presets) : false;
      // Soft by default; a hard delete only when neither rule claims it.
      await api.delete(`/settings/credentials?id=${id}&mode=${claimed ? 'soft' : 'hard'}`);
      toast({ tone: 'info', title: 'Kredensial dihapus' });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menghapus kredensial');
    }
  }

  if (state === 'loading') {
    return (
      <div className="mx-auto max-w-3xl px-5 py-7 sm:px-8">
        <div className="h-7 w-44 rounded-lg bg-subtle animate-pulse" />
        <div className="mt-6 space-y-2.5">
          {[0, 1].map((i) => (
            <div key={i} className="h-24 rounded-xl border border-line bg-surface animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-7 px-5 py-7 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Models</h1>
          <p className="max-w-prose text-sm text-ink-2">
            Satu model default dipakai untuk wawancara dan penulisan spesifikasi di seluruh studio.
          </p>
        </div>
        {hasDefault && (
          <Link
            href="/studio"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm font-medium text-ink shadow-xs transition-colors hover:bg-subtle"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Kembali ke Studio
          </Link>
        )}
      </header>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-danger/35 bg-danger-soft px-4 py-3 text-sm text-danger-ink"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Saved models are the page: what the studio will actually call. */}
      <section aria-labelledby="connected-heading" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="connected-heading" className="text-sm font-semibold text-ink">
            Model aktif &amp; terhubung
          </h2>
          {rows.length > 0 && (
            <span className="font-mono text-[11px] text-ink-3">
              {rows.length} model
            </span>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface/60 px-5 py-6">
            <p className="text-sm font-medium text-ink">Belum ada model terhubung.</p>
            <p className="mt-1 text-sm text-ink-2">
              Tambahkan penyedia di bawah, lalu pilih satu model sebagai default.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {rows.map(({ preset: p, credential: c }) => {
              const cached = c?.cachedModels ?? [];
              const busy = rowBusy === p.id;
              const isRefreshing = refreshing === p.id;
              return (
                <li
                  key={p.id}
                  className={cn(
                    'rounded-xl border bg-surface p-4 shadow-xs transition-colors',
                    p.isDefault ? 'border-accent/35' : 'border-line',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">{p.name}</span>
                        {p.isDefault && (
                          <Badge tone="ready" dot>
                            Default
                          </Badge>
                        )}
                        {c?.isValid === false && <Badge tone="danger">Kunci ditolak</Badge>}
                      </div>
                      <p className="font-mono text-[11px] text-ink-3">
                        {PROVIDER_LABEL[p.provider] ?? p.provider}
                        {c ? ` · ····${c.keyLast4}` : ' · kredensial tidak ditemukan'}
                        {c && !p.credentialId ? ' · kredensial aktif penyedia' : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      {!p.isDefault && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void patchPreset(p.id, { isDefault: true }, 'Model default diperbarui')}
                        >
                          <Star className="h-3.5 w-3.5" aria-hidden="true" />
                          Jadikan default
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Hapus ${p.name}`}
                        disabled={busy}
                        onClick={() => void removeRow(p)}
                        className="text-danger-ink hover:bg-danger-soft"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <ModelPicker
                        label={p.name}
                        value={p.modelId}
                        options={cached}
                        disabled={busy || isRefreshing}
                        onSelect={(modelId) =>
                          void patchPreset(p.id, { modelId }, `Model ${p.name} diperbarui`)
                        }
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Ambil ulang daftar model untuk ${p.name}`}
                        disabled={busy || isRefreshing || !c}
                        onClick={() => void refreshModels(p, c)}
                      >
                        <RefreshCw
                          className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')}
                          aria-hidden="true"
                        />
                        <span className="hidden sm:inline">
                          {isRefreshing ? 'Mengambil...' : 'Segarkan'}
                        </span>
                      </Button>
                    </div>

                    <div className="flex w-full items-center gap-1.5 sm:ml-auto sm:w-auto">
                      <span className="text-[11px] font-medium text-ink-3">Reasoning</span>
                      <EffortSelect
                        label={p.name}
                        value={p.reasoningEffort}
                        busy={busy}
                        onChange={(next) =>
                          void patchPreset(p.id, { reasoningEffort: next }, 'Reasoning effort disimpan')
                        }
                      />
                    </div>
                  </div>

                  {cached.length === 0 && (
                    <p className="mt-2 text-[11px] text-ink-3">
                      Daftar model belum tersimpan. Klik Segarkan untuk mengambilnya dari penyedia, atau
                      isi ID manual.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {orphanCredentials.length > 0 && (
          <div className="space-y-2 rounded-xl border border-line bg-canvas/60 p-4">
            <p className="text-xs font-medium text-ink-2">Kredensial tanpa model</p>
            <ul className="space-y-1.5">
              {orphanCredentials.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-ink-2">
                    {c.label}{' '}
                    <span className="font-mono text-[11px] text-ink-3">
                      {PROVIDER_LABEL[c.provider] ?? c.provider} · ····{c.keyLast4}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Hapus kredensial ${c.label}`}
                    onClick={() => void removeOrphan(c.id)}
                    className="text-danger-ink hover:bg-danger-soft"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Secondary by design: with models connected this is a closed strip, not a form on top. */}
      <section aria-labelledby="add-heading" className="rounded-xl border border-line bg-surface">
        <h2 id="add-heading" className="sr-only">
          Tambah penyedia baru
        </h2>
        <button
          type="button"
          aria-expanded={addOpen}
          aria-controls="add-provider-panel"
          onClick={() => setAddOpen((v) => !v)}
          className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-subtle/60 sm:px-5"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">Tambah penyedia baru</span>
            <span className="block text-xs text-ink-3">
              Kunci API atau endpoint OpenAI-compatible
            </span>
          </span>
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-ink-3 transition-transform', addOpen && 'rotate-180')}
            aria-hidden="true"
          />
        </button>

        {addOpen && (
          <form
            id="add-provider-panel"
            className="space-y-5 border-t border-line px-4 py-5 sm:px-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSave) void save();
            }}
          >
            <fieldset className="space-y-2.5">
              <legend className="mb-2 text-xs font-medium text-ink-2">Penyedia</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {CHOICES.map((c) => {
                  const selected = provider === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setProvider(c.id);
                        setTest(null);
                        setSelectedModel('');
                        setBaseUrl('');
                      }}
                      className={cn(
                        'flex min-h-14 flex-col justify-center gap-0.5 rounded-lg border px-3.5 py-2.5 text-left transition-colors',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                        selected
                          ? 'border-accent bg-accent-soft/60'
                          : 'border-line bg-canvas hover:border-line-strong hover:bg-subtle/60',
                      )}
                    >
                      <span className="text-sm font-medium text-ink">{c.label}</span>
                      <span className="truncate font-mono text-[11px] text-ink-3">{c.hint}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {entry && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="api-key-input" className="block text-xs font-medium text-ink-2">
                    API key
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="api-key-input"
                      type={showKey ? 'text' : 'password'}
                      autoComplete="off"
                      placeholder={entry.keyPrefix ? `${entry.keyPrefix}...` : 'sk-...'}
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        setTest(null);
                        setSelectedModel('');
                      }}
                      className="min-h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-canvas px-3.5 py-2 font-mono text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
                    />
                    <Button
                      variant="secondary"
                      aria-label={showKey ? 'Sembunyikan kunci' : 'Tampilkan kunci'}
                      aria-pressed={showKey}
                      onClick={() => setShowKey((v) => !v)}
                    >
                      {showKey ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="base-url-input" className="block text-xs font-medium text-ink-2">
                      Base URL{' '}
                      {needsBaseUrl ? (
                        <span className="font-normal text-danger-ink">(wajib)</span>
                      ) : (
                        <span className="font-normal text-ink-3">(opsional)</span>
                      )}
                    </label>
                    <input
                      id="base-url-input"
                      required={needsBaseUrl}
                      placeholder={entry.defaultBaseUrl ?? 'https://api.example.com/v1'}
                      value={baseUrl}
                      onChange={(e) => {
                        setBaseUrl(e.target.value);
                        setTest(null);
                        setSelectedModel('');
                      }}
                      className="min-h-11 w-full rounded-lg border border-line-strong bg-canvas px-3.5 py-2 font-mono text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
                    />
                    {!needsBaseUrl && (
                      <p className="text-[11px] text-ink-3">Kosongkan untuk memakai endpoint bawaan.</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="label-input" className="block text-xs font-medium text-ink-2">
                      Label <span className="font-normal text-ink-3">(opsional)</span>
                    </label>
                    <input
                      id="label-input"
                      placeholder={PROVIDER_LABEL[provider] ?? provider}
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      className="min-h-11 w-full rounded-lg border border-line-strong bg-canvas px-3.5 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-ink-2">Reasoning effort</span>
                    <EffortSelect label="penyedia baru" value={effort} onChange={setEffort} />
                  </div>
                  <p className="text-[11px] text-ink-3">
                    Dipakai model ini saat memanggil penyedia. Default mengikuti setelan penyedia.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
                  <Button variant="secondary" onClick={() => void runTest()} disabled={!canTest || testing}>
                    <Plug className="h-4 w-4" aria-hidden="true" />
                    {testing ? 'Menguji koneksi...' : 'Ambil daftar model'}
                  </Button>
                  <Button type="submit" variant="primary" disabled={!canSave}>
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    {saving ? 'Menyimpan...' : 'Simpan sebagai default'}
                  </Button>
                </div>

                {test && (
                  <div
                    role="status"
                    className={cn(
                      'space-y-3 rounded-xl border p-4 text-sm',
                      test.ok ? 'border-ready/30 bg-ready-soft/60' : 'border-danger/35 bg-danger-soft',
                    )}
                  >
                    {test.ok ? (
                      <>
                        <p className="font-medium text-ready-ink">
                          Koneksi berhasil
                          {models.length > 0 ? `, ${models.length} model tersedia` : ''}
                        </p>
                        <div className="space-y-1.5">
                          <span className="block text-xs font-medium text-ink-2">Model</span>
                          <ModelPicker
                            label="penyedia baru"
                            value={selectedModel}
                            options={models}
                            onSelect={setSelectedModel}
                          />
                        </div>
                        {models.length === 0 && (
                          <p className="text-xs text-ink-2">
                            Penyedia tidak mengembalikan daftar model. Isi ID model yang kamu pakai.
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-start gap-2 text-danger-ink">
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                          <div>
                            <span className="font-medium">Uji koneksi gagal. </span>
                            <span>{test.reason}</span>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label htmlFor="manual-model-fallback" className="block text-xs font-medium text-ink">
                            ID model
                          </label>
                          <input
                            id="manual-model-fallback"
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            placeholder="deepseek-chat"
                            className="min-h-10 w-full rounded-lg border border-line-strong bg-canvas px-3 py-1.5 font-mono text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
                          />
                          <p className="text-xs text-ink-2">
                            Sebagian penyedia menolak daftar model. Isi ID model yang kamu pakai lalu simpan;
                            kredensial disimpan tanpa uji koneksi.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </form>
        )}
      </section>
    </div>
  );
}
