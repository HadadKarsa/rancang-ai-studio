'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, ApiError } from '@/lib/client/api';

/* ── Types (mirror forge's /api/v1 contract) ──────────────────────── */
type DocumentType = 'prd' | 'architecture' | 'database' | 'api' | 'tasks' | 'memory' | 'wireframe';
type DocStatus = 'pending' | 'generating' | 'ready' | 'failed' | 'stale';

interface Project {
  id: string; name: string; slug: string; status: string;
  accentColor: string; description: string | null; updatedAt: string;
}
interface Doc {
  id: string; type: DocumentType; title: string; status: DocStatus;
  orderIndex: number; lastGeneratedAt: string | null; currentVersionId: string | null;
}
interface ProjectResp { project: Project; documents: Doc[] }
interface DocResp { document: Doc; content: string | null }

const DOC_ORDER: DocumentType[] = ['prd', 'architecture', 'database', 'api', 'tasks', 'memory', 'wireframe'];
const DOC_LABEL: Record<DocumentType, string> = {
  prd: 'PRD', architecture: 'Arsitektur', database: 'Database',
  api: 'API', tasks: 'Tugas', memory: 'Memori', wireframe: 'Wireframe',
};
const STATUS_LABEL: Record<DocStatus, string> = {
  pending: 'belum', generating: 'menulis', ready: 'siap', failed: 'gagal', stale: 'usang',
};

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M8 2 4 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ProjectPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const [project, setProject] = useState<Project | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selected, setSelected] = useState<DocumentType | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  /* One fetch per document, kept for the visit: flipping between two
     documents should not re-download 90 KB of markdown each time. */
  const cache = useRef(new Map<DocumentType, string | null>());

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const r = await api.get<ProjectResp>(`/projects/${projectId}`);
      setProject(r.project);
      const ordered = [...r.documents].sort(
        (a, b) => DOC_ORDER.indexOf(a.type) - DOC_ORDER.indexOf(b.type) || a.orderIndex - b.orderIndex,
      );
      setDocs(ordered);
      const firstReady = ordered.find((d) => d.status === 'ready' && d.type !== 'wireframe');
      setSelected(firstReady?.type ?? null);
      setState('ready');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal memuat proyek');
      setState('error');
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  /* Fetch the selected document's markdown — no navigation, no reload. */
  useEffect(() => {
    if (!selected) { setContent(null); return; }
    const cached = cache.current.get(selected);
    if (cached !== undefined) { setContent(cached); return; }
    let alive = true;
    setLoadingDoc(true);
    setContent(null);
    api.get<DocResp>(`/projects/${projectId}/documents/${selected}?content=1`)
      .then((r) => {
        if (!alive) return;
        cache.current.set(selected, r.content);
        setContent(r.content);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof ApiError ? e.message : 'Gagal memuat dokumen');
      })
      .finally(() => { if (alive) setLoadingDoc(false); });
    return () => { alive = false; };
  }, [selected, projectId]);

  const readyDocs = useMemo(() => docs.filter((d) => d.status === 'ready'), [docs]);
  const hasDocs = readyDocs.length > 0;
  const selectedDoc = docs.find((d) => d.type === selected) ?? null;

  if (state === 'loading') {
    return <div className="pg-project"><p className="mono muted load">memuat proyek…</p></div>;
  }
  if (state === 'error' || !project) {
    return (
      <div className="pg-project">
        <div className="alert" role="alert">{error ?? 'Proyek tidak ditemukan.'}</div>
        <Link href="/studio" className="back mono"><Chevron /> Studio</Link>
      </div>
    );
  }

  /* No document written yet: the interview is the page's whole job. */
  if (!hasDocs) {
    return (
      <div className="pg-project is-fresh">
        <header className="top">
          <div className="crumbs">
            <Link href="/studio" className="back mono"><Chevron /> Studio</Link>
            <span className="mono muted">/</span>
            <span className="mono pname">{project.name}</span>
          </div>
        </header>

        <section className="fresh card">
          <p className="eyebrow mono">belum ada dokumen</p>
          <h1>{project.name}</h1>
          {project.description && <p className="muted lede">{project.description}</p>}
          <p className="note">
            Dokumen spesifikasi ditulis dari wawancara. Ceritakan idemu dulu —
            lima sampai delapan pertanyaan — lalu enam dokumen ditulis sekaligus.
          </p>
          <div className="row">
            <Link href={`/projects/${projectId}/interview`} className="btn primary">
              Mulai wawancara
            </Link>
            <Link href="/studio" className="btn ghost">Kembali ke studio</Link>
          </div>
          <ul className="plan" aria-label="Dokumen yang akan ditulis">
            {DOC_ORDER.map((t) => (
              <li key={t}><span className="dot" aria-hidden="true" />{DOC_LABEL[t]}</li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  const isWireframe = selected === 'wireframe';

  return (
    <div className="pg-project">
      <header className="top">
        <div className="crumbs">
          <Link href="/studio" className="back mono"><Chevron /> Studio</Link>
          <span className="mono muted">/</span>
          <span className="mono pname">{project.name}</span>
        </div>
        <div className="head">
          <div>
            <p className="eyebrow mono">{readyDocs.length} dokumen siap</p>
            <h1>{project.name}</h1>
          </div>
          <div className="acts">
            <Link href={`/projects/${projectId}/interview`} className="btn ghost sm">
              Lihat wawancara
            </Link>
            <div className="dl" aria-label="Unduh proyek">
              <span className="dl-label mono">unduh</span>
              <a className="dl-fmt" href={`/api/v1/projects/${projectId}/export?format=md`} download>MD</a>
              <a className="dl-fmt" href={`/api/v1/projects/${projectId}/export?format=zip`} download>ZIP</a>
              <a className="dl-fmt" href={`/api/v1/projects/${projectId}/export?format=json`} download>JSON</a>
            </div>
          </div>
        </div>
      </header>

      {error && <div className="alert" role="alert">{error}</div>}

      <div className="split">
        <nav className="doc-list" aria-label="Dokumen proyek">
          <p className="cap mono">dokumen</p>
          <ul>
            {docs.map((d) => {
              const on = d.type === selected;
              const ready = d.status === 'ready';
              return (
                <li key={d.type}>
                  {ready ? (
                    <button
                      type="button"
                      className={`doc-row${on ? ' on' : ''}`}
                      aria-current={on ? 'true' : undefined}
                      onClick={() => setSelected(d.type)}
                    >
                      <span className="nm">{DOC_LABEL[d.type]}</span>
                      <span className="meta mono">{timeAgo(d.lastGeneratedAt)}</span>
                    </button>
                  ) : (
                    <Link
                      href={`/projects/${projectId}/documents/${d.type}`}
                      className="doc-row is-dim"
                      title={`${DOC_LABEL[d.type]} — ${STATUS_LABEL[d.status]}`}
                    >
                      <span className="nm">{DOC_LABEL[d.type]}</span>
                      <span className="meta mono">{STATUS_LABEL[d.status]}</span>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <section className="preview card" aria-live="polite" aria-busy={loadingDoc}>
          {selectedDoc && (
            <div className="preview-head">
              <h2>{DOC_LABEL[selectedDoc.type]}</h2>
              <Link
                href={`/projects/${projectId}/documents/${selectedDoc.type}`}
                className="mono open"
              >
                buka halaman
              </Link>
            </div>
          )}

          {isWireframe ? (
            <div className="preview-empty">
              <p className="muted">
                Wireframe adalah HTML, bukan markdown — ia dibuka di editornya sendiri.
              </p>
              <Link href={`/projects/${projectId}/documents/wireframe`} className="btn ghost sm">
                Buka editor wireframe
              </Link>
            </div>
          ) : loadingDoc ? (
            <p className="mono muted load">memuat dokumen…</p>
          ) : content ? (
            <article className="md">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </article>
          ) : (
            <div className="preview-empty">
              <p className="muted">Dokumen ini belum punya isi. Pilih dokumen lain di sebelah kiri.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
