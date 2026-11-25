'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  Archive,
  ArchiveRestore,
  Building2,
  FolderOpen,
  Layers,
  LayoutDashboard,
  MoreHorizontal,
  Search,
  Store,
  Terminal,
  Trash2,
  X,
  SlidersHorizontal,
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
  DropdownMenuTrigger,
  useToast,
} from '@/components/ui';
import { cn } from '@/lib/cn';

type ProjectStatus = 'draft' | 'interviewing' | 'generating' | 'ready' | 'archived';

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  icon: string | null;
  accentColor: string;
  updatedAt: string;
  createdAt: string;
  docsReady: number;
  docsTotal: number;
}

type Counts = {
  all: number;
  draft: number;
  interviewing: number;
  generating: number;
  ready: number;
  archived: number;
};

interface ListResp {
  projects: Project[];
  counts: Counts;
  pagination: { total: number; limit: number; nextCursor: { value: string; id: string } | null };
}

interface TemplateItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  accentColor: string;
  baselineAssumptions: string[];
  defaultQuestions: string[];
  usageCount: number;
}

const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: 'Draft',
  interviewing: 'Wawancara',
  generating: 'Menulis',
  ready: 'Siap',
  archived: 'Arsip',
};

const FILTERS: { key: ProjectStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'draft', label: 'Draft' },
  { key: 'interviewing', label: 'Wawancara' },
  { key: 'generating', label: 'Menulis' },
  { key: 'ready', label: 'Siap' },
  { key: 'archived', label: 'Arsip' },
];

type SortKey = 'updated_at:desc' | 'created_at:desc' | 'name:asc';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'updated_at:desc', label: 'Terbaru diubah' },
  { key: 'created_at:desc', label: 'Terbaru dibuat' },
  { key: 'name:asc', label: 'Nama A-Z' },
];

const ACCENTS = ['#c2410c', '#0f766e', '#3d5a80', '#7a3b69', '#8f6b2e', '#6366f1'];

const CATEGORY_LABEL: Record<string, string> = {
  saas: 'SaaS',
  marketplace: 'Marketplace',
  ai: 'Agen AI',
  internal: 'Internal',
  content: 'Konten',
  other: 'Lainnya',
};

function TemplateIcon({ category }: { category: string }) {
  if (category === 'saas') return <Building2 className="h-4 w-4" aria-hidden="true" />;
  if (category === 'marketplace') return <Store className="h-4 w-4" aria-hidden="true" />;
  if (category === 'ai') return <Terminal className="h-4 w-4" aria-hidden="true" />;
  if (category === 'internal') return <LayoutDashboard className="h-4 w-4" aria-hidden="true" />;
  return <Layers className="h-4 w-4" aria-hidden="true" />;
}

function timeAgo(iso: string): string {
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

function deriveProjectName(idea: string, fallbackTemplate?: string): string {
  const firstLine = idea.split(/\n|[.!?]/)[0]?.trim() ?? '';
  const words = firstLine.split(/\s+/).filter(Boolean).slice(0, 6).join(' ');
  const candidate = words.length >= 3 ? words : fallbackTemplate || 'Proyek Baru';
  return candidate.slice(0, 80);
}

export default function StudioPage() {
  const router = useRouter();
  const { toast } = useToast();

  // Quick-Start Composer state
  const [idea, setIdea] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [accent, setAccent] = useState(ACCENTS[0]!);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | null>(null);
  const [creating, setCreating] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  // Templates from API
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);

  // Projects list state
  const [data, setData] = useState<ListResp | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ProjectStatus | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('updated_at:desc');
  const [refreshTick, setRefreshTick] = useState(0);

  // Delete / Archive state
  const [confirmDel, setConfirmDel] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get<{ templates: TemplateItem[] }>('/templates')
      .then((res) => {
        if (alive) {
          setTemplates(res.templates ?? []);
          setTemplatesLoaded(true);
        }
      })
      .catch(() => {
        if (alive) setTemplatesLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const query = useCallback(
    (cursor?: { value: string; id: string }) => {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (status !== 'all') params.set('status', status);
      const [col, dir] = sort.split(':') as [string, string];
      params.set('sort', col);
      params.set('order', dir);
      if (cursor) {
        params.set('cursorValue', cursor.value);
        params.set('cursorId', cursor.id);
      }
      return `/projects?${params.toString()}`;
    },
    [q, status, sort],
  );

  useEffect(() => {
    let stale = false;
    if (debounce.current) clearTimeout(debounce.current);

    const run = () => {
      api
        .get<ListResp>(query())
        .then((d) => {
          if (!stale) {
            setData(d);
            setError(null);
          }
        })
        .catch((e: unknown) => {
          if (!stale) setError(e instanceof ApiError ? e.message : 'Gagal memuat proyek');
        });
    };

    if (q.trim().length > 0) {
      debounce.current = setTimeout(run, 180);
    } else {
      run();
    }

    return () => {
      stale = true;
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, q, refreshTick]);

  async function launchProject() {
    const trimmedIdea = idea.trim();
    const trimmedTitle = customTitle.trim();
    if (!trimmedIdea && !trimmedTitle && !selectedTemplate) return;

    setCreating(true);
    setError(null);
    const projectName =
      trimmedTitle ||
      deriveProjectName(trimmedIdea || selectedTemplate?.name || 'Proyek Baru', selectedTemplate?.name);
    const description = trimmedIdea || selectedTemplate?.description || undefined;

    try {
      const { project } = await api.post<{ project: Project }>('/projects', {
        name: projectName,
        description,
        templateId: selectedTemplate?.id,
        accentColor: accent,
      });

      if (trimmedIdea) {
        try {
          window.sessionStorage.setItem(`rancang.seed.${project.id}`, trimmedIdea);
        } catch {
          /* private mode */
        }
      }
      router.push(`/projects/${project.id}?mode=interview`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal membuat proyek baru');
      setCreating(false);
    }
  }

  function applyTemplate(tpl: TemplateItem) {
    setSelectedTemplate(tpl);
    if (tpl.accentColor && /^#[0-9a-fA-F]{6}$/.test(tpl.accentColor)) {
      setAccent(tpl.accentColor);
    }
    if (!idea.trim()) {
      setIdea(`Saya ingin membangun ${tpl.name}: ${tpl.description}`);
    }
    composerRef.current?.focus();
    toast({
      tone: 'info',
      title: `Template "${tpl.name}" dipilih`,
      description: 'Sesuaikan ide di composer lalu tekan Mulai merancang.',
    });
  }

  async function loadMore() {
    const cursor = data?.pagination.nextCursor;
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await api.get<ListResp>(query(cursor));
      setData((prev) =>
        prev
          ? {
              projects: [
                ...prev.projects,
                ...next.projects.filter((p) => !prev.projects.some((ex) => ex.id === p.id)),
              ],
              counts: next.counts,
              pagination: next.pagination,
            }
          : next,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal memuat proyek berikutnya');
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggleArchive(p: Project) {
    try {
      await api.patch(
        `/projects/${p.id}`,
        p.status === 'archived' ? { restore: true } : { status: 'archived' },
      );
      toast({
        tone: 'info',
        title: p.status === 'archived' ? `"${p.name}" dipulihkan` : `"${p.name}" diarsipkan`,
      });
      setRefreshTick((t) => t + 1);
    } catch (e) {
      toast({
        tone: 'error',
        title: 'Gagal mengubah status arsip',
        description: e instanceof ApiError ? e.message : undefined,
      });
    }
  }

  async function deleteProject(p: Project) {
    setDeleting(true);
    setDelError(null);
    try {
      await api.delete(`/projects/${p.id}?hard=1`);
      setConfirmDel(null);
      toast({ tone: 'info', title: `Proyek "${p.name}" dihapus permanen` });
      setRefreshTick((t) => t + 1);
    } catch (e) {
      setDelError(e instanceof ApiError ? e.message : 'Gagal menghapus proyek');
    } finally {
      setDeleting(false);
    }
  }

  const cards = useMemo(() => data?.projects ?? [], [data]);
  const filtered = q.trim().length > 0 || status !== 'all';

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-5 py-7 sm:px-8">
      {/* Quick-Start Composer */}
      <section aria-labelledby="studio-heading" className="space-y-4">
        <div>
          <h1 id="studio-heading" className="text-2xl font-semibold tracking-tight text-ink">
            Mulai spesifikasi baru
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            Tulis satu kalimat tentang aplikasi yang ingin kamu bangun, atau pilih template di
            bawah sebagai titik awal.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void launchProject();
          }}
          className="rounded-2xl border border-line bg-surface p-4 shadow-panel sm:p-5 space-y-3"
        >
          {selectedTemplate && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/25 bg-accent-soft/60 px-3 py-2 text-xs">
              <span className="flex items-center gap-2 font-medium text-accent-ink">
                <TemplateIcon category={selectedTemplate.category} />
                <span>Template aktif: {selectedTemplate.name}</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedTemplate(null)}
                aria-label="Hapus pilihan template"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-accent-ink hover:bg-accent/15"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          <div>
            <label htmlFor="quick-start-idea" className="sr-only">
              Ceritakan ide aplikasimu
            </label>
            <textarea
              id="quick-start-idea"
              ref={composerRef}
              rows={3}
              maxLength={2000}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void launchProject();
                }
              }}
              placeholder="Contoh: Aplikasi kasir dan antrean servis untuk bengkel motor, dipakai 2 mekanik dan 1 admin, dengan nota kirim ke WhatsApp..."
              className="w-full resize-none rounded-xl border border-line bg-canvas px-4 py-3 text-sm leading-relaxed text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
            />
          </div>

          {showOptions && (
            <div className="grid gap-3 rounded-xl border border-line bg-sidebar/50 p-3.5 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="qs-title" className="block text-xs font-medium text-ink-2">
                  Nama proyek <span className="font-normal text-ink-3">(otomatis jika kosong)</span>
                </label>
                <input
                  id="qs-title"
                  maxLength={120}
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Contoh: Kasir Bengkel Maju"
                  className="w-full min-h-10 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <span className="block text-xs font-medium text-ink-2">Warna penanda kartu</span>
                <div className="flex items-center gap-2 pt-1" role="radiogroup" aria-label="Warna penanda">
                  {ACCENTS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={accent === c}
                      aria-label={`Warna ${c}`}
                      onClick={() => setAccent(c)}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg border transition-transform',
                        accent === c
                          ? 'border-ink scale-105 bg-surface'
                          : 'border-line bg-surface/60 hover:border-line-strong',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: c }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowOptions((v) => !v)}
                aria-expanded={showOptions}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{showOptions ? 'Sembunyikan opsi' : 'Nama & warna'}</span>
              </Button>
              <span className="hidden sm:inline font-mono text-[11px] text-ink-3">
                Ctrl/Cmd+Enter untuk mulai
              </span>
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={creating || (!idea.trim() && !customTitle.trim() && !selectedTemplate)}
            >
              <span>{creating ? 'Menyiapkan ruang kerja...' : 'Mulai merancang'}</span>
              {!creating && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
            </Button>
          </div>
        </form>
      </section>

      {/* Template Starter Cards from /api/v1/templates */}
      <section aria-labelledby="templates-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="templates-heading" className="text-sm font-semibold text-ink">
            Mulai dari template
          </h2>
          {templatesLoaded && (
            <span className="font-mono text-xs text-ink-3">{templates.length} template siap</span>
          )}
        </div>

        {!templatesLoaded ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-32 rounded-xl border border-line bg-surface animate-pulse" />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <p className="text-xs text-ink-3">Belum ada template tersimpan.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {templates.map((tpl) => {
              const isSelected = selectedTemplate?.id === tpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  aria-pressed={isSelected}
                  className={cn(
                    'flex flex-col justify-between rounded-xl border p-4 text-left transition-colors',
                    isSelected
                      ? 'border-accent bg-accent-soft/50 shadow-xs'
                      : 'border-line bg-surface hover:border-line-strong hover:bg-subtle/40',
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line"
                        style={{
                          backgroundColor: `${tpl.accentColor}1a`,
                          color: tpl.accentColor,
                        }}
                      >
                        <TemplateIcon category={tpl.category} />
                      </span>
                      <Badge tone="neutral">
                        {CATEGORY_LABEL[tpl.category] ?? tpl.category}
                      </Badge>
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-ink">{tpl.name}</h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-2">
                      {tpl.description}
                    </p>
                  </div>
                  {tpl.baselineAssumptions.length > 0 && (
                    <p className="mt-3 truncate font-mono text-[11px] text-ink-3">
                      {tpl.baselineAssumptions.slice(0, 2).join(' · ')}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Existing Projects */}
      <section aria-labelledby="projects-heading" className="space-y-4 border-t border-line pt-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="projects-heading" className="text-lg font-semibold tracking-tight text-ink">
            Proyekmu
          </h2>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64 sm:flex-none">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
                aria-hidden="true"
              />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari proyek..."
                aria-label="Cari proyek"
                className="w-full min-h-10 rounded-lg border border-line-strong bg-surface pl-9 pr-3 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-ink-2">
              <span className="sr-only">Urutkan proyek</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Urutkan proyek"
                className="min-h-10 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-ink focus:border-accent focus:outline-none"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Status Filter Chips */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Saring berdasarkan status">
          {FILTERS.map((f) => {
            const count = data?.counts[f.key === 'all' ? 'all' : f.key];
            const active = status === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => setStatus(f.key)}
                className={cn(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'border-ink bg-ink text-canvas'
                    : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
                )}
              >
                <span>{f.label}</span>
                {data && (
                  <span
                    className={cn(
                      'font-mono text-[11px]',
                      active ? 'opacity-80' : 'text-ink-3',
                    )}
                  >
                    {count ?? 0}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-danger/35 bg-danger-soft px-4 py-3 text-sm text-danger-ink"
          >
            {error}
          </div>
        )}

        {!data && !error && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-44 rounded-2xl border border-line bg-surface animate-pulse" />
            ))}
          </div>
        )}

        {data && cards.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-10 text-center">
            <FolderOpen className="mx-auto h-7 w-7 text-ink-3" aria-hidden="true" />
            <h3 className="mt-3 text-base font-semibold text-ink">
              {filtered ? 'Tidak ada proyek yang cocok.' : 'Belum ada proyek di Studio.'}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-2">
              {filtered
                ? 'Coba kata kunci lain atau kembalikan saringan ke Semua.'
                : 'Tulis satu kalimat ide di composer atas atau pilih salah satu template untuk memulai proyek pertamamu.'}
            </p>
            {filtered && (
              <div className="mt-4">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setQ('');
                    setStatus('all');
                  }}
                >
                  Tampilkan semua proyek
                </Button>
              </div>
            )}
          </div>
        )}

        {cards.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((p) => (
              <li key={p.id} className="group relative">
                <Link
                  href={`/projects/${p.id}`}
                  className="flex h-full flex-col justify-between rounded-2xl border border-line bg-surface p-5 shadow-xs transition-all hover:border-line-strong hover:shadow-panel"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 pr-8">
                      <span
                        aria-hidden="true"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line text-sm font-semibold"
                        style={{
                          backgroundColor: `${p.accentColor}1a`,
                          color: p.accentColor,
                        }}
                      >
                        {p.name.slice(0, 1).toUpperCase()}
                      </span>
                    </div>

                    <h3 className="mt-3.5 line-clamp-1 text-base font-semibold text-ink group-hover:text-accent-ink transition-colors">
                      {p.name}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-2">
                      {p.description ?? 'Belum ada deskripsi proyek.'}
                    </p>
                  </div>

                  <div className="mt-5 space-y-3">
                    {/* 7-doc progress bar */}
                    <div
                      className="flex items-center justify-between gap-2"
                      title={`${p.docsReady} dari ${p.docsTotal} dokumen siap`}
                    >
                      <div className="flex items-center gap-1" aria-hidden="true">
                        {Array.from({ length: p.docsTotal || 7 }, (_, idx) => (
                          <span
                            key={idx}
                            className={cn(
                              'h-1.5 w-3.5 rounded-full',
                              idx < p.docsReady ? 'bg-ready' : 'bg-subtle',
                            )}
                          />
                        ))}
                      </div>
                      <span className="font-mono text-[11px] text-ink-3">
                        {p.docsReady}/{p.docsTotal || 7} dok
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-t border-line pt-3">
                      <Badge
                        tone={
                          p.status === 'ready'
                            ? 'ready'
                            : p.status === 'interviewing' || p.status === 'generating'
                              ? 'live'
                              : 'neutral'
                        }
                        dot
                      >
                        {STATUS_LABEL[p.status]}
                      </Badge>
                      <span className="font-mono text-[11px] text-ink-3">
                        {timeAgo(p.updatedAt)}
                      </span>
                    </div>
                  </div>
                </Link>

                {/* Overflow menu positioned outside Link for valid HTML */}
                <div className="absolute right-3 top-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Opsi untuk ${p.name}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-subtle hover:text-ink"
                      >
                        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => void toggleArchive(p)}>
                        {p.status === 'archived' ? (
                          <>
                            <ArchiveRestore className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                            <span>Pulihkan proyek</span>
                          </>
                        ) : (
                          <>
                            <Archive className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                            <span>Arsipkan</span>
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        tone="danger"
                        onSelect={() => {
                          setDelError(null);
                          setConfirmDel(p);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Hapus permanen</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            ))}
          </ul>
        )}

        {data?.pagination.nextCursor && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadMore()}
              disabled={loadingMore}
            >
              {loadingMore ? 'Memuat...' : 'Muat lebih banyak'}
            </Button>
            <span className="font-mono text-xs text-ink-3">
              {cards.length} dari {data.pagination.total}
            </span>
          </div>
        )}
      </section>

      {/* Permanent delete confirmation dialog */}
      <Dialog open={Boolean(confirmDel)} onOpenChange={(o) => !o && !deleting && setConfirmDel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus &ldquo;{confirmDel?.name}&rdquo;?</DialogTitle>
            <DialogDescription>
              Seluruh wawancara, dokumen, riwayat versi, dan wireframe milik proyek ini akan
              dihapus permanen. Jika hanya ingin menyembunyikannya, gunakan opsi Arsipkan.
            </DialogDescription>
          </DialogHeader>
          {delError && (
            <div
              role="alert"
              className="rounded-lg border border-danger/35 bg-danger-soft px-3 py-2 text-xs text-danger-ink"
            >
              {delError}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" disabled={deleting} onClick={() => setConfirmDel(null)}>
              Batal
            </Button>
            <Button
              variant="danger"
              disabled={deleting}
              onClick={() => confirmDel && void deleteProject(confirmDel)}
            >
              {deleting ? 'Menghapus...' : 'Hapus permanen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
