'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, ExternalLink, Link2, Lock, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  useToast,
} from '@/components/ui';
import type { WorkspaceDoc } from './types';
import { DOC_LABEL } from './types';

interface ShareLinkRow {
  id: string;
  slug: string;
  scope: 'project' | 'document' | 'wireframe';
  documentId: string | null;
  access: 'public' | 'password';
  viewCount: number;
  revokedAt: string | null;
  createdAt: string;
}

interface ShareDialogProps {
  projectId: string;
  projectName: string;
  activeDoc?: WorkspaceDoc | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({
  projectId,
  projectName,
  activeDoc,
  open,
  onOpenChange,
}: ShareDialogProps) {
  const { toast } = useToast();
  const [links, setLinks] = useState<ShareLinkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [scope, setScope] = useState<'project' | 'document'>('project');
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ links: ShareLinkRow[] }>(`/projects/${projectId}/share`);
      setLinks((res.links ?? []).filter((l) => !l.revokedAt));
    } catch {
      /* leave list empty */
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    void loadLinks();
  }, [open, loadLinks]);

  async function createLink() {
    if (usePassword && password.trim().length < 4) {
      setError('Kata sandi minimal 4 karakter.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        scope: scope === 'document' && activeDoc ? 'document' : 'project',
        access: usePassword ? 'password' : 'public',
      };
      if (scope === 'document' && activeDoc) {
        payload.documentId = activeDoc.id;
      }
      if (usePassword) {
        payload.password = password.trim();
      }
      const res = await api.post<{ link: ShareLinkRow; url: string }>(
        `/projects/${projectId}/share`,
        payload,
      );
      const fullUrl = `${window.location.origin}${res.url}`;
      try {
        await navigator.clipboard.writeText(fullUrl);
        toast({
          tone: 'success',
          title: 'Tautan bagikan dibuat dan disalin',
          description: res.url,
        });
      } catch {
        toast({
          tone: 'success',
          title: 'Tautan bagikan dibuat',
          description: fullUrl,
        });
      }
      setPassword('');
      setUsePassword(false);
      await loadLinks();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal membuat tautan bagikan.');
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    try {
      await api.delete(`/projects/${projectId}/share?id=${encodeURIComponent(id)}`);
      setLinks((prev) => prev.filter((l) => l.id !== id));
      toast({ tone: 'info', title: 'Tautan bagikan dicabut' });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal mencabut tautan.');
    }
  }

  async function copyUrl(slug: string) {
    const fullUrl = `${window.location.origin}/share/${slug}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast({ tone: 'success', title: 'Tautan disalin ke papan klip' });
    } catch {
      toast({ tone: 'info', title: 'Salin tautan secara manual', description: fullUrl });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bagikan {projectName}</DialogTitle>
          <DialogDescription>
            Buat tautan baca saja yang dapat dibuka tanpa masuk akun. Tautan dapat dicabut kapan
            saja.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cakupan berbagi">
            <button
              type="button"
              role="radio"
              aria-checked={scope === 'project'}
              onClick={() => setScope('project')}
              className={`rounded-xl border p-3 text-left text-sm transition-colors ${
                scope === 'project'
                  ? 'border-accent bg-accent-soft/60 text-ink'
                  : 'border-line bg-canvas text-ink-2 hover:border-line-strong'
              }`}
            >
              <span className="block font-medium text-ink">Seluruh proyek</span>
              <span className="block text-xs text-ink-2 mt-0.5">Semua dokumen siap</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={scope === 'document'}
              disabled={!activeDoc}
              onClick={() => setScope('document')}
              className={`rounded-xl border p-3 text-left text-sm transition-colors disabled:opacity-45 ${
                scope === 'document'
                  ? 'border-accent bg-accent-soft/60 text-ink'
                  : 'border-line bg-canvas text-ink-2 hover:border-line-strong'
              }`}
            >
              <span className="block font-medium text-ink">
                {activeDoc ? `Hanya ${DOC_LABEL[activeDoc.type]}` : 'Dokumen aktif'}
              </span>
              <span className="block text-xs text-ink-2 mt-0.5">
                {activeDoc ? 'Satu dokumen saja' : 'Pilih dokumen dulu'}
              </span>
            </button>
          </div>

          <div className="space-y-2 rounded-xl border border-line bg-canvas/70 p-3.5">
            <label className="flex items-center gap-2.5 text-sm font-medium text-ink">
              <input
                type="checkbox"
                checked={usePassword}
                onChange={(e) => setUsePassword(e.target.checked)}
                className="h-4 w-4 rounded accent-[var(--accent)]"
              />
              <Lock className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
              <span>Lindungi dengan kata sandi</span>
            </label>
            {usePassword && (
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 4 karakter"
                aria-label="Kata sandi tautan bagikan"
                className="w-full min-h-10 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
              />
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-danger/35 bg-danger-soft px-3 py-2 text-xs text-danger-ink"
            >
              {error}
            </div>
          )}

          <Button
            variant="primary"
            className="w-full"
            onClick={() => void createLink()}
            disabled={creating}
          >
            <Link2 className="h-4 w-4" aria-hidden="true" />
            {creating ? 'Membuat tautan...' : 'Buat dan salin tautan'}
          </Button>

          <div className="border-t border-line pt-4 space-y-2.5">
            <p className="text-xs font-medium text-ink-2">
              Tautan aktif ({links.length})
            </p>
            {loading ? (
              <p className="font-mono text-xs text-ink-3">Memuat daftar tautan...</p>
            ) : links.length === 0 ? (
              <p className="text-xs text-ink-3">Belum ada tautan aktif untuk proyek ini.</p>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {links.map((link) => (
                  <li
                    key={link.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-3 py-2 text-xs"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <Badge tone="neutral">
                        {link.scope === 'project' ? 'Proyek' : 'Dokumen'}
                      </Badge>
                      {link.access === 'password' && (
                        <Lock className="h-3 w-3 shrink-0 text-ink-3" aria-label="Dengan sandi" />
                      )}
                      <span className="truncate font-mono text-ink-2">/share/{link.slug}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void copyUrl(link.slug)}
                        aria-label={`Salin tautan ${link.slug}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-2 hover:bg-subtle hover:text-ink"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <a
                        href={`/share/${link.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Buka tautan ${link.slug}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-2 hover:bg-subtle hover:text-ink"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                      <button
                        type="button"
                        onClick={() => void revoke(link.id)}
                        aria-label={`Cabut tautan ${link.slug}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-danger-ink hover:bg-danger-soft"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
