'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Eye,
  EyeOff,
  Pencil,
  Plug,
  Star,
  Trash2,
  AlertCircle,
  CheckCircle2,
  KeyRound,
} from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { Badge, Button, useToast } from '@/components/ui';
import { useAppShell } from '@/components/AppShellContext';
import { cn } from '@/lib/cn';

type ProviderId = 'openai' | 'anthropic' | 'google' | 'groq' | 'openrouter' | 'ollama' | 'custom';

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
  modelId: string;
  baseUrl: string | null;
  isDefault: boolean;
}

interface TestResult {
  ok: boolean;
  reason?: string;
  models?: string[];
  latencyMs?: number;
}

export default function ModelsPage() {
  const { toast } = useToast();
  const { refreshActiveModel } = useAppShell();

  const [providers, setProviders] = useState<CatalogEntry[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const [provider, setProvider] = useState<ProviderId | ''>('');
  const [mode, setMode] = useState<'subscription' | 'byok'>('byok');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [label, setLabel] = useState('');
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [selectedModel, setSelectedModel] = useState('');
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
      setProviders(cat.providers);
      setCredentials(creds.credentials);
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

  const entry = providers.find((p) => p.id === provider);
  const savedCred = provider
    ? credentials.find((c) => c.provider === provider && c.isActive && c.isValid !== false)
    : undefined;
  const canTest =
    provider !== '' && (mode === 'byok' ? apiKey.trim().length > 0 : Boolean(savedCred));
  const testPassed = test?.ok === true;
  const models = testPassed && test?.models ? test.models : [];

  async function runTest() {
    if (!provider) return;
    setTesting(true);
    setTest(null);
    setSelectedModel('');
    setError(null);
    try {
      const body: Record<string, unknown> = { provider };
      if (mode === 'byok') {
        if (apiKey.trim()) body.apiKey = apiKey.trim();
        if (baseUrl.trim()) body.baseUrl = baseUrl.trim();
      }
      const r = await api.post<TestResult>('/providers/test', body);
      setTest(r);
      if (r.ok && r.models && r.models.length > 0) {
        setSelectedModel(r.models[0] ?? '');
      }
    } catch (e) {
      if (e instanceof ApiError) setTest({ ok: false, reason: e.message });
      else setTest({ ok: false, reason: 'Gagal menguji koneksi penyedia.' });
    }
    setTesting(false);
  }

  async function save() {
    if (!provider || !selectedModel) return;
    setSaving(true);
    setError(null);
    try {
      const cred = await api.post<Credential>('/settings/credentials', {
        provider,
        label: label.trim() || entry?.label || provider,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || undefined,
        test: true,
      });
      await api.post('/settings/presets', {
        name: label.trim() || entry?.label || provider,
        provider,
        credentialId: cred.id,
        modelId: selectedModel,
        isDefault: true,
      });
      toast({
        tone: 'success',
        title: 'Kredensial dan preset tersimpan',
        description: `Model default sekarang ${selectedModel}.`,
      });
      setApiKey('');
      setLabel('');
      setBaseUrl('');
      setTest(null);
      setSelectedModel('');
      await load();
      refreshActiveModel();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan kredensial');
    }
    setSaving(false);
  }

  async function removeCredential(id: string) {
    setError(null);
    try {
      await api.delete(`/settings/credentials?id=${id}&mode=soft`);
      toast({ tone: 'info', title: 'Kredensial dihapus' });
      await load();
      refreshActiveModel();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menghapus kredensial');
    }
  }

  async function savePresetModel(id: string) {
    if (!editModel.trim()) return;
    try {
      await api.patch(`/settings/presets?id=${id}`, { modelId: editModel.trim() });
      setEditing(null);
      toast({ tone: 'success', title: 'Model preset diperbarui' });
      await load();
      refreshActiveModel();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal memperbarui preset');
    }
  }

  async function removePreset(id: string) {
    setError(null);
    try {
      await api.delete(`/settings/presets?id=${id}`);
      toast({ tone: 'info', title: 'Preset dihapus' });
      await load();
      refreshActiveModel();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menghapus preset');
    }
  }

  async function makeDefault(id: string) {
    try {
      await api.patch(`/settings/presets?id=${id}`, { isDefault: true });
      toast({ tone: 'success', title: 'Preset default diperbarui' });
      await load();
      refreshActiveModel();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menjadikan default');
    }
  }

  if (state === 'loading') {
    return (
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <div className="h-7 w-40 rounded-lg bg-subtle animate-pulse" />
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-xl border border-line bg-surface animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-5 py-7 sm:px-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Models dan kredensial</h1>
        <p className="text-sm text-ink-2">
          Pilih penyedia AI dan model default untuk wawancara serta penulisan spesifikasi di seluruh
          studio.
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

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (testPassed) void save();
        }}
      >
        {/* Step 1 */}
        <section className="rounded-xl border border-line bg-surface p-5 shadow-panel">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-subtle font-mono text-xs font-semibold text-ink">
              1
            </span>
            <h2 className="text-base font-semibold text-ink">Pilih penyedia</h2>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {providers.map((p) => {
              const cred = credentials.find(
                (c) => c.provider === p.id && c.isActive && c.isValid !== false,
              );
              const selected = provider === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setProvider(p.id);
                    setTest(null);
                    setMode(p.authStyle === 'api-key' ? 'byok' : 'subscription');
                  }}
                  className={cn(
                    'flex min-h-14 items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left transition-colors',
                    selected
                      ? 'border-accent bg-accent-soft/60 text-ink'
                      : 'border-line bg-canvas/50 text-ink hover:border-line-strong hover:bg-subtle/60',
                  )}
                >
                  <span className="text-sm font-medium text-ink">{p.label}</span>
                  <Badge tone={cred ? 'ready' : 'neutral'} dot>
                    {cred ? 'Terhubung' : 'Belum'}
                  </Badge>
                </button>
              );
            })}
          </div>
        </section>

        {/* Step 2 */}
        {entry && (
          <section className="rounded-xl border border-line bg-surface p-5 shadow-panel space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-subtle font-mono text-xs font-semibold text-ink">
                2
              </span>
              <h2 className="text-base font-semibold text-ink">Kunci akses ({entry.label})</h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Cara mengakses">
              {entry.authStyle !== 'api-key' && (
                <label
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3.5 transition-colors',
                    mode === 'subscription'
                      ? 'border-accent bg-accent-soft/50'
                      : 'border-line bg-canvas/40 hover:border-line-strong',
                  )}
                >
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === 'subscription'}
                    onChange={() => setMode('subscription')}
                    className="mt-1 accent-[var(--accent)]"
                  />
                  <div>
                    <span className="block text-sm font-medium text-ink">
                      Pakai kredensial tersimpan
                    </span>
                    <span className="block text-xs text-ink-2 mt-0.5">
                      Gunakan akun {entry.label} yang sudah terhubung sebelumnya.
                    </span>
                  </div>
                </label>
              )}

              <label
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-3.5 transition-colors',
                  mode === 'byok'
                    ? 'border-accent bg-accent-soft/50'
                    : 'border-line bg-canvas/40 hover:border-line-strong',
                )}
              >
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'byok'}
                  onChange={() => setMode('byok')}
                  className="mt-1 accent-[var(--accent)]"
                />
                <div>
                  <span className="block text-sm font-medium text-ink">
                    BYOK: bawa kunci API sendiri
                  </span>
                  <span className="block text-xs text-ink-2 mt-0.5">
                    Kunci disimpan terenkripsi; pemakaian ditagih langsung oleh penyedia.
                  </span>
                </div>
              </label>
            </div>

            {mode === 'byok' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2 space-y-1.5">
                  <label htmlFor="api-key-input" className="block text-sm font-medium text-ink">
                    API key
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="api-key-input"
                      type={showKey ? 'text' : 'password'}
                      autoComplete="off"
                      placeholder={`${entry.keyPrefix}...`}
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        setTest(null);
                      }}
                      className="flex-1 min-h-11 rounded-lg border border-line-strong bg-canvas px-3.5 py-2 font-mono text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
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
                      <span className="hidden sm:inline">{showKey ? 'Sembunyikan' : 'Tampilkan'}</span>
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="base-url-input" className="block text-sm font-medium text-ink">
                    Base URL <span className="font-normal text-ink-3">(opsional)</span>
                  </label>
                  <input
                    id="base-url-input"
                    placeholder={entry.defaultBaseUrl ?? 'http://localhost:11434/v1'}
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    className="w-full min-h-11 rounded-lg border border-line-strong bg-canvas px-3.5 py-2 font-mono text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
                  />
                  <p className="text-xs text-ink-3">
                    {entry.needsBaseUrl
                      ? 'Wajib diisi untuk penyedia ini.'
                      : 'Kosongkan untuk memakai endpoint bawaan penyedia.'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="label-input" className="block text-sm font-medium text-ink">
                    Label <span className="font-normal text-ink-3">(opsional)</span>
                  </label>
                  <input
                    id="label-input"
                    placeholder={entry.label}
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    className="w-full min-h-11 rounded-lg border border-line-strong bg-canvas px-3.5 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink-2">
                {savedCred
                  ? 'Memakai kredensial tersimpan untuk penyedia ini. Uji koneksi dulu agar daftar model muncul.'
                  : 'Belum ada kredensial tersimpan untuk penyedia ini. Pilih BYOK untuk menguji kunci API baru.'}
              </p>
            )}
          </section>
        )}

        {/* Step 3 */}
        {entry && (
          <section className="rounded-xl border border-line bg-surface p-5 shadow-panel space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-subtle font-mono text-xs font-semibold text-ink">
                3
              </span>
              <h2 className="text-base font-semibold text-ink">Uji koneksi dan simpan</h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Button variant="secondary" onClick={() => void runTest()} disabled={!canTest || testing}>
                <Plug className="h-4 w-4" aria-hidden="true" />
                {testing ? 'Menguji koneksi...' : 'Uji koneksi'}
              </Button>
              <Button type="submit" variant="primary" disabled={!testPassed || !selectedModel || saving}>
                <Check className="h-4 w-4" aria-hidden="true" />
                {saving
                  ? 'Menyimpan...'
                  : selectedModel
                    ? 'Simpan dan jadikan default'
                    : 'Pilih model setelah uji berhasil'}
              </Button>
            </div>

            {test && (
              <div
                role="status"
                className={cn(
                  'rounded-xl border p-4 text-sm',
                  test.ok
                    ? 'border-ready/30 bg-ready-soft/60'
                    : 'border-danger/35 bg-danger-soft',
                )}
              >
                {test.ok ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 font-medium text-ready-ink">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      <span>
                        Koneksi berhasil
                        {test.latencyMs ? ` (${test.latencyMs} ms)` : ''}
                      </span>
                    </div>
                    {models.length === 0 ? (
                      <p className="text-xs text-ink-2">Tidak ada daftar model yang dikembalikan.</p>
                    ) : (
                      <fieldset className="space-y-2">
                        <legend className="text-xs font-medium text-ink-2">
                          Pilih model untuk preset utama
                        </legend>
                        <div className="grid max-h-56 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                          {models.map((m) => (
                            <label
                              key={m}
                              className={cn(
                                'flex min-h-10 items-center gap-2.5 rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors',
                                selectedModel === m
                                  ? 'border-accent bg-surface text-ink font-medium'
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
                    )}
                  </div>
                ) : (
                  <div className="flex items-start gap-2 text-danger-ink">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <div>
                      <span className="font-medium">Pengujian gagal. </span>
                      <span>{test.reason}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </form>

      {/* Saved Presets & Credentials */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-ink">Preset tersimpan</h2>
          {presets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-strong bg-surface/60 p-5 text-sm text-ink-2">
              Belum ada preset tersimpan. Hubungkan satu penyedia di atas untuk mulai menulis
              spesifikasi.
            </div>
          ) : (
            <ul className="space-y-2.5">
              {presets.map((p) => (
                <li
                  key={p.id}
                  className="rounded-xl border border-line bg-surface p-4 shadow-xs"
                >
                  {editing === p.id ? (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label htmlFor={`edit-model-${p.id}`} className="text-xs font-medium text-ink-2">
                          ID Model
                        </label>
                        <input
                          id={`edit-model-${p.id}`}
                          value={editModel}
                          onChange={(e) => setEditModel(e.target.value)}
                          autoFocus
                          className="w-full min-h-10 rounded-lg border border-line-strong bg-canvas px-3 py-1.5 font-mono text-sm text-ink focus:border-accent focus:outline-none"
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
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-ink">{p.name}</span>
                          {p.isDefault && (
                            <Badge tone="ready" dot>
                              Default
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 truncate font-mono text-xs text-ink-3">
                          {p.provider} · {p.modelId}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {!p.isDefault && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void makeDefault(p.id)}
                            title="Jadikan preset default"
                          >
                            <Star className="h-3.5 w-3.5" aria-hidden="true" />
                            Default
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
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Hapus preset ${p.name}`}
                          onClick={() => void removePreset(p.id)}
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
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-ink">Kredensial API tersimpan</h2>
          {credentials.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-strong bg-surface/60 p-5 text-sm text-ink-2">
              Belum ada kredensial API tersimpan.
            </div>
          ) : (
            <ul className="space-y-2.5">
              {credentials.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 shadow-xs"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-ink-2">
                      <KeyRound className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{c.label}</p>
                      <p className="font-mono text-xs text-ink-3">
                        {c.provider} · ····{c.keyLast4}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      tone={c.isValid === true ? 'ready' : c.isValid === false ? 'danger' : 'neutral'}
                      dot
                    >
                      {c.isValid === true ? 'Valid' : c.isValid === false ? 'Invalid' : 'Belum diuji'}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Hapus kredensial ${c.label}`}
                      onClick={() => void removeCredential(c.id)}
                      className="text-danger-ink hover:bg-danger-soft"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
