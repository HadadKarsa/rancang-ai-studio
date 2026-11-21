'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/client/api';

interface Screen {
  id: string;
  name: string;
  slug: string;
  htmlContent: string;
  viewport: 'mobile' | 'tablet' | 'desktop';
  orderIndex: number;
  isEntry: boolean;
}

const VIEWPORTS: { id: 'desktop' | 'tablet' | 'mobile'; label: string; width: number }[] = [
  { id: 'desktop', label: 'Desktop', width: 1100 },
  { id: 'tablet', label: 'Tablet', width: 768 },
  { id: 'mobile', label: 'Mobile', width: 390 },
];

const SAMPLE = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body{font-family:system-ui,sans-serif;margin:0;padding:24px;color:#1d1a16;background:#fff}
  h1{font-size:22px;margin:0 0 8px}
  .bar{height:44px;border:1px solid #ddd;border-radius:8px;display:flex;align-items:center;padding:0 12px;color:#999;margin-bottom:16px}
  .row{display:flex;gap:12px}
  .box{flex:1;height:90px;border:1px dashed #bbb;border-radius:8px;display:grid;place-items:center;color:#999;font-size:13px}
</style></head><body>
  <h1>Layar Pertama</h1>
  <div class="bar">Cari…</div>
  <div class="row"><div class="box">Kartu</div><div class="box">Kartu</div></div>
</body></html>`;

/**
 * Wireframe HTML preview editor (contract §3).
 * Split pane: textarea left, sandboxed iframe srcdoc right. 400 ms debounce,
 * dirty state, Simpan via PATCH. The iframe has no allow-same-origin, so the
 * previewed HTML cannot reach this page's cookies or DOM.
 */
export function WireframeEditor({ projectId }: { projectId: string }) {
  const [screens, setScreens] = useState<Screen[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [html, setHtml] = useState('');
  const [saved, setSaved] = useState('');
  const [preview, setPreview] = useState('');
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'empty'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.get<{ screens: Screen[] }>(`/projects/${projectId}/wireframes`);
        if (!alive) return;
        setScreens(r.screens);
        if (r.screens.length === 0) { setState('empty'); return; }
        const first = r.screens[0]!;
        setActiveId(first.id);
        setHtml(first.htmlContent || SAMPLE);
        setSaved(first.htmlContent || SAMPLE);
        setPreview(first.htmlContent || SAMPLE);
        setViewport(first.viewport);
        setState('ready');
      } catch (e) {
        if (!alive) return;
        setError(e instanceof ApiError ? e.message : 'Gagal memuat wireframe');
        setState('error');
      }
    })();
    return () => { alive = false; };
  }, [projectId]);

  // 400 ms debounce: type in the textarea, the preview follows.
  useEffect(() => {
    if (state !== 'ready') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setPreview(html), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [html, state]);

  const dirty = html !== saved;

  const active = useMemo(() => screens.find((s) => s.id === activeId) ?? null, [screens, activeId]);

  function selectScreen(s: Screen) {
    setActiveId(s.id);
    setHtml(s.htmlContent || SAMPLE);
    setSaved(s.htmlContent || SAMPLE);
    setPreview(s.htmlContent || SAMPLE);
    setViewport(s.viewport);
    setJustSaved(false);
  }

  async function save() {
    if (!activeId || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api.patch<{ screen: Screen }>(`/projects/${projectId}/wireframes/${activeId}`, { htmlContent: html });
      setSaved(r.screen.htmlContent);
      setScreens((prev) => prev.map((s) => (s.id === activeId ? { ...s, htmlContent: r.screen.htmlContent } : s)));
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1800);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menyimpan');
    }
    setSaving(false);
  }

  if (state === 'loading') return <div className="mono muted" style={{ padding: 40 }}>memuat…</div>;
  if (state === 'error') return <div className="alert" role="alert">{error}</div>;
  if (state === 'empty') {
    return (
      <div className="wf-empty card">
        <h2>Belum ada layar wireframe.</h2>
        <p className="muted">Wireframe dibuat bersama dokumen lain setelah wawancara. Jalankan wawancara untuk memulainya.</p>
      </div>
    );
  }

  const vw = VIEWPORTS.find((v) => v.id === viewport)?.width ?? 1100;

  return (
    <div className="wf">
      <header className="wf-head">
        <div className="wf-screens" role="tablist" aria-label="Layar">
          {screens.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={s.id === activeId}
              className={`wf-tab ${s.id === activeId ? 'on' : ''}`}
              onClick={() => selectScreen(s)}
            >
              {s.name}
              {s.isEntry && <span className="wf-entry mono">entry</span>}
            </button>
          ))}
        </div>
        <div className="wf-actions">
          <div className="wf-vp" role="group" aria-label="Lebar pratinjau">
            {VIEWPORTS.map((v) => (
              <button
                key={v.id}
                className={`wf-vp-btn mono ${viewport === v.id ? 'on' : ''}`}
                onClick={() => setViewport(v.id)}
                aria-pressed={viewport === v.id}
              >
                {v.label}
              </button>
            ))}
          </div>
          <span className={`wf-state mono ${dirty ? 'dirty' : ''}`}>{dirty ? 'belum disimpan' : justSaved ? 'tersimpan ✓' : 'tersimpan'}</span>
          <button className="btn primary" onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </header>

      {error && <div className="alert" role="alert">{error}</div>}

      <div className="wf-split">
        <div className="wf-pane">
          <div className="wf-pane-cap mono">HTML · {active?.slug ?? ''}</div>
          <textarea
            className="wf-code mono"
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            spellCheck={false}
            aria-label="HTML wireframe"
          />
        </div>
        <div className="wf-pane preview">
          <div className="wf-pane-cap mono">Pratinjau · {viewport} · {vw}px</div>
          <div className="wf-stage">
            <iframe
              title="Pratinjau wireframe"
              sandbox="allow-scripts"
              srcDoc={preview}
              style={{ width: vw, maxWidth: '100%' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
