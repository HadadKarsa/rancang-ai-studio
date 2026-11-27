'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Search, Sun, Moon, ChevronRight } from 'lucide-react';
import { Rail } from '@/components/Rail';
import { AppShellProvider, useAppShell } from '@/components/AppShellContext';
import { CommandPalette, useToast, useTheme, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui';
import { api } from '@/lib/client/api';

interface PresetLite {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  credentialId: string | null;
  reasoningEffort: 'none' | 'low' | 'medium' | 'high' | null;
  isDefault: boolean;
}

interface Connection {
  id: string;
  provider: string;
  label: string;
  isActive: boolean;
  isValid: boolean | null;
  cachedModels: string[];
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
  const projectId = pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const isProjectRoute = Boolean(projectId);
  const [presets, setPresets] = React.useState<PresetLite[]>([]);
  const [connections, setConnections] = React.useState<Connection[]>([]);
  const [selected, setSelected] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const { refreshActiveModel } = useAppShell();
  const { toast } = useToast();

  React.useEffect(() => {
    let alive = true;
    setLoaded(false);
    Promise.all([
      api.get<{ presets: PresetLite[] }>('/settings/presets'),
      projectId ? api.get<{ project: { defaultPresetId: string | null } }>(`/projects/${projectId}`) : null,
      api.get<{ credentials: Connection[] }>('/settings/credentials'),
    ]).then(([result, detail, keys]) => {
      if (!alive) return;
      const connected = result.presets.filter(p => keys.credentials.some(k => k.id === p.credentialId && k.isActive && k.isValid !== false));
      setPresets(connected);
      setConnections(keys.credentials.filter(k => k.isActive && k.isValid !== false));
      setSelected(detail?.project.defaultPresetId ?? result.presets.find(p => p.isDefault)?.id ?? '');
      setLoaded(true);
    }).catch(() => {
      if (alive) { setConnections([]); setPresets([]); setSelected(''); setLoaded(true); }
    });
    return () => { alive = false; };
  }, [projectId, modelRefreshTick]);

  const pendingLists = React.useRef(new Set<string>());
  async function loadMissingModels() {
    for (const connection of connections) {
      if (connection.cachedModels?.length || pendingLists.current.has(connection.id)) continue;
      pendingLists.current.add(connection.id);
      try {
        const result = await api.post<{ models: string[] }>('/providers/test', {
          credentialId: connection.id, provider: connection.provider,
        });
        setConnections(current => current.map(c => c.id === connection.id ? { ...c, cachedModels: result.models } : c));
      } catch {
        toast({ tone: 'error', title: `Gagal memuat model dari ${connection.label}` });
      } finally {
        pendingLists.current.delete(connection.id);
      }
    }
  }

  async function chooseModel(value: string) {
    setBusy(true);
    try {
      const [credentialId, modelId] = JSON.parse(value) as [string, string];
      const connection = connections.find(c => c.id === credentialId);
      if (!connection) return;
      const saved = presets.find(p => p.credentialId === credentialId && p.modelId === modelId);
      const preset = saved ?? (await api.post<{ preset: PresetLite }>('/settings/presets', {
        provider: connection.provider, credentialId, modelId, name: modelId.slice(0, 80),
      })).preset;
      const id = preset.id;
      if (projectId) await api.patch(`/projects/${projectId}`, { defaultPresetId: id });
      else await api.patch(`/settings/presets?id=${encodeURIComponent(id)}`, { isDefault: true });
      setSelected(id);
      refreshActiveModel();
      toast({ tone: 'success', title: 'Model untuk generasi berikutnya diperbarui' });
    } catch {
      toast({ tone: 'error', title: 'Gagal mengganti model. Coba lagi.' });
    } finally {
      setBusy(false);
    }
  }

  const active = presets.find(p => p.id === selected);
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
            {loaded && !connections.length ? (
              <Link href="/models" className="rounded-lg border border-line px-2 py-2 text-xs">Hubungkan model</Link>
            ) : (
              <select
                aria-label="Model untuk generasi berikutnya"
                value={active ? JSON.stringify([active.credentialId, active.modelId]) : ''}
                disabled={!loaded || busy}
                onFocus={() => void loadMissingModels()}
                onChange={e => void chooseModel(e.target.value)}
                className="min-h-11 max-w-[30vw] cursor-pointer rounded-lg border border-line-strong bg-surface px-2 font-mono text-xs text-ink sm:min-h-9 sm:max-w-64"
              >
                <option value="" disabled>{loaded ? 'Pilih model' : 'Memuat…'}</option>
                {connections.map(c => (
                  <optgroup key={c.id} label={c.label || c.provider}>
                    {Array.from(new Set([...(c.cachedModels ?? []), ...presets.filter(p => p.credentialId === c.id).map(p => p.modelId)])).sort().map(model => (
                      <option key={model} value={JSON.stringify([c.id, model])}>{model}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}

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
