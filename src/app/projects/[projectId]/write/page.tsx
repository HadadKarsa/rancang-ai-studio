'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

/* ── Why this screen looks like this ─────────────────────────────────
   Ndan's brief: the wait must not be boring — you should watch a document
   being written, not watch a bar. So the page is a manuscript, not a
   dashboard:

   · TYPE — the body is JetBrains Mono at 13.5/1.85 on a 68ch measure,
     because you are watching keystrokes land and a monospaced column is
     what a draft looks like while it is being typed. Headings switch to
     Schibsted Grotesk so the document's structure is still legible over
     the typewriter: you see the writer make a section, not a wall of text.
     The reading page (/documents/[type]) stays sans — that is where you
     read it; here you watch it.
   · COLOUR — vermilion is the wet ink and nothing else: the caret, the
     live pill, the rule beside the document being written. A finished
     document goes quiet (ink), a pending one goes grey.
   · STRUCTURE — the index on the left (six documents and their state),
     the page on the right, the press (export / wireframe) at the bottom
     once the ink is dry.
   ─────────────────────────────────────────────────────────────────── */

type DocumentType = 'prd' | 'architecture' | 'database' | 'api' | 'tasks' | 'memory' | 'wireframe';

type Phase = 'connecting' | 'writing' | 'done' | 'stopped' | 'interrupted' | 'error';

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

/* The six the batch writes by itself. Wireframe is opt-in and never in here. */
const ORDER: DocumentType[] = ['prd', 'architecture', 'database', 'api', 'tasks', 'memory'];

const initDocs = (list: DocumentType[]): DocState[] =>
  list.map((t) => ({ type: t, status: 'queued', text: '', bytes: null, error: null }));

/* ── Markdown → HTML ─────────────────────────────────────────────────
   Deliberately tiny and synchronous: this runs while tokens arrive, so it
   must not be clever. `live` puts the caret inside the last block that has
   text, which is the trick that makes it read as typing rather than as a
   block that grows. */
function renderMd(md: string, live = false): string {
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

  let html = out.join('\n');
  if (live) {
    const caret = '<span class="caret" aria-hidden="true"></span>';
    // The caret belongs where the next character will land: inside the last
    // block, at the end of its text. A stream that happens to stop on a block
    // boundary still gets it inside that block, not on a line of its own.
    // The closing tag may be followed by </ul>, </ol>, </tbody></table>: the
    // caret still goes inside the last item, not after the list.
    const closed = /<\/(p|li|h[1-6]|td)>(?=(?:<\/(?:ul|ol|table|tbody)>)*$)/.exec(html);
    if (closed) html = `${html.slice(0, closed.index)}${caret}${html.slice(closed.index)}`;
    else html += caret;
  }
  return html;
}

function kb(n: number): string {
  return `${(n / 1024).toFixed(1)} kB`;
}

function mmss(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
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

  const [projectName, setProjectName] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocState[]>(initDocs(ORDER));
  const [active, setActive] = useState<DocumentType>('prd');
  const [phase, setPhase] = useState<Phase>('connecting');
  const [fatal, setFatal] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ generated: string[]; failed: string[]; skipped: string[] } | null>(null);
  const [follow, setFollow] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [wireframing, setWireframing] = useState(false);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedAt = useRef<number>(0);
  const finishedRef = useRef(false);

  /* Deltas arrive at token speed. Re-rendering the whole document on each
     one is wasted work and makes the text jitter; buffer them and paint at
     ~14 fps, which is faster than the eye and far cheaper than the stream. */
  const pending = useRef<Map<string, string>>(new Map());
  const flushTimer = useRef<number | null>(null);

  const flushNow = useCallback(() => {
    if (flushTimer.current) { window.clearTimeout(flushTimer.current); flushTimer.current = null; }
    if (pending.current.size === 0) return;
    const entries = [...pending.current.entries()];
    pending.current.clear();
    setDocs((prev) => prev.map((d) => {
      const hit = entries.find(([t]) => t === d.type);
      return hit ? { ...d, text: d.text + hit[1] } : d;
    }));
  }, []);

  const queueDelta = useCallback((type: string, text: string) => {
    pending.current.set(type, (pending.current.get(type) ?? '') + text);
    if (flushTimer.current) return;
    flushTimer.current = window.setTimeout(() => {
      flushTimer.current = null;
      flushNow();
    }, 70);
  }, [flushNow]);

  const patch = useCallback((type: DocumentType, next: Partial<DocState>) => {
    setDocs((prev) => prev.map((d) => (d.type === type ? { ...d, ...next } : d)));
  }, []);

  /* A stream that ends early leaves its last document flagged `writing` with
     no writer. Say so in the index rather than leaving a live dot spinning
     for the rest of the session. */
  const closeOpenDoc = useCallback(() => {
    setDocs((prev) => prev.map((d) => (d.status === 'writing'
      ? { ...d, status: 'failed', error: 'Sambungan terputus sebelum dokumen ini selesai.' }
      : d)));
  }, []);


  const runBatch = useCallback(async (list: DocumentType[], mode: 'replace' | 'append') => {
    if (list.length === 0) return;
    setFatal(null);
    finishedRef.current = false;
    setPhase('connecting');
    startedAt.current = Date.now();
    setElapsed(0);

    if (mode === 'replace') {
      setSummary(null);
      setDocs(initDocs(list));
    } else {
      // Append: keep what is already on the page, reset only the new ones.
      setDocs((prev) => {
        const next = [...prev];
        for (const t of list) {
          const i = next.findIndex((d) => d.type === t);
          const fresh: DocState = { type: t, status: 'queued', text: '', bytes: null, error: null };
          if (i === -1) next.push(fresh); else next[i] = fresh;
        }
        return next;
      });
    }
    setActive(list[0] ?? 'prd');
    setFollow(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const qs = list.length === ORDER.length && list.every((t, i) => t === ORDER[i])
      ? ''
      : `?types=${list.join(',')}`;

    try {
      // A 409 means another stream holds the project's batch. That happens
      // legitimately in dev, where React StrictMode mounts twice and the first
      // request is still releasing the guard. Wait for it and try again before
      // telling the reader anything is wrong.
      let res: Response | null = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        res = await fetch(`/api/v1/projects/${projectId}/documents/generate-stream${qs}`, {
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
        let message = res?.status === 409
          ? 'Proyek ini sedang ditulis di tab lain. Tutup tab itu, lalu coba lagi.'
          : `Server menolak permintaan (${res?.status ?? 0}).`;
        try {
          const body = await res?.json();
          message = body?.error?.message ?? message;
        } catch { /* the envelope was not JSON */ }
        setFatal(message);
        setPhase('error');
        return;
      }

      setPhase('writing');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parse = makeParser(({ event, data }) => {
        let payload: Record<string, unknown>;
        try { payload = JSON.parse(data) as Record<string, unknown>; } catch { return; }

        if (event === 'start') {
          if (mode === 'append') return; // keep the six already on the page
          const order = (payload.order as DocumentType[] | undefined) ?? list;
          setDocs(initDocs(order));
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
          queueDelta(payload.type as string, (payload.text as string | undefined) ?? '');
          return;
        }
        if (event === 'done') {
          flushNow();
          const type = payload.type as DocumentType;
          patch(type, { status: 'ready', bytes: (payload.bytes as number | undefined) ?? null });
          return;
        }
        if (event === 'error') {
          flushNow();
          const type = payload.type as DocumentType | null;
          const message = (payload.message as string | undefined) ?? 'Gagal menulis dokumen';
          if (type) patch(type, { status: 'failed', error: message });
          else setFatal(message);
          return;
        }
        if (event === 'finish') {
          flushNow();
          finishedRef.current = true;
          setSummary({
            generated: (payload.generated as string[] | undefined) ?? [],
            failed: ((payload.failed as unknown[] | undefined) ?? []).map((f) =>
              typeof f === 'string' ? f : ((f as { type?: string })?.type ?? 'dokumen')),
            skipped: (payload.skipped as string[] | undefined) ?? [],
          });
          setPhase('done');
          return;
        }
      });

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parse(decoder.decode(value, { stream: true }));
      }
      flushNow();
      // The reader ending without a `finish` event is not success: the tunnel
      // or the process dropped the stream. Say so, and offer to carry on.
      if (!finishedRef.current) {
        closeOpenDoc();
        setPhase((p) => (p === 'writing' || p === 'connecting' ? 'interrupted' : p));
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // we stopped it on purpose
      flushNow();
      closeOpenDoc();
      setPhase('interrupted');
    }
  }, [projectId, patch, queueDelta, flushNow, closeOpenDoc]);

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
    void runBatch(ORDER, 'replace');
    return () => abortRef.current?.abort();
  }, [projectId, runBatch]);

  // A clock, so a long document has a sense of time passing.
  useEffect(() => {
    if (phase !== 'writing' && phase !== 'connecting') return;
    const id = window.setInterval(() => setElapsed(Date.now() - startedAt.current), 500);
    return () => window.clearInterval(id);
  }, [phase]);

  // Follow the ink: keep the writing document scrolled to its last line,
  // unless the reader has scrolled away to read something above it.
  const activeStatus = docs.find((d) => d.type === active)?.status;
  useEffect(() => {
    // Only chase the ink while it is wet. A finished document is for reading,
    // so it opens at the top rather than snapped to its last line.
    if (!follow || activeStatus !== 'writing') return;
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [docs, follow, active, activeStatus]);

  // On a phone the index is a horizontal strip: bring the writing document
  // into view so the reader is not looking at document 1 while 5 is written.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const btn = rail.querySelector<HTMLElement>(`[data-doc="${active}"]`);
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const rr = rail.getBoundingClientRect();
    if (r.left < rr.left || r.right > rr.right) {
      rail.scrollTo({ left: btn.offsetLeft - 16, behavior: 'smooth' });
    }
  }, [active]);

  const current = useMemo(() => docs.find((d) => d.type === active) ?? docs[0], [docs, active]);
  const doneCount = docs.filter((d) => d.status === 'ready').length;
  const failedCount = docs.filter((d) => d.status === 'failed').length;
  const settled = phase === 'done';
  const busy = phase === 'writing' || phase === 'connecting';

  const stop = useCallback(() => {
    abortRef.current?.abort();
    flushNow();
    closeOpenDoc();
    setPhase('stopped');
  }, [flushNow, closeOpenDoc]);

  const resume = useCallback(() => {
    // Carry on with whatever is not finished, in the batch's own order.
    const rest = docs.filter((d) => d.status !== 'ready').map((d) => d.type);
    void runBatch(rest.length > 0 ? rest : ORDER, 'append');
  }, [docs, runBatch]);

  const startWireframe = useCallback(async () => {
    setWireframing(true);
    setFatal(null);
    await runBatch(['wireframe'], 'append');
    setWireframing(false);
  }, [runBatch]);

  const eyebrow = phase === 'done' ? 'selesai'
    : phase === 'interrupted' ? 'terputus'
    : phase === 'stopped' ? 'dihentikan'
    : phase === 'error' ? 'gagal'
    : 'menulis';

  // A batch can finish having written nothing (every document failed). That is
  // not "tertulis", and the heading must not say it is.
  const title = phase === 'done'
      ? (doneCount === 0 ? 'Tidak ada dokumen yang jadi.' : 'Dokumen sudah tertulis.')
    : phase === 'interrupted' ? 'Sambungan terputus.'
    : phase === 'stopped' ? 'Penulisan dihentikan.'
    : phase === 'error' ? 'Tidak bisa mulai menulis.'
    : 'Dokumen sedang ditulis.';

  return (
    <div className="pg-write">
      <header className="top">
        <div className="crumbs">
          <Link href="/studio" className="back mono">
            <svg className="chev" width="6" height="9" viewBox="0 0 6 9" fill="none" aria-hidden="true">
              <path d="M5 1L1.5 4.5L5 8" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            Studio
          </Link>
          <span className="mono muted">/</span>
          <span className="mono pname">{projectName ?? 'proyek'}</span>
        </div>
        <div className="head">
          <div>
            <p className={`eyebrow ${busy ? '' : 'quiet'}`}>{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          <p className="tally mono">
            <b>{doneCount}</b>
            <span className="of">/ {docs.length}</span>
            <span className="tl">dokumen</span>
            {busy && <span className="clock">{mmss(elapsed)}</span>}
          </p>
        </div>
      </header>

      {fatal && (
        <div className="alert" role="alert">
          <p>{fatal}</p>
          {!busy && (
            <button className="btn ghost" onClick={resume}>
              {docs.some((d) => d.status === 'ready') ? 'Lanjutkan' : 'Coba lagi'}
            </button>
          )}
        </div>
      )}

      <div className="cols">
        <nav className="rail" aria-label="Dokumen dalam batch" ref={railRef}>
          <p className="rail-cap mono">Batch</p>
          {docs.map((d, i) => (
            <button
              key={d.type}
              type="button"
              data-doc={d.type}
              aria-current={d.type === active ? 'true' : undefined}
              className={`step ${d.type === active ? 'on' : ''} ${d.status}`}
              onClick={() => setActive(d.type)}
            >
              <span className="idx mono">{String(i + 1).padStart(2, '0')}</span>
              <span className="nm">{LABEL[d.type]}</span>
              <span className="st mono">
                {d.status === 'ready' ? (d.bytes ? kb(d.bytes) : 'siap')
                  : d.status === 'failed' ? 'gagal'
                  : d.status === 'writing' ? 'menulis'
                  : 'menunggu'}
              </span>
              <span className="mark" aria-hidden="true" />
            </button>
          ))}
        </nav>

        <article className="sheet card">
          <header className="running">
            <div className="rh">
              <h2>{LABEL[current?.type ?? 'prd']}</h2>
              <p className={`meta mono ${current?.status === 'writing' ? 'wet' : ''}`}>
                {current?.status === 'ready'
                  ? `selesai · ${current.bytes ? kb(current.bytes) : '—'}`
                  : current?.status === 'writing' ? 'sedang ditulis'
                  : current?.status === 'failed' ? 'gagal'
                  : 'menunggu giliran'}
              </p>
            </div>
            {current?.status === 'ready' && (
              <Link className="btn ghost sm" href={`/projects/${projectId}/documents/${current.type}`}>
                Buka dokumen
              </Link>
            )}
          </header>

          <div
            className={`body ${follow && busy ? 'following' : ''}`}
            ref={boxRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
            }}
          >
            {/* The stream is announced once, not on every token: a polite
                live region on the whole article would read 15k characters. */}
            <p className="sr-only" role="status">
              {current?.status === 'writing' ? `${LABEL[current.type]} sedang ditulis` : ''}
            </p>
            {current?.text ? (
              <div
                className="ms"
                dangerouslySetInnerHTML={{ __html: renderMd(current.text, current.status === 'writing') }}
              />
            ) : current?.status === 'writing' ? (
              <p className="waiting mono"><span className="caret" aria-hidden="true" /> menunggu kata pertama…</p>
            ) : current?.status === 'failed' ? (
              <p className="waiting">Dokumen ini gagal ditulis{current.error ? `: ${current.error}` : '.'}</p>
            ) : (
              <p className="waiting">Giliran dokumen ini belum tiba.</p>
            )}
          </div>

          {current?.status === 'writing' && (
            <footer className="inkline" aria-hidden="true">
              <span className="bar" />
            </footer>
          )}
        </article>
      </div>

      <footer className="foot">
        {settled && doneCount === 0 ? (
          /* Nothing was written: do not offer an export of an empty project. */
          <>
            <p className="note">
              Batch selesai tanpa satu dokumen pun. Yang gagal ditandai di indeks —
              buka salah satunya untuk melihat sebabnya, lalu jalankan lagi.
            </p>
            <div className="row">
              <button className="btn primary" onClick={resume}>Coba lagi</button>
              <Link className="btn ghost" href={`/projects/${projectId}/interview`}>
                Kembali ke wawancara
              </Link>
            </div>
          </>
        ) : settled ? (
          <>
            <div className="press">
              <p className="note">
                <strong>{summary?.generated.length ?? doneCount} dokumen selesai.</strong>
                {failedCount > 0 && ` ${failedCount} gagal.`}
                {' '}Wireframe tidak termasuk — buat terpisah kalau memang perlu.
              </p>
              <div className="row">
                <div className="dl" role="group" aria-label="Unduh proyek">
                  <span className="dl-label mono">Unduh</span>
                  {(['md', 'zip', 'json'] as const).map((f) => (
                    <a
                      key={f}
                      className="dl-fmt mono"
                      href={`/api/v1/projects/${projectId}/export?format=${f}`}
                      download
                    >
                      {f.toUpperCase()}
                    </a>
                  ))}
                </div>
                <Link className="btn primary" href={`/projects/${projectId}/documents/prd`}>
                  Baca dokumen
                </Link>
              </div>
            </div>

            <div className="optional">
              <div className="opt-txt">
                <h3>Wireframe?</h3>
                <p>
                  Sketsa tata letak tiap layar, dibuat dari dokumen di atas.
                  Opsional — spesifikasinya sudah lengkap tanpa ini.
                </p>
              </div>
              {docs.some((d) => d.type === 'wireframe' && d.status === 'ready') ? (
                <Link className="btn ghost" href={`/projects/${projectId}/documents/wireframe`}>
                  Lihat wireframe
                </Link>
              ) : (
                <button className="btn ghost" onClick={() => void startWireframe()} disabled={wireframing}>
                  {wireframing ? 'Membuat wireframe…' : 'Buat wireframe'}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="note">
              {phase === 'interrupted'
                ? 'Dokumen yang sudah selesai tetap tersimpan. Lanjutkan untuk menulis sisanya.'
                : phase === 'stopped'
                  ? 'Berhenti. Yang sudah selesai tetap tersimpan.'
                  : phase === 'error'
                    ? 'Belum ada yang ditulis. Perbaiki penyebabnya, lalu coba lagi.'
                    : phase === 'connecting'
                      ? 'Menyambung ke penulis…'
                      : 'Biarkan tab ini terbuka. Tiap dokumen muncul di sini begitu mulai ditulis.'}
            </p>
            <div className="row">
              {busy ? (
                <button className="btn ghost" onClick={stop}>Hentikan</button>
              ) : (
                <>
                  {/* the alert already carries the retry when the start failed */}
                  {phase !== 'error' && (
                    <button className="btn ghost" onClick={resume}>Lanjutkan</button>
                  )}
                  <Link className="btn ghost" href={`/projects/${projectId}/interview`}>
                    Kembali ke wawancara
                  </Link>
                </>
              )}
            </div>
          </>
        )}
      </footer>
    </div>
  );
}