'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  AlertCircle,
  Loader2,
  Lock,
  Unlock,
  Copy,
  BookMarked,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Eye,
  History,
  Save,
  RotateCcw,
  TerminalSquare,
  ChevronDown,
  Clock,
  Play,
  Square,
  X,
} from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { getRuntimeModelHeaders } from '@/lib/client/byokSession';
import {
  AGENT_PLACEMENT_HINT,
  AGENT_USAGE_HINT,
  buildAgentCompanionInstructions,
  formatAgentSpecPrompt,
} from '@/lib/export/agentInstructions';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  useToast,
} from '@/components/ui';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { cn } from '@/lib/cn';
import type { DocumentType, WorkspaceDoc, WorkspaceProject } from './types';
import { DOC_LABEL, CORE_DOC_ORDER, DOC_SUBTITLE, formatTimeAgo } from './types';

interface DocVersion {
  id: string;
  versionNumber: number;
  source: 'initial' | 'regenerate' | 'manual_edit' | 'restore' | string;
  changeSummary: string | null;
  modelUsed: string | null;
  provider: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  generationMs: number | null;
  createdAt: string;
  contentMd?: string;
}

interface DocResp {
  document: WorkspaceDoc;
  content: string | null;
  versions: DocVersion[];
}

interface BatchDocLive {
  type: DocumentType;
  status: 'queued' | 'writing' | 'ready' | 'failed';
  text: string;
  bytes: number | null;
  error: string | null;
}

interface BatchSnapshotPayload {
  projectId: string;
  order: DocumentType[];
  docs: BatchDocLive[];
  startedAt: number;
  elapsedMs: number;
  finished: boolean;
  result: { generated: string[]; failed: { type: string; error: string }[]; skipped: string[] } | null;
}

interface SnapshotResp {
  running: boolean;
  snapshot: BatchSnapshotPayload | null;
}

interface DocumentPanelProps {
  project: WorkspaceProject;
  docs: WorkspaceDoc[];
  selectedType: DocumentType;
  autoStart?: boolean;
  onAutoStartConsumed?: () => void;
  onSelectType: (type: DocumentType) => void;
  onDocumentsChanged: () => void;
  onBackToInterview?: () => void;
}

const SOURCE_LABEL: Record<string, string> = {
  initial: 'Awal',
  regenerate: 'Revisi AI',
  manual_edit: 'Suntingan',
  restore: 'Dipulihkan',
};

const QUICK_REVISION_PROMPTS = [
  'Tambahkan diagram Mermaid yang memperjelas alur utama',
  'Pertajam edge case, validasi input, dan skenario galat',
  'Ringkas bagian yang berulang agar lebih padat dan siap pakai',
  'Tambahkan aturan keamanan, hak akses, dan audit log',
];

function StatusIcon({ status }: { status: WorkspaceDoc['status'] }) {
  if (status === 'ready') {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-ready-ink" aria-hidden="true" />;
  }
  if (status === 'generating') {
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-ink" aria-hidden="true" />;
  }
  if (status === 'failed') {
    return <AlertCircle className="h-4 w-4 shrink-0 text-danger-ink" aria-hidden="true" />;
  }
  return <Circle className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />;
}

function formatBytes(text: string): string {
  const len = new TextEncoder().encode(text).length;
  return len < 1024 ? `${len} B` : `${(len / 1024).toFixed(1)} kB`;
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

export function DocumentPanel({
  project,
  docs,
  selectedType,
  autoStart = false,
  onAutoStartConsumed,
  onSelectType,
  onDocumentsChanged,
  onBackToInterview,
}: DocumentPanelProps) {
  const { toast } = useToast();
  const { t } = useLocale();
  const [activeDoc, setActiveDoc] = useState<WorkspaceDoc | null>(null);
  const [content, setContent] = useState<string>('');
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [viewingVersion, setViewingVersion] = useState<DocVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Unified batch generation state (lives inside Document Studio)
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchDocs, setBatchDocs] = useState<Partial<Record<DocumentType, BatchDocLive>>>({});
  const [batchElapsed, setBatchElapsed] = useState(0);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [startingBatch, setStartingBatch] = useState(false);
  const [stoppingBatch, setStoppingBatch] = useState(false);
  const [autoFollowActive, setAutoFollowActive] = useState(true);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Regenerate with revision instructions dialog
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenInstructions, setRegenInstructions] = useState('');
  const [streaming, setStreaming] = useState(false);

  // Collapsible AI agent usage guide (replaces bulky redundant CTA bar)
  const [agentGuideOpen, setAgentGuideOpen] = useState(false);

  // Version restore & misc actions
  const [historyOpen, setHistoryOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [savingLib, setSavingLib] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const [copyingProject, setCopyingProject] = useState(false);
  const [copyingAgent, setCopyingAgent] = useState(false);

  const cache = useRef<Map<DocumentType, DocResp>>(new Map());
  const selectedTypeRef = useRef<DocumentType>(selectedType);
  selectedTypeRef.current = selectedType;
  const autoFollowRef = useRef(autoFollowActive);
  autoFollowRef.current = autoFollowActive;
  const batchDocsRef = useRef(batchDocs);
  batchDocsRef.current = batchDocs;
  const docsRef = useRef(docs);
  docsRef.current = docs;
  const batchStartedAtRef = useRef<number>(0);
  const sseAbortRef = useRef<AbortController | null>(null);
  const lastSseAtRef = useRef<number>(0);
  const pendingDeltasRef = useRef<Map<DocumentType, string>>(new Map());
  const flushTimerRef = useRef<number | null>(null);
  const prevBatchStatusRef = useRef<Partial<Record<DocumentType, BatchDocLive['status']>>>({});
  const aliveRef = useRef(true);

  const loadDoc = useCallback(
    async (type: DocumentType, force = false) => {
      const liveState = batchDocsRef.current[type];
      const dbState = docsRef.current.find((d) => d.type === type);
      const isKnownReady = liveState?.status === 'ready' || dbState?.status === 'ready';

      if (!force) {
        const cached = cache.current.get(type);
        // Never serve a stale empty cached document when the doc is already marked ready.
        if (cached && (!isKnownReady || Boolean(cached.content?.trim()))) {
          setActiveDoc(cached.document);
          setContent(cached.content ?? '');
          setVersions(cached.versions ?? []);
          setViewingVersion(null);
          setEditing(false);
          setLoading(false);
          return;
        }
      }
      // Show in-memory completed batch text immediately while fetching DB versions/metadata.
      if (liveState?.status === 'ready' && liveState.text.trim()) {
        setContent(liveState.text);
        setViewingVersion(null);
        setEditing(false);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const r = await api.get<DocResp>(
          `/projects/${project.id}/documents/${type}?content=1&versions=1`,
        );
        cache.current.set(type, r);
        if (selectedTypeRef.current === type) {
          setActiveDoc(r.document);
          setContent(r.content ?? '');
          setVersions(r.versions ?? []);
          setViewingVersion(null);
          setEditing(false);
        }
      } catch (e) {
        if (selectedTypeRef.current === type) {
          setError(e instanceof ApiError ? e.message : 'Gagal memuat dokumen');
        }
      } finally {
        if (selectedTypeRef.current === type) {
          setLoading(false);
        }
      }
    },
    [project.id],
  );

  const flushDeltas = useCallback(() => {
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (pendingDeltasRef.current.size === 0) return;
    const entries = [...pendingDeltasRef.current.entries()];
    pendingDeltasRef.current.clear();
    setBatchDocs((prev) => {
      const next = { ...prev };
      for (const [type, chunk] of entries) {
        const existing = next[type] ?? {
          type,
          status: 'writing' as const,
          text: '',
          bytes: null,
          error: null,
        };
        next[type] = { ...existing, status: 'writing', text: existing.text + chunk };
      }
      return next;
    });
  }, []);

  const queueDelta = useCallback(
    (type: DocumentType, chunk: string) => {
      pendingDeltasRef.current.set(type, (pendingDeltasRef.current.get(type) ?? '') + chunk);
      if (flushTimerRef.current) return;
      flushTimerRef.current = window.setTimeout(() => {
        flushTimerRef.current = null;
        flushDeltas();
      }, 70);
    },
    [flushDeltas],
  );

  const applySnapshot = useCallback(
    (snap: BatchSnapshotPayload, running: boolean) => {
      if (flushTimerRef.current) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      pendingDeltasRef.current.clear();

      const mapped: Partial<Record<DocumentType, BatchDocLive>> = {};
      const newlyReady: DocumentType[] = [];
      let writingType: DocumentType | null = null;

      for (const d of snap.docs) {
        if (!CORE_DOC_ORDER.includes(d.type)) continue;
        mapped[d.type] = d;
        const prevStatus = prevBatchStatusRef.current[d.type];
        if (d.status === 'ready' && prevStatus !== 'ready') {
          newlyReady.push(d.type);
        }
        if (d.status === 'writing') {
          writingType = d.type;
        }
        prevBatchStatusRef.current[d.type] = d.status;
      }

      setBatchDocs(mapped);
      batchStartedAtRef.current = snap.startedAt || Date.now() - (snap.elapsedMs ?? 0);
      setBatchElapsed(snap.elapsedMs ?? 0);
      setBatchRunning(running && !snap.finished);

      if (writingType && autoFollowRef.current && selectedTypeRef.current !== writingType) {
        onSelectType(writingType);
      }

      if (newlyReady.length > 0) {
        for (const t of newlyReady) {
          cache.current.delete(t);
        }
        onDocumentsChanged();
        if (newlyReady.includes(selectedTypeRef.current)) {
          void loadDoc(selectedTypeRef.current, true);
        }
      }

      if (snap.finished || !running) {
        onDocumentsChanged();
        cache.current.delete(selectedTypeRef.current);
        void loadDoc(selectedTypeRef.current, true);
      }
    },
    [loadDoc, onDocumentsChanged, onSelectType],
  );

  const fetchSnapshot = useCallback(async (): Promise<SnapshotResp | null> => {
    try {
      const res = await fetch(
        `/api/v1/projects/${project.id}/documents/generate-stream?snapshot=1`,
        { credentials: 'same-origin', cache: 'no-store' },
      );
      if (!res.ok) return null;
      return (await res.json()) as SnapshotResp;
    } catch {
      return null;
    }
  }, [project.id]);

  const attachBatchStream = useCallback(async () => {
    sseAbortRef.current?.abort();
    const ctrl = new AbortController();
    sseAbortRef.current = ctrl;

    let res: Response;
    try {
      res = await fetch(`/api/v1/projects/${project.id}/documents/generate-stream`, {
        credentials: 'same-origin',
        signal: ctrl.signal,
        headers: { Accept: 'text/event-stream' },
      });
    } catch {
      return;
    }

    if (!res.ok || !res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const parse = makeSseParser(({ event, data }) => {
      lastSseAtRef.current = Date.now();
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(data) as Record<string, unknown>;
      } catch {
        return;
      }

      if (event === 'snapshot') {
        const snap = payload as unknown as BatchSnapshotPayload;
        applySnapshot(snap, !snap.finished);
        return;
      }
      if (event === 'doc') {
        const type = payload.type as DocumentType;
        if (!CORE_DOC_ORDER.includes(type)) return;
        prevBatchStatusRef.current[type] = 'writing';
        setBatchRunning(true);
        setBatchDocs((prev) => ({
          ...prev,
          [type]: {
            type,
            status: 'writing',
            text: prev[type]?.text ?? '',
            bytes: null,
            error: null,
          },
        }));
        if (autoFollowRef.current && selectedTypeRef.current !== type) {
          onSelectType(type);
        }
        return;
      }
      if (event === 'delta') {
        const type = payload.type as DocumentType;
        if (!CORE_DOC_ORDER.includes(type)) return;
        queueDelta(type, (payload.text as string | undefined) ?? '');
        return;
      }
      if (event === 'done') {
        flushDeltas();
        const type = payload.type as DocumentType;
        if (!CORE_DOC_ORDER.includes(type)) return;
        prevBatchStatusRef.current[type] = 'ready';
        setBatchDocs((prev) => ({
          ...prev,
          [type]: {
            type,
            status: 'ready',
            text: prev[type]?.text ?? '',
            bytes: (payload.bytes as number | undefined) ?? null,
            error: null,
          },
        }));
        cache.current.delete(type);
        onDocumentsChanged();
        if (selectedTypeRef.current === type) {
          void loadDoc(type, true);
        }
        return;
      }
      if (event === 'error') {
        flushDeltas();
        const type = payload.type as DocumentType | null;
        const message = (payload.message as string | undefined) ?? 'Gagal menulis dokumen';
        if (type && CORE_DOC_ORDER.includes(type)) {
          prevBatchStatusRef.current[type] = 'failed';
          setBatchDocs((prev) => ({
            ...prev,
            [type]: {
              type,
              status: 'failed',
              text: prev[type]?.text ?? '',
              bytes: null,
              error: message,
            },
          }));
        } else {
          setBatchError(message);
        }
        onDocumentsChanged();
        return;
      }
      if (event === 'finish') {
        flushDeltas();
        setBatchRunning(false);
        onDocumentsChanged();
        cache.current.delete(selectedTypeRef.current);
        void loadDoc(selectedTypeRef.current, true);
      }
    });

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parse(decoder.decode(value, { stream: true }));
      }
    } catch {
      /* aborted or tunnel drop; snapshot fallback keeps UI accurate */
    } finally {
      flushDeltas();
      try {
        reader.releaseLock();
      } catch {
        /* ignore */
      }
    }
  }, [project.id, applySnapshot, queueDelta, flushDeltas, onDocumentsChanged, onSelectType, loadDoc]);

  const startBatch = useCallback(
    async (types?: DocumentType[]) => {
      if (startingBatch || batchRunning) return;
      setStartingBatch(true);
      setBatchError(null);
      setError(null);
      setEditing(false);
      setViewingVersion(null);
      setAutoFollowActive(true);
      try {
        const targetTypes =
          types && types.length > 0
            ? types
            : CORE_DOC_ORDER.filter((t) => docs.find((d) => d.type === t)?.status !== 'ready');
        const list = targetTypes.length > 0 ? targetTypes : CORE_DOC_ORDER;
        const isFull = list.length === CORE_DOC_ORDER.length;
        const res = await fetch(`/api/v1/projects/${project.id}/documents/generate-all`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', ...getRuntimeModelHeaders() },
          body: JSON.stringify(isFull ? {} : { types: list }),
        });
        if (!res.ok && res.status !== 409) {
          let message = `Server menolak permintaan (${res.status}).`;
          try {
            const body = await res.json();
            message = body?.error?.message ?? message;
          } catch {
            /* plain */
          }
          setBatchError(message);
          return;
        }
        batchStartedAtRef.current = Date.now();
        setBatchElapsed(0);
        setBatchRunning(true);
        if (list[0]) onSelectType(list[0]);

        const snap = await fetchSnapshot();
        if (snap?.snapshot) {
          applySnapshot(snap.snapshot, snap.running);
        }
        void attachBatchStream();
      } catch {
        setBatchError('Tidak dapat menghubungi server untuk memulai penulisan.');
      } finally {
        setStartingBatch(false);
      }
    },
    [startingBatch, batchRunning, docs, project.id, onSelectType, fetchSnapshot, applySnapshot, attachBatchStream],
  );

  const stopBatch = useCallback(async () => {
    if (stoppingBatch) return;
    setStoppingBatch(true);
    try {
      const res = await fetch(`/api/v1/projects/${project.id}/documents/cancel`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!res.ok && res.status !== 404) {
        throw new Error(`Tidak bisa menghentikan (${res.status}).`);
      }
      sseAbortRef.current?.abort();
      setBatchRunning(false);
      onDocumentsChanged();
      cache.current.delete(selectedTypeRef.current);
      void loadDoc(selectedTypeRef.current, true);
      toast({ tone: 'info', title: 'Penulisan dokumen dihentikan' });
    } catch (e) {
      setBatchError(e instanceof Error ? e.message : 'Gagal menghentikan penulisan.');
    } finally {
      setStoppingBatch(false);
    }
  }, [stoppingBatch, project.id, onDocumentsChanged, loadDoc, toast]);

  // Initial sync on mount/refresh: plain JSON snapshot arrives immediately even
  // over Cloudflare quick tunnels, preventing stuck "Antre" state after refresh.
  useEffect(() => {
    aliveRef.current = true;
    prevBatchStatusRef.current = {};
    let cancelled = false;

    void (async () => {
      const snap = await fetchSnapshot();
      if (cancelled || !aliveRef.current) return;

      if (snap?.running && snap.snapshot) {
        applySnapshot(snap.snapshot, true);
        void attachBatchStream();
        if (autoStart) onAutoStartConsumed?.();
        return;
      }

      if (snap?.snapshot?.finished) {
        applySnapshot(snap.snapshot, false);
      }

      if (autoStart) {
        onAutoStartConsumed?.();
        void startBatch();
      }
    })();

    return () => {
      aliveRef.current = false;
      cancelled = true;
      sseAbortRef.current?.abort();
      if (flushTimerRef.current) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
    // Run on project mount or explicit autoStart handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, autoStart]);

  // Live timer + Cloudflare-buffer fallback snapshot poll while batch runs.
  useEffect(() => {
    if (!batchRunning) return;
    const tick = window.setInterval(() => {
      if (batchStartedAtRef.current > 0) {
        setBatchElapsed(Date.now() - batchStartedAtRef.current);
      }
    }, 500);

    const poll = window.setInterval(() => {
      // Only poll JSON snapshot when SSE has been quiet (e.g. Cloudflare proxy buffering).
      if (Date.now() - lastSseAtRef.current < 1600) return;
      void fetchSnapshot().then((snap) => {
        if (!aliveRef.current || !snap) return;
        if (snap.snapshot) {
          applySnapshot(snap.snapshot, snap.running);
        } else if (!snap.running) {
          setBatchRunning(false);
          onDocumentsChanged();
          cache.current.delete(selectedTypeRef.current);
          void loadDoc(selectedTypeRef.current, true);
        }
      });
    }, 1800);

    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [batchRunning, fetchSnapshot, applySnapshot, onDocumentsChanged, loadDoc]);

  useEffect(() => {
    void loadDoc(selectedType);
  }, [selectedType, loadDoc]);

  const enterEdit = useCallback(() => {
    if (activeDoc?.isLocked) return;
    setViewingVersion(null);
    setEditDraft(content);
    setChangeSummary('');
    setEditing(true);
  }, [activeDoc?.isLocked, content]);

  const saveEdit = useCallback(async () => {
    if (!editDraft.trim() || savingEdit) return;
    setSavingEdit(true);
    setError(null);
    try {
      const r = await api.put<{
        document: WorkspaceDoc;
        version: DocVersion;
        content: string;
        versions: DocVersion[];
      }>(`/projects/${project.id}/documents/${selectedType}`, {
        contentMd: editDraft,
        changeSummary: changeSummary.trim() || 'Suntingan manual',
      });
      const updated: DocResp = {
        document: r.document,
        content: r.content,
        versions: r.versions,
      };
      cache.current.set(selectedType, updated);
      setActiveDoc(r.document);
      setContent(r.content);
      setVersions(r.versions);
      setEditing(false);
      setChangeSummary('');
      onDocumentsChanged();
      toast({
        tone: 'success',
        title: `Disimpan sebagai v${r.version.versionNumber}`,
        description: r.version.changeSummary ?? undefined,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menyimpan perubahan');
    } finally {
      setSavingEdit(false);
    }
  }, [editDraft, savingEdit, project.id, selectedType, changeSummary, onDocumentsChanged, toast]);

  // Cmd/Ctrl+S inside Edit mode saves immediately
  useEffect(() => {
    if (!editing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveEdit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editing, saveEdit]);

  async function regenerate(instructions?: string) {
    setRegenOpen(false);
    setEditing(false);
    setViewingVersion(null);
    setStreaming(true);
    setError(null);
    setContent('');
    try {
      const payload: Record<string, unknown> = {};
      if (instructions && instructions.trim().length > 0) {
        payload.instructions = instructions.trim();
      }
      const res = await fetch(`/api/v1/projects/${project.id}/documents/${selectedType}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...getRuntimeModelHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) {
        let msg = `Gagal (${res.status})`;
        try {
          const b = await res.json();
          msg = b?.error?.message ?? msg;
        } catch {
          /* plain */
        }
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
      }
      setRegenInstructions('');
      cache.current.delete(selectedType);
      await loadDoc(selectedType, true);
      onDocumentsChanged();
      toast({
        tone: 'success',
        title: `${DOC_LABEL[selectedType]} berhasil ditulis ulang`,
        description: instructions?.trim() ? 'Versi baru disimpan dengan instruksi revisi.' : undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menulis ulang dokumen');
    } finally {
      setStreaming(false);
    }
  }

  async function restoreVersion(ver: DocVersion) {
    setRestoring(true);
    setError(null);
    try {
      const r = await api.post<{
        document: WorkspaceDoc;
        version: DocVersion;
        content: string;
        versions: DocVersion[];
      }>(`/projects/${project.id}/documents/${selectedType}/versions`, {
        versionId: ver.id,
      });
      const updated: DocResp = {
        document: r.document,
        content: r.content,
        versions: r.versions,
      };
      cache.current.set(selectedType, updated);
      setActiveDoc(r.document);
      setContent(r.content);
      setVersions(r.versions);
      setViewingVersion(null);
      setHistoryOpen(false);
      onDocumentsChanged();
      toast({
        tone: 'success',
        title: `v${ver.versionNumber} dipulihkan sebagai v${r.version.versionNumber}`,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal memulihkan versi');
    } finally {
      setRestoring(false);
    }
  }

  async function copyMarkdown() {
    const target = viewingVersion?.contentMd ?? content;
    try {
      await navigator.clipboard.writeText(target);
      toast({ tone: 'success', title: 'Markdown disalin ke papan klip' });
    } catch {
      toast({ tone: 'error', title: 'Gagal menyalin ke papan klip' });
    }
  }

  async function copyAgentInstructions() {
    if (copyingAgent) return;
    setCopyingAgent(true);
    try {
      const text = buildAgentCompanionInstructions(project, { hasWireframes: false });
      await navigator.clipboard.writeText(text);
      toast({
        tone: 'success',
        title: 'Instruksi agent disalin',
        description: 'Tempel sebagai system prompt atau pesan pertama bersama bundle spesifikasi.',
      });
    } catch {
      toast({ tone: 'error', title: 'Gagal menyalin instruksi agent' });
    } finally {
      setCopyingAgent(false);
    }
  }

  async function copyForAgent(scope: 'doc' | 'project') {
    if (scope === 'doc') {
      const target = viewingVersion?.contentMd ?? content;
      if (!target) return;
      const ver = viewingVersion?.versionNumber ?? versions[0]?.versionNumber;
      const formatted = formatAgentSpecPrompt(project, DOC_LABEL[selectedType], ver, target);
      try {
        await navigator.clipboard.writeText(formatted);
        toast({
          tone: 'success',
          title: `${DOC_LABEL[selectedType]} disalin untuk AI Agent`,
          description: 'Format siap tempel ke Cursor, Claude Code, atau Antigravity.',
        });
      } catch {
        toast({ tone: 'error', title: 'Gagal menyalin ke papan klip' });
      }
      return;
    }

    setCopyingProject(true);
    try {
      const res = await fetch(`/api/v1/projects/${project.id}/export?format=md`, {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        let msg = 'Dokumen inti belum lengkap untuk disalin seluruhnya.';
        try {
          const b = await res.json();
          msg = b?.error?.message ?? msg;
        } catch {
          /* plain */
        }
        throw new Error(msg);
      }
      const allMd = await res.text();
      const formatted = formatAgentSpecPrompt(project, 'ALL_SPECS', undefined, allMd);
      await navigator.clipboard.writeText(formatted);
      toast({
        tone: 'success',
        title: 'Seluruh spesifikasi proyek disalin untuk AI Agent',
      });
    } catch (e) {
      toast({
        tone: 'error',
        title: 'Tidak dapat menyalin seluruh proyek',
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setCopyingProject(false);
    }
  }

  async function saveToLibrary() {
    if (!activeDoc || !content) return;
    setSavingLib(true);
    try {
      await api.post('/library', {
        kind: 'document',
        title: activeDoc.title || DOC_LABEL[selectedType],
        projectId: project.id,
        documentId: activeDoc.id,
        payload: viewingVersion?.contentMd ?? content,
      });
      toast({ tone: 'success', title: `${DOC_LABEL[selectedType]} disimpan ke Library` });
    } catch (e) {
      toast({
        tone: 'error',
        title: 'Gagal menyimpan ke Library',
        description: e instanceof ApiError ? e.message : undefined,
      });
    } finally {
      setSavingLib(false);
    }
  }

  async function toggleLock() {
    if (!activeDoc) return;
    setLockBusy(true);
    try {
      const next = !activeDoc.isLocked;
      await api.patch(`/projects/${project.id}/documents/${selectedType}`, { isLocked: next });
      cache.current.delete(selectedType);
      await loadDoc(selectedType, true);
      onDocumentsChanged();
      toast({
        tone: 'info',
        title: next ? 'Dokumen dikunci' : 'Kunci dokumen dibuka',
      });
    } catch (e) {
      toast({
        tone: 'error',
        title: 'Gagal mengubah kunci',
        description: e instanceof ApiError ? e.message : undefined,
      });
    } finally {
      setLockBusy(false);
    }
  }

  // Merge DB document metadata with live batch status so the sidebar never shows stale "Antre".
  const orderedDocs = useMemo(
    () =>
      CORE_DOC_ORDER.map((type) => {
        const dbDoc = docs.find((d) => d.type === type);
        if (!dbDoc) return null;
        const live = batchDocs[type];
        if (!live) return dbDoc;
        let mergedStatus: WorkspaceDoc['status'] = dbDoc.status;
        if (live.status === 'writing') mergedStatus = 'generating';
        else if (live.status === 'ready') mergedStatus = 'ready';
        else if (live.status === 'failed') mergedStatus = 'failed';
        return { ...dbDoc, status: mergedStatus };
      }).filter((d): d is WorkspaceDoc => Boolean(d)),
    [docs, batchDocs],
  );

  const selectedLive = batchDocs[selectedType];
  const isBatchWritingSelected = batchRunning && selectedLive?.status === 'writing';
  const isActivelyStreaming = streaming || isBatchWritingSelected;
  const liveReadyCount = orderedDocs.filter((d) => d.status === 'ready').length;
  const missingCount = Math.max(0, CORE_DOC_ORDER.length - liveReadyCount);
  const activeWritingDoc = orderedDocs.find((d) => d.status === 'generating');

  const latestVersion = versions[0];
  const liveReadyFallback =
    !isBatchWritingSelected && !viewingVersion && !content.trim() && selectedLive?.status === 'ready'
      ? selectedLive.text
      : '';
  const displayedContent = isBatchWritingSelected
    ? selectedLive?.text ?? ''
    : viewingVersion?.contentMd ?? (content || liveReadyFallback);
  const editDirty = editing && editDraft !== content;

  return (
    <div className="grid gap-5 lg:grid-cols-[256px_1fr] lg:items-start">
      {/* Always-visible 6-document sidebar + batch controls */}
      <aside
        aria-label={t('Daftar enam dokumen spesifikasi', 'Six specification documents list')}
        className="min-w-0 rounded-xl border border-line bg-sidebar p-2.5 lg:sticky lg:top-20 space-y-2.5"
      >
        <div className="hidden lg:flex items-center justify-between px-2 pt-0.5">
          <p className="text-xs font-medium text-ink-3">{t('Enam dokumen', 'Six documents')}</p>
          <span className="font-mono text-[11px] text-ink-3">
            {liveReadyCount}/{CORE_DOC_ORDER.length}
          </span>
        </div>

        <ul className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
          {orderedDocs.map((d) => {
            const isSelected = d.type === selectedType;
            const live = batchDocs[d.type];
            return (
              <li key={d.type} className="shrink-0">
                <button
                  type="button"
                  aria-current={isSelected ? 'true' : undefined}
                  onClick={() => {
                    if (batchRunning) {
                      // Synchronously disable auto-follow so SSE/polling never yanks selection back.
                      autoFollowRef.current = false;
                      setAutoFollowActive(false);
                    }
                    if (live?.status === 'ready' || d.status === 'ready') {
                      const cached = cache.current.get(d.type);
                      if (cached && !cached.content?.trim()) {
                        cache.current.delete(d.type);
                      }
                    }
                    onSelectType(d.type);
                  }}
                  className={cn(
                    'flex min-h-11 w-full cursor-pointer items-center justify-between gap-2.5 rounded-lg px-3 py-2 text-left transition-colors',
                    isSelected
                      ? 'bg-surface text-ink'
                      : 'text-ink-2 hover:bg-hover/70 hover:text-ink',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <StatusIcon status={d.status} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {DOC_LABEL[d.type]}
                      </span>
                      <span className="hidden lg:block truncate text-[11px] text-ink-3">
                        {d.status === 'generating'
                          ? 'Sedang ditulis...'
                          : live?.status === 'failed'
                            ? 'Gagal ditulis'
                            : DOC_SUBTITLE[d.type]}
                      </span>
                    </span>
                  </span>
                  {d.isLocked && (
                    <Lock className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-label="Terkunci" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {/* Compact batch controls directly in sidebar */}
        <div className="border-t border-line/80 pt-2.5 px-1">
          {batchRunning ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-ink-2 px-1">
                <span className="inline-flex items-center gap-1.5 font-medium text-accent-ink">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Menulis {liveReadyCount}/{CORE_DOC_ORDER.length}
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-3">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {mmss(batchElapsed)}
                </span>
              </div>
              {activeWritingDoc && activeWritingDoc.type !== selectedType && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full justify-start text-xs"
                  onClick={() => {
                    setAutoFollowActive(true);
                    onSelectType(activeWritingDoc.type);
                  }}
                >
                  Ikuti {DOC_LABEL[activeWritingDoc.type]}
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                disabled={stoppingBatch}
                onClick={() => void stopBatch()}
              >
                <Square className="h-3.5 w-3.5" aria-hidden="true" />
                {stoppingBatch ? 'Menghentikan...' : 'Hentikan batch'}
              </Button>
            </div>
          ) : missingCount > 0 ? (
            <Button
              size="sm"
              variant={liveReadyCount === 0 ? 'primary' : 'secondary'}
              className="w-full"
              disabled={startingBatch || streaming}
              onClick={() => void startBatch()}
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              {startingBatch
                ? 'Memulai...'
                : liveReadyCount === 0
                  ? 'Buat 6 dokumen'
                  : `Lanjutkan sisa (${missingCount})`}
            </Button>
          ) : null}
        </div>
      </aside>

      {/* Main Document Studio (live stream + formatted preview + edit + history) */}
      <section className="min-w-0 rounded-xl border border-line bg-surface shadow-panel overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-sidebar/40 px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold tracking-tight text-ink">
                {activeDoc?.title ?? DOC_LABEL[selectedType]}
              </h2>
              <Link
                className="text-xs font-medium text-accent-ink underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
                href={`/docs#panduan-${selectedType}`}
              >
                Panduan {DOC_LABEL[selectedType]}
              </Link>
              {isBatchWritingSelected && (
                <Badge tone="live" dot>
                  Menulis langsung
                </Badge>
              )}
              {activeDoc?.isLocked && <Badge tone="warn">Terkunci</Badge>}
            </div>
            <p className="mt-0.5 font-mono text-xs text-ink-3">
              {isBatchWritingSelected
                ? `Sedang ditulis di server · ${mmss(batchElapsed)}`
                : activeDoc?.lastGeneratedAt
                  ? `Diperbarui ${formatTimeAgo(activeDoc.lastGeneratedAt)}`
                  : 'Belum ditulis'}
              {displayedContent ? ` · ${formatBytes(displayedContent)}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Preview / Edit toggle */}
            {content && !isActivelyStreaming && (
              <div
                className="inline-flex rounded-lg border border-line/80 bg-sidebar p-0.5"
                role="group"
                aria-label="Mode tampilan dokumen"
              >
                <button
                  type="button"
                  aria-pressed={!editing}
                  onClick={() => setEditing(false)}
                  className={cn(
                    'inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                    !editing ? 'bg-surface text-ink' : 'text-ink-2 hover:text-ink',
                  )}
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Pratinjau</span>
                </button>
                <button
                  type="button"
                  aria-pressed={editing}
                  disabled={Boolean(activeDoc?.isLocked)}
                  title={activeDoc?.isLocked ? 'Buka kunci dokumen untuk menyunting' : undefined}
                  onClick={enterEdit}
                  className={cn(
                    'inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors disabled:opacity-45',
                    editing ? 'bg-surface text-ink' : 'text-ink-2 hover:text-ink',
                  )}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Sunting</span>
                </button>
              </div>
            )}

            {/* Version History Switcher */}
            {versions.length > 0 && !isBatchWritingSelected && (
              <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="secondary">
                    <History className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                    <span className="font-mono">
                      v{viewingVersion?.versionNumber ?? latestVersion?.versionNumber ?? 1}
                    </span>
                    <span className="hidden sm:inline text-ink-3">({versions.length})</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-96 p-0 overflow-hidden" align="end">
                  <div className="border-b border-line bg-sidebar/60 px-4 py-3">
                    <p className="text-sm font-semibold text-ink">Riwayat versi</p>
                    <p className="text-xs text-ink-2">
                      Pilih versi untuk melihat isinya atau memulihkannya sebagai versi terbaru.
                    </p>
                  </div>
                  <ol className="max-h-72 divide-y divide-line overflow-y-auto">
                    {versions.map((v, idx) => {
                      const isHead = idx === 0;
                      const isActiveView = viewingVersion
                        ? viewingVersion.id === v.id
                        : isHead;
                      return (
                        <li key={v.id} className="p-3">
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(false);
                              setViewingVersion(isHead ? null : v);
                              setHistoryOpen(false);
                            }}
                            className={cn(
                              'w-full rounded-lg p-2 text-left transition-colors',
                              isActiveView ? 'bg-subtle' : 'hover:bg-subtle/60',
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5">
                                <span className="font-mono text-xs font-semibold text-ink">
                                  v{v.versionNumber}
                                </span>
                                <Badge tone={isHead ? 'ready' : 'neutral'}>
                                  {isHead ? 'Terbaru' : SOURCE_LABEL[v.source] ?? v.source}
                                </Badge>
                              </span>
                              <time className="font-mono text-[11px] text-ink-3">
                                {new Date(v.createdAt).toLocaleDateString('id-ID', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </time>
                            </div>
                            {v.changeSummary && (
                              <p className="mt-1 line-clamp-2 text-xs text-ink-2">
                                {v.changeSummary}
                              </p>
                            )}
                            {v.modelUsed && (
                              <p className="mt-1 font-mono text-[11px] text-ink-3">
                                {v.modelUsed}
                                {v.generationMs
                                  ? ` · ${(v.generationMs / 1000).toFixed(1)} dtk`
                                  : ''}
                              </p>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </PopoverContent>
              </Popover>
            )}

            {/* Copy for AI Agent */}
            {content && !isBatchWritingSelected && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="secondary" disabled={copyingProject}>
                    <TerminalSquare className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                    <span className="hidden sm:inline">Salin untuk AI Agent</span>
                    <span className="sm:hidden">Salin AI</span>
                    <ChevronDown className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => void copyAgentInstructions()}
                    disabled={copyingAgent}
                    className="font-medium"
                  >
                    <TerminalSquare className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                    {copyingAgent ? 'Menyalin instruksi...' : 'Salin instruksi agent'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void copyForAgent('doc')}>
                    <Copy className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                    Salin {DOC_LABEL[selectedType]} untuk AI Agent
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void copyForAgent('project')}>
                    <TerminalSquare className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                    Salin seluruh proyek untuk AI Agent
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void copyMarkdown()}>
                    <Copy className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                    Salin Markdown mentah
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Regenerate / Generate single document trigger */}
            {!isBatchWritingSelected && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => (content ? setRegenOpen(true) : void regenerate())}
                disabled={streaming || batchRunning || Boolean(activeDoc?.isLocked)}
                title={
                  batchRunning
                    ? 'Tunggu penulisan batch selesai'
                    : activeDoc?.isLocked
                      ? 'Buka kunci untuk menulis ulang'
                      : undefined
                }
              >
                <RefreshCw
                  className={cn('h-3.5 w-3.5', streaming && 'animate-spin')}
                  aria-hidden="true"
                />
                {streaming ? 'Menulis...' : content ? 'Tulis ulang' : 'Buat dokumen'}
              </Button>
            )}

            {/* Secondary overflow menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" aria-label="Aksi dokumen lainnya">
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={savingLib || !content}
                  onSelect={() => void saveToLibrary()}
                >
                  <BookMarked className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                  Simpan ke Library
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={lockBusy || !activeDoc}
                  onSelect={() => void toggleLock()}
                >
                  {activeDoc?.isLocked ? (
                    <Unlock className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                  )}
                  {activeDoc?.isLocked ? 'Buka kunci dokumen' : 'Kunci dokumen'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Compact collapsible AI agent workflow guide (no duplicate CTA buttons) */}
        {project.purpose === 'ai_agent' && liveReadyCount > 0 && !isBatchWritingSelected && (
          <div className="border-b border-line bg-sidebar/35 px-5 py-2.5">
            <button
              type="button"
              aria-expanded={agentGuideOpen}
              onClick={() => setAgentGuideOpen((v) => !v)}
              className="flex min-h-8 w-full items-center justify-between gap-3 text-left text-xs text-ink-2 transition-colors hover:text-ink"
            >
              <span className="flex items-center gap-2 min-w-0">
                <TerminalSquare className="h-3.5 w-3.5 shrink-0 text-accent-ink" aria-hidden="true" />
                <span className="truncate font-medium text-ink">
                  Cara memakai spesifikasi ini di AI coding agent
                </span>
                <span className="hidden sm:inline text-ink-3">
                  (pakai menu Ekspor &amp; Salin untuk AI Agent di atas)
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-accent-ink">
                <span>{agentGuideOpen ? 'Tutup' : 'Lihat langkah'}</span>
                <ChevronDown
                  className={cn('h-3.5 w-3.5 transition-transform', agentGuideOpen && 'rotate-180')}
                  aria-hidden="true"
                />
              </span>
            </button>

            {agentGuideOpen && (
              <div className="mt-3 space-y-2.5 border-t border-line/70 pt-3 text-xs leading-relaxed text-ink-2">
                <p className="text-ink">{AGENT_USAGE_HINT}</p>
                <ol className="list-decimal space-y-1.5 pl-4">
                  <li>
                    Buka menu <strong className="text-ink">Ekspor → Unduh paket ZIP</strong> di pojok kanan atas proyek. Paket ZIP sudah menyertakan 6 dokumen bernomor dan file <code className="font-mono text-[11px] text-ink">AGENT_INSTRUCTIONS.md</code>.
                  </li>
                  <li>
                    Buka menu <strong className="text-ink">Salin untuk AI Agent → Salin instruksi agent</strong> di bilah atas dokumen ini. {AGENT_PLACEMENT_HINT}
                  </li>
                  <li>
                    Urutan baca yang dianjurkan untuk agent: <span className="font-mono text-[11px] text-ink">06_Project_Memory.md</span> dan <span className="font-mono text-[11px] text-ink">01_PRD.md</span> dulu, lalu <span className="font-mono text-[11px] text-ink">02_Architecture.md</span>, <span className="font-mono text-[11px] text-ink">03_Database.md</span>, <span className="font-mono text-[11px] text-ink">04_API_Contracts.md</span>, dan eksekusi bertahap lewat <span className="font-mono text-[11px] text-ink">05_Task_Checklist.md</span>.
                  </li>
                </ol>
              </div>
            )}
          </div>
        )}

        {(error || batchError) && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 border-b border-danger/30 bg-danger-soft px-5 py-3 text-sm text-danger-ink"
          >
            <span className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{batchError ?? error}</span>
            </span>
            {onBackToInterview && !batchRunning && (
              <Button size="sm" variant="secondary" onClick={onBackToInterview}>
                Kembali ke Wawancara
              </Button>
            )}
          </div>
        )}

        {/* Historical version preview banner */}
        {viewingVersion && !editing && !isBatchWritingSelected && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 border-b border-warn/30 bg-warn-soft px-5 py-2.5 text-xs text-ink"
          >
            <span>
              Sedang melihat versi lama{' '}
              <strong className="font-mono">v{viewingVersion.versionNumber}</strong>
              {viewingVersion.changeSummary ? `: ${viewingVersion.changeSummary}` : '.'}
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setViewingVersion(null)}>
                Kembali ke terbaru
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={restoring || Boolean(activeDoc?.isLocked)}
                onClick={() => void restoreVersion(viewingVersion)}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {restoring ? 'Memulihkan...' : 'Pulihkan versi ini'}
              </Button>
            </div>
          </div>
        )}

        <div className="p-5 sm:p-7">
          {isBatchWritingSelected ? (
            displayedContent.trim().length > 0 ? (
              <div className="pb-6">
                <MarkdownRenderer content={displayedContent} streaming />
                <span className="wet-caret ml-1" aria-hidden="true" />
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2.5 py-6">
                <p className="inline-flex items-center gap-2 font-mono text-xs text-ink-2">
                  <span className="wet-caret" aria-hidden="true" />
                  Menunggu token pertama untuk {DOC_LABEL[selectedType]} ({mmss(batchElapsed)})...
                </p>
                <p className="max-w-lg text-xs leading-relaxed text-ink-3">
                  Penulisan berjalan di server. Kamu boleh berpindah dokumen, refresh halaman, atau membuka menu lain tanpa menghentikan proses.
                </p>
              </div>
            )
          ) : loading ? (
            <p className="font-mono text-xs text-ink-3">Memuat isi dokumen...</p>
          ) : editing ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-sidebar/60 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
                  <Badge tone={editDirty ? 'live' : 'neutral'}>
                    {editDirty ? 'Ada perubahan' : 'Belum berubah'}
                  </Badge>
                  <span className="font-mono text-ink-3">{formatBytes(editDraft)}</span>
                  <span className="hidden sm:inline font-mono text-ink-3">· Ctrl/Cmd+S simpan</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={savingEdit}
                    onClick={() => setEditing(false)}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Batal
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={savingEdit || !editDirty || !editDraft.trim()}
                    onClick={() => void saveEdit()}
                  >
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    {savingEdit ? 'Menyimpan...' : 'Simpan versi baru'}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-change-summary" className="block text-xs font-medium text-ink-2">
                  Catatan versi <span className="font-normal text-ink-3">(opsional)</span>
                </label>
                <input
                  id="edit-change-summary"
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                  maxLength={200}
                  placeholder="Contoh: Tambah batasan rate limit dan skema webhook"
                  className="w-full min-h-10 rounded-lg border border-line bg-canvas/70 px-3 py-1.5 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-markdown-body" className="block text-xs font-medium text-ink-2">
                  Isi Markdown
                </label>
                <textarea
                  id="edit-markdown-body"
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  spellCheck={false}
                  rows={22}
                  className="w-full rounded-xl border border-line bg-canvas/70 p-4 font-mono text-[13px] leading-relaxed text-ink transition-colors hover:border-line-strong focus:border-accent"
                />
              </div>
            </div>
          ) : displayedContent ? (
            <div>
              <MarkdownRenderer content={displayedContent} streaming={streaming} />
              {streaming && <span className="wet-caret ml-1" aria-hidden="true" />}
            </div>
          ) : batchRunning ? (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-line bg-canvas/50 p-7">
              <p className="text-sm font-medium text-ink">
                {DOC_LABEL[selectedType]} masuk antrean penulisan
              </p>
              <p className="max-w-lg text-xs leading-relaxed text-ink-2">
                {activeWritingDoc
                  ? `Saat ini server sedang menulis ${DOC_LABEL[activeWritingDoc.type]}. Begitu selesai, dokumen berikutnya akan dimulai otomatis.`
                  : 'Server sedang menyiapkan penulisan dokumen.'}
              </p>
              {activeWritingDoc && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setAutoFollowActive(true);
                    onSelectType(activeWritingDoc.type);
                  }}
                >
                  Lihat {DOC_LABEL[activeWritingDoc.type]} yang sedang ditulis
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line-strong bg-canvas/50 p-7">
              <h3 className="text-base font-semibold text-ink">
                {DOC_LABEL[selectedType]} belum dibuat
              </h3>
              <p className="max-w-lg text-sm leading-relaxed text-ink-2">
                Buat keenam dokumen spesifikasi secara berurutan agar setiap dokumen saling merujuk, atau buat {DOC_LABEL[selectedType]} ini saja terlebih dahulu.
              </p>
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <Button
                  variant="primary"
                  onClick={() => void startBatch()}
                  disabled={startingBatch || streaming}
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  {startingBatch
                    ? 'Memulai...'
                    : liveReadyCount === 0
                      ? 'Buat 6 dokumen sekaligus'
                      : `Lanjutkan sisa (${missingCount} dokumen)`}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void regenerate()}
                  disabled={streaming || startingBatch}
                >
                  {streaming ? 'Menulis...' : `Buat ${DOC_LABEL[selectedType]} saja`}
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Regenerate with revision instructions dialog */}
      <Dialog open={regenOpen} onOpenChange={setRegenOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tulis ulang {DOC_LABEL[selectedType]}</DialogTitle>
            <DialogDescription>
              Berikan instruksi revisi spesifik agar bagian penting diperbarui tanpa mengubah
              bagian lain yang sudah tepat. Versi sebelumnya tetap tersimpan di riwayat.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="regen-instructions" className="block text-sm font-medium text-ink">
                Instruksi revisi <span className="font-normal text-ink-3">(opsional)</span>
              </label>
              <textarea
                id="regen-instructions"
                rows={4}
                maxLength={4000}
                value={regenInstructions}
                onChange={(e) => setRegenInstructions(e.target.value)}
                placeholder="Contoh: Tambahkan tabel audit_logs, pisahkan role admin dan kasir, dan buat diagram alur pembayaran..."
                className="w-full rounded-xl border border-line bg-canvas/70 p-3 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent"
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-ink-3">Saran cepat</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REVISION_PROMPTS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() =>
                      setRegenInstructions((prev) => (prev.trim() ? `${prev.trim()}\n${chip}` : chip))
                    }
                    className="rounded-lg border border-line bg-canvas px-2.5 py-1 text-left text-xs text-ink-2 transition-colors hover:border-accent hover:text-ink"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setRegenOpen(false)}>
              Batal
            </Button>
            <Button
              variant="primary"
              onClick={() => void regenerate(regenInstructions)}
              disabled={streaming}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              {regenInstructions.trim() ? 'Terapkan revisi' : 'Tulis ulang penuh'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
