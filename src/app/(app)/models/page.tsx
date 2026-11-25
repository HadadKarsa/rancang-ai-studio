'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Pencil,
  Plug,
  Search,
  Star,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { Badge, Button, useToast } from '@/components/ui';
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
  createdAt: string;
}

interface Preset {
  id: string;
  name: string;
  provider: ProviderId;
  credentialId: string | null;
  modelId: string;
  baseUrl: string | null;
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
 * provider has credentialId = null — that preset resolves to the provider's
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

export default function ModelsPage() {
  const { toast } = useToast();
  const { refreshActiveModel } = useAppShell();

  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const [provider, setProvider] = useState<ProviderId | ''>('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [label, setLabel] = useState('');
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [selectedModel, setSelectedModel] = useState('');
  const [manualModel, setManualModel] = useState(false);
  const [modelQuery, setModelQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<string | null>(null);
  const [editModel, setEditModel] = useState('');

  const load = useCallback(async () => {
    setState('loading');
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

  const visibleModels = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.toLowerCase().includes(q));
  }, [models, modelQuery]);

  // One row per connected model: a preset is the row, its credential supplies last4.
  const rows = useMemo(
    () => presets.map((p) => ({ preset: p, credential: resolvedCredential(p, credentials) })),
    [presets, credentials],
  );

  /** Credentials no preset points at — shown so nothing is stranded, deletable on their own. */
  const orphanCredentials = useMemo(
    () => credentials.filter((c) => !isCredentialClaimed(c, presets)),
    [presets, credentials],
  );

  async function runTest() {
    if (!provider) return;
    setTesting(true);
    setTest(null);
    setSelectedModel('');
    setModelQuery('');
    setError(null);
    try {
      const body: Record<string, unknown> = { provider, apiKey: apiKey.trim() };
      if (baseUrl.trim()) body.baseUrl = baseUrl.trim();
      const r = await api.post<TestResult>('/providers/test', body);
      setTest(r);
      if (r.ok && r.models && r.models.length > 0) {
        setSelectedModel(r.models[0] ?? '');
        setManualModel(false);
      } else if (r.ok) {
        setManualModel(true);
      }
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
        test: testPassed,
      });
      const credentialId = res.credential.id;
      await api.post('/settings/presets', {
        name: label.trim() || PROVIDER_LABEL[provider] || provider,
        provider,
        credentialId,
        modelId: model,
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
      setManualModel(false);
      setModelQuery('');
      await load();
      refreshActiveModel();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan model');
    }
    setSaving(false);
  }

  async function makeDefault(id: string) {
    try {
      await api.patch(`/settings/presets?id=${id}`, { isDefault: true });
      toast({ tone: 'success', title: 'Model default diperbarui' });
      await load();
      refreshActiveModel();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menjadikan default');
    }
  }

  async function savePresetModel(id: string) {
    if (!editModel.trim()) return;
    try {
      await api.patch(`/settings/presets?id=${id}`, { modelId: editModel.trim() });
      setEditing(null);
      toast({ tone: 'success', title: 'Model diperbarui' });
      await load();
      refreshActiveModel();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal memperbarui model');
    }
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
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        <div className="h-7 w-40 rounded-lg bg-subtle animate-pulse" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl border border-line bg-surface animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-5 py-7 sm:px-8">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Hubungkan model</h1>
        <p className="text-sm text-ink-2">
          Satu model default dipakai untuk wawancara dan penulisan spesifikasi di seluruh studio.
        </p>
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

      {hasDefault && (
        <Link
          href="/studio"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm font-medium text-ink shadow-xs transition-colors hover:bg-subtle"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Kembali ke Studio
        </Link>
      )}

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) void save();
        }}
      >
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Penyedia</h2>
          <div className="grid gap-2.5 sm:grid-cols-2">
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
                    setManualModel(false);
                    setModelQuery('');
                    setBaseUrl('');
                  }}
                  className={cn(
                    'flex min-h-16 flex-col justify-center gap-0.5 rounded-xl border px-4 py-3 text-left transition-colors',
                    selected
                      ? 'border-accent bg-accent-soft/60'
                      : 'border-line bg-surface hover:border-line-strong hover:bg-subtle/60',
                  )}
                >
                  <span className="text-sm font-medium text-ink">{c.label}</span>
                  <span className="font-mono text-[11px] text-ink-3">{c.hint}</span>
                </button>
              );
            })}
          </div>
        </section>

        {entry && (
          <section className="space-y-4 rounded-xl border border-line bg-surface p-5 shadow-panel">
            <h2 className="text-sm font-semibold text-ink">Kunci API</h2>

            <div className="space-y-1.5">
              <label htmlFor="api-key-input" className="block text-sm font-medium text-ink">
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
                    setManualModel(false);
                  }}
                  className="min-h-11 flex-1 rounded-lg border border-line-strong bg-canvas px-3.5 py-2 font-mono text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
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

            <div className="space-y-1.5">
              <label htmlFor="base-url-input" className="block text-sm font-medium text-ink">
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
                  setManualModel(false);
                }}
                className="min-h-11 w-full rounded-lg border border-line-strong bg-canvas px-3.5 py-2 font-mono text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
              />
              {!needsBaseUrl && (
                <p className="text-xs text-ink-3">Kosongkan untuk memakai endpoint bawaan penyedia.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="label-input" className="block text-sm font-medium text-ink">
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

            <div className="flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
              <Button variant="secondary" onClick={() => void runTest()} disabled={!canTest || testing}>
                <Plug className="h-4 w-4" aria-hidden="true" />
                {testing ? 'Menguji koneksi...' : 'Uji koneksi'}
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
                  'rounded-xl border p-4 text-sm',
                  test.ok ? 'border-ready/30 bg-ready-soft/60' : 'border-danger/35 bg-danger-soft',
                )}
              >
                {test.ok ? (
                  <div className="space-y-3">
                    <p className="font-medium text-ready-ink">Koneksi berhasil</p>

                    {models.length > 0 && !manualModel && (
                      <div className="space-y-2">
                        {models.length > 6 && (
                          <div className="relative">
                            <Search
                              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3"
                              aria-hidden="true"
                            />
                            <input
                              type="search"
                              value={modelQuery}
                              onChange={(e) => setModelQuery(e.target.value)}
                              placeholder={`Saring ${models.length} model...`}
                              aria-label="Saring model"
                              className="min-h-9 w-full rounded-lg border border-line-strong bg-canvas pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
                            />
                          </div>
                        )}
                        <fieldset>
                          <legend className="mb-2 text-xs font-medium text-ink-2">Pilih model</legend>
                          <div className="grid max-h-56 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                            {visibleModels.length === 0 && (
                              <p className="text-xs text-ink-2">Tidak ada model yang cocok.</p>
                            )}
                            {visibleModels.map((m) => (
                              <label
                                key={m}
                                className={cn(
                                  'flex min-h-10 items-center gap-2.5 rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors',
                                  selectedModel === m
                                    ? 'border-accent bg-surface font-medium text-ink'
                                    : 'border-line bg-surface/70 text-ink-2 hover:border-line-strong hover:text-ink',
                                )}
                              >
                                <input
                                  type="radio"
                                  name="model"
                                  value={m}
                                  checked={selectedModel === m}
                                  onChange={() => setSelectedModel(m)}
                                  className="accent-[var(--accent)]"
                                />
                                <span className="truncate">{m}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <button
                          type="button"
                          onClick={() => {
                            setManualModel(true);
                            setSelectedModel('');
                          }}
                          className="text-xs font-medium text-accent-ink underline underline-offset-2"
                        >
                          Model tidak ada di daftar? Isi manual
                        </button>
                      </div>
                    )}

                    {(models.length === 0 || manualModel) && (
                      <div className="space-y-1.5">
                        <label htmlFor="manual-model" className="block text-xs font-medium text-ink-2">
                          ID model
                        </label>
                        <input
                          id="manual-model"
                          value={selectedModel}
                          onChange={(e) => setSelectedModel(e.target.value)}
                          placeholder="mis. deepseek-chat atau gpt-4o-mini"
                          className="min-h-10 w-full rounded-lg border border-line-strong bg-canvas px-3 py-1.5 font-mono text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
                        />
                        <p className="text-xs text-ink-3">
                          {models.length === 0
                            ? 'Penyedia tidak mengembalikan daftar model. Isi ID model yang kamu pakai.'
                            : 'ID model diisi manual, daftar di atas diabaikan.'}
                        </p>
                        {manualModel && models.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setManualModel(false);
                              setSelectedModel(models[0] ?? '');
                            }}
                            className="text-xs font-medium text-accent-ink underline underline-offset-2"
                          >
                            Kembali ke daftar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-start gap-2 text-danger-ink">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <div>
                      <span className="font-medium">Uji koneksi gagal. </span>
                      <span>{test.reason}</span>
                    </div>
                  </div>
                )}
                {!test.ok && (
                  <div className="mt-3 space-y-1.5">
                    <label htmlFor="manual-model-fallback" className="block text-xs font-medium text-ink">
                      ID model
                    </label>
                    <input
                      id="manual-model-fallback"
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      placeholder="mis. deepseek-chat atau gpt-4o-mini"
                      className="min-h-10 w-full rounded-lg border border-line-strong bg-canvas px-3 py-1.5 font-mono text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
                    />
                    <p className="text-xs text-ink-2">
                      Sebagian penyedia menolak daftar model. Isi ID model yang kamu pakai, lalu simpan —
                      kredensial disimpan tanpa uji koneksi.
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </form>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Model terhubung</h2>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface/60 p-5 text-sm text-ink-2">
            Belum ada model terhubung. Pilih penyedia di atas dan simpan satu model sebagai default.
          </div>
        ) : (
          <ul className="space-y-2.5">
            {rows.map(({ preset: p, credential: c }) => (
              <li key={p.id} className="rounded-xl border border-line bg-surface p-4 shadow-xs">
                {editing === p.id ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label htmlFor={`edit-model-${p.id}`} className="text-xs font-medium text-ink-2">
                        ID model
                      </label>
                      <input
                        id={`edit-model-${p.id}`}
                        value={editModel}
                        onChange={(e) => setEditModel(e.target.value)}
                        autoFocus
                        className="min-h-10 w-full rounded-lg border border-line-strong bg-canvas px-3 py-1.5 font-mono text-sm text-ink focus:border-accent focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Batal
                      </Button>
                      <Button size="sm" variant="primary" onClick={() => void savePresetModel(p.id)}>
                        Simpan
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-ink">{p.name}</span>
                        <Badge tone="neutral">{PROVIDER_LABEL[p.provider] ?? p.provider}</Badge>
                        {p.isDefault && (
                          <Badge tone="ready" dot>
                            Default
                          </Badge>
                        )}
                      </div>
                      <p className="truncate font-mono text-xs text-ink-2">{p.modelId}</p>
                      <p className="font-mono text-[11px] text-ink-3">
                        {c ? `····${c.keyLast4}` : 'kredensial tidak ditemukan'}
                        {c && !p.credentialId ? ' · kredensial aktif penyedia' : ''}
                        {c?.isValid === false ? ' · kunci ditolak' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {!p.isDefault && (
                        <Button size="sm" variant="ghost" onClick={() => void makeDefault(p.id)}>
                          <Star className="h-3.5 w-3.5" aria-hidden="true" />
                          Jadikan default
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Ubah model ${p.name}`}
                        onClick={() => {
                          setEditing(p.id);
                          setEditModel(p.modelId);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">Ubah model</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Hapus ${p.name}`}
                        onClick={() => void removeRow(p)}
                        className="text-danger-ink hover:bg-danger-soft"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
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
    </div>
  );
}
