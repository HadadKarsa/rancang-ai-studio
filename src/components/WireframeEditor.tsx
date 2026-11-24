'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Monitor, Tablet, Smartphone, Save, Code2, Eye, Check } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { Badge, Button, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';

interface Screen {
  id: string;
  name: string;
  slug: string;
  htmlContent: string;
  viewport: 'mobile' | 'tablet' | 'desktop';
  orderIndex: number;
  isEntry: boolean;
}

const VIEWPORTS: {
  id: 'desktop' | 'tablet' | 'mobile';
  label: string;
  width: number;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}[] = [
  { id: 'desktop', label: 'Desktop', width: 1100, icon: Monitor },
  { id: 'tablet', label: 'Tablet', width: 768, icon: Tablet },
  { id: 'mobile', label: 'Ponsel', width: 390, icon: Smartphone },
];

const SAMPLE = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body{font-family:system-ui,sans-serif;margin:0;padding:24px;color:#1c1917;background:#fff}
  h1{font-size:22px;margin:0 0 8px}
  .bar{height:44px;border:1px solid #ddd;border-radius:8px;display:flex;align-items:center;padding:0 12px;color:#78716c;margin-bottom:16px}
  .row{display:flex;gap:12px}
  .box{flex:1;height:90px;border:1px dashed #bbb;border-radius:8px;display:grid;place-items:center;color:#78716c;font-size:13px}
</style></head><body>
  <h1>Layar Pertama</h1>
  <div class="bar">Cari...</div>
  <div class="row"><div class="box">Kartu</div><div class="box">Kartu</div></div>
</body></html>`;

export function WireframeEditor({
  projectId,
  onGenerateWireframe,
  generating,
}: {
  projectId: string;
  onGenerateWireframe?: () => void;
  generating?: boolean;
}) {
  const { toast } = useToast();
  const [screens, setScreens] = useState<Screen[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [html, setHtml] = useState('');
  const [saved, setSaved] = useState('');
  const [preview, setPreview] = useState('');
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [viewMode, setViewMode] = useState<'split' | 'preview' | 'code'>('split');
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'empty'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    setState('loading');
    (async () => {
      try {
        const r = await api.get<{ screens: Screen[] }>(`/projects/${projectId}/wireframes`);
        if (!alive) return;
        setScreens(r.screens);
        if (r.screens.length === 0) {
          setState('empty');
          return;
        }
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
    return () => {
      alive = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (state !== 'ready') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setPreview(html), 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
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
      const r = await api.patch<{ screen: Screen }>(
        `/projects/${projectId}/wireframes/${activeId}`,
        { htmlContent: html },
      );
      setSaved(r.screen.htmlContent);
      setScreens((prev) =>
        prev.map((s) => (s.id === activeId ? { ...s, htmlContent: r.screen.htmlContent } : s)),
      );
      setJustSaved(true);
      toast({ tone: 'success', title: `Wireframe "${r.screen.name}" tersimpan` });
      setTimeout(() => setJustSaved(false), 1800);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menyimpan wireframe');
    }
    setSaving(false);
  }

  if (state === 'loading') {
    return (
      <div className="p-8 font-mono text-xs text-ink-3">Memuat layar wireframe...</div>
    );
  }

  if (state === 'error') {
    return (
      <div
        role="alert"
        className="rounded-xl border border-danger/35 bg-danger-soft px-4 py-3 text-sm text-danger-ink"
      >
        {error}
      </div>
    );
  }

  if (state === 'empty') {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line-strong bg-canvas/50 p-8">
        <h3 className="text-base font-semibold text-ink">Belum ada layar wireframe</h3>
        <p className="max-w-lg text-sm text-ink-2">
          Wireframe HTML bersifat opsional dan dibuat dari keenam dokumen inti agar susunan layarnya
          selaras dengan PRD dan API.
        </p>
        {onGenerateWireframe && (
          <Button variant="primary" onClick={onGenerateWireframe} disabled={generating}>
            {generating ? 'Membuat wireframe...' : 'Buat wireframe sekarang'}
          </Button>
        )}
      </div>
    );
  }

  const vw = VIEWPORTS.find((v) => v.id === viewport)?.width ?? 1100;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Layar wireframe">
          {screens.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === activeId}
              onClick={() => selectScreen(s)}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                s.id === activeId
                  ? 'border-accent bg-accent-soft text-accent-ink'
                  : 'border-line bg-canvas text-ink-2 hover:border-line-strong hover:text-ink',
              )}
            >
              <span>{s.name}</span>
              {s.isEntry && <Badge tone="neutral">Entry</Badge>}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-line bg-sidebar p-0.5" role="group" aria-label="Tata letak editor">
            {(
              [
                ['split', 'Bagi dua'],
                ['preview', 'Pratinjau'],
                ['code', 'HTML'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={viewMode === id}
                onClick={() => setViewMode(id)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  viewMode === id ? 'bg-surface text-ink shadow-xs' : 'text-ink-2 hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-lg border border-line bg-sidebar p-0.5" role="group" aria-label="Lebar pratinjau">
            {VIEWPORTS.map((v) => {
              const Icon = v.icon;
              return (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={viewport === v.id}
                  aria-label={v.label}
                  title={`${v.label} (${v.width}px)`}
                  onClick={() => setViewport(v.id)}
                  className={cn(
                    'inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                    viewport === v.id ? 'bg-surface text-ink shadow-xs' : 'text-ink-2 hover:text-ink',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden={true} />
                </button>
              );
            })}
          </div>

          <span className={cn('font-mono text-xs', dirty ? 'text-accent-ink' : 'text-ink-3')}>
            {dirty ? 'Belum disimpan' : justSaved ? 'Tersimpan' : 'Tersimpan'}
          </span>

          <Button size="sm" variant="primary" onClick={() => void save()} disabled={!dirty || saving}>
            {justSaved && !dirty ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {saving ? 'Menyimpan...' : 'Simpan'}
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-danger/35 bg-danger-soft px-3.5 py-2.5 text-xs text-danger-ink"
        >
          {error}
        </div>
      )}

      <div
        className={cn(
          'grid gap-4',
          viewMode === 'split' ? 'lg:grid-cols-2' : 'grid-cols-1',
        )}
      >
        {viewMode !== 'preview' && (
          <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-canvas">
            <div className="flex items-center justify-between border-b border-line bg-sidebar px-3.5 py-2 font-mono text-xs text-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <Code2 className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                {active?.slug ?? 'screen'}.html
              </span>
            </div>
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              spellCheck={false}
              aria-label="Kode HTML wireframe"
              className="min-h-[460px] w-full flex-1 resize-y bg-transparent p-3.5 font-mono text-xs leading-relaxed text-ink focus:outline-none"
            />
          </div>
        )}

        {viewMode !== 'code' && (
          <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-sidebar">
            <div className="flex items-center justify-between border-b border-line bg-sidebar px-3.5 py-2 font-mono text-xs text-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                Pratinjau · {viewport} · {vw}px
              </span>
            </div>
            <div className="flex flex-1 justify-center overflow-x-auto bg-subtle/60 p-4">
              <iframe
                title="Pratinjau wireframe"
                sandbox="allow-scripts"
                srcDoc={preview}
                width={vw}
                height={520}
                style={{ width: vw, maxWidth: '100%' }}
                className="min-h-[460px] rounded-lg border border-line bg-white shadow-xs"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
