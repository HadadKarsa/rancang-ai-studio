'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/client/api';

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

/* ── Tiny markdown renderer (headings, lists, tables, code, inline) ── */
function renderMd(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  const lines = md.split('\n');
  const out: string[] = [];
  let inCode = false;
  let listType: 'ul' | 'ol' | null = null;
  let inTable = false;
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
  const closeTable = () => { if (inTable) { out.push('</tbody></table>'); inTable = false; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.startsWith('```')) {
      closeList(); closeTable();
      out.push(inCode ? '</code></pre>' : '<pre><code>');
      inCode = !inCode;
      continue;
    }
    if (inCode) { out.push(esc(line)); continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      closeList(); closeTable();
      const lvl = (h[1] ?? '#').length;
      out.push(`<h${lvl + 1}>${inline(h[2] ?? '')}</h${lvl + 1}>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.trim().slice(1, -1).split('|').map((c) => c.trim());
      if (/^[\s|:-]+$/.test(line)) continue; // separator row
      if (!inTable) { closeList(); out.push('<table><tbody>'); inTable = true; }
      out.push(`<tr>${cells.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`);
      continue;
    }
    closeTable();
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul) {
      if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
      out.push(`<li>${inline(ul[1] ?? '')}</li>`);
      continue;
    }
    if (ol) {
      if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
      out.push(`<li>${inline(ol[1] ?? '')}</li>`);
      continue;
    }
    closeList();
    if (line.trim() === '') continue;
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList(); closeTable();
  if (inCode) out.push('</code></pre>');
  return out.join('\n');
}

function bytes(n: number): string {
  return `${(new TextEncoder().encode(String(n)).length / 1024).toFixed(1)} kB`;
}

export default function DocPage() {
  const params = useParams<{ projectId: string; type: string }>();
  const projectId = params.projectId;
  const type = (params.type ?? 'prd') as DocumentType;
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [content, setContent] = useState('');
  const [versions, setVersions] = useState<Version[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'missing'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamTail, setStreamTail] = useState('');
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const pj = await api.get<ProjectResp>(`/projects/${projectId}`);
      setProject(pj.project);
      setDocs(pj.documents);
      const d = await api.get<DocResp>(`/projects/${projectId}/documents/${type}?content=1&versions=1`);
      setDoc(d.document);
      setContent(d.content ?? '');
      setVersions(d.versions ?? []);
      setState(d.content ? 'ready' : 'missing');
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) { setState('missing'); return; }
      setError(e instanceof ApiError ? e.message : 'Gagal memuat dokumen');
      setState('error');
    }
  }, [projectId, type]);

  useEffect(() => { void load(); }, [load]);

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

  function downloadMd() {
    const blob = new Blob([content], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${project?.slug ?? 'proyek'}-${type}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (state === 'loading') return <div className="mono muted" style={{ padding: 40 }}>memuat…</div>;
  if (state === 'error') return <div className="alert" role="alert" style={{ margin: 40 }}>{error}</div>;

  const latest = versions[0];
  const ordered = DOC_ORDER.filter((t) => docs.some((d) => d.type === t));

  return (
    <div className="pg-documents">
      <header className="head">
        <div className="crumbs">
          <Link href="/studio" className="mono muted">Studio</Link>
          <span className="mono muted">/</span>
          <span className="mono muted pname">{project?.name}</span>
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
              <div className="acts">
                <button className="btn ghost" onClick={() => void copyMd()}>{copied ? 'Tersalin ✓' : 'Salin'}</button>
                <button className="btn ghost" onClick={downloadMd}>.md</button>
                <button className="btn primary" onClick={() => void regenerate()} disabled={streaming}>
                  {streaming ? 'Menulis…' : 'Tulis ulang'}
                </button>
              </div>
            </header>
            <div className="body" ref={bodyRef} dangerouslySetInnerHTML={{ __html: renderMd(content) }} />
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
                  <div><dt>Ukuran</dt><dd className="mono">{bytes(content.length)}</dd></div>
                </dl>
              ) : <p className="muted small">Belum pernah dibuat.</p>}
            </section>

            <section className="card pad">
              <h3 className="mono">REVISI</h3>
              {versions.length === 0 && <p className="muted small">Belum ada revisi.</p>}
              <ol className="revs">
                {versions.map((v) => (
                  <li key={v.id}>
                    <span className="mono v">v{v.versionNumber}</span>
                    <span className="small">{v.changeSummary ?? v.source}</span>
                    <time className="mono muted small">{new Date(v.createdAt).toLocaleDateString('id-ID')}</time>
                  </li>
                ))}
              </ol>
            </section>

            <section className="card pad">
              <h3 className="mono">BAGIKAN</h3>
              <p className="muted small">Bagikan dokumen ini sebagai tautan baca-saja.</p>
              <button
                className="btn"
                onClick={async () => {
                  try {
                    const r = await api.post<{ link: { url: string } }>(`/projects/${projectId}/share`, { scope: 'document', documentId: doc?.id, access: 'public' });
                    await navigator.clipboard.writeText(r.link.url);
                    alert(`Tautan disalin: ${r.link.url}`);
                  } catch (e) {
                    setError(e instanceof ApiError ? e.message : 'Gagal membuat tautan');
                  }
                }}
              >
                Buat tautan bagikan
              </button>
            </section>
          </aside>
        </div>
      )}

      {error && <div className="alert" role="alert">{error}</div>}

    </div>
  );
}
