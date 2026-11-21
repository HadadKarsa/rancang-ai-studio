'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/client/api';

/* ── Types (mirror forge's /api/v1) ───────────────────────────────── */
type ProviderId = 'openai' | 'anthropic' | 'google' | 'groq' | 'openrouter' | 'ollama' | 'custom';
interface CatalogEntry {
  id: ProviderId; label: string; authStyle: 'api-key' | 'subscription' | 'none';
  keyPrefix: string; defaultBaseUrl: string | null; needsBaseUrl: boolean;
  suggestedModels: string[]; docsUrl: string;
}
interface Credential {
  id: string; provider: ProviderId; label: string; keyLast4: string;
  baseUrl: string | null; isActive: boolean; isValid: boolean | null;
  lastValidatedAt: string | null; createdAt: string;
}
interface Preset {
  id: string; name: string; provider: ProviderId; modelId: string;
  baseUrl: string | null; isDefault: boolean;
}
interface TestResult {
  ok: boolean; reason?: string; models?: string[]; latencyMs?: number;
}

const STATUS_ID = {
  connected: { label: 'TERHUBUNG', cls: 'ok' },
  none: { label: 'BELUM', cls: '' },
} as const;

export default function ModelsPage() {
  const [providers, setProviders] = useState<CatalogEntry[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  /* form state */
  const [provider, setProvider] = useState<ProviderId | ''>('');
  const [mode, setMode] = useState<'subscription' | 'byok'>('subscription');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [label, setLabel] = useState('');
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [selectedModel, setSelectedModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  /* edit a saved preset inline */
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
      setError(e instanceof ApiError ? e.message : 'Gagal memuat pengaturan');
      setState('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const entry = providers.find((p) => p.id === provider);
  const canTest = provider !== '' && (mode === 'subscription' || apiKey.trim().length > 0);
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
    } catch (e) {
      if (e instanceof ApiError) setTest({ ok: false, reason: e.message });
      else setTest({ ok: false, reason: 'Gagal menguji koneksi' });
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
      try {
        await api.post('/settings/presets', {
          name: label.trim() || entry?.label || provider,
          provider,
          credentialId: cred.id,
          modelId: selectedModel,
          isDefault: true,
        });
      } catch (pe) {
        throw new Error(
          pe instanceof ApiError
            ? `Kredensial tersimpan, tetapi preset gagal dibuat: ${pe.message}`
            : 'Kredensial tersimpan, tetapi preset gagal dibuat.',
        );
      }
      setSaved(true);
      setApiKey('');
      setLabel('');
      setBaseUrl('');
      setTest(null);
      setSelectedModel('');
      await load();
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan kredensial');
    }
    setSaving(false);
  }

  async function removeCredential(id: string) {
    setError(null);
    try {
      await api.delete(`/settings/credentials?id=${id}&mode=soft`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menghapus kredensial');
    }
  }

  async function savePresetModel(id: string) {
    if (!editModel.trim()) return;
    try {
      await api.patch(`/settings/presets?id=${id}`, { modelId: editModel.trim() });
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal memperbarui preset');
    }
  }

  async function removePreset(id: string) {
    setError(null);
    try {
      await api.delete(`/settings/presets?id=${id}`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menghapus preset');
    }
  }

  async function makeDefault(id: string) {
    try {
      await api.patch(`/settings/presets?id=${id}`, { isDefault: true });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menjadikan default');
    }
  }

  if (state === 'loading') return <div className="mono muted" style={{ padding: 40 }}>memuat…</div>;

  return (
    <div className="pg-models">
      <header className="head">
        <h1>Models</h1>
        <p className="muted">Satu sumber kecerdasan untuk seluruh studio: langganan yang sudah ada, atau kunci sendiri.</p>
      </header>

      {error && <div className="alert" role="alert">{error}</div>}

      <form className="card form" onSubmit={(e) => { e.preventDefault(); if (testPassed) void save(); }}>
        {/* 1 — provider */}
        <section>
          <h2 className="step mono"><span>1</span> Pilih penyedia</h2>
          <div className="prov-grid">
            {providers.map((p) => {
              const cred = credentials.find((c) => c.provider === p.id && c.isActive && c.isValid !== false);
              const st = cred ? STATUS_ID.connected : STATUS_ID.none;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`prov ${provider === p.id ? 'on' : ''}`}
                  aria-pressed={provider === p.id}
                  onClick={() => { setProvider(p.id); setTest(null); setMode(p.authStyle === 'api-key' ? 'byok' : 'subscription'); }}
                >
                  <span className="pname">{p.label}</span>
                  <span className={`pill ${st.cls}`}><span className="dot" />{st.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 2 — key */}
        {entry && (
          <section>
            <h2 className="step mono"><span>2</span> Kunci akses</h2>
            <div className="modes" role="radiogroup" aria-label="Cara mengakses">
              {entry.authStyle !== 'api-key' && (
                <label className={`mode ${mode === 'subscription' ? 'on' : ''}`}>
                  <input type="radio" name="mode" checked={mode === 'subscription'} onChange={() => setMode('subscription')} />
                  <div>
                    <strong>Pakai langganan yang ada</strong>
                    <p className="muted small">Masuk dengan akun {entry.label} yang sudah kamu bayar.</p>
                  </div>
                </label>
              )}
              <label className={`mode ${mode === 'byok' ? 'on' : ''}`}>
                <input type="radio" name="mode" checked={mode === 'byok'} onChange={() => setMode('byok')} />
                <div>
                  <strong>BYOK — bawa kunci sendiri</strong>
                  <p className="muted small">Tempel kunci API; bayar pemakaian langsung ke penyedia.</p>
                </div>
              </label>
            </div>

            {mode === 'byok' && (
              <div className="byok">
                <div className="field">
                  <label htmlFor="k">API key</label>
                  <div className="key-wrap">
                    <input
                      id="k"
                      type={showKey ? 'text' : 'password'}
                      autoComplete="off"
                      placeholder={`${entry.keyPrefix}…`}
                      value={apiKey}
                      onChange={(e) => { setApiKey(e.target.value); setTest(null); }}
                    />
                    <button
                      type="button"
                      className="key-eye"
                      aria-label={showKey ? 'Sembunyikan kunci' : 'Tampilkan kunci'}
                      aria-pressed={showKey}
                      onClick={() => setShowKey((v) => !v)}
                    >
                      {showKey ? 'Sembunyikan' : 'Tampilkan'}
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="u">Base URL <span className="muted">(opsional)</span></label>
                  <input
                    id="u"
                    placeholder={entry.defaultBaseUrl ?? 'http://localhost:11434/v1'}
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                  />
                  <span className="help">{entry.needsBaseUrl ? 'Wajib untuk penyedia ini.' : 'Kosongkan untuk memakai alamat bawaan penyedia.'}</span>
                </div>
                <div className="field">
                  <label htmlFor="l">Label <span className="muted">(opsional)</span></label>
                  <input id="l" placeholder={entry.label} value={label} onChange={(e) => setLabel(e.target.value)} />
                </div>
              </div>
            )}

            {mode === 'subscription' && (
              <p className="muted small note">
                Kunci disimpan terenkripsi (AES-256-GCM). Uji dulu — tombol simpan terbuka setelah lolos.
              </p>
            )}
          </section>
        )}

        {/* 3 — test + save */}
        {entry && (
          <section>
            <h2 className="step mono"><span>3</span> Uji &amp; simpan</h2>
            <div className="row">
              <button type="button" className="btn" onClick={() => void runTest()} disabled={!canTest || testing}>
                {testing ? 'Menguji…' : 'Uji koneksi'}
              </button>
              <button type="submit" className="btn primary" disabled={!testPassed || !selectedModel || saving}>
                {saving ? 'Menyimpan…' : saved ? 'Tersimpan ✓' : selectedModel ? 'Simpan kredensial' : 'Simpan — pilih model dulu'}
              </button>
            </div>

            {test && (
              <div className={`result ${test.ok ? 'pass' : 'fail'}`} role="status">
                <span className={`lamp ${test.ok ? 'ok' : 'err'}`} aria-hidden="true" />
                {test.ok ? (
                  <div className="res-body">
                    <strong>Koneksi berhasil{test.latencyMs ? ` · ${test.latencyMs} ms` : ''}</strong>
                    {models.length === 0 ? (
                      <p className="muted small">Tidak ada model terdeteksi.</p>
                    ) : (
                      <fieldset className="pick">
                        <legend className="small muted">Pilih model untuk preset utama</legend>
                        <div role="listbox" aria-label="Model terdeteksi" className="pick-list">
                          {models.map((m) => (
                            <label key={m} className={`pick-item ${selectedModel === m ? 'on' : ''}`}>
                              <input
                                type="radio"
                                name="model"
                                value={m}
                                checked={selectedModel === m}
                                onChange={() => setSelectedModel(m)}
                              />
                              <span className="mono pick-name">{m}</span>
                              <span className="pick-mark" aria-hidden="true" />
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    )}
                  </div>
                ) : (
                  <div className="res-body"><strong>Gagal.</strong> <span className="muted">{test.reason}</span></div>
                )}
              </div>
            )}
          </section>
        )}
      </form>

      {/* saved presets — readable rows with edit / default / delete */}
      <section className="list">
        <h2 className="mono h">PRESET TERSIMPAN</h2>
        {presets.length === 0 ? (
          <p className="muted small">Belum ada preset. Simpan satu di atas untuk mulai membuat dokumen.</p>
        ) : (
          <ul>
            {presets.map((p) => (
              <li key={p.id} className="card cred">
                {editing === p.id ? (
                  <div className="edit-row">
                    <div className="field">
                      <label htmlFor={`m-${p.id}`}>Model</label>
                      <input
                        id={`m-${p.id}`}
                        className="mono"
                        value={editModel}
                        onChange={(e) => setEditModel(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="right">
                      <button type="button" className="btn ghost" onClick={() => void savePresetModel(p.id)}>Simpan</button>
                      <button type="button" className="btn ghost" onClick={() => setEditing(null)}>Batal</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="cred-main">
                      <strong>{p.name}</strong>
                      {p.isDefault && <span className="pill ok"><span className="dot" />default</span>}
                      <span className="mono muted small"> · {p.provider} · {p.modelId}</span>
                    </div>
                    <div className="right">
                      {!p.isDefault && <button type="button" className="btn ghost sm" onClick={() => void makeDefault(p.id)}>Jadikan default</button>}
                      <button type="button" className="btn ghost sm" onClick={() => { setEditing(p.id); setEditModel(p.modelId); }}>Edit</button>
                      <button type="button" className="btn ghost sm" onClick={() => void removePreset(p.id)}>Hapus</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="list">
        <h2 className="mono h">KREDENSIAL TERSIMPAN</h2>
        {credentials.length === 0 && <p className="muted small">Belum ada. Simpan satu di atas untuk mulai membuat dokumen.</p>}
        <ul>
          {credentials.map((c) => (
            <li key={c.id} className="card cred">
              <div className="cred-main">
                <strong>{c.label}</strong>
                <span className="mono muted small"> · {c.provider} · ····{c.keyLast4}</span>
              </div>
              <div className="right">
                <span className={`pill ${c.isValid === true ? 'ok' : c.isValid === false ? 'err' : ''}`}>
                  <span className="dot" />{c.isValid === true ? 'valid' : c.isValid === false ? 'invalid' : 'belum diuji'}
                </span>
                <button type="button" className="btn ghost sm" onClick={() => void removeCredential(c.id)}>Hapus</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
