'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Search, Sun, Moon, ChevronRight } from 'lucide-react';
import { Rail } from '@/components/Rail';
import { AppShellProvider, useAppShell } from '@/components/AppShellContext';
import { CommandPalette, useToast, useTheme, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui';
import { api } from '@/lib/client/api';
import {
  getByokSession,
  getManagedSelection,
  getModelSourceMode,
  saveByokSession,
  saveManagedSelection,
  setModelSourceMode,
  type ByokSessionConfig,
  type ModelSourceMode,
} from '@/lib/client/byokSession';

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

interface ManagedPublic {
  enabled: boolean;
  source: 'owner' | 'env' | 'none';
  label: string;
  defaultModelId: string | null;
  models: string[];
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
  const { projectBreadcrumb, modelRefreshTick, refreshActiveModel } = useAppShell();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const projectId = pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const isProjectRoute = Boolean(projectId);

  const [managed, setManaged] = React.useState<ManagedPublic | null>(null);
  const [isOwner, setIsOwner] = React.useState(false);
  const [presets, setPresets] = React.useState<PresetLite[]>([]);
  const [connections, setConnections] = React.useState<Connection[]>([]);
  const [byok, setByok] = React.useState<ByokSessionConfig | null>(null);
  const [sourceMode, setSourceMode] = React.useState<ModelSourceMode>('managed');
  const [selectedPresetId, setSelectedPresetId] = React.useState('');
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

    Promise.all([
      api
        .get<{ managed: ManagedPublic; isOwner?: boolean }>('/settings/managed')
        .catch(() => ({ managed: null, isOwner: false })),
      api.get<{ presets: PresetLite[] }>('/settings/presets').catch(() => ({ presets: [] })),
      projectId
        ? api.get<{ project: { defaultPresetId: string | null } }>(`/projects/${projectId}`).catch(() => null)
        : Promise.resolve(null),
      api.get<{ credentials: Connection[] }>('/settings/credentials').catch(() => ({ credentials: [] })),
    ])
      .then(([mgd, result, detail, keys]) => {
        if (!alive) return;
        const ownerFlag = Boolean(mgd.isOwner);
        const validConns = ownerFlag
          ? keys.credentials.filter((k) => k.isActive && k.isValid !== false)
          : [];
        const connectedPresets = ownerFlag
          ? result.presets.filter((p) => validConns.some((k) => k.id === p.credentialId))
          : [];
        setIsOwner(ownerFlag);
        setManaged(mgd.managed);
        setPresets(connectedPresets);
        setConnections(validConns);
        const presetId =
          detail?.project.defaultPresetId ?? connectedPresets.find((p) => p.isDefault)?.id ?? '';
        setSelectedPresetId(presetId);
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
          setIsOwner(false);
          setManaged(null);
          setConnections([]);
          setPresets([]);
          setSelectedPresetId('');
          setLoaded(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [projectId, modelRefreshTick]);

  const pendingLists = React.useRef(new Set<string>());
  async function loadMissingModels() {
    for (const connection of connections) {
      if (connection.cachedModels?.length || pendingLists.current.has(connection.id)) continue;
      pendingLists.current.add(connection.id);
      try {
        const result = await api.post<{ models: string[] }>('/providers/test', {
          credentialId: connection.id,
          provider: connection.provider,
        });
        setConnections((current) =>
          current.map((c) => (c.id === connection.id ? { ...c, cachedModels: result.models } : c)),
        );
      } catch {
        toast({ tone: 'error', title: `Gagal memuat model dari ${connection.label}` });
      } finally {
        pendingLists.current.delete(connection.id);
      }
    }
  }

  async function chooseModel(raw: string) {
    if (!raw) return;
    setBusy(true);
    try {
      const parsed = JSON.parse(raw) as ['byok' | 'managed' | 'account', string, string];
      const [kind, groupId, modelId] = parsed;

      if (kind === 'byok') {
        const current = getByokSession();
        if (!current) return;
        const updated: ByokSessionConfig = { ...current, modelId };
        saveByokSession(updated);
        setByok(updated);
        setSourceMode('byok');
        refreshActiveModel();
        toast({ tone: 'success', title: `Model sesi BYOK: ${modelId}` });
        return;
      }

      if (kind === 'managed') {
        const prevSel = getManagedSelection();
        saveManagedSelection({ modelId, reasoningEffort: prevSel?.reasoningEffort ?? null });
        setSourceMode('managed');
        setSelectedManagedModel(modelId);
        refreshActiveModel();
        toast({ tone: 'success', title: `Model bawaan aktif: ${modelId}` });
        return;
      }

      // Existing account connection fallback
      const connection = connections.find((c) => c.id === groupId);
      if (!connection) return;
      setModelSourceMode('managed');
      const saved = presets.find((p) => p.credentialId === groupId && p.modelId === modelId);
      const preset =
        saved ??
        (
          await api.post<{ preset: PresetLite }>('/settings/presets', {
            provider: connection.provider,
            credentialId: groupId,
            modelId,
            name: modelId.slice(0, 80),
          })
        ).preset;
      const id = preset.id;
      if (projectId) await api.patch(`/projects/${projectId}`, { defaultPresetId: id });
      else await api.patch(`/settings/presets?id=${encodeURIComponent(id)}`, { isDefault: true });
      saveManagedSelection({ modelId, reasoningEffort: preset.reasoningEffort ?? null });
      setSourceMode('managed');
      setSelectedPresetId(id);
      setSelectedManagedModel(modelId);
      refreshActiveModel();
      toast({ tone: 'success', title: 'Model untuk generasi berikutnya diperbarui' });
    } catch {
      toast({ tone: 'error', title: 'Gagal mengganti model. Coba lagi.' });
    } finally {
      setBusy(false);
    }
  }

  const byokModels = React.useMemo(() => {
    if (!byok) return [];
    return Array.from(new Set([byok.modelId, ...(byok.models ?? [])].filter(Boolean))).sort();
  }, [byok]);

  const activePreset = presets.find((p) => p.id === selectedPresetId);
  const showOwnerConnections = isOwner && connections.length > 0;
  const currentValue = React.useMemo(() => {
    if (sourceMode === 'byok' && byok?.modelId) {
      return JSON.stringify(['byok', 'session', byok.modelId]);
    }
    if (showOwnerConnections && activePreset?.credentialId && activePreset.modelId) {
      return JSON.stringify(['account', activePreset.credentialId, activePreset.modelId]);
    }
    if (selectedManagedModel && managed?.enabled) {
      return JSON.stringify(['managed', 'server', selectedManagedModel]);
    }
    return '';
  }, [sourceMode, byok, showOwnerConnections, managed, selectedManagedModel, activePreset]);

  const hasAnyModel = Boolean(byok?.modelId || managed?.enabled || connections.length > 0);
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
            {loaded && !hasAnyModel ? (
              <Link
                href="/models"
                className="inline-flex min-h-9 items-center rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink hover:border-line-strong hover:bg-subtle"
              >
                Atur model
              </Link>
            ) : (
              <div className="flex items-center gap-1.5">
                {sourceMode === 'byok' && byok && (
                  <span
                    title="Menggunakan API key sesi browser"
                    className="hidden sm:inline-flex items-center rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-accent-ink"
                  >
                    BYOK
                  </span>
                )}
                <select
                  aria-label="Model untuk generasi berikutnya"
                  value={currentValue}
                  disabled={!loaded || busy}
                  onFocus={() => void loadMissingModels()}
                  onChange={(e) => void chooseModel(e.target.value)}
                  className="min-h-11 max-w-[36vw] cursor-pointer rounded-lg border border-line bg-surface px-2.5 font-mono text-xs text-ink transition-colors hover:border-line-strong focus:border-accent sm:min-h-9 sm:max-w-64"
                >
                  <option value="" disabled>
                    {loaded ? 'Pilih model' : 'Memuat...'}
                  </option>

                  {byok && byokModels.length > 0 && (
                    <optgroup label={`BYOK sesi (${byok.label})`}>
                      {byokModels.map((model) => (
                        <option key={`byok-${model}`} value={JSON.stringify(['byok', 'session', model])}>
                          {model}
                        </option>
                      ))}
                    </optgroup>
                  )}

                  {!showOwnerConnections && managed?.enabled && managed.models.length > 0 && (
                    <optgroup label={`Bawaan ${managed.label}`}>
                      {managed.models.map((model) => (
                        <option key={`mgd-${model}`} value={JSON.stringify(['managed', 'server', model])}>
                          {model}
                        </option>
                      ))}
                    </optgroup>
                  )}

                  {showOwnerConnections &&
                    connections.map((c) => {
                      const list = Array.from(
                        new Set([
                          ...(c.cachedModels ?? []),
                          ...presets.filter((p) => p.credentialId === c.id).map((p) => p.modelId),
                        ]),
                      ).sort();
                      if (list.length === 0) return null;
                      return (
                        <optgroup key={c.id} label={`Bawaan (${c.label || c.provider})`}>
                          {list.map((model) => (
                            <option key={`${c.id}-${model}`} value={JSON.stringify(['account', c.id, model])}>
                              {model}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                </select>
              </div>
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
