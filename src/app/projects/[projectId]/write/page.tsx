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

/* `reconnecting` is its own state, not a flavour of `interrupted`: the
   connection is being rebuilt and the page says so. Only when the retries
   are spent does it become `interrupted` (terputus). `stopped` is the
   reader's own decision and must never read as a failure. */
type Phase = 'connecting' | 'reconnecting' | 'writing' | 'done' | 'stopped' | 'interrupted' | 'error';

interface DocState {
  type: DocumentType;
  status: 'queued' | 'writing' | 'ready' | 'failed';
  text: string;
  bytes: number | null;
  error: string | null;
}

/** What the server sends first on every attach (lib/services/batchRunner.ts). */
interface SnapshotPayload {
  projectId: string;
  order: DocumentType[];
  docs: { type: DocumentType; status: DocState['status']; text: string; bytes: number | null; error: string | null }[];
  startedAt: number;
  elapsedMs: number;
  finished: boolean;
  result: { generated: string[]; failed: unknown[]; skipped: string[] } | null;
}

const LABEL: Record<DocumentType, string> = {
  prd: 'PRD', architecture: 'Arsitektur', database: 'Database', api: 'API',
  tasks: 'Tugas', memory: 'Memori', wireframe: 'Wireframe',
};

/* The six the batch writes by itself. Wireframe is opt-in and never in here. */
const ORDER: DocumentType[] = ['prd', 'architecture', 'database', 'api', 'tasks', 'memory'];

const initDocs = (list: DocumentType[]): DocState[] =>
  list.map((t) => ({ type: t, status: 'queued', text: '', bytes: null, error: null }));

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
   request still gives us the JSON envelope to show.

   The server sends `: ping` every 15s to keep a tunnel from dropping an
   idle connection. A comment line is not an event: it is skipped, never
   parsed as data, and a block with no `data:` line produces nothing.*/
interface SseEvent { event: string; data: string }

function makeParser(onEvent: (e: SseEvent) => void) {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk.replace(/\r\n/g, '\n');
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of raw.split('\n')) {
        // `: ping` is a comment, not an event. A keep-alive must never reach
        // JSON.parse, and a block with no data line must produce nothing at all.
        if (line.startsWith(':')) continue;
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length > 0) onEvent({ event, data: dataLines.join('\n') });
    }
  };
}

/* How many times a dropped stream is rebuilt before the page calls it
   terputus. Three attempts at 1s, 2s, 4s: long enough to ride out a tunnel
   hiccup, short enough that a dead server is reported in seven seconds. */
const REATTACH_DELAYS = [1000, 2000, 4000];

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
  const [stopping, setStopping] = useState(false);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedAt = useRef<number>(0);
  const finishedRef = useRef(false);
  /** The reader pressed stop: a `finish` after that is theirs, not a success. */
  const stoppedRef = useRef(false);
  /** Set once a snapshot has been applied, so a later 409 means "it ended". */
  const hydratedRef = useRef(false);
  /** False after unmount: no retry may fire into a dead component. */
  const aliveRef = useRef(true);

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
  const closeOpenDoc = useCallback((reason = 'Sambungan terputus sebelum dokumen ini selesai.') => {
    setDocs((prev) => prev.map((d) => (d.status === 'writing'
      ? { ...d, status: 'failed', error: reason }
      : d)));
  }, []);

  /* ── Snapshot → page ────────────────────────────────────────────────
     The first event of every attach is the whole truth: the order, every
     document's status, and the partial text of the one being written. It
     replaces what is on the page rather than merging into it, so a
     re-attach cannot leave a half-flushed delta behind as a duplicate. */
  const hydrate = useCallback((snap: SnapshotPayload) => {
    if (flushTimer.current) { window.clearTimeout(flushTimer.current); flushTimer.current = null; }
    pending.current.clear();

    const list: DocState[] = snap.docs.map((d) => ({
      type: d.type,
      status: d.status,
      text: d.text ?? '',
      bytes: d.bytes ?? null,
      error: d.error ?? null,
    }));
    setDocs(list);
    hydratedRef.current = true;
    startedAt.current = snap.startedAt || Date.now() - (snap.elapsedMs ?? 0);
    setElapsed(snap.elapsedMs ?? 0);

    const writing = list.find((d) => d.status === 'writing');
    const lastReady = [...list].reverse().find((d) => d.status === 'ready');
    setActive(writing?.type ?? lastReady?.type ?? list[0]?.type ?? 'prd');

    if (snap.finished) {
      finishedRef.current = true;
      setSummary({
        generated: snap.result?.generated ?? [],
        failed: ((snap.result?.failed ?? []) as unknown[]).map((f) =>
          typeof f === 'string' ? f : ((f as { type?: string })?.type ?? 'dokumen')),
        skipped: snap.result?.skipped ?? [],
      });
      // A batch that ended while the page was away is not a live view: the
      // press (export / optional wireframe) is the whole screen.
      setPhase(stoppedRef.current ? 'stopped' : 'done');
    }
  }, []);

  /* ── One attach ─────────────────────────────────────────────────────
     Reads the stream to its end and reports why it ended. It never starts
     a batch and never cancels one: this request is a tail. */
  type AttachResult = 'finished' | 'dropped' | 'conflict' | 'failed';

  const attachOnce = useCallback(async (): Promise<AttachResult> => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let res: Response;
    try {
      res = await fetch(`/api/v1/projects/${projectId}/documents/generate-stream`, {
        credentials: 'same-origin',
        signal: ctrl.signal,
        headers: { Accept: 'text/event-stream' },
      });
    } catch {
      return ctrl.signal.aborted ? 'dropped' : 'failed';
    }

    // 409 is plain JSON, not SSE: no batch is running for this project.
    if (res.status === 409) return 'conflict';
    if (!res.ok || !res.body) {
      let message = `Server menolak permintaan (${res.status}).`;
      try {
        const body = await res.json();
        message = body?.error?.message ?? message;
      } catch { /* the envelope was not JSON */ }
      setFatal(message);
      return 'failed';
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const parse = makeParser(({ event, data }) => {
      let payload: Record<string, unknown>;
      try { payload = JSON.parse(data) as Record<string, unknown>; } catch { return; }

      if (event === 'snapshot') {
        hydrate(payload as unknown as SnapshotPayload);
        return;
      }
      if (event === 'start') {
        const order = (payload.order as DocumentType[] | undefined) ?? ORDER;
        // Only a fresh batch needs a fresh index; a re-attach already has one.
        if (!hydratedRef.current) setDocs(initDocs(order));
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
        setPhase(stoppedRef.current ? 'stopped' : 'done');
        return;
      }
    });

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parse(decoder.decode(value, { stream: true }));
      }
    } catch {
      // A torn connection lands here (the tunnel closing mid-chunk).
      flushNow();
      return 'dropped';
    } finally {
      try { reader.releaseLock(); } catch { /* already released */ }
    }

    flushNow();
    return finishedRef.current ? 'finished' : 'dropped';
  }, [projectId, hydrate, patch, queueDelta, flushNow]);

  /* ── Attach, and rebuild the connection if it drops ─────────────────
     The batch lives on the server, so a drop is a display problem: retry
     the GET with backoff, and the snapshot that comes back carries every
     byte written while we were away. Only when the retries are spent does
     the page say terputus. */
  const watch = useCallback(async (): Promise<'done' | 'conflict' | 'lost'> => {
    for (let attempt = 0; ; attempt++) {
      if (!aliveRef.current) return 'lost';
      const result = await attachOnce();
      if (!aliveRef.current) return 'lost';

      if (result === 'finished') return 'done';
      if (result === 'conflict') {
        // A 409 after a snapshot means the batch ended while we were away.
        // The page already holds every byte written: keep it, do not re-read
        // the documents list, which carries no text.
        if (hydratedRef.current) {
          finishedRef.current = true;
          setPhase(stoppedRef.current ? 'stopped' : 'done');
          return 'done';
        }
        return 'conflict';
      }
      if (result === 'failed') return 'lost';

      // dropped
      if (attempt >= REATTACH_DELAYS.length) {
        closeOpenDoc();
        setPhase('interrupted');
        return 'lost';
      }
      setPhase('reconnecting');
      await sleep(REATTACH_DELAYS[attempt] ?? 4000);
    }
  }, [attachOnce, closeOpenDoc]);

  /* ── Nothing running: read what is on disk ──────────────────────────
     A 409 on attach means the batch is over (or was never started). The
     documents endpoint is the truth then: finished documents mean the
     completion state, and a document left `generating` with no batch
     behind it means the process died mid-write. */
  const hydrateFromDocuments = useCallback(async (): Promise<'done' | 'empty'> => {
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/documents`, { credentials: 'same-origin' });
      if (!res.ok) return 'empty';
      const body = await res.json() as { documents?: { type: DocumentType; status: string; hasContent: boolean }[] };
      const list = body.documents ?? [];
      if (list.length === 0) return 'empty';

      const mapped: DocState[] = list.map((d) => ({
        type: d.type,
        status: d.status === 'ready' || d.status === 'stale' ? 'ready'
          : d.status === 'failed' ? 'failed'
          // `generating` with no batch behind it is a process that died mid-write.
          : d.status === 'generating' ? 'failed'
          : 'queued',
        text: '',
        bytes: null,
        error: d.status === 'generating' ? 'Penulisan berhenti sebelum dokumen ini selesai.' : null,
      }));

      const anyContent = mapped.some((d) => d.status === 'ready');
      const anyStuck = mapped.some((d) => d.status === 'failed');
      if (!anyContent && !anyStuck) return 'empty';

      setDocs(mapped);
      setActive(mapped.find((d) => d.status === 'ready')?.type ?? mapped[0]?.type ?? 'prd');
      hydratedRef.current = true;
      finishedRef.current = true;
      setSummary(null);
      setPhase(anyStuck ? 'interrupted' : 'done');
      return 'done';
    } catch {
      return 'empty';
    }
  }, [projectId]);

  /* POST generate-all, then tail it. Used only for a project with nothing
     written yet, and for the reader's own "Lanjutkan". */
  const startBatch = useCallback(async (list: DocumentType[]): Promise<boolean> => {
    if (list.length === 0) return false;
    setFatal(null);
    setStopping(false);
    stoppedRef.current = false;
    finishedRef.current = false;
    hydratedRef.current = false;
    setSummary(null);
    setPhase('connecting');
    startedAt.current = Date.now();
    setElapsed(0);
    setDocs(initDocs(list));
    setActive(list[0] ?? 'prd');
    setFollow(true);

    const qs = list.length === ORDER.length && list.every((t, i) => t === ORDER[i])
      ? ''
      : `?types=${list.join(',')}`;

    try {
      const res = await fetch(`/api/v1/projects/${projectId}/documents/generate-all${qs}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        // generate-all reads the selection from the body, not the query.
        body: JSON.stringify(list.length === ORDER.length && list.every((t, i) => t === ORDER[i]) ? {} : { types: list }),
      });
      if (res.status === 409) return true; // someone else holds it: just tail
      if (!res.ok) {
        let message = `Server menolak permintaan (${res.status}).`;
        try {
          const body = await res.json();
          message = body?.error?.message ?? message;
        } catch { /* not JSON */ }
        setFatal(message);
        setPhase('error');
        return false;
      }
      return true;
    } catch {
      setFatal('Tidak bisa menghubungi server.');
      setPhase('error');
      return false;
    }
  }, [projectId]);

  /* ── Boot ───────────────────────────────────────────────────────────
     Attach first, always. A running batch is adopted (snapshot hydrates
     the text already written); a finished one shows the press; only a
     project with nothing at all on disk starts a batch of its own. */
  const boot = useCallback(async () => {
    const outcome = await watch();
    if (outcome !== 'conflict') return;

    const disk = await hydrateFromDocuments();
    if (disk === 'done') return;

    // Nothing written and nothing running: this is a fresh project.
    const started = await startBatch(ORDER);
    if (!started) return;
    await watch();
  }, [watch, hydrateFromDocuments, startBatch]);

  useEffect(() => {
    aliveRef.current = true;
    void (async () => {
      try {
        const res = await fetch(`/api/v1/projects/${projectId}`, { credentials: 'same-origin' });
        if (res.ok) {
          const body = await res.json();
          setProjectName(body?.project?.name ?? null);
        }
      } catch { /* the name is decoration; the stream is the page */ }
    })();
    void boot();
    // Detaching costs the server one listener; the batch keeps writing.
    return () => {
      aliveRef.current = false;
      abortRef.current?.abort();
    };
  }, [projectId, boot]);

  // A clock, so a long document has a sense of time passing.
  useEffect(() => {
    if (phase !== 'writing' && phase !== 'connecting' && phase !== 'reconnecting') return;
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
  const busy = phase === 'writing' || phase === 'connecting' || phase === 'reconnecting';

  /* ── Stop ───────────────────────────────────────────────────────────
     The batch belongs to the server, so stopping it is a request to the
     server, not an abort of this fetch: aborting would only detach the
     display and leave the writer running (and burning tokens) unseen.
     The stream then delivers the runner's own `finish`, and the page
     reports it as dihentikan because stoppedRef says the reader asked. */
  const stop = useCallback(async () => {
    if (stopping) return;
    setStopping(true);
    stoppedRef.current = true;
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/documents/cancel`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!res.ok && res.status !== 404) {
        // 404 means it had already ended: either way nothing is writing now.
        let message = `Tidak bisa menghentikan (${res.status}).`;
        try {
          const body = await res.json();
          message = body?.error?.message ?? message;
        } catch { /* not JSON */ }
        setFatal(message);
        stoppedRef.current = false;
        setStopping(false);
        return;
      }
    } catch {
      setFatal('Tidak bisa menghubungi server untuk menghentikan penulisan.');
      stoppedRef.current = false;
      setStopping(false);
      return;
    }
    flushNow();
    closeOpenDoc('Dihentikan sebelum dokumen ini selesai.');
    setPhase('stopped');
    setStopping(false);
  }, [projectId, stopping, flushNow, closeOpenDoc]);

  const resume = useCallback(() => {
    // Carry on with whatever is not finished, in the batch's own order.
    const rest = docs.filter((d) => d.status !== 'ready').map((d) => d.type);
    void (async () => {
      const started = await startBatch(rest.length > 0 ? rest : ORDER);
      if (started) await watch();
    })();
  }, [docs, startBatch, watch]);

  const startWireframe = useCallback(async () => {
    setWireframing(true);
    setFatal(null);
    const started = await startBatch(['wireframe']);
    if (started) await watch();
    setWireframing(false);
  }, [startBatch, watch]);

  const eyebrow = phase === 'done' ? 'selesai'
    : phase === 'interrupted' ? 'terputus'
    : phase === 'stopped' ? 'dihentikan'
    : phase === 'error' ? 'gagal'
    : phase === 'reconnecting' ? 'menyambung ulang'
    : 'menulis';

  // A batch can finish having written nothing (every document failed). That is
  // not "tertulis", and the heading must not say it is.
  const title = phase === 'done'
      ? (doneCount === 0 ? 'Tidak ada dokumen yang jadi.' : 'Dokumen sudah tertulis.')
    : phase === 'interrupted' ? 'Sambungan terputus.'
    : phase === 'stopped' ? 'Penulisan dihentikan.'
    : phase === 'error' ? 'Tidak bisa mulai menulis.'
    : phase === 'reconnecting' ? 'Menyambung ulang…'
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
            ) : current?.status === 'ready' ? (
              /* Read from disk, not from a stream: the text is not in this
                 page, the reading view has it. */
              <p className="waiting">
                Dokumen ini sudah tertulis.{' '}
                <Link href={`/projects/${projectId}/documents/${current.type}`}>Buka untuk membacanya</Link>.
              </p>
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
              <Link className="btn ghost" href={`/projects/${projectId}/[REDACTED:TMP_SECRET_D40DC8D77949]`}>
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
              {phase === 'reconnecting'
                ? 'Sambungan putus. Menyambung ulang — dokumen tetap ditulis di server, tidak ada yang hilang.'
                : phase === 'interrupted'
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
                <button className="btn ghost" onClick={() => void stop()} disabled={stopping}>
                  {stopping ? 'Menghentikan…' : 'Hentikan'}
                </button>
              ) : (
                <>
                  {/* the alert already carries the retry when the start failed */}
                  {phase !== 'error' && (
                    <button className="btn ghost" onClick={resume}>Lanjutkan</button>
                  )}
                  <Link className="btn ghost" href={`/projects/${projectId}/[REDACTED:TMP_SECRET_D40DC8D77949]`}>
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