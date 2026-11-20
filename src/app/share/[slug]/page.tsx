'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
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

/* Same tiny renderer as the studio viewer — one source of truth for proof style. */
function renderMd(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  const out: string[] = [];
  let inCode = false;
  let listType: 'ul' | 'ol' | null = null;
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
  for (const line of md.split('\n')) {
    if (line.startsWith('```')) { closeList(); out.push(inCode ? '</code></pre>' : '<pre><code>'); inCode = !inCode; continue; }
    if (inCode) { out.push(esc(line)); continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { closeList(); const lvl = (h[1] ?? '#').length; out.push(`<h${lvl + 1}>${inline(h[2] ?? '')}</h${lvl + 1}>`); continue; }
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul) { if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; } out.push(`<li>${inline(ul[1] ?? '')}</li>`); continue; }
    if (ol) { if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; } out.push(`<li>${inline(ol[1] ?? '')}</li>`); continue; }
    closeList();
    if (line.trim() === '') continue;
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  if (inCode) out.push('</code></pre>');
  return out.join('\n');
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
        <style jsx>{`
          .gate { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
          .card { width: min(400px, 100%); padding: 30px; display: flex; flex-direction: column; gap: 14px; }
          h1 { font-size: 21px; letter-spacing: -0.01em; }
          .alert { border: 1.5px solid var(--vermilion); background: var(--vermilion-wash); color: var(--vermilion-ink); border-radius: 10px; padding: 10px 14px; font-size: 13px; }
        `}</style>
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
        <style jsx>{`
          .gate { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
          .card { width: min(420px, 100%); padding: 30px; }
          h1 { font-size: 21px; }
        `}</style>
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
          <div className="body" dangerouslySetInnerHTML={{ __html: renderMd(data.content) }} />
        </article>
        <style jsx global>{`
          .pub { max-width: 760px; margin: 0 auto; padding: 32px 20px 60px; display: flex; flex-direction: column; gap: 22px; }
          .top { padding-bottom: 6px; }
          .brand { font-weight: 800; font-size: 17px; display: flex; flex-direction: column; }
          .brand small { font: 600 9.5px var(--mono); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-3); }
          .sheet { padding: 30px 32px; }
          .sheet h1 { font-size: 24px; letter-spacing: -0.02em; margin-bottom: 18px; }
          .body :global(h2) { font-size: 18px; margin: 24px 0 10px; }
          .body :global(h3) { font-size: 15px; margin: 18px 0 8px; }
          .body :global(p) { margin: 8px 0; font-size: 14.5px; }
          .body :global(ul), .body :global(ol) { margin: 8px 0 8px 22px; font-size: 14.5px; }
          .body :global(code) { font: 12.5px var(--mono); background: var(--paper); border: 1px solid var(--line); border-radius: 5px; padding: 1px 5px; }
          .body :global(pre) { background: var(--ink); color: var(--paper); border-radius: 10px; padding: 14px 16px; overflow-x: auto; margin: 12px 0; }
          .body :global(pre code) { background: none; border: none; color: inherit; }
        `}</style>
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
          <div className="body" dangerouslySetInnerHTML={{ __html: renderMd(contentOf(active)) }} />
        </article>
      )}

      <style jsx global>{`
        .pub { max-width: 760px; margin: 0 auto; padding: 32px 20px 60px; display: flex; flex-direction: column; gap: 22px; }
        .top { padding-bottom: 6px; }
        .brand { font-weight: 800; font-size: 17px; display: flex; flex-direction: column; }
        .brand small { font: 600 9.5px var(--mono); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-3); }
        .cover { border-bottom: 1.5px solid var(--line); padding-bottom: 22px; display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
        .cover h1 { font-size: 32px; letter-spacing: -0.02em; }
        .cover p { max-width: 52ch; }
        .meta { font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; }
        .toc { display: flex; gap: 6px; flex-wrap: wrap; }
        .toc-item { border: 1.5px solid var(--line-2); border-radius: 10px; padding: 9px 14px; display: flex; flex-direction: column; gap: 2px; background: var(--card); text-align: left; }
        .toc-item:hover { border-color: var(--ink); }
        .toc-item.on { border-color: var(--ink); box-shadow: inset 0 0 0 1px var(--ink); background: var(--paper); }
        .toc-item .t { font: 600 9.5px var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-3); }
        .toc-item .ti { font-size: 13px; font-weight: 600; }
        .sheet { padding: 30px 32px; }
        .sheet h2 { font-size: 21px; letter-spacing: -0.01em; margin-bottom: 16px; }
        .body :global(h2) { font-size: 17px; margin: 22px 0 9px; }
        .body :global(h3) { font-size: 14.5px; margin: 16px 0 7px; }
        .body :global(p) { margin: 8px 0; font-size: 14.5px; }
        .body :global(ul), .body :global(ol) { margin: 8px 0 8px 22px; font-size: 14.5px; }
        .body :global(code) { font: 12.5px var(--mono); background: var(--paper); border: 1px solid var(--line); border-radius: 5px; padding: 1px 5px; }
        .body :global(pre) { background: var(--ink); color: var(--paper); border-radius: 10px; padding: 14px 16px; overflow-x: auto; margin: 12px 0; }
        .body :global(pre code) { background: none; border: none; color: inherit; }
        .body :global(table) { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13.5px; }
        .body :global(td) { border: 1px solid var(--line); padding: 7px 10px; }
      `}</style>
    </main>
  );
}
