'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Search, Sun, Moon, ChevronRight } from 'lucide-react';
import { Rail } from '@/components/Rail';
import { AppShellProvider, useAppShell } from '@/components/AppShellContext';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { CommandPalette, useToast, useTheme, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui';
import { api } from '@/lib/client/api';
import {
  getByokSession,
  getManagedSelection,
  getModelSourceMode,
  saveByokSession,
  saveManagedSelection,
  type ByokSessionConfig,
  type ModelSourceMode,
} from '@/lib/client/byokSession';

interface ManagedPublic {
  enabled: boolean;
  source: 'owner' | 'env' | 'none';
  label: string;
  defaultModelId: string | null;
  models: string[];
}

export interface ShellUser {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'member';
}

function ShellInner({ children, initialUser }: { children: React.ReactNode; initialUser?: ShellUser }) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { t } = useLocale();
  const { projectBreadcrumb, modelRefreshTick, refreshActiveModel } = useAppShell();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const projectId = pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const isProjectRoute = Boolean(projectId);

  const [managed, setManaged] = React.useState<ManagedPublic | null>(null);
  const [byok, setByok] = React.useState<ByokSessionConfig | null>(null);
  const [sourceMode, setSourceMode] = React.useState<ModelSourceMode>('managed');
  const [selectedManagedModel, setSelectedManagedModel] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    let alive = true;
    setLoaded(false);
    const sessionByok = getByokSession();
    const activeMode = getModelSourceMode();
    const managedSel = getManagedSelection();
    setByok(sessionByok);
    setSourceMode(activeMode);

    api
      .get<{ managed: ManagedPublic }>('/settings/managed')
      .then((mgd) => {
        if (!alive) return;
        setManaged(mgd.managed);
        const managedList = mgd.managed?.models ?? [];
        const preferredManaged =
          managedSel?.modelId && (managedList.length === 0 || managedList.includes(managedSel.modelId))
            ? managedSel.modelId
            : mgd.managed?.defaultModelId || managedList[0] || '';
        setSelectedManagedModel(preferredManaged);
        setLoaded(true);
      })
      .catch(() => {
        if (alive) {
          setManaged(null);
          setSelectedManagedModel('');
          setLoaded(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [projectId, modelRefreshTick]);

  async function chooseModel(raw: string) {
    if (!raw) return;
    setBusy(true);
    try {
      const parsed = JSON.parse(raw) as ['byok' | 'managed', string, string];
      const [kind, , modelId] = parsed;

      if (kind === 'byok') {
        const current = getByokSession();
        if (!current) return;
        const updated: ByokSessionConfig = { ...current, modelId };
        saveByokSession(updated);
        setByok(updated);
        setSourceMode('byok');
        refreshActiveModel();
        toast({ tone: 'success', title: t(`Model sesi BYOK: ${modelId}`, `Session BYOK model: ${modelId}`) });
        return;
      }

      const prevSel = getManagedSelection();
      saveManagedSelection({ modelId, reasoningEffort: prevSel?.reasoningEffort ?? null });
      setSourceMode('managed');
      setSelectedManagedModel(modelId);
      refreshActiveModel();
      toast({ tone: 'success', title: t(`Model bawaan aktif: ${modelId}`, `Managed model active: ${modelId}`) });
    } catch {
      toast({ tone: 'error', title: t('Gagal mengganti model. Coba lagi.', 'Failed to switch model. Try again.') });
    } finally {
      setBusy(false);
    }
  }

  const byokModels = React.useMemo(() => {
    if (!byok) return [];
    return Array.from(new Set([byok.modelId, ...(byok.models ?? [])].filter(Boolean))).sort();
  }, [byok]);

  const managedModels = React.useMemo(() => {
    if (!managed?.enabled) return [];
    return Array.from(new Set(managed.models.filter(Boolean)));
  }, [managed]);

  const currentValue = React.useMemo(() => {
    if (sourceMode === 'byok' && byok?.modelId) {
      return JSON.stringify(['byok', 'session', byok.modelId]);
    }
    if (selectedManagedModel && managed?.enabled && managedModels.includes(selectedManagedModel)) {
      return JSON.stringify(['managed', 'server', selectedManagedModel]);
    }
    if (managed?.enabled && managedModels[0]) {
      return JSON.stringify(['managed', 'server', managedModels[0]]);
    }
    return '';
  }, [sourceMode, byok, managed, managedModels, selectedManagedModel]);

  const hasAnyModel = Boolean(byok?.modelId || (managed?.enabled && managedModels.length > 0));

  const routeLabels: Record<string, string> = {
    '/studio': 'Studio',
    '/library': 'Library',
    '/models': 'Models',
    '/profile': t('Profil', 'Profile'),
    '/docs': t('Dokumentasi', 'Documentation'),
  };
  const sectionLabel = isProjectRoute
    ? 'Studio'
    : routeLabels[pathname] ?? routeLabels[`/${pathname.split('/')[1] ?? ''}`] ?? 'Studio';

  return (
    <div className="flex min-h-screen w-full bg-canvas text-ink">
      <Rail
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        user={initialUser}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-13 shrink-0 items-center justify-between gap-2 border-b border-line bg-canvas/95 px-4 backdrop-blur-xs sm:gap-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label={t('Buka menu navigasi', 'Open navigation menu')}
              className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-sm font-medium text-ink md:hidden hover:bg-subtle"
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
                    {projectBreadcrumb ?? t('Proyek', 'Project')}
                  </span>
                </>
              ) : (
                <span className="truncate font-medium text-ink">{sectionLabel}</span>
              )}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {loaded && !hasAnyModel ? (
              <Link
                href="/models"
                className="inline-flex min-h-9 items-center rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink hover:border-line-strong hover:bg-subtle"
              >
                {t('Atur model', 'Set model')}
              </Link>
            ) : (
              <div className="flex items-center gap-1.5">
                {sourceMode === 'byok' && byok && (
                  <span
                    title={t('Menggunakan API key sesi browser', 'Using browser session API key')}
                    className="hidden sm:inline-flex items-center rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-accent-ink"
                  >
                    BYOK
                  </span>
                )}
                <select
                  aria-label={t('Model untuk generasi berikutnya', 'Model for next generation')}
                  value={currentValue}
                  disabled={!loaded || busy}
                  onChange={(e) => void chooseModel(e.target.value)}
                  className="min-h-11 max-w-[34vw] cursor-pointer rounded-lg border border-line bg-surface px-2.5 font-mono text-xs text-ink transition-colors hover:border-line-strong focus:border-accent sm:min-h-9 sm:max-w-60"
                >
                  <option value="" disabled>
                    {loaded ? t('Pilih model', 'Select model') : t('Memuat...', 'Loading...')}
                  </option>

                  {byok && byokModels.length > 0 && (
                    <optgroup label={t('BYOK sesi', 'Session BYOK')}>
                      {byokModels.map((model) => (
                        <option key={`byok-${model}`} value={JSON.stringify(['byok', 'session', model])}>
                          {model}
                        </option>
                      ))}
                    </optgroup>
                  )}

                  {managed?.enabled && managedModels.length > 0 && (
                    <optgroup label={t('Bawaan Rancang.ai', 'Managed Rancang.ai')}>
                      {managedModels.map((model) => (
                        <option key={`mgd-${model}`} value={JSON.stringify(['managed', 'server', model])}>
                          {model}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label={t('Buka palet perintah (Ctrl+K)', 'Open command palette (Ctrl+K)')}
              className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-xs text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            >
              <Search className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
              <span className="hidden md:inline">{t('Cari', 'Search')}</span>
              <kbd className="hidden lg:inline-flex items-center rounded border border-line bg-subtle px-1.5 py-0.5 font-mono text-[10.5px] text-ink-3">
                ⌘K
              </kbd>
            </button>

            <LanguageToggle />

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label={
                    theme === 'dark'
                      ? t('Beralih ke mode terang', 'Switch to light mode')
                      : t('Beralih ke mode gelap', 'Switch to dark mode')
                  }
                  className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-line bg-surface text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
                >
                  {theme === 'dark' ? (
                    <Sun className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Moon className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {theme === 'dark'
                  ? t('Mode terang', 'Light mode')
                  : t('Mode gelap tenang', 'Deep Slate dark mode')}
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

export function AppShell({
  children,
  initialUser,
}: {
  children: React.ReactNode;
  initialUser?: ShellUser;
}) {
  return (
    <AppShellProvider>
      <ShellInner initialUser={initialUser}>{children}</ShellInner>
    </AppShellProvider>
  );
}
