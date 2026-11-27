'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Lock, FileText } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { Badge, Button } from '@/components/ui';
import { PublicThemeToggle } from '@/components/PublicThemeToggle';
import { MarkdownRenderer } from '@/components/workspace/MarkdownRenderer';
import { cn } from '@/lib/cn';

interface Doc {
  id: string;
  type: string;
  title: string;
  status: string;
}
interface Version {
  documentId: string;
  contentMd: string;
}
interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  accentColor: string;
  updatedAt: string;
}
interface Wireframe {
  id: string;
  name: string;
}
interface ProjectPayload {
  scope: 'project';
  project: Project;
  documents: Doc[];
  versions: Version[];
  wireframes: Wireframe[];
}
interface DocumentPayload {
  scope: 'document';
  document: { id: string; title: string; type: string };
  content: string;
}

const DOC_LABEL: Record<string, string> = {
  prd: 'PRD',
  architecture: 'Arsitektur',
  database: 'Database',
  api: 'API',
  tasks: 'Tugas',
  memory: 'Memori',
  wireframe: 'Wireframe',
};

export default function SharePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [data, setData] = useState<ProjectPayload | DocumentPayload | null>(null);
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'gone'>('loading');
  const [active, setActive] = useState<string | null>(null);

  const fetchShare = useCallback(
    async (pw?: string) => {
      setState('loading');
      setError(null);
      try {
        const q = pw ? `?password=${encodeURIComponent(pw)}` : '';
        const d = await api.get<ProjectPayload | DocumentPayload>(`/share/${slug}${q}`);
        setData(d);
        setNeedPassword(false);
        const first = d.scope === 'project' ? (d.versions[0]?.documentId ?? null) : d.document.id;
        setActive(first);
        setState('ready');
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.code === 'UNAUTHORIZED')) {
          setNeedPassword(true);
          setState('ready');
          return;
        }
        setError(e instanceof ApiError ? e.message : 'Tautan tidak dapat dibuka');
        setState('gone');
      }
    },
    [slug],
  );

  useEffect(() => {
    void fetchShare();
  }, [fetchShare]);

  if (state === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-5">
        <p className="font-mono text-sm text-ink-2">Memuat spesifikasi...</p>
      </main>
    );
  }

  if (needPassword) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
        <form
          className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-panel space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void fetchShare(password);
          }}
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-subtle text-ink-2">
              <Lock className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-ink">Halaman ini terkunci</h1>
              <p className="text-xs text-ink-2">Masukkan kata sandi dari pemilik proyek.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="share-pw" className="block text-sm font-medium text-ink">
              Kata sandi
            </label>
            <input
              id="share-pw"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full min-h-11 rounded-lg border border-line-strong bg-canvas px-3.5 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-danger/35 bg-danger-soft px-3 py-2 text-xs text-danger-ink"
            >
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" className="w-full">
            Buka dokumen
          </Button>
        </form>
      </main>
    );
  }

  if (state === 'gone' || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-panel space-y-3 text-center">
          <h1 className="text-xl font-semibold text-ink">Tautan tidak tersedia</h1>
          <p className="text-sm text-ink-2">
            {error ?? 'Tautan bagikan ini sudah kedaluwarsa atau dicabut oleh pemiliknya.'}
          </p>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex min-h-10 items-center rounded-lg border border-line-strong bg-canvas px-4 text-sm font-medium text-ink hover:bg-subtle"
            >
              Ke halaman utama
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const headerBar = (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/95 backdrop-blur-xs">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-xs font-semibold text-white"
          >
            R
          </span>
          <span className="text-sm font-semibold text-ink">Rencang-Rancang</span>
          <Badge tone="neutral">Baca saja</Badge>
        </div>
        <PublicThemeToggle />
      </div>
    </header>
  );

  if (data.scope === 'document') {
    return (
      <div className="min-h-screen bg-canvas text-ink">
        {headerBar}
        <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
          <article className="rounded-2xl border border-line bg-surface p-6 shadow-panel sm:p-10">
            <p className="font-mono text-xs text-ink-3">
              {DOC_LABEL[data.document.type] ?? data.document.type}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
              {data.document.title}
            </h1>
            <div className="mt-6">
              <MarkdownRenderer content={data.content} />
            </div>
          </article>
        </main>
      </div>
    );
  }

  const contentOf = (docId: string): string =>
    data.versions.find((v) => v.documentId === docId)?.contentMd ?? '';

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {headerBar}
      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 space-y-6">
        <section className="rounded-2xl border border-line bg-surface p-6 shadow-panel">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="ready" dot>
              {data.documents.length} dokumen
            </Badge>
            <span className="font-mono text-xs text-ink-3">
              Diperbarui{' '}
              {new Date(data.project.updatedAt).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
            {data.project.name}
          </h1>
          {data.project.description && (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-2">
              {data.project.description}
            </p>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-[240px_1fr] lg:items-start">
          <nav
            aria-label="Daftar dokumen"
            className="rounded-xl border border-line bg-sidebar p-2 lg:sticky lg:top-20"
          >
            <ul className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
              {data.documents.map((d) => {
                const isOn = active === d.id;
                return (
                  <li key={d.id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setActive(d.id)}
                      aria-current={isOn ? 'true' : undefined}
                      className={cn(
                        'flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        isOn
                          ? 'bg-surface font-medium text-ink shadow-xs ring-1 ring-line'
                          : 'text-ink-2 hover:bg-hover hover:text-ink',
                      )}
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                      <span className="truncate">{DOC_LABEL[d.type] ?? d.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {active && (
            <article className="min-w-0 rounded-2xl border border-line bg-surface p-6 shadow-panel sm:p-8">
              <h2 className="text-xl font-semibold tracking-tight text-ink">
                {data.documents.find((d) => d.id === active)?.title}
              </h2>
              <div className="mt-5">
                <MarkdownRenderer content={contentOf(active)} />
              </div>
            </article>
          )}
        </div>
      </main>
    </div>
  );
}
