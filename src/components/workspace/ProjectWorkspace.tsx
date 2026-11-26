'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  FileText,
  Download,
  Share2,
  ChevronDown,
  FileArchive,
  FileCode2,
  AlertCircle,
  ArrowLeft,
  Copy,
} from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
  useToast,
} from '@/components/ui';
import { useAppShell } from '@/components/AppShellContext';
import { InterviewPanel } from './InterviewPanel';
import { WritePanel } from './WritePanel';
import { DocumentPanel } from './DocumentPanel';
import { ShareDialog } from './ShareDialog';
import type {
  DocumentType,
  ProjectPurpose,
  WorkspaceDoc,
  WorkspaceMode,
  WorkspaceProject,
} from './types';
import { PROJECT_PURPOSE_LABEL } from './types';
import { CORE_DOC_ORDER, isValidDocType } from './types';

interface ProjectResp {
  project: WorkspaceProject;
  documents: WorkspaceDoc[];
}

const PROJECT_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  interviewing: 'Wawancara',
  generating: 'Menulis',
  ready: 'Siap',
  archived: 'Arsip',
};

function isValidMode(val: string | null): val is WorkspaceMode {
  return val === 'interview' || val === 'write' || val === 'documents';
}

function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-line-strong bg-canvas font-mono text-[10px] leading-none text-ink-3 transition-colors group-data-[state=active]:border-accent group-data-[state=active]:bg-accent group-data-[state=active]:text-white"
    >
      {n}
    </span>
  );
}

export function ProjectWorkspace() {
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const projectId = params.projectId;
  const { setProjectBreadcrumb } = useAppShell();
  const { toast } = useToast();

  const [project, setProject] = useState<WorkspaceProject | null>(null);
  const [savingPurpose, setSavingPurpose] = useState(false);
  const [docs, setDocs] = useState<WorkspaceDoc[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const initialModeParam = searchParams.get('mode');
  const initialDocParam = searchParams.get('doc');
  const initialAutoStart = searchParams.get('autostart') === '1';

  const [mode, setMode] = useState<WorkspaceMode>(
    isValidMode(initialModeParam) ? initialModeParam : 'documents',
  );
  const [modeInitialized, setModeInitialized] = useState(isValidMode(initialModeParam));
  const [selectedDoc, setSelectedDoc] = useState<DocumentType>(
    isValidDocType(initialDocParam) ? initialDocParam : 'prd',
  );
  const [autoStartWrite, setAutoStartWrite] = useState(initialAutoStart);
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [copyingMd, setCopyingMd] = useState(false);

  // Pick up any Quick-Start Composer prompt handed off via sessionStorage
  useEffect(() => {
    try {
      const key = `rancang.seed.${projectId}`;
      const seeded = window.sessionStorage.getItem(key);
      if (seeded) {
        window.sessionStorage.removeItem(key);
        setInitialPrompt(seeded);
        setMode('interview');
        setModeInitialized(true);
      }
    } catch {
      /* ignore */
    }
  }, [projectId]);

  const syncUrl = useCallback(
    (nextMode: WorkspaceMode, nextDoc?: DocumentType) => {
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      url.searchParams.set('mode', nextMode);
      url.searchParams.delete('autostart');
      if (nextMode === 'documents' && nextDoc) {
        url.searchParams.set('doc', nextDoc);
      } else {
        url.searchParams.delete('doc');
      }
      window.history.replaceState(null, '', `${url.pathname}${url.search}`);
    },
    [],
  );

  const loadProject = useCallback(
    async (silent = false) => {
      if (!silent) setState('loading');
      try {
        const res = await api.get<ProjectResp>(`/projects/${projectId}`);
        setProject(res.project);
        const ordered = res.documents.filter((doc) => CORE_DOC_ORDER.includes(doc.type)).sort(
          (a, b) =>
            CORE_DOC_ORDER.indexOf(a.type) - CORE_DOC_ORDER.indexOf(b.type) || a.orderIndex - b.orderIndex,
        );
        setDocs(ordered);
        setProjectBreadcrumb(res.project.name);

        if (!modeInitialized) {
          const readyCount = ordered.filter((d) => d.status === 'ready').length;
          if (res.project.status === 'generating') {
            setMode('write');
          } else if (readyCount > 0) {
            setMode('documents');
            if (!isValidDocType(initialDocParam)) {
              const firstReady = ordered.find((d) => d.status === 'ready');
              if (firstReady) setSelectedDoc(firstReady.type);
            }
          } else {
            setMode('interview');
          }
          setModeInitialized(true);
        }

        setState('ready');
      } catch (e) {
        if (!silent) {
          setError(e instanceof ApiError ? e.message : 'Gagal memuat proyek');
          setState('error');
        }
      }
    },
    [projectId, setProjectBreadcrumb, modeInitialized, initialDocParam],
  );

  useEffect(() => {
    void loadProject();
    return () => setProjectBreadcrumb(null);
  }, [loadProject, setProjectBreadcrumb]);

  const handleModeChange = useCallback(
    (next: string) => {
      if (!isValidMode(next)) return;
      setMode(next);
      syncUrl(next, next === 'documents' ? selectedDoc : undefined);
      if (next === 'documents') {
        void loadProject(true);
      }
    },
    [selectedDoc, syncUrl, loadProject],
  );

  const handleSelectDoc = useCallback(
    (type: DocumentType) => {
      setSelectedDoc(type);
      syncUrl('documents', type);
    },
    [syncUrl],
  );

  const openDocumentFromWrite = useCallback(
    (type: DocumentType) => {
      setSelectedDoc(type);
      setMode('documents');
      syncUrl('documents', type);
      void loadProject(true);
    },
    [syncUrl, loadProject],
  );

  const startWritingFromInterview = useCallback(() => {
    setAutoStartWrite(true);
    setMode('write');
    syncUrl('write');
  }, [syncUrl]);

  const readyCount = useMemo(() => docs.filter((d) => d.status === 'ready').length, [docs]);
  const coreReadyCount = useMemo(
    () => docs.filter((d) => CORE_DOC_ORDER.includes(d.type) && d.status === 'ready').length,
    [docs],
  );
  const canExport = coreReadyCount === CORE_DOC_ORDER.length;
  const activeDocRecord = useMemo(
    () => docs.find((d) => d.type === selectedDoc) ?? null,
    [docs, selectedDoc],
  );

  // Same rule the export route enforces: 409 while any core document is
  // missing, so the button and the copy action stay off until all six are ready.
  const exportGateTitle = canExport ? undefined : 'Butuh 6 dokumen inti';

  async function copyForAgent() {
    if (copyingMd) return;
    if (!canExport) {
      toast({
        tone: 'error',
        title: 'Dokumen inti belum lengkap',
        description: `${coreReadyCount} dari ${CORE_DOC_ORDER.length} dokumen inti siap.`,
      });
      return;
    }
    setCopyingMd(true);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/export?format=md`, {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        let message = `Ekspor gagal (${res.status}).`;
        try {
          const body = await res.json();
          message = body?.error?.message ?? message;
        } catch {
          /* non-JSON error body */
        }
        throw new Error(message);
      }
      const markdown = await res.text();
      if (!navigator.clipboard?.writeText) {
        throw new Error('Papan klip tidak tersedia di browser ini. Buka lewat HTTPS atau localhost.');
      }
      await navigator.clipboard.writeText(markdown);
      toast({
        tone: 'success',
        title: 'Markdown disalin',
        description: `${Math.max(1, Math.round(markdown.length / 1024))} KB siap ditempel ke AI agent.`,
      });
    } catch (e) {
      toast({
        tone: 'error',
        title: 'Gagal menyalin markdown',
        description: e instanceof Error ? e.message : 'Tidak bisa menyalin ke papan klip.',
      });
    } finally {
      setCopyingMd(false);
    }
  }

  async function changePurpose(next: ProjectPurpose | null) {
    if (!project || savingPurpose) return;
    const previous = project.purpose;
    if (previous === next) return;

    setSavingPurpose(true);
    setProject({ ...project, purpose: next });
    try {
      const res = await api.patch<ProjectResp>(`/projects/${projectId}`, { purpose: next });
      setProject(res.project);
      toast({
        tone: 'success',
        title: 'Tujuan diperbarui',
        description:
          'Berlaku untuk wawancara dan penulisan berikutnya. Dokumen yang sudah ada tidak berubah.',
      });
    } catch (e) {
      setProject({ ...project, purpose: previous });
      toast({
        tone: 'error',
        title: 'Gagal menyimpan tujuan',
        description: e instanceof ApiError ? e.message : 'Coba lagi sebentar lagi.',
      });
    } finally {
      setSavingPurpose(false);
    }
  }

  function triggerExport(format: 'zip' | 'md' | 'json') {
    if (!canExport) {
      toast({
        tone: 'error',
        title: 'Dokumen inti belum lengkap',
        description: `${coreReadyCount} dari 6 dokumen inti siap. Selesaikan penulisan sebelum mengekspor.`,
      });
      return;
    }
    window.location.href = `/api/v1/projects/${projectId}/export?format=${format}`;
    toast({
      tone: 'success',
      title: `Mengunduh paket ${format.toUpperCase()}`,
    });
  }

  if (state === 'loading') {
    return (
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 space-y-5">
        <div className="h-24 rounded-2xl border border-line bg-surface animate-pulse" />
        <div className="h-96 rounded-2xl border border-line bg-surface animate-pulse" />
      </div>
    );
  }

  if (state === 'error' || !project) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 space-y-4">
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-danger/35 bg-danger-soft px-4 py-3 text-sm text-danger-ink"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error ?? 'Proyek tidak ditemukan.'}</span>
        </div>
        <Link
          href="/studio"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-subtle"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Kembali ke Studio
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 space-y-6">
      {/* Persistent project header */}
      <header className="rounded-2xl border border-line bg-surface p-4 shadow-panel sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line text-sm font-semibold"
              style={{
                backgroundColor: `${project.accentColor}1a`,
                color: project.accentColor,
              }}
            >
              {project.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                  {project.name}
                </h1>
                <Badge
                  tone={
                    project.status === 'ready'
                      ? 'ready'
                      : project.status === 'generating' || project.status === 'interviewing'
                        ? 'live'
                        : 'neutral'
                  }
                  dot
                >
                  {PROJECT_STATUS_LABEL[project.status] ?? project.status}
                </Badge>
                <span
                  title={`${readyCount} dari ${docs.length || 7} dokumen selesai`}
                  className="inline-flex items-center rounded-md border border-line bg-sidebar px-2 py-0.5 font-mono text-xs font-medium text-ink-2"
                >
                  {readyCount}/{docs.length || 7} dok
                </span>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={savingPurpose}
                      className="min-h-9"
                      title="Tujuan dokumen menentukan penekanan wawancara dan penulisan"
                    >
                      <span className="text-ink-2">
                        {project.purpose ? PROJECT_PURPOSE_LABEL[project.purpose] : 'Pilih tujuan'}
                      </span>
                      <ChevronDown className="h-3 w-3 text-ink-3" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>Tujuan dokumen</DropdownMenuLabel>
                    {(Object.keys(PROJECT_PURPOSE_LABEL) as ProjectPurpose[]).map((value) => (
                      <DropdownMenuItem
                        key={value}
                        onSelect={() => void changePurpose(value)}
                        disabled={project.purpose === value}
                      >
                        <span>{PROJECT_PURPOSE_LABEL[value]}</span>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => void changePurpose(null)}
                      disabled={project.purpose === null}
                    >
                      <span>Belum ditentukan</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {project.description && (
                <p className="mt-1 line-clamp-2 max-w-2xl text-sm text-ink-2">
                  {project.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!canExport}
                  title={exportGateTitle}
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Ekspor</span>
                  <ChevronDown className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => triggerExport('zip')}>
                  <FileArchive className="h-4 w-4 text-ink-3" aria-hidden="true" />
                  <span>Unduh paket ZIP</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => triggerExport('md')}>
                  <FileText className="h-4 w-4 text-ink-3" aria-hidden="true" />
                  <span>Unduh gabungan Markdown</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => triggerExport('json')}>
                  <FileCode2 className="h-4 w-4 text-ink-3" aria-hidden="true" />
                  <span>Unduh bundel JSON</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void copyForAgent()} disabled={copyingMd}>
                  <Copy className="h-4 w-4 text-ink-3" aria-hidden="true" />
                  <span>{copyingMd ? 'Menyalin...' : 'Salin untuk AI Agent'}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button size="sm" variant="secondary" onClick={() => setShareOpen(true)}>
              <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Bagikan</span>
            </Button>
          </div>
        </div>

        {/* Linear stepper: one path, documents stay shut until something is written */}
        <Tabs value={mode} onValueChange={handleModeChange}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="interview" className="group">
              <StepNumber n={1} />
              <span>Wawancara</span>
            </TabsTrigger>
            <TabsTrigger value="write" className="group">
              <StepNumber n={2} />
              <span>Tulis</span>
            </TabsTrigger>
            <TabsTrigger
              value="documents"
              className="group"
              disabled={readyCount === 0}
              title={readyCount === 0 ? 'Selesaikan penulisan dulu' : undefined}
            >
              <StepNumber n={3} />
              <span>Dokumen</span>
              <span className="ml-0.5 hidden font-mono text-[11px] text-ink-3 sm:inline">
                {readyCount}/{docs.length || 7}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      {/* Active mode surface */}
      <div>
        {mode === 'interview' && (
          <InterviewPanel
            project={project}
            initialPrompt={initialPrompt}
            onPromptConsumed={() => setInitialPrompt(null)}
            onStartWriting={startWritingFromInterview}
          />
        )}

        {mode === 'write' && (
          <WritePanel
            project={project}
            autoStart={autoStartWrite}
            onAutoStartConsumed={() => setAutoStartWrite(false)}
            onDocumentsChanged={() => void loadProject(true)}
            onOpenDocument={openDocumentFromWrite}
            onBackToInterview={() => handleModeChange('interview')}
          />
        )}

        {mode === 'documents' && (
          <DocumentPanel
            project={project}
            docs={docs}
            selectedType={selectedDoc}
            onSelectType={handleSelectDoc}
            onDocumentsChanged={() => void loadProject(true)}
            onGoToWrite={() => handleModeChange('write')}
          />
        )}
      </div>

      <ShareDialog
        projectId={project.id}
        projectName={project.name}
        activeDoc={mode === 'documents' ? activeDocRecord : null}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </div>
  );
}
