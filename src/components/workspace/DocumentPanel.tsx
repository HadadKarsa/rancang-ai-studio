'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
} from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  useToast,
} from '@/components/ui';
import { WireframeEditor } from '@/components/WireframeEditor';
import { cn } from '@/lib/cn';
import type { DocumentType, WorkspaceDoc, WorkspaceProject } from './types';
import { DOC_LABEL, DOC_ORDER, DOC_SUBTITLE, formatTimeAgo } from './types';

interface DocVersion {
  id: string;
  versionNumber: number;
  source: string;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [savingLib, setSavingLib] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);

  const cache = useRef<Map<DocumentType, DocResp>>(new Map());

  const loadDoc = useCallback(
    async (type: DocumentType, force = false) => {
      if (!force) {
        const cached = cache.current.get(type);
        if (cached) {
          setActiveDoc(cached.document);
          setContent(cached.content ?? '');
          setVersions(cached.versions ?? []);
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

  async function regenerate() {
    setStreaming(true);
    setError(null);
    setContent('');
    try {
      const res = await fetch(`/api/v1/projects/${project.id}/documents/${selectedType}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
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
      cache.current.delete(selectedType);
      await loadDoc(selectedType, true);
      onDocumentsChanged();
      toast({ tone: 'success', title: `${DOC_LABEL[selectedType]} berhasil diperbarui` });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menulis ulang dokumen');
    } finally {
      setStreaming(false);
    }
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(content);
      toast({ tone: 'success', title: 'Markdown disalin ke papan klip' });
    } catch {
      toast({ tone: 'error', title: 'Gagal menyalin ke papan klip' });
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
        payload: content,
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

  const orderedDocs = DOC_ORDER.map((type) => docs.find((d) => d.type === type)).filter(
    (d): d is WorkspaceDoc => Boolean(d),
  );
  const latestVersion = versions[0];

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

      {/* Main document viewer */}
      <section className="min-w-0 rounded-2xl border border-line bg-surface shadow-panel overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-sidebar/40 px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold tracking-tight text-ink">
                {activeDoc?.title ?? DOC_LABEL[selectedType]}
              </h2>
              {latestVersion && (
                <Badge tone="neutral" className="font-mono">
                  v{latestVersion.versionNumber}
                </Badge>
              )}
              {activeDoc?.isLocked && (
                <Badge tone="warn">Terkunci</Badge>
              )}
            </div>
            <p className="mt-0.5 font-mono text-xs text-ink-3">
              {activeDoc?.lastGeneratedAt
                ? `Diperbarui ${formatTimeAgo(activeDoc.lastGeneratedAt)}`
                : 'Belum ditulis'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void regenerate()}
              disabled={streaming || Boolean(activeDoc?.isLocked)}
              title={activeDoc?.isLocked ? 'Buka kunci untuk menulis ulang' : undefined}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', streaming && 'animate-spin')} aria-hidden="true" />
              {streaming ? 'Menulis...' : content ? 'Tulis ulang' : 'Buat dokumen'}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" aria-label="Aksi dokumen lainnya">
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={!content}
                  onSelect={() => void copyMarkdown()}
                >
                  <Copy className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                  Salin Markdown
                </DropdownMenuItem>
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

        {error && (
          <div
            role="alert"
            className="border-b border-danger/30 bg-danger-soft px-5 py-3 text-sm text-danger-ink"
          >
            {error}
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
          ) : content ? (
            <article className="prose-fresh">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              {streaming && <span className="wet-caret ml-1" aria-hidden="true" />}
            </article>
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
    </div>
  );
}
