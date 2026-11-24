'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Search, Sun, Moon, ChevronRight, Cpu } from 'lucide-react';
import { Rail } from '@/components/Rail';
import { AppShellProvider, useAppShell } from '@/components/AppShellContext';
import { CommandPalette, useTheme, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui';
import { api } from '@/lib/client/api';

interface PresetLite {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  isDefault: boolean;
}

const ROUTE_LABELS: Record<string, string> = {
  '/studio': 'Studio',
  '/library': 'Library',
  '/models': 'Models',
  '/docs': 'Dokumentasi',
};

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { projectBreadcrumb, modelRefreshTick } = useAppShell();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [activeModel, setActiveModel] = React.useState<PresetLite | null>(null);
  const [modelLoaded, setModelLoaded] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    api
      .get<{ presets: PresetLite[] }>('/settings/presets')
      .then((res) => {
        if (!alive) return;
        const list = res.presets ?? [];
        const def = list.find((p) => p.isDefault) ?? list[0] ?? null;
        setActiveModel(def);
        setModelLoaded(true);
      })
      .catch(() => {
        if (alive) setModelLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [modelRefreshTick]);

  const isProjectRoute = pathname.startsWith('/projects/');
  const sectionLabel = isProjectRoute
    ? 'Studio'
    : ROUTE_LABELS[pathname] ?? ROUTE_LABELS[`/${pathname.split('/')[1] ?? ''}`] ?? 'Studio';

  return (
    <div className="flex min-h-screen w-full bg-canvas text-ink">
      <Rail mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-13 shrink-0 items-center justify-between gap-3 border-b border-line bg-canvas/95 px-4 backdrop-blur-xs sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Buka menu navigasi"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-sm font-medium text-ink md:hidden hover:bg-subtle"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
              <span>Menu</span>
            </button>

            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
              {isProjectRoute ? (
                <>
                  <Link
                    href="/studio"
                    className="shrink-0 text-ink-2 transition-colors hover:text-ink"
                  >
                    Studio
                  </Link>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                  <span className="truncate font-medium text-ink">
                    {projectBreadcrumb ?? 'Proyek'}
                  </span>
                </>
              ) : (
                <span className="truncate font-medium text-ink">{sectionLabel}</span>
              )}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/models"
                  className="hidden sm:inline-flex min-h-9 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-xs text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
                >
                  <span
                    aria-hidden="true"
                    className={
                      activeModel
                        ? 'h-2 w-2 rounded-full bg-ready'
                        : 'h-2 w-2 rounded-full bg-ink-3'
                    }
                  />
                  <Cpu className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                  <span className="max-w-[160px] truncate font-mono text-[11.5px]">
                    {!modelLoaded
                      ? 'memuat...'
                      : activeModel
                        ? activeModel.modelId
                        : 'Belum ada model'}
                  </span>
                </Link>
              </TooltipTrigger>
              <TooltipContent>
                {activeModel
                  ? `Model aktif: ${activeModel.provider} / ${activeModel.modelId}`
                  : 'Atur penyedia dan model AI di halaman Models'}
              </TooltipContent>
            </Tooltip>

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Buka palet perintah (Ctrl+K)"
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-xs text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            >
              <Search className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
              <span className="hidden sm:inline">Cari</span>
              <kbd className="hidden md:inline-flex items-center rounded border border-line bg-subtle px-1.5 py-0.5 font-mono text-[10.5px] text-ink-3">
                ⌘K
              </kbd>
            </button>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label={theme === 'dark' ? 'Beralih ke mode terang' : 'Beralih ke mode gelap'}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
                >
                  {theme === 'dark' ? (
                    <Sun className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Moon className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {theme === 'dark' ? 'Mode terang' : 'Mode gelap tenang'}
              </TooltipContent>
            </Tooltip>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShellProvider>
      <ShellInner>{children}</ShellInner>
    </AppShellProvider>
  );
}
