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
interface TestResult {
  ok: boolean; reason?: string; models?: string[]; latencyMs?: number;
}

const STATUS_ID = {
  connected: { label: 'TERHUBUNG', cls: 'ok' },
  expired: { label: 'SESI KEDALUWARSA', cls: 'err' },
  none: { label: 'BELUM', cls: '' },
} as const;

export default function ModelsPage() {
  const [providers, setProviders] = useState<CatalogEntry[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  /* form state */
  const [provider, setProvider] = useState<ProviderId | ''>('');
  const [mode, setMode] = useState<'subscription' | 'byok'>('subscription');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [label, setLabel] = useState('');
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [cat, creds] = await Promise.all([
        api.get<{ providers: CatalogEntry[] }>('/providers/test'),
        api.get<{ credentials: Credential[] }>('/settings/credentials'),
      ]);
      setProviders(cat.providers);
      setCredentials(creds.credentials);
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

  async function runTest() {
    if (!provider) return;
    setTesting(true);
    setTest(null);
    setError(null);
    try {
      const body: Record<string, unknown> = { provider };
      if (mode === 'byok') {
        body.apiKey = apiKey.trim();
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
    if (!provider || !apiKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.post('/settings/credentials', {
        provider,
        label: label.trim() || entry?.label || provider,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || undefined,
        test: true,
      });
      setSaved(true);
      setApiKey('');
      setLabel('');
      setTest(null);
      await load();
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menyimpan kredensial');
    }
    setSaving(false);
  }

  async function remove(id: string) {
    setError(null);
    try {
      await api.delete(`/settings/credentials?id=${id}&mode=soft`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menghapus kredensial');
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
                  <input id="k" type="password" autoComplete="off" placeholder={`${entry.keyPrefix}…`}
                    value={apiKey} onChange={(e) => { setApiKey(e.target.value); setTest(null); }} />
                </div>
                {entry.needsBaseUrl && (
                  <div className="field">
                    <label htmlFor="u">Base URL</label>
                    <input id="u" placeholder="http://localhost:11434/v1" value={baseUrl}
                      onChange={(e) => { setBaseUrl(e.target.value); setTest(null); }} />
                  </div>
                )}
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
              <button type="submit" className="btn primary" disabled={!testPassed || saving}>
                {saving ? 'Menyimpan…' : saved ? 'Tersimpan ✓' : 'Simpan kredensial'}
              </button>
            </div>

            {test && (
              <div className={`result ${test.ok ? 'pass' : 'fail'}`} role="status">
                <span className={`lamp ${test.ok ? 'ok' : 'err'}`} aria-hidden="true" />
                {test.ok ? (
                  <div className="res-body">
                    <strong>Koneksi berhasil{test.latencyMs ? ` · ${test.latencyMs} ms` : ''}</strong>
                    {test.models && test.models.length > 0 && (
                      <div className="models">
                        {test.models.slice(0, 6).map((m) => <span key={m} className="mono chip-m">{m}</span>)}
                      </div>
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

      <section className="list">
        <h2 className="mono h">KREDENSIAL TERSIMPAN</h2>
        {credentials.length === 0 && <p className="muted small">Belum ada. Simpan satu di atas untuk mulai membuat dokumen.</p>}
        <ul>
          {credentials.map((c) => (
            <li key={c.id} className="card cred">
              <div>
                <strong>{c.label}</strong>
                <span className="mono muted small"> · {c.provider} · ····{c.keyLast4}</span>
              </div>
              <div className="right">
                <span className={`pill ${c.isValid === true ? 'ok' : c.isValid === false ? 'err' : ''}`}>
                  <span className="dot" />{c.isValid === true ? 'valid' : c.isValid === false ? 'invalid' : 'belum diuji'}
                </span>
                <button type="button" className="btn ghost" onClick={() => void remove(c.id)}>Hapus</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

    </div>
  );
}
