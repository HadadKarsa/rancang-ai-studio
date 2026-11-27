'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  FolderKanban,
  BookMarked,
  SlidersHorizontal,
  BookOpen,
  Search,
  Moon,
  Sun,
  Plus,
  FileText,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import { useTheme } from './theme-provider';
import { api } from '@/lib/client/api';
import { cn } from '@/lib/cn';

interface ProjectLite {
  id: string;
  name: string;
  status: string;
  docsReady?: number;
  docsTotal?: number;
}

interface CommandItem {
  id: string;
  group: 'Navigasi' | 'Proyek' | 'Tampilan';
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [query, setQuery] = React.useState('');
  const [projects, setProjects] = React.useState<ProjectLite[]>([]);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedIndex(0);
      return;
    }
    let alive = true;
    api
      .get<{ projects: ProjectLite[] }>('/projects?limit=12&sort=updated_at&order=desc')
      .then((res) => {
        if (alive) setProjects(res.projects ?? []);
      })
      .catch(() => {
        /* ignore if not signed in or offline */
      });
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open]);

  const go = React.useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router],
  );

  const items = React.useMemo<CommandItem[]>(() => {
    const base: CommandItem[] = [
      {
        id: 'nav-new',
        group: 'Navigasi',
        label: 'Mulai proyek baru di Studio',
        hint: 'Quick-Start Composer',
        icon: <Plus className="h-4 w-4 text-accent-ink" aria-hidden="true" />,
        run: () => go('/studio?compose=1'),
      },
      {
        id: 'nav-studio',
        group: 'Navigasi',
        label: 'Buka Studio',
        hint: 'Daftar proyek dan template',
        icon: <FolderKanban className="h-4 w-4" aria-hidden="true" />,
        run: () => go('/studio'),
      },
      {
        id: 'nav-library',
        group: 'Navigasi',
        label: 'Buka Library',
        hint: 'Artefak dan ekspor tersimpan',
        icon: <BookMarked className="h-4 w-4" aria-hidden="true" />,
        run: () => go('/library'),
      },
      {
        id: 'nav-models',
        group: 'Navigasi',
        label: 'Atur Models dan kredensial',
        hint: 'Penyedia AI dan preset default',
        icon: <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />,
        run: () => go('/models'),
      },
      {
        id: 'nav-docs',
        group: 'Navigasi',
        label: 'Baca Dokumentasi',
        hint: 'Panduan penggunaan Rencang-Rancang',
        icon: <BookOpen className="h-4 w-4" aria-hidden="true" />,
        run: () => go('/docs'),
      },
      {
        id: 'toggle-theme',
        group: 'Tampilan',
        label: theme === 'dark' ? 'Beralih ke mode terang' : 'Beralih ke mode gelap tenang',
        hint: theme === 'dark' ? 'Warm white canvas' : 'Calm dark studio',
        icon:
          theme === 'dark' ? (
            <Sun className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Moon className="h-4 w-4" aria-hidden="true" />
          ),
        run: () => {
          toggleTheme();
          onOpenChange(false);
        },
      },
    ];

    const projectItems: CommandItem[] = projects.map((p) => ({
      id: `proj-${p.id}`,
      group: 'Proyek',
      label: p.name,
      hint: p.docsTotal ? `${p.docsReady ?? 0}/${p.docsTotal} dokumen` : p.status,
      icon: <FileText className="h-4 w-4" aria-hidden="true" />,
      run: () => go(`/projects/${p.id}`),
    }));

    const all = [...projectItems, ...base];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.hint && item.hint.toLowerCase().includes(q)) ||
        item.group.toLowerCase().includes(q),
    );
  }, [projects, query, theme, toggleTheme, go, onOpenChange]);

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === 'Enter' && items[selectedIndex]) {
      e.preventDefault();
      items[selectedIndex].run();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="max-w-xl p-0 overflow-hidden top-[22%] translate-y-0"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">Palet perintah</DialogTitle>
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari proyek, buka halaman, atau ganti tema..."
            aria-label="Cari perintah atau proyek"
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center rounded border border-line bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-ink-2">
            Esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2" role="listbox" aria-label="Hasil perintah">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-ink-2">
              Tidak ada perintah atau proyek yang cocok dengan &ldquo;{query}&rdquo;.
            </p>
          ) : (
            items.map((item, idx) => {
              const prevGroup = idx > 0 ? items[idx - 1]?.group : null;
              const showGroup = item.group !== prevGroup;
              const active = idx === selectedIndex;
              return (
                <React.Fragment key={item.id}>
                  {showGroup && (
                    <div className="px-2.5 pb-1 pt-2 text-xs font-medium text-ink-3 first:pt-1">
                      {item.group}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={item.run}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                      active ? 'bg-subtle text-ink' : 'text-ink-2 hover:bg-subtle hover:text-ink',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="shrink-0 text-ink-3">{item.icon}</span>
                      <span className="truncate font-medium text-ink">{item.label}</span>
                    </span>
                    {item.hint && (
                      <span className="shrink-0 font-mono text-xs text-ink-3">{item.hint}</span>
                    )}
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
