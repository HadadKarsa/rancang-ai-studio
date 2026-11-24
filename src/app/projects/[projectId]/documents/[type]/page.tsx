'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, ApiError } from '@/lib/client/api';
import { WireframeEditor } from '@/components/WireframeEditor';

/* ── Types (mirror forge's /api/v1) ───────────────────────────────── */
type DocumentType = 'prd' | 'architecture' | 'database' | 'api' | 'tasks' | 'memory' | 'wireframe';
interface Project { id: string; name: string; slug: string; status: string; accentColor: string }
interface Doc { id: string; type: DocumentType; title: string; status: string; lastGeneratedAt: string | null }
interface Version {
  id: string; versionNumber: number; source: string; changeSummary: string | null;
  modelUsed: string | null; provider: string | null; promptTokens: number | null;
  completionTokens: number | null; generationMs: number | null; createdAt: string;
}
interface DocResp { document: Doc; content: string | null; versions: Version[] }
interface ProjectResp { project: Project; documents: Doc[] }

const DOC_LABEL: Partial<Record<DocumentType, string>> = {
  prd: 'PRD', architecture: 'Arsitektur', database: 'Database',
  api: 'API', tasks: 'Tugas', memory: 'Memori', wireframe: 'Wireframe',
};
const labelOf = (t: string) => DOC_LABEL[t as DocumentType] ?? t.replace(/^\w/, (c) => c.toUpperCase());
const DOC_ORDER: DocumentType[] = ['prd', 'architecture', 'database', 'api', 'tasks', 'memory', 'wireframe'];

/* Local extensions on top of the shapes the API returns. */
interface DocView extends Doc { isLocked?: boolean }
interface VersionView extends Version { contentMd?: string }
interface ShareLinkLite { id: string; slug: string; documentId: string | null; revokedAt: string | null }

function bytes(text: string): string {
  return `${(new TextEncoder().encode(text).length / 1024).toFixed(1)} kB`;
}

export default function DocPage() {
  const params = useParams<{ projectId: string; type: string }>();
  const projectId = params.projectId;
  const type = (params.type ?? 'prd') as DocumentType;
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [doc, setDoc] = useState<DocView | null>(null);
  const [content, setContent] = useState('');
  const [versions, setVersions] = useState<VersionView[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'missing'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamTail, setStreamTail] = useState('');
  const [copied, setCopied] = useState(false);
  const [savingLib, setSavingLib] = useState(false);
  const [libSaved, setLibSaved] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<VersionView | null>(null);
  const [shareLinks, setShareLinks] = useState<ShareLinkLite[]>([]);
  const [lockBusy, setLockBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const pj = await api.get<ProjectResp>(`/projects/${projectId}`);
      setProject(pj.project);
      setDocs(pj.documents);
      const d = await api.get<DocResp>(`/projects/${projectId}/documents/${type}?content=1&versions=1`);
      setDoc(d.document as DocView);
      setContent(d.content ?? '');
      setVersions((d.versions ?? []) as VersionView[]);
      setState(d.content ? 'ready' : 'missing');
      void loadShares();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) { setState('missing'); return; }
      setError(e instanceof ApiError ? e.message : 'Gagal memuat dokumen');
      setState('error');
    }
  }, [projectId, type]);

  useEffect(() => { void load(); }, [load]);

  // The overflow menu closes on Escape and on a click outside, and returns
  // focus to its trigger — the same contract as the studio card menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  async function regenerate() {
    setStreaming(true);
    setError(null);
    setStreamTail('');
    setContent('');
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/documents/${type}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok || !res.body) {
        let msg = `Gagal (${res.status})`;
        try { const b = await res.json(); msg = b?.error?.message ?? msg; } catch { /* plain */ }
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setContent(acc);
        setStreamTail(acc.slice(-80));
        bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
      }
      setStreaming(false);
      await load();
    } catch (e) {
      setStreaming(false);
      setError(e instanceof Error ? e.message : 'Gagal membuat ulang dokumen');
    }
  }

  async function copyMd() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function createShare() {
    setShareBusy(true);
    setError(null);
    setShareNote(null);
    try {
      const r = await api.post<{ link: { id: string; slug: string }; url: string }>(
        `/projects/${projectId}/share`,
        { scope: 'document', documentId: doc?.id, access: 'public' },
      );
      const full = `${window.location.origin}${r.url}`;
      try {
        await navigator.clipboard.writeText(full);
        setShareNote('Tautan disalin ke papan klip.');
      } catch {
        setShareNote(`Tautan dibuat: ${full}`);
      }
      await loadShares();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal membuat tautan');
    }
    setShareBusy(false);
  }

  async function saveToLibrary() {
    if (!doc) return;
    setSavingLib(true);
    setError(null);
    try {
      await api.post('/library', {
        kind: type === 'wireframe' ? 'wireframe' : 'document',
        title: doc.title,
        projectId,
        documentId: doc.id,
        payload: content || '(kosong)',
      });
      setLibSaved(true);
      setTimeout(() => setLibSaved(false), 2000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menyimpan ke library');
    }
    setSavingLib(false);
  }

  async function toggleLock() {
    if (!doc) return;
    setLockBusy(true);
    setError(null);
    try {
      await api.patch(`/projects/${projectId}/documents/${type}`, { isLocked: !doc.isLocked });
      const d = await api.get<DocResp>(`/projects/${projectId}/documents/${type}?content=0&versions=0`);
      setDoc(d.document as DocView);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal mengubah kunci dokumen');
    }
    setLockBusy(false);
  }

  async function loadShares() {
    try {
      const r = await api.get<{ links: ShareLinkLite[] }>(`/projects/${projectId}/share`);
      setShareLinks(r.links ?? []);
    } catch {
      /* the share panel simply stays empty */
    }
  }

  async function revokeLink(id: string) {
    setError(null);
    try {
      await api.delete(`/projects/${projectId}/share?id=${encodeURIComponent(id)}`);
      await loadShares();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal mencabut tautan');
    }
  }

  if (state === 'loading') return <div className="mono muted" style={{ padding: 40 }}>memuat…</div>;
  if (state === 'error') return <div className="alert" role="alert" style={{ margin: 40 }}>{error}</div>;

  const latest = versions[0];
  const activeShares = shareLinks.filter((l) => !l.revokedAt && l.documentId === doc?.id);
  const ordered = DOC_ORDER.filter((t) => docs.some((d) => d.type === t));

  return (
    <div className="pg-documents">
      <header className="head">
        <div className="crumbs">
          <Link href="/studio" className="mono muted">Studio</Link>
          <span className="mono muted">/</span>
          <Link href={`/projects/${projectId}`} className="mono muted pname">{project?.name}</Link>
        </div>
        <nav className="tabs" aria-label="Dokumen">
          {ordered.map((t) => {
            const d = docs.find((x) => x.type === t);
            return (
              <Link key={t} href={`/projects/${projectId}/documents/${t}`}
                className={`tab ${t === type ? 'on' : ''} ${d?.status === 'ready' ? '' : 'dim'}`}>
                {labelOf(t)}
              </Link>
            );
          })}
        </nav>
      </header>

      {state === 'missing' ? (
        <div className="empty card">
          <h2>{labelOf(type)} belum ada.</h2>
          <p className="muted">Dokumen ini dibuat dari hasil wawancara. Jalankan dari halaman wawancara, atau buat sekarang.</p>
          <button className="btn primary" onClick={() => void regenerate()} disabled={streaming}>
            {streaming ? 'Menulis…' : 'Buat dokumen'}
          </button>
        </div>
      ) : (
        <div className="proof">
          <article className="sheet card">
            <header className="running">
              <div>
                <h1>{doc?.title}</h1>
                <div className="mono meta">
                  rev {latest ? `v${latest.versionNumber}` : '—'} · {doc?.status ?? '—'}
                  {doc?.lastGeneratedAt ? ` · ${new Date(doc.lastGeneratedAt).toLocaleString('id-ID')}` : ''}
                </div>
              </div>
              {/* One primary action, one download group, everything else
                  behind the overflow menu: five equal buttons made the
                  reader choose before reading. */}
              <div className="acts">
                <button
                  className="btn primary"
                  onClick={() => void regenerate()}
                  disabled={streaming || Boolean(doc?.isLocked)}
                  title={doc?.isLocked ? 'Dokumen terkunci — buka kunci untuk menulis ulang' : undefined}
                >
                  {streaming ? 'Menulis…' : 'Tulis ulang'}
                </button>
                <div className="dl" role="group" aria-label="Unduh proyek">
                  <span className="dl-label mono">Unduh</span>
                  {(['md', 'zip', 'json'] as const).map((f) => (
                    <a
                      key={f}
                      className="dl-fmt mono"
                      href={`/api/v1/projects/${projectId}/export?format=${f}`}
                      download
                      title={`Unduh seluruh proyek sebagai ${f.toUpperCase()}`}
                    >
                      {f === 'md' ? 'MD' : f === 'zip' ? 'ZIP' : 'JSON'}
                    </a>
                  ))}
                </div>
                <div className="more-wrap" ref={menuRef}>
                  <button
                    type="button"
                    className="btn ghost more-btn"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    aria-label="Aksi lain"
                    onClick={() => setMenuOpen((v) => !v)}
                  >
                    ⋯
                  </button>
                  {menuOpen && (
                    <div className="more-menu" role="menu" aria-label="Aksi dokumen">
                      <button type="button" role="menuitem" className="more-item"
                        onClick={() => { setMenuOpen(false); void copyMd(); }}>
                        {copied ? 'Tersalin ✓' : 'Salin markdown'}
                      </button>
                      <button type="button" role="menuitem" className="more-item"
                        onClick={() => { setMenuOpen(false); void saveToLibrary(); }}
                        disabled={savingLib || !content}>
                        {libSaved ? 'Tersimpan ✓' : savingLib ? 'Menyimpan…' : 'Simpan ke library'}
                      </button>
                      <button type="button" role="menuitem" className="more-item"
                        onClick={() => { setMenuOpen(false); void toggleLock(); }}
                        disabled={lockBusy}>
                        {doc?.isLocked ? 'Buka kunci dokumen' : 'Kunci dokumen'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>
            {type === 'wireframe' ? (
              <div className="editor" style={{ padding: 'var(--s5)' }}>
                {/* Live HTML preview: the editor renders the screen markup into a
                    sandboxed iframe's srcdoc, so edits show up as you type. */}
                <WireframeEditor projectId={projectId} />
              </div>
            ) : (
              <>
                {viewingVersion && (
                  <div className="rev-note mono" role="status">
                    Melihat v{viewingVersion.versionNumber} ·{' '}
                    <button className="linkbtn" onClick={() => setViewingVersion(null)}>kembali ke versi terbaru</button>
                  </div>
                )}
                <div className="body" ref={bodyRef}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {viewingVersion?.contentMd ?? content}
                  </ReactMarkdown>
                </div>
              </>
            )}
            {streaming && <div className="wet mono"><span className="cursor" /> {streamTail.slice(-40)}</div>}
          </article>

          <aside className="marginalia">
            <section className="card pad">
              <h3 className="mono">PEMBUATAN</h3>
              {latest ? (
                <dl>
                  <div><dt>Model</dt><dd className="mono">{latest.modelUsed ?? '—'}</dd></div>
                  <div><dt>Provider</dt><dd className="mono">{latest.provider ?? '—'}</dd></div>
                  <div><dt>Token</dt><dd className="mono">{latest.promptTokens ?? '—'} + {latest.completionTokens ?? '—'}</dd></div>
                  <div><dt>Durasi</dt><dd className="mono">{latest.generationMs ? `${(latest.generationMs / 1000).toFixed(1)} dtk` : '—'}</dd></div>
                  <div><dt>Ukuran</dt><dd className="mono">{bytes(content)}</dd></div>
                </dl>
              ) : <p className="muted small">Belum pernah dibuat.</p>}
            </section>

            <section className="card pad">
              <h3 className="mono">REVISI</h3>
              {versions.length === 0 && <p className="muted small">Belum ada revisi.</p>}
              <ol className="revs">
                {versions.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      className={`rev ${viewingVersion?.id === v.id ? 'on' : ''}`}
                      onClick={() => setViewingVersion(v)}
                      title={`Baca versi v${v.versionNumber}`}
                    >
                      <span className="mono v">v{v.versionNumber}</span>
                      <span className="small">{v.changeSummary ?? v.source}</span>
                      <time className="mono muted small">{new Date(v.createdAt).toLocaleDateString('id-ID')}</time>
                    </button>
                  </li>
                ))}
              </ol>
            </section>

            <section className="card pad">
              <h3 className="mono">BAGIKAN</h3>
              <p className="muted small">Bagikan dokumen ini sebagai tautan baca-saja.</p>
              <button className="btn" onClick={() => void createShare()} disabled={shareBusy}>
                {shareBusy ? 'Membuat…' : 'Buat tautan bagikan'}
              </button>
              {shareNote && <p className="share-note mono" role="status">{shareNote}</p>}
              {activeShares.length > 0 && (
                <ul className="shares">
                  {activeShares.map((l) => (
                    <li key={l.id}>
                      <a className="mono small" href={`/share/${l.slug}`} target="_blank" rel="noreferrer">
                        /share/{l.slug}
                      </a>
                      <button className="linkbtn" onClick={() => void revokeLink(l.id)}>
                        cabut
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}

      {error && <div className="alert" role="alert">{error}</div>}

    </div>
  );
}
