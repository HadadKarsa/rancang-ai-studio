'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

/* ── Types (mirror forge's /api/v1) ───────────────────────────────── */
type DocumentType = 'prd' | 'architecture' | 'database' | 'api' | 'tasks' | 'memory' | 'wireframe';

interface DocState {
  type: DocumentType;
  status: 'queued' | 'writing' | 'ready' | 'failed';
  text: string;
  bytes: number | null;
  error: string | null;
}

const LABEL: Record<DocumentType, string> = {
  prd: 'PRD', architecture: 'Arsitektur', database: 'Database', api: 'API',
  tasks: 'Tugas', memory: 'Memori', wireframe: 'Wireframe',
};

const ORDER: DocumentType[] = ['prd', 'architecture', 'database', 'api', 'tasks', 'memory'];

/* ── Markdown → HTML (same tiny renderer as the document page) ─────── */
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
      if (/^[\s|:-]+$/.test(line)) continue;
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

function kb(n: number): string {
  return `${(n / 1024).toFixed(1)} kB`;
}

/* ── SSE over fetch ───────────────────────────────────────────────────
   EventSource cannot read an error body (a 409 arrives as a bare error
   event), so the stream is read by hand: same wire format, and a failed
   request still gives us the JSON envelope to show. */
interface SseEvent { event: string; data: string }

function makeParser(onEvent: (e: SseEvent) => void) {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length > 0) onEvent({ event, data: dataLines.join('\n') });
    }
  };
}

export default function WritePage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const router = useRouter();

  const [projectName, setProjectName] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocState[]>(
    ORDER.map((t) => ({ type: t, status: 'queued', text: '', bytes: null, error: null })),
  );
  const [active, setActive] = useState<DocumentType>('prd');
  const [running, setRunning] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ generated: string[]; failed: unknown[]; skipped: string[] } | null>(null);
  const [follow, setFollow] = useState(true);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const patch = useCallback((type: DocumentType, next: Partial<DocState>) => {
    setDocs((prev) => prev.map((d) => (d.type === type ? { ...d, ...next } : d)));
  }, []);

  const start = useCallback(async () => {
    setFatal(null);
    setSummary(null);
    setRunning(true);
    setDocs(ORDER.map((t) => ({ type: t, status: 'queued', text: '', bytes: null, error: null })));
    setActive('prd');

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      // A 409 means another stream holds the project's batch. That happens
      // legitimately in dev, where React StrictMode mounts twice and the first
      // request is still releasing the guard. Wait for it and try again before
      // telling the reader anything is wrong.
      let res: Response | null = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        res = await fetch(`/api/v1/projects/${projectId}/documents/generate-stream`, {
          credentials: 'same-origin',
          signal: ctrl.signal,
          headers: { Accept: 'text/event-stream' },
        });
        if (res.status !== 409) break;
        if (attempt === 5) break;
        await new Promise((r) => setTimeout(r, 1200));
        if (ctrl.signal.aborted) return;
      }

      if (!res || !res.ok || !res.body) {
        let message = `Gagal memulai (${res?.status ?? 0})`;
        try {
          const body = await res?.json();
          message = body?.error?.message ?? message;
        } catch { /* non-JSON */ }
        setFatal(message);
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parse = makeParser(({ event, data }) => {
        let payload: Record<string, unknown>;
        try { payload = JSON.parse(data) as Record<string, unknown>; } catch { return; }

        if (event === 'start') {
          const order = (payload.order as DocumentType[] | undefined) ?? ORDER;
          setDocs(order.map((t) => ({ type: t, status: 'queued', text: '', bytes: null, error: null })));
          setActive(order[0] ?? 'prd');
          return;
        }
        if (event === 'doc') {
          const type = payload.type as DocumentType;
          patch(type, { status: 'writing', error: null });
          setActive(type);
          return;
        }
        if (event === 'delta') {
          const type = payload.type as DocumentType;
          const text = (payload.text as string | undefined) ?? '';
          setDocs((prev) => prev.map((d) => (d.type === type ? { ...d, text: d.text + text } : d)));
          return;
        }
        if (event === 'done') {
          const type = payload.type as DocumentType;
          patch(type, { status: 'ready', bytes: (payload.bytes as number | undefined) ?? null });
          return;
        }
        if (event === 'error') {
          const type = payload.type as DocumentType | null;
          const message = (payload.message as string | undefined) ?? 'Gagal menulis dokumen';
          if (type) patch(type, { status: 'failed', error: message });
          else setFatal(message);
          return;
        }
        if (event === 'finish') {
          setSummary({
            generated: (payload.generated as string[] | undefined) ?? [],
            failed: (payload.failed as unknown[] | undefined) ?? [],
            skipped: (payload.skipped as string[] | undefined) ?? [],
          });
          setRunning(false);
        }
      });

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parse(decoder.decode(value, { stream: true }));
      }
      setRunning(false);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // we stopped it
      setFatal('Koneksi ke server terputus. Dokumen yang sudah selesai tetap tersimpan.');
      setRunning(false);
    }
  }, [projectId, patch]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/v1/projects/${projectId}`, { credentials: 'same-origin' });
        if (res.ok) {
          const body = await res.json();
          setProjectName(body?.project?.name ?? null);
        }
      } catch { /* the name is decoration; the stream is the page */ }
    })();
    void start();
    return () => abortRef.current?.abort();
  }, [projectId, start]);

  // Follow the ink: keep the writing document scrolled to its last line.
  useEffect(() => {
    if (!follow) return;
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [docs, follow]);

  const current = useMemo(() => docs.find((d) => d.type === active) ?? docs[0], [docs, active]);
  const doneCount = docs.filter((d) => d.status === 'ready').length;
  const settled = !running && summary !== null;

  const retry = useCallback(() => { void start(); }, [start]);

  return (
    <div className="pg-write">
      <header className="top">
        <div className="crumbs">
          <Link href="/studio" className="back mono">Studio</Link>
          <span className="mono muted">/</span>
          <span className="mono muted pname">{projectName ?? 'proyek'}</span>
        </div>
        <div className="head">
          <div>
            <p className="eyebrow">{running ? 'menulis' : settled ? 'selesai' : 'berhenti'}</p>
            <h1>{running ? 'Dokumen sedang ditulis.' : 'Penulisan selesai.'}</h1>
          </div>
          <p className="tally mono">
            <b>{doneCount}</b> / {docs.length} dokumen
            {running && <span className="wet"><span className="inkline" aria-hidden="true" /></span>}
          </p>
        </div>
      </header>

      {fatal && (
        <div className="alert" role="alert">
          <p>{fatal}</p>
          {!running && <button className="btn" onClick={retry}>Coba lagi</button>}
        </div>
      )}

      <div className="cols">
        <nav className="rail" aria-label="Dokumen">
          {docs.map((d, i) => (
            <button
              key={d.type}
              type="button"
              className={`step ${d.type === active ? 'on' : ''} ${d.status}`}
              onClick={() => setActive(d.type)}
            >
              <span className="idx mono">{String(i + 1).padStart(2, '0')}</span>
              <span className="nm">{LABEL[d.type]}</span>
              <span className={`pill ${d.status === 'ready' ? 'ok' : d.status === 'failed' ? 'err' : d.status === 'writing' ? 'live' : ''}`}>
                <span className="dot" aria-hidden="true" />
                {d.status === 'ready' ? (d.bytes ? kb(d.bytes) : 'siap')
                  : d.status === 'failed' ? 'gagal'
                  : d.status === 'writing' ? 'menulis'
                  : 'menunggu'}
              </span>
            </button>
          ))}
        </nav>

        <article className="sheet card" aria-live="polite">
          <header className="running">
            <div>
              <h2>{LABEL[current?.type ?? 'prd']}</h2>
              <p className="meta mono">
                {current?.status === 'ready' ? `selesai · ${current.bytes ? kb(current.bytes) : '—'}`
                  : current?.status === 'writing' ? 'menulis…'
                  : current?.status === 'failed' ? 'gagal'
                  : 'menunggu giliran'}
              </p>
            </div>
            {current?.status === 'ready' && (
              <Link className="btn ghost" href={`/projects/${projectId}/documents/${current.type}`}>
                Buka dokumen
              </Link>
            )}
          </header>

          <div
            className="body"
            ref={boxRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
            }}
          >
            {current?.text ? (
              <div dangerouslySetInnerHTML={{ __html: renderMd(current.text) }} />
            ) : current?.status === 'writing' ? (
              <p className="waiting mono"><span className="cursor" /> menunggu kata pertama…</p>
            ) : current?.status === 'failed' ? (
              <p className="waiting">Dokumen ini gagal ditulis{current.error ? `: ${current.error}` : '.'}</p>
            ) : (
              <p className="waiting">Giliran dokumen ini belum tiba.</p>
            )}
            {current?.status === 'writing' && current.text && (
              <div className="wet"><span className="cursor" /></div>
            )}
          </div>
        </article>
      </div>

      <footer className="foot">
        {settled ? (
          <>
            <p className="note">
              {summary && summary.failed.length > 0
                ? `${summary.generated.length} dokumen selesai, ${summary.failed.length} gagal.`
                : `${summary?.generated.length ?? 0} dokumen selesai.`}
              {' '}Wireframe tidak termasuk — buat belakangan kalau perlu.
            </p>
            <div className="row">
              <Link className="btn primary" href={`/projects/${projectId}/documents/prd`}>
                Lihat dokumen
              </Link>
              <Link className="btn ghost" href={`/projects/${projectId}/interview`}>
                Kembali ke wawancara
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="note">
              Biarkan tab ini terbuka. Tiap dokumen muncul di sini begitu ditulis.
            </p>
            <div className="row">
              <button className="btn ghost" onClick={() => { abortRef.current?.abort(); setRunning(false); }}>
                Hentikan
              </button>
            </div>
          </>
        )}
      </footer>
    </div>
  );
}