'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BookMarked,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileArchive,
  FileText,
  Layout,
  Search,
  Trash2,
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
  useToast,
} from '@/components/ui';
import { MarkdownRenderer } from '@/components/workspace/MarkdownRenderer';
import { cn } from '@/lib/cn';

interface LibraryItem {
  id: string;
  kind: 'document' | 'export' | 'wireframe';
  title: string;
  projectId: string | null;
  projectName: string | null;
  documentId: string | null;
  documentType: string | null;
  createdAt: string;
  bytes: number;
}

const KIND_LABEL: Record<LibraryItem['kind'], string> = {
  document: 'Dokumen',
  export: 'Ekspor',
  wireframe: 'Wireframe',
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function KindIcon({ kind }: { kind: LibraryItem['kind'] }) {
  if (kind === 'wireframe') return <Layout className="h-4 w-4" aria-hidden="true" />;
  if (kind === 'export') return <FileArchive className="h-4 w-4" aria-hidden="true" />;
  return <FileText className="h-4 w-4" aria-hidden="true" />;
}

export default function LibraryPage() {
  const { toast } = useToast();

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [kind, setKind] = useState<'' | LibraryItem['kind']>('');
  const [q, setQ] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  // Master-detail selection & payload preview
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [payload, setPayload] = useState<string>('');
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [wireframeShowCode, setWireframeShowCode] = useState(false);

  // Delete confirmation
  const [confirmItem, setConfirmItem] = useState<LibraryItem | null>(null);
  const [removing, setRemoving] = useState(false);

  const payloadCache = useRef<Map<string, string>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (type: '' | LibraryItem['kind'], search: string, cursor?: string) => {
      if (!cursor) setState('loading');
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (type) qs.set('type', type);
        if (search.trim()) qs.set('q', search.trim());
        if (cursor) qs.set('cursor', cursor);
        const r = await api.get<{ items: LibraryItem[]; nextCursor: string | null }>(
          `/library?${qs.toString()}`,
        );
        setItems((prev) => (cursor ? [...prev, ...r.items] : r.items));
        setNextCursor(r.nextCursor);
        if (!cursor) {
          setSelectedId((prev) => {
            if (prev && r.items.some((i) => i.id === prev)) return prev;
            return r.items[0]?.id ?? null;
          });
        }
        setState('ready');
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Gagal memuat Library');
        setState('error');
      }
    },
    [],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void load(kind, q);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [kind, q, load]);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );

  useEffect(() => {
    if (!selectedId) {
      setPayload('');
      return;
    }
    const cached = payloadCache.current.get(selectedId);
    if (cached !== undefined) {
      setPayload(cached);
      setLoadingDetail(false);
      return;
    }
    let alive = true;
    setLoadingDetail(true);
    setWireframeShowCode(false);
    api
      .get<{ item: LibraryItem; payload: string }>(`/library/${selectedId}`)
      .then((res) => {
        if (!alive) return;
        payloadCache.current.set(selectedId, res.payload ?? '');
        setPayload(res.payload ?? '');
      })
      .catch((e) => {
        if (alive) {
          setPayload('');
          toast({
            tone: 'error',
            title: 'Gagal memuat pratinjau artefak',
            description: e instanceof ApiError ? e.message : undefined,
          });
        }
      })
      .finally(() => {
        if (alive) setLoadingDetail(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedId, toast]);

  async function removeItem(item: LibraryItem) {
    setRemoving(true);
    try {
      await api.delete(`/library/${item.id}`);
      payloadCache.current.delete(item.id);
      setItems((prev) => {
        const next = prev.filter((i) => i.id !== item.id);
        if (selectedId === item.id) {
          setSelectedId(next[0]?.id ?? null);
          setMobileDetailOpen(false);
        }
        return next;
      });
      setConfirmItem(null);
      toast({ tone: 'info', title: `"${item.title}" dihapus dari Library` });
    } catch (e) {
      toast({
        tone: 'error',
        title: 'Gagal menghapus artefak',
        description: e instanceof ApiError ? e.message : undefined,
      });
    } finally {
      setRemoving(false);
    }
  }

  async function copyPayload() {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      toast({ tone: 'success', title: 'Isi artefak disalin ke papan klip' });
    } catch {
      toast({ tone: 'error', title: 'Gagal menyalin ke papan klip' });
    }
  }

  function downloadPayload(item: LibraryItem) {
    if (!payload) return;
    const ext = item.kind === 'wireframe' ? 'html' : item.kind === 'export' ? 'txt' : 'md';
    const slug = item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'artefak';
    const blob = new Blob([payload], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Library</h1>
        <p className="text-sm text-ink-2">
          Pilih artefak di sisi kiri untuk melihat pratinjau penuh, menyalin, atau mengunduhnya di
          sisi kanan.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-danger/35 bg-danger-soft px-4 py-3 text-sm text-danger-ink"
        >
          {error}
        </div>
      )}

      {state === 'ready' && items.length === 0 && !q && !kind ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center">
          <BookMarked className="mx-auto h-7 w-7 text-ink-3" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold text-ink">Library masih kosong</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-2">
            Buka dokumen atau wireframe di ruang kerja proyek, lalu pilih &ldquo;Simpan ke
            Library&rdquo; untuk menyimpannya sebagai arsip yang mudah diakses kembali.
          </p>
          <div className="mt-5">
            <Link
              href="/studio"
              className="inline-flex min-h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Buka Studio
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[340px_1fr] lg:items-start">
          {/* Master List Pane */}
          <section
            aria-label="Daftar artefak tersimpan"
            className={cn(
              'rounded-2xl border border-line bg-surface shadow-panel overflow-hidden',
              mobileDetailOpen && 'hidden lg:block',
            )}
          >
            <div className="space-y-3 border-b border-line bg-sidebar/50 p-3.5">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Cari judul artefak..."
                  aria-label="Cari di Library"
                  className="w-full min-h-10 rounded-lg border border-line-strong bg-surface pl-9 pr-3 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Saring jenis artefak">
                {(
                  [
                    ['', 'Semua'],
                    ['document', 'Dokumen'],
                    ['export', 'Ekspor'],
                    ['wireframe', 'Wireframe'],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v || 'all'}
                    type="button"
                    aria-pressed={kind === v}
                    onClick={() => setKind(v)}
                    className={cn(
                      'min-h-8 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                      kind === v
                        ? 'border-ink bg-ink text-canvas'
                        : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {state === 'loading' && items.length === 0 ? (
              <div className="p-4 space-y-2.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 rounded-xl bg-subtle animate-pulse" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <p className="p-6 text-center text-sm text-ink-2">
                Tidak ada artefak yang cocok dengan filter ini.
              </p>
            ) : (
              <ul className="max-h-[68vh] divide-y divide-line overflow-y-auto">
                {items.map((item) => {
                  const active = item.id === selectedId;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        aria-current={active ? 'true' : undefined}
                        onClick={() => {
                          setSelectedId(item.id);
                          setMobileDetailOpen(true);
                        }}
                        className={cn(
                          'flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors',
                          active ? 'bg-accent-soft/50' : 'hover:bg-subtle/60',
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                            active
                              ? 'border-accent/30 bg-surface text-accent-ink'
                              : 'border-line bg-canvas text-ink-3',
                          )}
                        >
                          <KindIcon kind={item.kind} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{item.title}</p>
                          <p className="mt-0.5 truncate text-xs text-ink-2">
                            {item.projectName ?? 'Simpanan lepas'}
                          </p>
                          <div className="mt-1.5 flex items-center gap-2 font-mono text-[11px] text-ink-3">
                            <span>{KIND_LABEL[item.kind]}</span>
                            <span>·</span>
                            <span>{formatBytes(item.bytes)}</span>
                            <span>·</span>
                            <span>{formatDate(item.createdAt)}</span>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {nextCursor && (
              <div className="border-t border-line p-3 text-center">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void load(kind, q, nextCursor)}
                >
                  Muat lebih banyak
                </Button>
              </div>
            )}
          </section>

          {/* Detail Preview Pane */}
          <section
            aria-label="Pratinjau artefak"
            className={cn(
              'min-w-0 rounded-2xl border border-line bg-surface shadow-panel overflow-hidden lg:sticky lg:top-20',
              !mobileDetailOpen && 'hidden lg:block',
            )}
          >
            {!selectedItem ? (
              <div className="p-10 text-center text-sm text-ink-3">
                Pilih salah satu artefak di daftar untuk melihat pratinjaunya di sini.
              </div>
            ) : (
              <>
                <header className="border-b border-line bg-sidebar/40 px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 lg:hidden">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setMobileDetailOpen(false)}
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      Kembali ke daftar
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">{KIND_LABEL[selectedItem.kind]}</Badge>
                        {selectedItem.projectName && (
                          <span className="text-xs text-ink-2">{selectedItem.projectName}</span>
                        )}
                      </div>
                      <h2 className="mt-1.5 truncate text-lg font-semibold tracking-tight text-ink">
                        {selectedItem.title}
                      </h2>
                      <p className="mt-0.5 font-mono text-xs text-ink-3">
                        {formatBytes(selectedItem.bytes)} · Disimpan {formatDate(selectedItem.createdAt)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!payload || loadingDetail}
                        onClick={() => void copyPayload()}
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        Salin
                      </Button>

                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!payload || loadingDetail}
                        onClick={() => downloadPayload(selectedItem)}
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        Unduh
                      </Button>

                      {selectedItem.projectId && (
                        <>
                          <a
                            href={`/api/v1/projects/${selectedItem.projectId}/export?format=zip`}
                            download
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-subtle"
                          >
                            <FileArchive className="h-3.5 w-3.5" aria-hidden="true" />
                            ZIP Proyek
                          </a>
                          <Link
                            href={`/projects/${selectedItem.projectId}`}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-subtle"
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            Proyek
                          </Link>
                        </>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Hapus ${selectedItem.title}`}
                        className="text-danger-ink hover:bg-danger-soft"
                        onClick={() => setConfirmItem(selectedItem)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </header>

                <div className="max-h-[65vh] overflow-y-auto p-5 sm:p-6">
                  {loadingDetail ? (
                    <p className="font-mono text-xs text-ink-3">Memuat pratinjau...</p>
                  ) : selectedItem.kind === 'wireframe' ? (
                    <div className="space-y-3">
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setWireframeShowCode((v) => !v)}
                        >
                          {wireframeShowCode ? (
                            <>
                              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                              Pratinjau HTML
                            </>
                          ) : (
                            <>
                              <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
                              Lihat kode HTML
                            </>
                          )}
                        </Button>
                      </div>
                      {wireframeShowCode ? (
                        <pre className="overflow-x-auto rounded-xl border border-line bg-sidebar p-4 font-mono text-xs text-ink">
                          <code>{payload}</code>
                        </pre>
                      ) : (
                        <iframe
                          title={`Pratinjau ${selectedItem.title}`}
                          sandbox="allow-scripts"
                          srcDoc={payload}
                          width={900}
                          height={480}
                          className="min-h-[420px] w-full rounded-xl border border-line bg-white"
                        />
                      )}
                    </div>
                  ) : (
                    <MarkdownRenderer content={payload} />
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={Boolean(confirmItem)} onOpenChange={(o) => !o && !removing && setConfirmItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus &ldquo;{confirmItem?.title}&rdquo; dari Library?</DialogTitle>
            <DialogDescription>
              Tindakan ini hanya menghapus salinan yang tersimpan di Library. Proyek, wawancara, dan
              dokumen aslinya tetap utuh.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={removing} onClick={() => setConfirmItem(null)}>
              Batal
            </Button>
            <Button
              variant="danger"
              disabled={removing}
              onClick={() => confirmItem && void removeItem(confirmItem)}
            >
              {removing ? 'Menghapus...' : 'Hapus dari Library'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
