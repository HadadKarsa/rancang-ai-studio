'use client';

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
  X,
} from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
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
import { WireframeEditor } from '@/components/WireframeEditor';
import { MarkdownRenderer } from './MarkdownRenderer';
import { cn } from '@/lib/cn';
import type { DocumentType, WorkspaceDoc, WorkspaceProject } from './types';
import { DOC_LABEL, DOC_ORDER, DOC_SUBTITLE, formatTimeAgo } from './types';

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

interface DocumentPanelProps {
  project: WorkspaceProject;
  docs: WorkspaceDoc[];
  selectedType: DocumentType;
  onSelectType: (type: DocumentType) => void;
  onDocumentsChanged: () => void;
  onGoToWrite: () => void;
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

function formatAgentPrompt(
  project: WorkspaceProject,
  docLabel: string,
  versionNum: number | undefined,
  markdown: string,
): string {
  return [
    `<rancang_spec project="${project.name}" slug="${project.slug}" document="${docLabel}" version="v${versionNum ?? 1}">`,
    `Gunakan spesifikasi berikut sebagai sumber kebenaran saat merancang dan menulis kode.`,
    `Ikuti kontrak, skema, batasan, dan konvensi yang tertulis tanpa mengubah keputusan yang sudah dikunci.`,
    '',
    markdown.trim(),
    `</rancang_spec>`,
  ].join('\n');
}

export function DocumentPanel({
  project,
  docs,
  selectedType,
  onSelectType,
  onDocumentsChanged,
  onGoToWrite,
}: DocumentPanelProps) {
  const { toast } = useToast();
  const [activeDoc, setActiveDoc] = useState<WorkspaceDoc | null>(null);
  const [content, setContent] = useState<string>('');
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [viewingVersion, setViewingVersion] = useState<DocVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Regenerate with revision instructions dialog
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenInstructions, setRegenInstructions] = useState('');
  const [streaming, setStreaming] = useState(false);

  // Version restore & misc actions
  const [historyOpen, setHistoryOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [savingLib, setSavingLib] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const [copyingProject, setCopyingProject] = useState(false);

  const cache = useRef<Map<DocumentType, DocResp>>(new Map());

  const loadDoc = useCallback(
    async (type: DocumentType, force = false) => {
      if (!force) {
        const cached = cache.current.get(type);
        if (cached) {
          setActiveDoc(cached.document);
          setContent(cached.content ?? '');
          setVersions(cached.versions ?? []);
          setViewingVersion(null);
          setEditing(false);
          setLoading(false);
          return;
        }
      }
      setLoading(true);
      setError(null);
      try {
        const r = await api.get<DocResp>(
          `/projects/${project.id}/documents/${type}?content=1&versions=1`,
        );
        cache.current.set(type, r);
        setActiveDoc(r.document);
        setContent(r.content ?? '');
        setVersions(r.versions ?? []);
        setViewingVersion(null);
        setEditing(false);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Gagal memuat dokumen');
      } finally {
        setLoading(false);
      }
    },
    [project.id],
  );

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
        headers: { 'Content-Type': 'application/json' },
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

  async function copyForAgent(scope: 'doc' | 'project') {
    if (scope === 'doc') {
      const target = viewingVersion?.contentMd ?? content;
      if (!target) return;
      const ver = viewingVersion?.versionNumber ?? versions[0]?.versionNumber;
      const formatted = formatAgentPrompt(project, DOC_LABEL[selectedType], ver, target);
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
      const formatted = formatAgentPrompt(project, 'ALL_SPECS', undefined, allMd);
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
        kind: selectedType === 'wireframe' ? 'wireframe' : 'document',
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

  const orderedDocs = useMemo(
    () =>
      DOC_ORDER.map((type) => docs.find((d) => d.type === type)).filter(
        (d): d is WorkspaceDoc => Boolean(d),
      ),
    [docs],
  );
  const latestVersion = versions[0];
  const displayedContent = viewingVersion?.contentMd ?? content;
  const editDirty = editing && editDraft !== content;

  return (
    <div className="grid gap-5 lg:grid-cols-[250px_1fr] lg:items-start">
      {/* Always-visible 7-document sidebar */}
      <aside
        aria-label="Daftar tujuh dokumen spesifikasi"
        className="rounded-2xl border border-line bg-sidebar p-2 lg:sticky lg:top-20"
      >
        <p className="hidden lg:block px-2.5 pb-1.5 pt-1 text-xs font-medium text-ink-3">
          Tujuh dokumen
        </p>
        <ul className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
          {orderedDocs.map((d) => {
            const isSelected = d.type === selectedType;
            return (
              <li key={d.type} className="shrink-0">
                <button
                  type="button"
                  aria-current={isSelected ? 'true' : undefined}
                  onClick={() => onSelectType(d.type)}
                  className={cn(
                    'flex min-h-11 w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-left transition-colors',
                    isSelected
                      ? 'bg-surface text-ink shadow-xs ring-1 ring-line'
                      : 'text-ink-2 hover:bg-hover hover:text-ink',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <StatusIcon status={d.status} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {DOC_LABEL[d.type]}
                      </span>
                      <span className="hidden lg:block truncate text-[11px] text-ink-3">
                        {DOC_SUBTITLE[d.type]}
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
      </aside>

      {/* Main Document Studio */}
      <section className="min-w-0 rounded-2xl border border-line bg-surface shadow-panel overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-sidebar/40 px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold tracking-tight text-ink">
                {activeDoc?.title ?? DOC_LABEL[selectedType]}
              </h2>
              {activeDoc?.isLocked && <Badge tone="warn">Terkunci</Badge>}
            </div>
            <p className="mt-0.5 font-mono text-xs text-ink-3">
              {activeDoc?.lastGeneratedAt
                ? `Diperbarui ${formatTimeAgo(activeDoc.lastGeneratedAt)}`
                : 'Belum ditulis'}
              {displayedContent ? ` · ${formatBytes(displayedContent)}` : ''}
            </p>
          </div>

          {selectedType !== 'wireframe' && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Preview / Edit toggle */}
              {content && !streaming && (
                <div
                  className="inline-flex rounded-lg border border-line bg-sidebar p-0.5"
                  role="group"
                  aria-label="Mode tampilan dokumen"
                >
                  <button
                    type="button"
                    aria-pressed={!editing}
                    onClick={() => setEditing(false)}
                    className={cn(
                      'inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                      !editing ? 'bg-surface text-ink shadow-xs' : 'text-ink-2 hover:text-ink',
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
                      editing ? 'bg-surface text-ink shadow-xs' : 'text-ink-2 hover:text-ink',
                    )}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Sunting</span>
                  </button>
                </div>
              )}

              {/* Version History Switcher */}
              {versions.length > 0 && (
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
              {content && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="secondary" disabled={copyingProject}>
                      <TerminalSquare className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                      <span className="hidden sm:inline">Salin untuk AI Agent</span>
                      <span className="sm:hidden">AI Agent</span>
                      <ChevronDown className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
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

              {/* Regenerate with instructions trigger */}
              <Button
                size="sm"
                variant="primary"
                onClick={() => (content ? setRegenOpen(true) : void regenerate())}
                disabled={streaming || Boolean(activeDoc?.isLocked)}
                title={activeDoc?.isLocked ? 'Buka kunci untuk menulis ulang' : undefined}
              >
                <RefreshCw
                  className={cn('h-3.5 w-3.5', streaming && 'animate-spin')}
                  aria-hidden="true"
                />
                {streaming ? 'Menulis...' : content ? 'Tulis ulang' : 'Buat dokumen'}
              </Button>

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
          )}
        </header>

        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 border-b border-danger/30 bg-danger-soft px-5 py-3 text-sm text-danger-ink"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* Historical version preview banner */}
        {viewingVersion && !editing && (
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
          {selectedType === 'wireframe' ? (
            <WireframeEditor
              projectId={project.id}
              onGenerateWireframe={() => void regenerate()}
              generating={streaming}
            />
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
                  className="w-full min-h-10 rounded-lg border border-line-strong bg-canvas px-3 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
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
                  className="w-full rounded-xl border border-line-strong bg-canvas p-4 font-mono text-[13px] leading-relaxed text-ink focus:border-accent focus:outline-none"
                />
              </div>
            </div>
          ) : displayedContent ? (
            <div>
              <MarkdownRenderer content={displayedContent} />
              {streaming && <span className="wet-caret ml-1" aria-hidden="true" />}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line-strong bg-canvas/50 p-8">
              <h3 className="text-base font-semibold text-ink">
                {DOC_LABEL[selectedType]} belum dibuat
              </h3>
              <p className="max-w-lg text-sm text-ink-2">
                Dokumen ini dihasilkan dari hasil wawancara proyek. Buat dokumen ini saja sekarang,
                atau jalankan penulisan batch untuk keenam dokumen inti sekaligus.
              </p>
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <Button variant="primary" onClick={() => void regenerate()} disabled={streaming}>
                  {streaming ? 'Menulis...' : `Buat ${DOC_LABEL[selectedType]}`}
                </Button>
                <Button variant="secondary" onClick={onGoToWrite}>
                  Buka mode Tulis Langsung
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
                className="w-full rounded-xl border border-line-strong bg-canvas p-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
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
