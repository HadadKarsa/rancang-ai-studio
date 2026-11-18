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
    <div className="wrap">
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

      <style jsx>{`
        .wrap { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 28px; }
        .head h1 { font-size: 30px; letter-spacing: -0.02em; }
        .head p { margin-top: 4px; }
        .form { padding: 28px; display: flex; flex-direction: column; gap: 30px; }
        .step { font-size: 11px; letter-spacing: 0.1em; color: var(--ink-2); display: flex; align-items: center; gap: 10px; }
        .step span { width: 22px; height: 22px; border-radius: 50%; background: var(--ink); color: var(--paper); display: grid; place-items: center; font-size: 10px; }
        .prov-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; margin-top: 12px; }
        .prov { border: 1.5px solid var(--line-2); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; background: var(--card); text-align: left; }
        .prov:hover { border-color: var(--ink); }
        .prov.on { border-color: var(--ink); background: var(--paper); box-shadow: inset 0 0 0 1px var(--ink); }
        .pname { font-weight: 700; font-size: 14px; }
        .modes { display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
        .mode { flex: 1; min-width: 240px; border: 1.5px solid var(--line-2); border-radius: 12px; padding: 14px 16px; display: flex; gap: 10px; cursor: pointer; background: var(--card); }
        .mode.on { border-color: var(--ink); box-shadow: inset 0 0 0 1px var(--ink); }
        .mode input { margin-top: 3px; accent-color: var(--vermilion); }
        .mode strong { font-size: 14px; }
        .mode p { margin-top: 3px; }
        .byok { display: flex; flex-direction: column; gap: 14px; margin-top: 14px; }
        .note { margin-top: 12px; }
        .row { display: flex; gap: 10px; margin-top: 12px; }
        .result { display: flex; gap: 12px; align-items: flex-start; margin-top: 14px; border: 1.5px solid var(--line); border-radius: 12px; padding: 14px 16px; font-size: 13.5px; }
        .result.pass { border-color: var(--ok); background: color-mix(in srgb, var(--ok) 6%, var(--card)); }
        .result.fail { border-color: var(--vermilion); background: var(--vermilion-wash); }
        .lamp { width: 10px; height: 10px; border-radius: 50%; margin-top: 4px; flex: none; }
        .lamp.ok { background: var(--ok); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ok) 20%, transparent); }
        .lamp.err { background: var(--vermilion); box-shadow: 0 0 0 3px var(--vermilion-wash); }
        .res-body { display: flex; flex-direction: column; gap: 8px; }
        .models { display: flex; gap: 6px; flex-wrap: wrap; }
        .chip-m { font-size: 10.5px; border: 1px solid var(--line-2); border-radius: 99px; padding: 3px 9px; color: var(--ink-2); }
        .h { font-size: 10.5px; letter-spacing: 0.12em; color: var(--ink-3); margin-bottom: 10px; }
        .list ul { list-style: none; display: flex; flex-direction: column; gap: 8px; }
        .cred { padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .right { display: flex; gap: 10px; align-items: center; }
        .small { font-size: 12px; }
        .alert { border: 1.5px solid var(--vermilion); background: var(--vermilion-wash); color: var(--vermilion-ink); border-radius: 10px; padding: 10px 14px; font-size: 13.5px; }
      `}</style>
    </div>
  );
}
