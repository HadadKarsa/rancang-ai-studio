'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, ApiError } from '@/lib/client/api';

/* ── Types (mirror forge's /api/v1/share/:slug) ────────────────────── */
interface Doc { id: string; type: string; title: string; status: string }
interface Version { documentId: string; contentMd: string }
interface Project { id: string; name: string; slug: string; description: string | null; accentColor: string; updatedAt: string }
interface Wireframe { id: string; name: string }
interface ProjectPayload { scope: 'project'; project: Project; documents: Doc[]; versions: Version[]; wireframes: Wireframe[] }
interface DocumentPayload { scope: 'document'; document: { id: string; title: string; type: string }; content: string }

const DOC_LABEL: Record<string, string> = {
  prd: 'PRD', architecture: 'Arsitektur', database: 'Database',
  api: 'API', tasks: 'Tugas', memory: 'Memori', wireframe: 'Wireframe',
};

/* The public reader renders with ReactMarkdown + GFM, the same renderer the
   studio viewer uses: a client-facing page that silently dropped every table
   in a PRD was the worst place to keep a hand-rolled parser. */
function Markdown({ md }: { md: string }) {
  return (
    <div className="body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
    </div>
  );
}

export default function SharePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [data, setData] = useState<ProjectPayload | DocumentPayload | null>(null);
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'gone'>('loading');
  const [active, setActive] = useState<string | null>(null);

  const fetchShare = useCallback(async (pw?: string) => {
    setState('loading');
    setError(null);
    try {
      const q = pw ? `?password=${encodeURIComponent(pw)}` : '';
      const d = await api.get<ProjectPayload | DocumentPayload>(`/share/${slug}${q}`);
      setData(d);
      setNeedPassword(false);
      const first = d.scope === 'project' ? (d.versions[0]?.documentId ?? null) : d.document.id;
      setActive(first);
      setState('ready');
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.code === 'UNAUTHORIZED')) {
        setNeedPassword(true);
        setState('ready');
        return;
      }
      setError(e instanceof ApiError ? e.message : 'Tautan tidak dapat dibuka');
      setState('gone');
    }
  }, [slug]);

  useEffect(() => { void fetchShare(); }, [fetchShare]);

  if (state === 'loading') return <div className="mono muted" style={{ padding: 40 }}>memuat…</div>;

  if (needPassword) {
    return (
      <main className="pg-share gate">
        <form className="card" onSubmit={(e) => { e.preventDefault(); void fetchShare(password); }}>
          <h1>Halaman ini terkunci.</h1>
          <p className="muted">Masukkan kata sandi yang diberikan pemilik proyek.</p>
          <div className="field">
            <label htmlFor="pw">Kata sandi</label>
            <input id="pw" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <div className="alert" role="alert">{error}</div>}
          <button type="submit" className="btn primary">Buka</button>
        </form>
      </main>
    );
  }

  if (state === 'gone' || !data) {
    return (
      <main className="pg-share gate">
        <div className="card">
          <h1>Tautan tidak tersedia.</h1>
          <p className="muted">{error ?? 'Tautan ini sudah kedaluwarsa atau dicabut.'}</p>
        </div>
      </main>
    );
  }

  if (data.scope === 'document') {
    return (
      <main className="pg-share pub">
        <header className="top">
          <span className="brand">rancang-ai<small>baca-saja</small></span>
        </header>
        <article className="sheet card">
          <h1>{data.document.title}</h1>
          <Markdown md={data.content} />
        </article>
      </main>
    );
  }

  const contentOf = (docId: string): string =>
    data.versions.find((v) => v.documentId === docId)?.contentMd ?? '';

  return (
    <main className="pg-share pub">
      <header className="top">
        <span className="brand">rancang-ai<small>baca-saja</small></span>
      </header>

      {/* Cover sheet */}
      <section className="cover">
        <span className="mono pill"><span className="dot" />{DOC_LABEL[data.documents[0]?.type ?? ''] ?? 'spesifikasi'}</span>
        <h1>{data.project.name}</h1>
        {data.project.description && <p className="muted">{data.project.description}</p>}
        <div className="mono muted meta">
          {data.documents.length} dokumen · diperbarui {new Date(data.project.updatedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </section>

      {/* Contents */}
      <nav className="toc" aria-label="Daftar isi">
        {data.documents.map((d) => (
          <button key={d.id} className={`toc-item ${active === d.id ? 'on' : ''}`} onClick={() => setActive(d.id)}>
            <span className="mono t">{DOC_LABEL[d.type] ?? d.type}</span>
            <span className="ti">{d.title}</span>
          </button>
        ))}
      </nav>

      {/* Reader */}
      {active && (
        <article className="sheet card">
          <h2>{data.documents.find((d) => d.id === active)?.title}</h2>
          <Markdown md={contentOf(active)} />
        </article>
      )}
    </main>
  );
}
