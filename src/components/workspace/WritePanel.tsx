'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Square,
  Play,
  BookMarked,
  FileText,
  Layout,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { Badge, Button, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { DocumentType, WorkspaceProject } from './types';
import { CORE_DOC_ORDER, DOC_LABEL } from './types';

type Phase =
  | 'idle'
  | 'connecting'
  | 'reconnecting'
  | 'writing'
  | 'done'
  | 'stopped'
  | 'interrupted'
  | 'error';

interface DocStreamState {
  type: DocumentType;
  status: 'queued' | 'writing' | 'ready' | 'failed';
  text: string;
  bytes: number | null;
  error: string | null;
}

interface SnapshotPayload {
  projectId: string;
  order: DocumentType[];
  docs: DocStreamState[];
  startedAt: number;
  elapsedMs: number;
  finished: boolean;
  result: { generated: string[]; failed: unknown[]; skipped: string[] } | null;
}

const initDocs = (list: DocumentType[]): DocStreamState[] =>
  list.map((t) => ({ type: t, status: 'queued', text: '', bytes: null, error: null }));

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const REATTACH_DELAYS = [1000, 2000, 4000];

function renderStreamHtml(md: string, live = false): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');

  const lines = md.split('\n');
  const out: string[] = [];
  let inCode = false;
  let listType: 'ul' | 'ol' | null = null;
  let inTable = false;
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };
  const closeTable = () => {
    if (inTable) {
      out.push('</tbody></table>');
      inTable = false;
    }
  };

  for (const line of lines) {
    if (line.startsWith('```')) {
      closeList();
      closeTable();
      out.push(inCode ? '</code></pre>' : '<pre><code>');
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(esc(line));
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      closeTable();
      const lvl = Math.min((h[1] ?? '#').length + 1, 5);
      out.push(`<h${lvl}>${inline(h[2] ?? '')}</h${lvl}>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (/^[\s|:-]+$/.test(line)) continue;
      const cells = line
        .trim()
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      if (!inTable) {
        closeList();
        out.push('<table><tbody>');
        inTable = true;
      }
      out.push(`<tr>${cells.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`);
      continue;
    }
    closeTable();
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul) {
      if (listType !== 'ul') {
        closeList();
        out.push('<ul>');
        listType = 'ul';
      }
      out.push(`<li>${inline(ul[1] ?? '')}</li>`);
      continue;
    }
    if (ol) {
      if (listType !== 'ol') {
        closeList();
        out.push('<ol>');
        listType = 'ol';
      }
      out.push(`<li>${inline(ol[1] ?? '')}</li>`);
      continue;
    }
    closeList();
    if (line.trim() === '') continue;
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  closeTable();
  if (inCode) out.push('</code></pre>');

  let html = out.join('\n');
  if (live) {
    const caret = '<span class="wet-caret ml-0.5" aria-hidden="true"></span>';
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
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

interface SseEvent {
  event: string;
  data: string;
}

function makeSseParser(onEvent: (e: SseEvent) => void) {
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
        if (line.startsWith(':')) continue;
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length > 0) onEvent({ event, data: dataLines.join('\n') });
    }
  };
}

interface WritePanelProps {
  project: WorkspaceProject;
  autoStart?: boolean;
  onAutoStartConsumed?: () => void;
  onDocumentsChanged: () => void;
  onOpenDocument: (type: DocumentType) => void;
  onBackToInterview: () => void;
}

export function WritePanel({
  project,
  autoStart = false,
  onAutoStartConsumed,
  onDocumentsChanged,
  onOpenDocument,
  onBackToInterview,
}: WritePanelProps) {
  const { toast } = useToast();
  const projectId = project.id;

  const [docs, setDocs] = useState<DocStreamState[]>(initDocs(CORE_DOC_ORDER));
  const [active, setActive] = useState<DocumentType>('prd');
  const [phase, setPhase] = useState<Phase>('connecting');
  const [fatal, setFatal] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [wireframing, setWireframing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [savingLib, setSavingLib] = useState(false);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedAt = useRef<number>(0);
  const finishedRef = useRef(false);
  const stoppedRef = useRef(false);
  const hydratedRef = useRef(false);
  const aliveRef = useRef(true);
  const pending = useRef<Map<string, string>>(new Map());
  const flushTimer = useRef<number | null>(null);

  const flushNow = useCallback(() => {
    if (flushTimer.current) {
      window.clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    if (pending.current.size === 0) return;
    const entries = [...pending.current.entries()];
    pending.current.clear();
    setDocs((prev) =>
      prev.map((d) => {
        const hit = entries.find(([t]) => t === d.type);
        return hit ? { ...d, text: d.text + hit[1] } : d;
      }),
    );
  }, []);

  const queueDelta = useCallback(
    (type: string, text: string) => {
      pending.current.set(type, (pending.current.get(type) ?? '') + text);
      if (flushTimer.current) return;
      flushTimer.current = window.setTimeout(() => {
        flushTimer.current = null;
        flushNow();
      }, 70);
    },
    [flushNow],
  );

  const patch = useCallback((type: DocumentType, next: Partial<DocStreamState>) => {
    setDocs((prev) => prev.map((d) => (d.type === type ? { ...d, ...next } : d)));
  }, []);

  const closeOpenDoc = useCallback((reason = 'Sambungan terputus sebelum dokumen ini selesai.') => {
    setDocs((prev) =>
      prev.map((d) => (d.status === 'writing' ? { ...d, status: 'failed', error: reason } : d)),
    );
  }, []);

  const hydrate = useCallback((snap: SnapshotPayload) => {
    if (flushTimer.current) {
      window.clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    pending.current.clear();

    const list: DocStreamState[] = snap.docs.map((d) => ({
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
      setPhase(stoppedRef.current ? 'stopped' : 'done');
      onDocumentsChanged();
      return;
    }
    setPhase(stoppedRef.current ? 'stopped' : 'writing');
  }, [onDocumentsChanged]);

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

    if (res.status === 409) return 'conflict';
    if (!res.ok || !res.body) {
      let message = `Server menolak permintaan (${res.status}).`;
      try {
        const body = await res.json();
        message = body?.error?.message ?? message;
      } catch {
        /* plain */
      }
      setFatal(message);
      return 'failed';
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const parse = makeSseParser(({ event, data }) => {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(data) as Record<string, unknown>;
      } catch {
        return;
      }

      if (event === 'snapshot') {
        hydrate(payload as unknown as SnapshotPayload);
        return;
      }
      if (event === 'start') {
        const order = (payload.order as DocumentType[] | undefined) ?? CORE_DOC_ORDER;
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
        onDocumentsChanged();
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
        setPhase(stoppedRef.current ? 'stopped' : 'done');
        onDocumentsChanged();
      }
    });

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parse(decoder.decode(value, { stream: true }));
      }
    } catch {
      flushNow();
      return 'dropped';
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* already released */
      }
    }

    flushNow();
    return finishedRef.current ? 'finished' : 'dropped';
  }, [projectId, hydrate, patch, queueDelta, flushNow, onDocumentsChanged]);

  const watch = useCallback(async (): Promise<'done' | 'conflict' | 'lost'> => {
    for (let attempt = 0; ; attempt++) {
      if (!aliveRef.current) return 'lost';
      const result = await attachOnce();
      if (!aliveRef.current) return 'lost';
      if (result === 'finished') return 'done';
      if (result === 'conflict') {
        if (hydratedRef.current) {
          finishedRef.current = true;
          setPhase(stoppedRef.current ? 'stopped' : 'done');
          onDocumentsChanged();
          return 'done';
        }
        return 'conflict';
      }
      if (result === 'failed') return 'lost';
      if (attempt >= REATTACH_DELAYS.length) {
        closeOpenDoc();
        setPhase('interrupted');
        return 'lost';
      }
      setPhase('reconnecting');
      await sleep(REATTACH_DELAYS[attempt] ?? 4000);
    }
  }, [attachOnce, closeOpenDoc, onDocumentsChanged]);

  const hydrateFromDocuments = useCallback(async (): Promise<'done' | 'empty'> => {
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/documents`, {
        credentials: 'same-origin',
      });
      if (!res.ok) return 'empty';
      const body = (await res.json()) as {
        documents?: { type: DocumentType; status: string }[];
      };
      const list = (body.documents ?? []).filter((d) => CORE_DOC_ORDER.includes(d.type));
      if (list.length === 0) return 'empty';

      const mapped: DocStreamState[] = CORE_DOC_ORDER.map((t) => {
        const hit = list.find((d) => d.type === t);
        const st = hit?.status ?? 'pending';
        return {
          type: t,
          status:
            st === 'ready' || st === 'stale'
              ? 'ready'
              : st === 'failed' || st === 'generating'
                ? 'failed'
                : 'queued',
          text: '',
          bytes: null,
          error: st === 'generating' ? 'Penulisan berhenti sebelum dokumen ini selesai.' : null,
        };
      });

      const anyContent = mapped.some((d) => d.status === 'ready');
      const anyFailed = mapped.some((d) => d.status === 'failed');
      setDocs(mapped);
      if (!anyContent && !anyFailed) {
        setPhase('idle');
        return 'empty';
      }

      setActive(mapped.find((d) => d.status === 'ready')?.type ?? 'prd');
      hydratedRef.current = true;
      finishedRef.current = true;
      setPhase(anyFailed ? 'interrupted' : 'done');
      return 'done';
    } catch {
      setPhase('idle');
      return 'empty';
    }
  }, [projectId]);

  const startBatch = useCallback(
    async (list: DocumentType[]): Promise<boolean> => {
      if (list.length === 0) return false;
      setFatal(null);
      setStopping(false);
      stoppedRef.current = false;
      finishedRef.current = false;
      hydratedRef.current = false;
      setPhase('connecting');
      startedAt.current = Date.now();
      setElapsed(0);
      setDocs(initDocs(list));
      setActive(list[0] ?? 'prd');
      setFollow(true);

      const isDefaultOrder =
        list.length === CORE_DOC_ORDER.length && list.every((t, i) => t === CORE_DOC_ORDER[i]);

      try {
        const res = await fetch(`/api/v1/projects/${projectId}/documents/generate-all`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isDefaultOrder ? {} : { types: list }),
        });
        if (res.status === 409) return true;
        if (!res.ok) {
          let message = `Server menolak permintaan (${res.status}).`;
          try {
            const body = await res.json();
            message = body?.error?.message ?? message;
          } catch {
            /* not JSON */
          }
          setFatal(message);
          setPhase('error');
          return false;
        }
        return true;
      } catch {
        setFatal('Tidak dapat menghubungi server.');
        setPhase('error');
        return false;
      }
    },
    [projectId],
  );

  useEffect(() => {
    aliveRef.current = true;
    void (async () => {
      const outcome = await watch();
      if (outcome !== 'conflict') return;
      const disk = await hydrateFromDocuments();
      if (autoStart) {
        onAutoStartConsumed?.();
        if (disk === 'empty') {
          const started = await startBatch(CORE_DOC_ORDER);
          if (started) await watch();
        }
      }
    })();
    return () => {
      aliveRef.current = false;
      abortRef.current?.abort();
    };
  }, [watch, hydrateFromDocuments, startBatch, autoStart, onAutoStartConsumed]);

  useEffect(() => {
    if (phase !== 'writing' && phase !== 'connecting' && phase !== 'reconnecting') return;
    const id = window.setInterval(() => setElapsed(Date.now() - startedAt.current), 500);
    return () => window.clearInterval(id);
  }, [phase]);

  const activeStatus = docs.find((d) => d.type === active)?.status;
  useEffect(() => {
    if (!follow || activeStatus !== 'writing') return;
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [docs, follow, active, activeStatus]);

  const current = useMemo(() => docs.find((d) => d.type === active) ?? docs[0], [docs, active]);
  const doneCount = docs.filter((d) => d.status === 'ready').length;
  const busy = phase === 'writing' || phase === 'connecting' || phase === 'reconnecting';

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
        let message = `Tidak bisa menghentikan (${res.status}).`;
        try {
          const body = await res.json();
          message = body?.error?.message ?? message;
        } catch {
          /* plain */
        }
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
    toast({ tone: 'info', title: 'Penulisan batch dihentikan' });
  }, [projectId, stopping, flushNow, closeOpenDoc, toast]);

  const resume = useCallback(() => {
    const rest = docs.filter((d) => d.status !== 'ready').map((d) => d.type);
    void (async () => {
      const started = await startBatch(rest.length > 0 ? rest : CORE_DOC_ORDER);
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

  const saveAllToLibrary = useCallback(async () => {
    setSavingLib(true);
    setFatal(null);
    let saved = 0;
    try {
      for (const d of docs) {
        if (d.status !== 'ready') continue;
        const full = await api.get<{ document: { id: string; title: string }; content: string | null }>(
          `/projects/${projectId}/documents/${d.type}?content=1`,
        );
        if (!full.content) continue;
        await api.post('/library', {
          kind: 'document',
          title: full.document.title || DOC_LABEL[d.type],
          projectId,
          documentId: full.document.id,
          payload: full.content,
        });
        saved += 1;
      }
      toast({
        tone: 'success',
        title: `${saved} dokumen disimpan ke Library`,
      });
    } catch (e) {
      setFatal(e instanceof ApiError ? e.message : 'Gagal menyimpan ke Library');
    } finally {
      setSavingLib(false);
    }
  }, [docs, projectId, toast]);

  return (
    <div className="space-y-5">
      {/* Status Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-5 py-4 shadow-panel">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={
                busy
                  ? 'live'
                  : phase === 'done'
                    ? 'ready'
                    : phase === 'error' || phase === 'interrupted'
                      ? 'danger'
                      : 'neutral'
              }
              dot
            >
              {busy
                ? phase === 'reconnecting'
                  ? 'Menyambung ulang'
                  : 'Menulis langsung'
                : phase === 'done'
                  ? 'Selesai'
                  : phase === 'stopped'
                    ? 'Dihentikan'
                    : phase === 'interrupted'
                      ? 'Terputus'
                      : phase === 'error'
                        ? 'Gagal'
                        : 'Siap dimulai'}
            </Badge>
            <span className="font-mono text-xs text-ink-2">
              {doneCount}/{docs.length} dokumen
            </span>
            {busy && (
              <span className="inline-flex items-center gap-1 font-mono text-xs text-ink-3">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {mmss(elapsed)}
              </span>
            )}
          </div>
          <p className="text-sm text-ink-2">
            {phase === 'idle'
              ? 'Jalankan penulisan batch untuk menghasilkan 6 dokumen spesifikasi inti secara berurutan.'
              : busy
                ? 'Setiap dokumen ditulis kata demi kata di server. Kamu boleh berpindah tab tanpa menghentikan proses.'
                : phase === 'done'
                  ? 'Dokumen inti sudah selesai ditulis dan siap dibaca, disunting, atau diekspor.'
                  : 'Dokumen yang sudah selesai tetap tersimpan. Lanjutkan untuk menulis dokumen yang tersisa.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {busy ? (
            <Button variant="secondary" onClick={() => void stop()} disabled={stopping}>
              <Square className="h-3.5 w-3.5" aria-hidden="true" />
              {stopping ? 'Menghentikan...' : 'Hentikan'}
            </Button>
          ) : phase === 'idle' ? (
            <Button variant="primary" onClick={resume}>
              <Play className="h-4 w-4" aria-hidden="true" />
              Mulai menulis 6 dokumen
            </Button>
          ) : (
            <>
              {doneCount < docs.length && (
                <Button variant="primary" onClick={resume}>
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  {doneCount > 0 ? 'Lanjutkan sisa' : 'Coba lagi'}
                </Button>
              )}
              {doneCount > 0 && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => void saveAllToLibrary()}
                    disabled={savingLib}
                  >
                    <BookMarked className="h-3.5 w-3.5" aria-hidden="true" />
                    {savingLib ? 'Menyimpan...' : 'Simpan ke Library'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => void startWireframe()}
                    disabled={wireframing}
                  >
                    <Layout className="h-3.5 w-3.5" aria-hidden="true" />
                    {wireframing ? 'Membuat wireframe...' : 'Buat wireframe'}
                  </Button>
                  <Button variant="primary" onClick={() => onOpenDocument('prd')}>
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    Buka Dokumen
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {fatal && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/35 bg-danger-soft px-4 py-3 text-sm text-danger-ink"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {fatal}
          </span>
          {!busy && (
            <Button size="sm" variant="secondary" onClick={onBackToInterview}>
              Kembali ke Wawancara
            </Button>
          )}
        </div>
      )}

      {/* Split queue + live manuscript stream */}
      <div className="grid gap-5 lg:grid-cols-[240px_1fr] lg:items-start">
        <nav
          aria-label="Antrean dokumen"
          className="rounded-2xl border border-line bg-sidebar p-2 lg:sticky lg:top-20"
        >
          <ul className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
            {docs.map((d, idx) => {
              const isSelected = d.type === active;
              return (
                <li key={d.type} className="shrink-0">
                  <button
                    type="button"
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => setActive(d.type)}
                    className={cn(
                      'flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                      isSelected
                        ? 'bg-surface font-medium text-ink shadow-xs ring-1 ring-line'
                        : 'text-ink-2 hover:bg-hover hover:text-ink',
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[11px] text-ink-3">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="truncate">{DOC_LABEL[d.type]}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px]">
                      {d.status === 'ready' ? (
                        <span className="text-ready-ink">
                          {d.bytes ? kb(d.bytes) : 'Siap'}
                        </span>
                      ) : d.status === 'writing' ? (
                        <span className="text-accent-ink">Menulis</span>
                      ) : d.status === 'failed' ? (
                        <span className="text-danger-ink">Gagal</span>
                      ) : (
                        <span className="text-ink-3">Antre</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <article className="min-w-0 rounded-2xl border border-line bg-surface shadow-panel overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-sidebar/40 px-5 py-3.5">
            <div>
              <h2 className="text-base font-semibold text-ink">
                {DOC_LABEL[current?.type ?? 'prd']}
              </h2>
              <p className="font-mono text-xs text-ink-3">
                {current?.status === 'ready'
                  ? `Selesai${current.bytes ? ` · ${kb(current.bytes)}` : ''}`
                  : current?.status === 'writing'
                    ? 'Sedang ditulis secara langsung...'
                    : current?.status === 'failed'
                      ? 'Gagal ditulis'
                      : 'Menunggu giliran'}
              </p>
            </div>
            {current?.status === 'ready' && (
              <Button size="sm" variant="secondary" onClick={() => onOpenDocument(current.type)}>
                <CheckCircle2 className="h-3.5 w-3.5 text-ready-ink" aria-hidden="true" />
                Baca dan sunting
              </Button>
            )}
          </header>

          <div
            ref={boxRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
            }}
            className="max-h-[62vh] min-h-[360px] overflow-y-auto p-5 sm:p-6"
          >
            {current?.text ? (
              <div
                className="prose-fresh font-mono text-[13.5px] leading-relaxed"
                dangerouslySetInnerHTML={{
                  __html: renderStreamHtml(current.text, current.status === 'writing'),
                }}
              />
            ) : current?.status === 'writing' ? (
              <p className="inline-flex items-center gap-2 font-mono text-xs text-ink-2">
                <span className="wet-caret" aria-hidden="true" />
                Menunggu token pertama dari model...
              </p>
            ) : current?.status === 'failed' ? (
              <p className="text-sm text-danger-ink">
                Dokumen ini gagal ditulis{current.error ? `: ${current.error}` : '.'}
              </p>
            ) : current?.status === 'ready' ? (
              <div className="space-y-3">
                <p className="text-sm text-ink-2">
                  Dokumen ini sudah tersimpan di server. Buka di mode Dokumen & Wireframe untuk
                  membaca, merender diagram, atau menyunting isinya.
                </p>
                <Button size="sm" variant="primary" onClick={() => onOpenDocument(current.type)}>
                  Buka {DOC_LABEL[current.type]}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-ink-3">
                {phase === 'idle'
                  ? 'Tekan "Mulai menulis 6 dokumen" di atas untuk memulai penulisan.'
                  : 'Menunggu dokumen sebelumnya selesai ditulis.'}
              </p>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
