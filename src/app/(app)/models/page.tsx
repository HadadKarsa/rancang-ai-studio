'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Filter,
  KeyRound,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import {
  clearByokSession,
  getByokSession,
  getManagedSelection,
  getModelSourceMode,
  saveByokSession,
  saveManagedSelection,
  setModelSourceMode,
  type ByokSessionConfig,
  type ModelSourceMode,
} from '@/lib/client/byokSession';
import { Badge, Button, Popover, PopoverContent, PopoverTrigger, useToast } from '@/components/ui';
import { useAppShell } from '@/components/AppShellContext';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { cn } from '@/lib/cn';

type ProviderId = 'openai' | 'anthropic' | 'google' | 'groq' | 'openrouter' | 'ollama' | 'custom';
type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

interface ManagedPublic {
  enabled: boolean;
  source: 'owner' | 'env' | 'none';
  label: string;
  defaultModelId: string | null;
  models: string[];
}

interface Credential {
  id: string;
  provider: ProviderId;
  label: string;
  keyLast4: string;
  baseUrl: string | null;
  isActive: boolean;
  isValid: boolean | null;
  cachedModels: string[];
  allowedModels: string[] | null;
  createdAt: string;
}

interface Preset {
  id: string;
  name: string;
  provider: ProviderId;
  credentialId: string | null;
  modelId: string;
  baseUrl: string | null;
  reasoningEffort: ReasoningEffort | null;
  isDefault: boolean;
}

interface TestResult {
  ok: boolean;
  reason?: string;
  models?: string[];
}

const URL_SHORTCUTS: { label: string; url: string }[] = [
  { label: 'OpenAI', url: 'https://api.openai.com/v1' },
  { label: 'Kenari', url: 'https://api.kenari.id/v1' },
  { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
  { label: 'Ollama lokal', url: 'http://localhost:11434/v1' },
];

const EFFORT_OPTIONS: { value: ReasoningEffort | null; label: string; short: string; hint: string }[] = [
  { value: null, label: 'Default', short: 'def', hint: 'Ikut penyedia' },
  { value: 'none', label: 'Off', short: 'off', hint: 'Tanpa penalaran' },
  { value: 'low', label: 'Low', short: 'low', hint: 'Cepat, dangkal' },
  { value: 'medium', label: 'Medium', short: 'med', hint: 'Seimbang' },
  { value: 'high', label: 'High', short: 'high', hint: 'Lambat, teliti' },
];

function maskLast4(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 4) return '••••';
  return `····${trimmed.slice(-4)}`;
}

function ModelPicker({
  value,
  options,
  onSelect,
  label,
  disabled,
  allowManual = true,
  fullWidth = false,
}: {
  value: string;
  options: string[];
  onSelect: (modelId: string) => void;
  label: string;
  disabled?: boolean;
  allowManual?: boolean;
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [manual, setManual] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(value);
      setQuery('');
      setManual(allowManual && options.length === 0);
    }
  }, [open, value, options.length, allowManual]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((m) => m.toLowerCase().includes(q));
  }, [options, query]);

  function commitManual() {
    const next = draft.trim();
    if (!next) return;
    onSelect(next);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`${label}: ${value || 'Pilih model'}`}
          className={cn(
            'inline-flex min-h-10 max-w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-line bg-canvas/70 px-3 py-1.5',
            'font-mono text-xs text-ink transition-colors hover:border-line-strong hover:bg-subtle/60',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            'disabled:cursor-not-allowed disabled:opacity-50',
            fullWidth && 'w-full',
          )}
        >
          <span className="truncate">{value || 'Pilih model'}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2.5rem))] p-0">
        {options.length > 0 && (
          <div className="border-b border-line p-2.5">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3"
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Saring ${options.length} model`}
                aria-label={`Saring model untuk ${label}`}
                className="min-h-9 w-full rounded-lg border border-line bg-canvas pl-8 pr-2.5 text-xs text-ink placeholder:text-ink-3 focus:border-accent"
              />
            </div>
          </div>
        )}

        {!manual && (
          <ul className="max-h-60 overflow-y-auto p-1.5" role="listbox" aria-label={`Daftar model ${label}`}>
            {filtered.length === 0 ? (
              <li className="px-2.5 py-3 text-center text-xs text-ink-3">
                {options.length === 0 ? 'Belum ada daftar model.' : `Tidak ada model yang cocok dengan "${query}".`}
              </li>
            ) : (
              filtered.map((m) => {
                const selected = m === value;
                return (
                  <li key={m}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onSelect(m);
                        setOpen(false);
                      }}
                      className={cn(
                        'flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left font-mono text-xs transition-colors',
                        selected ? 'bg-accent-soft text-accent-ink' : 'text-ink hover:bg-subtle',
                      )}
                    >
                      <Check
                        className={cn('h-3.5 w-3.5 shrink-0', selected ? 'opacity-100' : 'opacity-0')}
                        aria-hidden="true"
                      />
                      <span className="truncate">{m}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        )}

        {allowManual && (
          <div className="space-y-2 border-t border-line p-2.5">
            {manual ? (
              <div className="space-y-1.5">
                <label htmlFor={`manual-${label}`} className="block text-[11px] font-medium text-ink-2">
                  ID model manual
                </label>
                <div className="flex gap-1.5">
                  <input
                    id={`manual-${label}`}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitManual();
                      }
                    }}
                    placeholder="gpt-4o-mini atau deepseek-chat"
                    className="min-h-9 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-2.5 py-1.5 font-mono text-xs text-ink placeholder:text-ink-3 focus:border-accent"
                  />
                  <Button size="sm" variant="secondary" onClick={commitManual} disabled={!draft.trim()}>
                    Pakai
                  </Button>
                </div>
                {options.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setManual(false)}
                    className="cursor-pointer text-[11px] font-medium text-accent-ink underline underline-offset-2"
                  >
                    Kembali ke daftar
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setManual(true);
                  setDraft(value);
                }}
                className="cursor-pointer text-[11px] font-medium text-accent-ink underline underline-offset-2"
              >
                Model tidak ada di daftar? Isi ID manual
              </button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function EffortSelect({
  value,
  onChange,
  label,
  busy,
}: {
  value: ReasoningEffort | null;
  onChange: (next: ReasoningEffort | null) => void;
  label: string;
  busy?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={`Reasoning effort ${label}`}
      className="inline-flex flex-wrap items-center rounded-lg border border-line/70 bg-sidebar/80 p-0.5"
    >
      {EFFORT_OPTIONS.map((o) => {
        const active = (value ?? null) === o.value;
        return (
          <button
            key={o.short}
            type="button"
            aria-pressed={active}
            disabled={busy}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={cn(
              'min-h-8 cursor-pointer rounded-md px-2.5 text-[11.5px] font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
              'disabled:cursor-not-allowed disabled:opacity-50',
              active ? 'bg-surface text-ink' : 'text-ink-3 hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function ModelsPage() {
  const { toast } = useToast();
  const { t } = useLocale();
  const { refreshActiveModel } = useAppShell();

  const [managed, setManaged] = useState<ManagedPublic | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeMode, setActiveMode] = useState<ModelSourceMode>('managed');
  const [managedModel, setManagedModel] = useState('');
  const [managedEffort, setManagedEffort] = useState<ReasoningEffort | null>(null);
  const [byokActive, setByokActive] = useState<ByokSessionConfig | null>(null);

  // User BYOK session form state (2-step: fetch models first -> choose from dropdown)
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [label, setLabel] = useState('');
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [manualByokInput, setManualByokInput] = useState(false);
  const [effort, setEffort] = useState<ReasoningEffort | null>(null);
  const [testing, setTesting] = useState(false);
  const [refreshingByok, setRefreshingByok] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);

  // Admin managed connection form state (only used when isOwner === true)
  const [adminAddOpen, setAdminAddOpen] = useState(false);
  const [adminBaseUrl, setAdminBaseUrl] = useState('');
  const [adminApiKey, setAdminApiKey] = useState('');
  const [adminShowKey, setAdminShowKey] = useState(false);
  const [adminLabel, setAdminLabel] = useState('');
  const [adminFetchedModels, setAdminFetchedModels] = useState<string[]>([]);
  const [adminSelectedModel, setAdminSelectedModel] = useState('');
  const [adminManualInput, setAdminManualInput] = useState(false);
  const [adminEffort, setAdminEffort] = useState<ReasoningEffort | null>(null);
  const [adminTesting, setAdminTesting] = useState(false);
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminTest, setAdminTest] = useState<TestResult | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [refreshingCredId, setRefreshingCredId] = useState<string | null>(null);

  // Admin whitelist editor state (v0.2.7)
  const [whitelistCredId, setWhitelistCredId] = useState<string | null>(null);
  const [whitelistDraft, setWhitelistDraft] = useState<string[]>([]);
  const [whitelistQuery, setWhitelistQuery] = useState('');
  const [savingWhitelist, setSavingWhitelist] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [mgd, credsRes, preRes] = await Promise.all([
        api.get<{ managed: ManagedPublic; isOwner?: boolean }>('/settings/managed'),
        api.get<{ credentials: Credential[] }>('/settings/credentials').catch(() => ({ credentials: [] })),
        api.get<{ presets: Preset[] }>('/settings/presets').catch(() => ({ presets: [] })),
      ]);

      const ownerFlag = Boolean(mgd.isOwner);
      setIsOwner(ownerFlag);
      setManaged(mgd.managed);
      const activeCreds = ownerFlag ? credsRes.credentials.filter((c) => c.isActive) : [];
      setCredentials(activeCreds);
      setPresets(ownerFlag ? preRes.presets : []);

      if (ownerFlag && activeCreds.length === 0) {
        setAdminAddOpen(true);
      }

      const sessionByok = getByokSession();
      setByokActive(sessionByok);

      const savedMode = getModelSourceMode();
      if (savedMode === 'byok' && sessionByok) {
        setActiveMode('byok');
      } else if (mgd.managed.enabled || ownerFlag) {
        setActiveMode('managed');
      } else {
        setActiveMode('byok');
      }

      const savedManaged = getManagedSelection();
      const validList = mgd.managed.models;
      const initialManagedModel =
        savedManaged?.modelId && (validList.length === 0 || validList.includes(savedManaged.modelId))
          ? savedManaged.modelId
          : mgd.managed.defaultModelId || validList[0] || '';
      setManagedModel(initialManagedModel);
      setManagedEffort(savedManaged?.reasoningEffort ?? null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Gagal memuat pengaturan model');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function switchTab(next: ModelSourceMode) {
    setActiveMode(next);
    if (next === 'managed' && managed?.enabled) {
      setModelSourceMode('managed');
      if (managedModel) {
        saveManagedSelection({ modelId: managedModel, reasoningEffort: managedEffort });
      }
      refreshActiveModel();
    } else if (next === 'byok' && byokActive) {
      setModelSourceMode('byok');
      refreshActiveModel();
    }
  }

  function applyManagedChange(nextModel: string, nextEffort: ReasoningEffort | null) {
    setManagedModel(nextModel);
    setManagedEffort(nextEffort);
    saveManagedSelection({ modelId: nextModel, reasoningEffort: nextEffort });
    setActiveMode('managed');
    refreshActiveModel();
    toast({ tone: 'success', title: `Model bawaan diatur ke ${nextModel}` });
  }

  // ── User BYOK (session-only) actions ─────────────────────────────────────────
  const canTestByok = apiKey.trim().length >= 4 && baseUrl.trim().length > 0;
  const canActivateByok = canTestByok && selectedModel.trim().length > 0;

  async function runByokTest() {
    if (!canTestByok) return;
    setTesting(true);
    setTest(null);
    try {
      const res = await api.post<TestResult>('/providers/test', {
        provider: 'custom',
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim(),
      });
      setTest(res);
      if (res.ok) {
        const models = res.models ?? [];
        setFetchedModels(models);
        if (models.length > 0) {
          setManualByokInput(false);
          if (!selectedModel || !models.includes(selectedModel)) {
            setSelectedModel(models[0] ?? '');
          }
        } else {
          setManualByokInput(true);
        }
      }
    } catch (err) {
      setTest({ ok: false, reason: err instanceof ApiError ? err.message : 'Uji koneksi gagal' });
    } finally {
      setTesting(false);
    }
  }

  function activateByokSession() {
    if (!canActivateByok) return;
    const cleanUrl = baseUrl.trim().replace(/\/+$/, '');
    const cleanModel = selectedModel.trim();
    const models = Array.from(new Set([cleanModel, ...fetchedModels])).filter(Boolean);
    const derivedLabel =
      label.trim() ||
      URL_SHORTCUTS.find((s) => s.url === cleanUrl)?.label ||
      cleanUrl.replace(/^https?:\/\//, '').split('/')[0] ||
      'BYOK Sesi';

    const config: ByokSessionConfig = {
      label: derivedLabel,
      baseUrl: cleanUrl,
      apiKey: apiKey.trim(),
      modelId: cleanModel,
      models,
      reasoningEffort: effort,
    };
    saveByokSession(config);
    setByokActive(config);
    setActiveMode('byok');
    setApiKey('');
    setShowKey(false);
    setTest(null);
    setFetchedModels([]);
    setSelectedModel('');
    setManualByokInput(false);
    refreshActiveModel();
    toast({ tone: 'success', title: `BYOK sesi aktif (${cleanModel})` });
  }

  function updateActiveByok(patch: Partial<ByokSessionConfig>, message: string) {
    if (!byokActive) return;
    const updated: ByokSessionConfig = { ...byokActive, ...patch };
    saveByokSession(updated);
    setByokActive(updated);
    setActiveMode('byok');
    refreshActiveModel();
    toast({ tone: 'success', title: message });
  }

  async function refreshActiveByokModels() {
    if (!byokActive) return;
    setRefreshingByok(true);
    try {
      const res = await api.post<TestResult>('/providers/test', {
        provider: 'custom',
        apiKey: byokActive.apiKey,
        baseUrl: byokActive.baseUrl,
      });
      if (res.ok && res.models?.length) {
        const merged = Array.from(new Set([byokActive.modelId, ...res.models]));
        updateActiveByok({ models: merged }, `${res.models.length} model berhasil dimuat`);
      } else {
        toast({ tone: 'error', title: res.reason ?? 'Penyedia tidak mengembalikan daftar model' });
      }
    } catch (err) {
      toast({
        tone: 'error',
        title: err instanceof ApiError ? err.message : 'Gagal menyegarkan daftar model',
      });
    } finally {
      setRefreshingByok(false);
    }
  }

  function wipeByokSession() {
    clearByokSession();
    setByokActive(null);
    if (managed?.enabled) {
      setActiveMode('managed');
    }
    refreshActiveModel();
    toast({ tone: 'success', title: 'API key sesi dihapus dari browser' });
  }

  // ── Admin Managed connections (DB-persisted, owner-only) ────────────────────
  const canTestAdmin = adminApiKey.trim().length >= 8 && adminBaseUrl.trim().length > 0;
  const canSaveAdmin = canTestAdmin && adminSelectedModel.trim().length > 0;

  async function runAdminTest() {
    if (!canTestAdmin) return;
    setAdminTesting(true);
    setAdminTest(null);
    try {
      const res = await api.post<TestResult>('/providers/test', {
        provider: 'custom',
        apiKey: adminApiKey.trim(),
        baseUrl: adminBaseUrl.trim(),
      });
      setAdminTest(res);
      if (res.ok) {
        const models = res.models ?? [];
        setAdminFetchedModels(models);
        if (models.length > 0) {
          setAdminManualInput(false);
          if (!adminSelectedModel || !models.includes(adminSelectedModel)) {
            setAdminSelectedModel(models[0] ?? '');
          }
        } else {
          setAdminManualInput(true);
        }
      }
    } catch (err) {
      setAdminTest({ ok: false, reason: err instanceof ApiError ? err.message : 'Uji koneksi gagal' });
    } finally {
      setAdminTesting(false);
    }
  }

  async function saveAdminConnection() {
    if (!canSaveAdmin) return;
    setAdminSaving(true);
    try {
      const cleanUrl = adminBaseUrl.trim().replace(/\/+$/, '');
      const cleanModel = adminSelectedModel.trim();
      const derivedLabel =
        adminLabel.trim() ||
        URL_SHORTCUTS.find((s) => s.url === cleanUrl)?.label ||
        cleanUrl.replace(/^https?:\/\//, '').split('/')[0] ||
        'Koneksi Bawaan';

      const credRes = await api.post<{ credential: Credential }>('/settings/credentials', {
        provider: 'custom',
        label: derivedLabel,
        apiKey: adminApiKey.trim(),
        baseUrl: cleanUrl,
        cachedModels: adminFetchedModels.length > 0 ? adminFetchedModels : [cleanModel],
        test: true,
      });

      const makeDefault = presets.length === 0;
      await api.post<{ preset: Preset }>('/settings/presets', {
        name: derivedLabel,
        provider: 'custom',
        credentialId: credRes.credential.id,
        modelId: cleanModel,
        reasoningEffort: adminEffort,
        isDefault: makeDefault,
      });

      setAdminApiKey('');
      setAdminBaseUrl('');
      setAdminLabel('');
      setAdminFetchedModels([]);
      setAdminSelectedModel('');
      setAdminManualInput(false);
      setAdminEffort(null);
      setAdminTest(null);
      setAdminAddOpen(false);

      await load();
      refreshActiveModel();
      toast({ tone: 'success', title: `Koneksi bawaan "${derivedLabel}" disimpan` });
    } catch (err) {
      toast({
        tone: 'error',
        title: err instanceof ApiError ? err.message : 'Gagal menyimpan koneksi bawaan',
      });
    } finally {
      setAdminSaving(false);
    }
  }

  async function patchAdminPreset(presetId: string, patch: Record<string, unknown>, message: string) {
    setRowBusy(presetId);
    try {
      await api.patch(`/settings/presets?id=${encodeURIComponent(presetId)}`, patch);
      await load();
      refreshActiveModel();
      toast({ tone: 'success', title: message });
    } catch (err) {
      toast({ tone: 'error', title: err instanceof ApiError ? err.message : 'Gagal memperbarui koneksi' });
    } finally {
      setRowBusy(null);
    }
  }

  async function refreshAdminCredential(cred: Credential) {
    setRefreshingCredId(cred.id);
    try {
      const res = await api.post<TestResult>('/providers/test', {
        provider: cred.provider,
        credentialId: cred.id,
      });
      if (res.ok) {
        await load();
        refreshActiveModel();
        toast({ tone: 'success', title: `${res.models?.length ?? 0} model disegarkan untuk ${cred.label}` });
      } else {
        toast({ tone: 'error', title: res.reason ?? 'Gagal menyegarkan daftar model' });
      }
    } catch (err) {
      toast({ tone: 'error', title: err instanceof ApiError ? err.message : 'Gagal menyegarkan daftar model' });
    } finally {
      setRefreshingCredId(null);
    }
  }

  async function removeAdminConnection(preset: Preset) {
    setRowBusy(preset.id);
    try {
      await api.delete(`/settings/presets?id=${encodeURIComponent(preset.id)}`);
      if (preset.credentialId) {
        const stillUsed = presets.some((p) => p.id !== preset.id && p.credentialId === preset.credentialId);
        if (!stillUsed) {
          await api.delete(`/settings/credentials?id=${encodeURIComponent(preset.credentialId)}`);
        }
      }
      await load();
      refreshActiveModel();
      toast({ tone: 'success', title: `Koneksi "${preset.name}" dihapus` });
    } catch (err) {
      toast({ tone: 'error', title: err instanceof ApiError ? err.message : 'Gagal menghapus koneksi' });
    } finally {
      setRowBusy(null);
    }
  }

  function openWhitelistEditor(cred: Credential, fallbackModelId: string) {
    if (whitelistCredId === cred.id) {
      setWhitelistCredId(null);
      return;
    }
    const seed =
      cred.allowedModels !== null
        ? cred.allowedModels
        : cred.cachedModels.length > 0
          ? cred.cachedModels
          : [fallbackModelId].filter(Boolean);
    setWhitelistDraft(Array.from(new Set(seed)));
    setWhitelistQuery('');
    setWhitelistCredId(cred.id);
  }

  function toggleWhitelistModel(modelId: string) {
    setWhitelistDraft((prev) =>
      prev.includes(modelId) ? prev.filter((m) => m !== modelId) : [...prev, modelId],
    );
  }

  async function persistWhitelist(cred: Credential, preset: Preset | null, nextAllowed: string[] | null) {
    setSavingWhitelist(true);
    try {
      await api.patch(`/settings/credentials?id=${encodeURIComponent(cred.id)}`, {
        allowedModels: nextAllowed,
      });
      if (preset && nextAllowed !== null && nextAllowed.length > 0 && !nextAllowed.includes(preset.modelId)) {
        await api.patch(`/settings/presets?id=${encodeURIComponent(preset.id)}`, {
          modelId: nextAllowed[0],
        });
      }
      setWhitelistCredId(null);
      await load();
      refreshActiveModel();
      toast({
        tone: 'success',
        title:
          nextAllowed === null
            ? t(`Whitelist ${cred.label} dihapus`, `${cred.label} whitelist cleared`)
            : t(`Whitelist ${cred.label} disimpan (${nextAllowed.length} model)`, `${cred.label} whitelist saved (${nextAllowed.length} models)`),
      });
    } catch (err) {
      toast({
        tone: 'error',
        title: err instanceof ApiError ? err.message : t('Gagal menyimpan whitelist model', 'Failed to save model whitelist'),
      });
    } finally {
      setSavingWhitelist(false);
    }
  }

  async function removeOrphanCredential(cred: Credential) {
    setRowBusy(cred.id);
    try {
      await api.delete(`/settings/credentials?id=${encodeURIComponent(cred.id)}`);
      await load();
      refreshActiveModel();
      toast({ tone: 'success', title: t(`Koneksi "${cred.label}" dinonaktifkan`, `Connection "${cred.label}" deactivated`) });
    } catch (err) {
      toast({ tone: 'error', title: err instanceof ApiError ? err.message : t('Gagal menghapus koneksi', 'Failed to remove connection') });
    } finally {
      setRowBusy(null);
    }
  }

  // Group owner's presets by credential AND surface any active credentials without a preset
  // so legacy/secondary connections are visible to admin and can be whitelisted or removed.
  const managedRows = useMemo(() => {
    const validCredMap = new Map(credentials.map((c) => [c.id, c]));
    const seenCredIds = new Set<string>();
    const rows: { key: string; preset: Preset | null; cred: Credential | null }[] = presets
      .filter((p) => !p.credentialId || validCredMap.has(p.credentialId))
      .map((p) => {
        if (p.credentialId) seenCredIds.add(p.credentialId);
        return {
          key: p.id,
          preset: p,
          cred: p.credentialId ? validCredMap.get(p.credentialId) ?? null : null,
        };
      });
    for (const c of credentials) {
      if (!seenCredIds.has(c.id)) {
        rows.push({ key: `cred-${c.id}`, preset: null, cred: c });
      }
    }
    return rows;
  }, [presets, credentials]);

  const anyCredentialWhitelisted = useMemo(
    () => credentials.some((c) => c.allowedModels !== null && c.allowedModels.length > 0),
    [credentials],
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 space-y-5">
        <div className="h-7 w-48 animate-pulse rounded-md bg-subtle" />
        <div className="h-24 animate-pulse rounded-xl bg-subtle" />
        <div className="h-56 animate-pulse rounded-xl bg-subtle" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-7 sm:px-6 sm:py-9 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
              {t('Pengaturan Model', 'Model Settings')}
            </h1>
            {isOwner && <Badge tone="live">Admin</Badge>}
          </div>
          <p className="text-sm leading-relaxed text-ink-2">
            {t(
              'Pakai model bawaan Rencang-Rancang atau hubungkan API key milikmu sendiri untuk sesi browser ini.',
              'Use Managed Rencang-Rancang models or connect your own API key for this browser session.',
            )}
          </p>
        </div>
        <Link
          href="/studio"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {t('Kembali ke Studio', 'Back to Studio')}
        </Link>
      </div>

      {loadError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-ink"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{loadError}</span>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            Coba lagi
          </Button>
        </div>
      )}

      {/* 2-mode segmented switcher */}
      <section aria-label="Sumber model" className="space-y-5">
        <div
          role="tablist"
          aria-label="Pilih sumber model"
          className="grid grid-cols-1 gap-2 rounded-xl border border-line bg-sidebar/70 p-1.5 sm:grid-cols-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeMode === 'managed'}
            onClick={() => switchTab('managed')}
            className={cn(
              'flex min-h-14 cursor-pointer items-start gap-3 rounded-lg px-4 py-3 text-left transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
              activeMode === 'managed'
                ? 'bg-surface text-ink ring-1 ring-accent/40'
                : 'text-ink-2 hover:bg-surface/50 hover:text-ink',
            )}
          >
            <Server
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0',
                activeMode === 'managed' ? 'text-accent-ink' : 'text-ink-3',
              )}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span>{t('Bawaan Rencang-Rancang', 'Managed Rencang-Rancang')}</span>
                {activeMode === 'managed' && managed?.enabled && (
                  <Badge tone="ready" dot>
                    {t('Aktif', 'Active')}
                  </Badge>
                )}
              </span>
              <span className="mt-0.5 block text-xs text-ink-3">
                {t(
                  'Langsung pakai pilihan model yang disediakan server tanpa perlu API key sendiri.',
                  'Start immediately with server-managed models without setting up an API key.',
                )}
              </span>
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeMode === 'byok'}
            onClick={() => switchTab('byok')}
            className={cn(
              'flex min-h-14 cursor-pointer items-start gap-3 rounded-lg px-4 py-3 text-left transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
              activeMode === 'byok'
                ? 'bg-surface text-ink ring-1 ring-accent/40'
                : 'text-ink-2 hover:bg-surface/50 hover:text-ink',
            )}
          >
            <KeyRound
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0',
                activeMode === 'byok' ? 'text-accent-ink' : 'text-ink-3',
              )}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span>{t('API Key Sendiri (BYOK)', 'Own API Key (BYOK)')}</span>
                {activeMode === 'byok' && byokActive && (
                  <Badge tone="live" dot>
                    {t('Sesi aktif', 'Session active')}
                  </Badge>
                )}
              </span>
              <span className="mt-0.5 block text-xs text-ink-3">
                {t(
                  'Endpoint OpenAI-Compatible milikmu, disimpan hanya di sesi browser ini.',
                  'Your OpenAI-compatible endpoint, stored only in this browser session.',
                )}
              </span>
            </span>
          </button>
        </div>

        {/* PANEL 1: Bawaan Rencang-Rancang */}
        {activeMode === 'managed' && (
          <div className="space-y-5">
            {/* Active Managed model selector (visible to all users) */}
            <div className="rounded-xl border border-line bg-surface p-5 shadow-panel sm:p-6 space-y-5">
              {managed?.enabled ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold text-ink">
                          {t('Model bawaan Rencang-Rancang', 'Managed Rencang-Rancang models')}
                        </h2>
                        <Badge tone="ready" dot>
                          {t(`${managed.models.length} model siap`, `${managed.models.length} models ready`)}
                        </Badge>
                      </div>
                      <p className="text-xs leading-relaxed text-ink-2">
                        {isOwner
                          ? t(
                              'Daftar di bawah otomatis mengikuti whitelist yang kamu pilih pada bagian Admin.',
                              'This list automatically reflects the whitelist selected in the Admin panel below.',
                            )
                          : t(
                              'Model ini berjalan memakai kredensial server Rencang-Rancang. Kamu tidak perlu menyiapkan API key sendiri.',
                              'These models run on Rencang-Rancang server credentials. No personal API key needed.',
                            )}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line/80 pt-4">
                    <div className="space-y-1.5">
                      <span className="block text-xs font-medium text-ink-2">Model aktif</span>
                      <ModelPicker
                        label="Model bawaan"
                        value={managedModel}
                        options={managed.models}
                        allowManual={false}
                        onSelect={(next) => applyManagedChange(next, managedEffort)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <span className="block text-xs font-medium text-ink-2">Reasoning effort</span>
                      <EffortSelect
                        label="Model bawaan"
                        value={managedEffort}
                        onChange={(next) => applyManagedChange(managedModel, next)}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-ink-3">
                    Model juga bisa diganti cepat lewat dropdown di kanan atas bilah navigasi.
                  </p>
                </>
              ) : (
                <div className="space-y-3 py-2">
                  <h2 className="text-base font-semibold text-ink">Model bawaan belum dikonfigurasi</h2>
                  <p className="max-w-xl text-sm leading-relaxed text-ink-2">
                    {isOwner
                      ? 'Tambahkan koneksi OpenAI-Compatible di bagian Admin di bawah agar seluruh pengguna bisa langsung memakai model bawaan Rencang-Rancang.'
                      : 'Admin belum menyiapkan model bawaan di server ini. Gunakan tab API Key Sendiri (BYOK) untuk mulai memakai kunci milikmu.'}
                  </p>
                  {!isOwner && (
                    <Button variant="primary" size="sm" onClick={() => setActiveMode('byok')}>
                      Atur BYOK untuk sesi ini
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Admin-only management panel for Managed Rencang-Rancang connections */}
            {isOwner && (
              <div className="rounded-xl border border-line bg-surface p-5 shadow-panel sm:p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-ink">
                        Kelola koneksi bawaan (Admin)
                      </h2>
                      <Badge tone="live">Khusus admin</Badge>
                    </div>
                    <p className="text-xs leading-relaxed text-ink-2">
                      Koneksi yang kamu simpan di sini terenkripsi di server dan otomatis menjadi daftar model Bawaan Rencang-Rancang untuk seluruh pengguna. Pengguna lain tidak dapat melihat atau mengubah bagian ini.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={adminAddOpen ? 'ghost' : 'secondary'}
                    onClick={() => setAdminAddOpen((v) => !v)}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    {adminAddOpen ? 'Tutup form' : 'Tambah koneksi'}
                  </Button>
                </div>

                {/* Existing admin managed connections */}
                {managedRows.length > 0 && (
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {managedRows.map(({ key, preset: p, cred: c }) => {
                      const busyId = p?.id ?? c?.id ?? key;
                      const busy = rowBusy === busyId;
                      const refreshing = c ? refreshingCredId === c.id : false;
                      const rowName = p?.name ?? c?.label ?? 'Koneksi bawaan';
                      const defaultModelForRow = p?.modelId ?? c?.allowedModels?.[0] ?? c?.cachedModels?.[0] ?? '';
                      const allCatalog = Array.from(
                        new Set([defaultModelForRow, ...(c?.cachedModels ?? [])].filter(Boolean)),
                      ).sort();
                      const options =
                        c && c.allowedModels !== null
                          ? Array.from(new Set(c.allowedModels.filter(Boolean))).sort()
                          : allCatalog;
                      const isEditingWhitelist = c !== null && whitelistCredId === c.id;
                      const isShadowedByOtherWhitelist =
                        anyCredentialWhitelisted && c !== null && c.allowedModels === null;
                      const filteredCatalog = whitelistQuery.trim()
                        ? allCatalog.filter((m) =>
                            m.toLowerCase().includes(whitelistQuery.trim().toLowerCase()),
                          )
                        : allCatalog;
                      return (
                        <li key={key} className="space-y-3 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-sm font-semibold text-ink">{rowName}</span>
                                {p?.isDefault && <Badge tone="ready">{t('Default bawaan', 'Default')}</Badge>}
                                {c && c.allowedModels !== null && (
                                  <Badge tone="live">
                                    Whitelist {c.allowedModels.length}/{allCatalog.length}
                                  </Badge>
                                )}
                                {isShadowedByOtherWhitelist && (
                                  <Badge tone="neutral">
                                    {t('Tidak di-whitelist (disembunyikan)', 'Not whitelisted (hidden)')}
                                  </Badge>
                                )}
                              </div>
                              <p className="truncate font-mono text-[11.5px] text-ink-3">
                                {c?.baseUrl || 'Endpoint bawaan'}
                                {c ? ` · ····${c.keyLast4}` : ''}
                                {c
                                  ? c.allowedModels !== null
                                    ? ` · ${c.allowedModels.length} / ${allCatalog.length} model`
                                    : isShadowedByOtherWhitelist
                                      ? t(' · tidak masuk daftar Bawaan selama whitelist lain aktif', ' · excluded while another whitelist is active')
                                      : ` · ${allCatalog.length} model`
                                  : ''}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {c && allCatalog.length > 0 && (
                                <Button
                                  size="sm"
                                  variant={isEditingWhitelist ? 'secondary' : 'ghost'}
                                  disabled={busy || refreshing}
                                  onClick={() => openWhitelistEditor(c, defaultModelForRow)}
                                >
                                  <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                                  {isEditingWhitelist ? t('Tutup whitelist', 'Close whitelist') : t('Atur whitelist', 'Edit whitelist')}
                                </Button>
                              )}
                              {p && !p.isDefault && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() =>
                                    void patchAdminPreset(
                                      p.id,
                                      { isDefault: true },
                                      `Default bawaan diubah ke ${p.name}`,
                                    )
                                  }
                                >
                                  <Star className="h-3.5 w-3.5" aria-hidden="true" />
                                  {t('Jadikan default', 'Set default')}
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Hapus ${rowName}`}
                                disabled={busy}
                                onClick={() =>
                                  p
                                    ? void removeAdminConnection(p)
                                    : c
                                      ? void removeOrphanCredential(c)
                                      : undefined
                                }
                                className="text-danger-ink hover:bg-danger-soft"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 border-t border-line/70 pt-3">
                            <div className="flex min-w-0 items-center gap-1.5">
                              {p && (
                                <ModelPicker
                                  label={`Model default ${p.name}`}
                                  value={p.modelId}
                                  options={options}
                                  disabled={busy || refreshing}
                                  onSelect={(next) =>
                                    void patchAdminPreset(
                                      p.id,
                                      { modelId: next },
                                      `Model default ${p.name} diubah ke ${next}`,
                                    )
                                  }
                                />
                              )}
                              {c && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busy || refreshing}
                                  aria-label={`Segarkan daftar model ${rowName}`}
                                  onClick={() => void refreshAdminCredential(c)}
                                >
                                  <RefreshCw
                                    className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')}
                                    aria-hidden="true"
                                  />
                                  <span className="hidden sm:inline">
                                    {refreshing ? t('Mengambil...', 'Fetching...') : t('Segarkan', 'Refresh')}
                                  </span>
                                </Button>
                              )}
                            </div>

                            {p && (
                              <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
                                <span className="text-[11.5px] font-medium text-ink-3">Reasoning</span>
                                <EffortSelect
                                  label={p.name}
                                  value={p.reasoningEffort}
                                  busy={busy}
                                  onChange={(next) =>
                                    void patchAdminPreset(
                                      p.id,
                                      { reasoningEffort: next },
                                      'Reasoning effort diperbarui',
                                    )
                                  }
                                />
                              </div>
                            )}
                          </div>

                          {/* Inline Admin Whitelist Picker */}
                          {isEditingWhitelist && c && (
                            <div className="rounded-lg border border-line-strong/70 bg-canvas/60 p-4 space-y-3.5">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="space-y-0.5">
                                  <p className="text-xs font-semibold text-ink">
                                    {t(
                                      `Whitelist model untuk pengguna (${whitelistDraft.length} dipilih)`,
                                      `Model whitelist for users (${whitelistDraft.length} selected)`,
                                    )}
                                  </p>
                                  <p className="text-[11.5px] text-ink-2">
                                    {t(
                                      'Hanya model yang dicentang yang muncul di dropdown Bawaan Rencang-Rancang untuk admin dan pengguna.',
                                      'Only checked models appear in the Managed Rencang-Rancang picker for both admin and users.',
                                    )}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {defaultModelForRow && (
                                    <button
                                      type="button"
                                      onClick={() => setWhitelistDraft([defaultModelForRow])}
                                      className="cursor-pointer rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink-2 hover:border-line-strong hover:text-ink"
                                    >
                                      {t('Hanya default', 'Default only')}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setWhitelistDraft([])}
                                    className="cursor-pointer rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink-2 hover:border-line-strong hover:text-ink"
                                  >
                                    {t('Kosongkan', 'Clear')}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={savingWhitelist}
                                    onClick={() => void persistWhitelist(c, p, null)}
                                    className="cursor-pointer rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-accent-ink hover:border-accent/50"
                                  >
                                    {t(`Buka semua (${allCatalog.length})`, `Allow all (${allCatalog.length})`)}
                                  </button>
                                </div>
                              </div>

                              {whitelistDraft.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {whitelistDraft.slice(0, 12).map((id) => (
                                    <span
                                      key={id}
                                      className="inline-flex items-center gap-1 rounded-md border border-accent/25 bg-accent-soft px-2 py-0.5 font-mono text-[11px] text-accent-ink"
                                    >
                                      <span className="max-w-44 truncate">{id}</span>
                                      <button
                                        type="button"
                                        aria-label={`Hapus ${id} dari whitelist`}
                                        onClick={() => toggleWhitelistModel(id)}
                                        className="cursor-pointer rounded hover:bg-accent/15"
                                      >
                                        <X className="h-3 w-3" aria-hidden="true" />
                                      </button>
                                    </span>
                                  ))}
                                  {whitelistDraft.length > 12 && (
                                    <span className="inline-flex items-center rounded-md bg-subtle px-2 py-0.5 font-mono text-[11px] text-ink-2">
                                      +{whitelistDraft.length - 12} {t('lainnya', 'more')}
                                    </span>
                                  )}
                                </div>
                              )}

                              <div className="relative">
                                <Search
                                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3"
                                  aria-hidden="true"
                                />
                                <input
                                  type="search"
                                  value={whitelistQuery}
                                  onChange={(e) => setWhitelistQuery(e.target.value)}
                                  placeholder={t(`Cari dari ${allCatalog.length} model penyedia...`, `Search ${allCatalog.length} provider models...`)}
                                  aria-label={`Cari model whitelist ${rowName}`}
                                  className="min-h-9 w-full rounded-lg border border-line bg-surface pl-8 pr-3 text-xs text-ink placeholder:text-ink-3 focus:border-accent"
                                />
                              </div>

                              <ul className="max-h-56 divide-y divide-line/50 overflow-y-auto rounded-lg border border-line bg-surface p-1">
                                {filteredCatalog.length === 0 ? (
                                  <li className="px-3 py-4 text-center text-xs text-ink-3">
                                    {t(`Tidak ada model yang cocok dengan "${whitelistQuery}".`, `No models matched "${whitelistQuery}".`)}
                                  </li>
                                ) : (
                                  filteredCatalog.map((m) => {
                                    const checked = whitelistDraft.includes(m);
                                    return (
                                      <li key={m}>
                                        <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 hover:bg-subtle/70">
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleWhitelistModel(m)}
                                            className="h-4 w-4 cursor-pointer accent-accent"
                                          />
                                          <span className="truncate font-mono text-xs text-ink">{m}</span>
                                          {m === defaultModelForRow && (
                                            <span className="ml-auto shrink-0 rounded bg-ready-soft px-1.5 py-0.5 font-mono text-[10px] text-ready-ink">
                                              default
                                            </span>
                                          )}
                                        </label>
                                      </li>
                                    );
                                  })
                                )}
                              </ul>

                              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                <span className="text-[11px] text-ink-3">
                                  {t(
                                    'Pilih minimal 1 model, atau klik Buka semua untuk tanpa batasan.',
                                    'Select at least 1 model, or click Allow all for unrestricted access.',
                                  )}
                                </span>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={savingWhitelist}
                                    onClick={() => setWhitelistCredId(null)}
                                  >
                                    {t('Batal', 'Cancel')}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="primary"
                                    disabled={savingWhitelist || whitelistDraft.length === 0}
                                    onClick={() => void persistWhitelist(c, p, whitelistDraft)}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                    {savingWhitelist
                                      ? t('Menyimpan...', 'Saving...')
                                      : t(`Simpan whitelist (${whitelistDraft.length})`, `Save whitelist (${whitelistDraft.length})`)}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* Add new managed connection form (Admin) */}
                {adminAddOpen && (
                  <form
                    className="rounded-lg border border-line/90 bg-canvas/40 p-4 sm:p-5 space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (canSaveAdmin) void saveAdminConnection();
                    }}
                  >
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-ink">
                        Tambah koneksi OpenAI-Compatible bawaan
                      </h3>
                      <p className="text-xs text-ink-2">
                        Langkah 1: isi Base URL dan API key lalu muat daftar model. Langkah 2: pilih model default dari dropdown lalu simpan.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label htmlFor="admin-base-url" className="block text-xs font-medium text-ink-2">
                          Base URL <span className="font-normal text-danger-ink">(wajib)</span>
                        </label>
                        <div className="flex flex-wrap items-center gap-1">
                          {URL_SHORTCUTS.map((s) => (
                            <button
                              key={s.label}
                              type="button"
                              onClick={() => {
                                setAdminBaseUrl(s.url);
                                if (!adminLabel.trim()) setAdminLabel(s.label);
                                setAdminTest(null);
                                setAdminFetchedModels([]);
                              }}
                              className="cursor-pointer rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <input
                        id="admin-base-url"
                        required
                        placeholder="https://api.kenari.id/v1"
                        value={adminBaseUrl}
                        onChange={(e) => {
                          setAdminBaseUrl(e.target.value);
                          setAdminTest(null);
                        }}
                        className="min-h-11 w-full rounded-lg border border-line bg-canvas px-3.5 py-2 font-mono text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent"
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label htmlFor="admin-api-key" className="block text-xs font-medium text-ink-2">
                          API Key <span className="font-normal text-danger-ink">(wajib)</span>
                        </label>
                        <div className="flex gap-2">
                          <input
                            id="admin-api-key"
                            type={adminShowKey ? 'text' : 'password'}
                            autoComplete="off"
                            required
                            placeholder="sk-..."
                            value={adminApiKey}
                            onChange={(e) => {
                              setAdminApiKey(e.target.value);
                              setAdminTest(null);
                            }}
                            className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3.5 py-2 font-mono text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent"
                          />
                          <Button
                            variant="secondary"
                            aria-label={adminShowKey ? 'Sembunyikan kunci' : 'Tampilkan kunci'}
                            aria-pressed={adminShowKey}
                            onClick={() => setAdminShowKey((v) => !v)}
                          >
                            {adminShowKey ? (
                              <EyeOff className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <Eye className="h-4 w-4" aria-hidden="true" />
                            )}
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label htmlFor="admin-label" className="block text-xs font-medium text-ink-2">
                          Label koneksi <span className="font-normal text-ink-3">(opsional)</span>
                        </label>
                        <input
                          id="admin-label"
                          placeholder="Contoh: Kenari Utama"
                          value={adminLabel}
                          onChange={(e) => setAdminLabel(e.target.value)}
                          className="min-h-11 w-full rounded-lg border border-line bg-canvas px-3.5 py-2 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        variant="secondary"
                        onClick={() => void runAdminTest()}
                        disabled={!canTestAdmin || adminTesting}
                      >
                        <Plug className="h-4 w-4" aria-hidden="true" />
                        {adminTesting ? 'Memuat daftar model...' : 'Muat daftar model'}
                      </Button>
                      {adminFetchedModels.length === 0 && !adminManualInput && (
                        <button
                          type="button"
                          onClick={() => setAdminManualInput(true)}
                          className="cursor-pointer text-xs text-ink-3 underline underline-offset-2 hover:text-ink"
                        >
                          Penyedia tanpa daftar model? Isi ID manual
                        </button>
                      )}
                    </div>

                    {adminTest && (
                      <div
                        role="status"
                        className={cn(
                          'rounded-lg border px-4 py-3 text-xs leading-relaxed',
                          adminTest.ok
                            ? 'border-ready/30 bg-ready-soft/60 text-ready-ink'
                            : 'border-danger/35 bg-danger-soft text-danger-ink',
                        )}
                      >
                        {adminTest.ok ? (
                          <p className="font-medium">
                            Koneksi berhasil
                            {adminTest.models && adminTest.models.length > 0
                              ? `, ${adminTest.models.length} model siap dipilih di bawah.`
                              : '. Penyedia tidak mengembalikan daftar model; isi ID model manual di bawah.'}
                          </p>
                        ) : (
                          <p>
                            <span className="font-medium">Uji koneksi gagal: </span>
                            {adminTest.reason}
                          </p>
                        )}
                      </div>
                    )}

                    {(adminFetchedModels.length > 0 || adminManualInput) && (
                      <div className="grid gap-4 border-t border-line/70 pt-4 sm:grid-cols-2 sm:items-end">
                        <div className="space-y-1.5">
                          <label htmlFor="admin-model-id" className="block text-xs font-medium text-ink-2">
                            Model default <span className="font-normal text-danger-ink">(wajib)</span>
                          </label>
                          {adminFetchedModels.length > 0 && !adminManualInput ? (
                            <ModelPicker
                              label="Pilih model default bawaan"
                              value={adminSelectedModel}
                              options={adminFetchedModels}
                              onSelect={setAdminSelectedModel}
                              fullWidth
                            />
                          ) : (
                            <input
                              id="admin-model-id"
                              value={adminSelectedModel}
                              onChange={(e) => setAdminSelectedModel(e.target.value)}
                              placeholder="Contoh: deepseek-v4-1-flash"
                              className="min-h-11 w-full rounded-lg border border-line bg-canvas px-3.5 py-2 font-mono text-sm text-ink placeholder:text-ink-3 focus:border-accent"
                            />
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <span className="block text-xs font-medium text-ink-2">Reasoning effort</span>
                          <EffortSelect label="Koneksi bawaan baru" value={adminEffort} onChange={setAdminEffort} />
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2.5 border-t border-line/70 pt-4">
                      <Button type="submit" variant="primary" disabled={!canSaveAdmin || adminSaving}>
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        {adminSaving ? 'Menyimpan...' : 'Simpan koneksi bawaan'}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        )}

        {/* PANEL 2: BYOK Session-Only (2-step fetch dropdown flow) */}
        {activeMode === 'byok' && (
          <div className="space-y-5">
            {byokActive && (
              <div className="rounded-xl border border-accent/35 bg-surface p-5 shadow-panel space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[15px] font-semibold text-ink">{byokActive.label}</h2>
                      <Badge tone="live" dot>
                        Aktif di sesi ini
                      </Badge>
                    </div>
                    <p className="truncate font-mono text-[11.5px] text-ink-3">
                      {byokActive.baseUrl} · {maskLast4(byokActive.apiKey)} · hanya di browser
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={wipeByokSession}
                    className="text-danger-ink hover:bg-danger-soft"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Hapus kunci sesi
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-3 border-t border-line/80 pt-3.5">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <ModelPicker
                      label="Model sesi BYOK"
                      value={byokActive.modelId}
                      options={byokActive.models}
                      disabled={refreshingByok}
                      onSelect={(next) =>
                        updateActiveByok({ modelId: next }, `Model sesi diubah ke ${next}`)
                      }
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={refreshingByok}
                      aria-label="Segarkan daftar model sesi BYOK"
                      onClick={() => void refreshActiveByokModels()}
                    >
                      <RefreshCw
                        className={cn('h-3.5 w-3.5', refreshingByok && 'animate-spin')}
                        aria-hidden="true"
                      />
                      <span className="hidden sm:inline">
                        {refreshingByok ? 'Mengambil...' : 'Segarkan'}
                      </span>
                    </Button>
                  </div>

                  <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
                    <span className="text-[11.5px] font-medium text-ink-3">Reasoning</span>
                    <EffortSelect
                      label="BYOK aktif"
                      value={byokActive.reasoningEffort}
                      onChange={(next) =>
                        updateActiveByok({ reasoningEffort: next }, 'Reasoning effort sesi diperbarui')
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            <form
              className="rounded-xl border border-line bg-surface p-5 shadow-panel sm:p-6 space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (canActivateByok) activateByokSession();
              }}
            >
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-ink">
                  {byokActive ? 'Ganti endpoint atau API key sesi' : 'Hubungkan endpoint OpenAI-Compatible'}
                </h2>
                <p className="text-xs leading-relaxed text-ink-2">
                  Satu jalur untuk OpenAI, Kenari, DeepSeek, OpenRouter, Ollama, atau endpoint kompatibel OpenAI lainnya.
                </p>
              </div>

              {/* Honest, transparent security notice (R-36) */}
              <div className="flex items-start gap-2.5 rounded-lg border border-ready/25 bg-ready-soft/60 px-3.5 py-3 text-xs leading-relaxed text-ink-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ready-ink" aria-hidden="true" />
                <div>
                  <p className="font-medium text-ink">Kunci hanya disimpan di sesi browser ini</p>
                  <p className="mt-0.5">
                    API key disimpan di <code className="font-mono text-[11px] text-ink">sessionStorage</code> browser dan{' '}
                    <strong className="text-ink">tidak pernah disimpan ke database server</strong>. Kunci dikirim lewat HTTPS hanya saat wawancara atau menulis dokumen, lalu terhapus otomatis saat tab ditutup atau kamu keluar. Disarankan memakai API key terpisah dengan batas biaya (spending limit).
                  </p>
                </div>
              </div>

              {/* Step 1: Endpoint + API Key -> Fetch model list */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-soft font-mono text-[11px] font-semibold text-accent-ink">
                    1
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-2">
                    Masukkan endpoint dan API key
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor="byok-base-url" className="block text-xs font-medium text-ink-2">
                      Base URL <span className="font-normal text-danger-ink">(wajib)</span>
                    </label>
                    <div className="flex flex-wrap items-center gap-1">
                      {URL_SHORTCUTS.map((s) => (
                        <button
                          key={s.label}
                          type="button"
                          onClick={() => {
                            setBaseUrl(s.url);
                            if (!label.trim()) setLabel(s.label);
                            setTest(null);
                            setFetchedModels([]);
                            setSelectedModel('');
                          }}
                          className="cursor-pointer rounded-md border border-line bg-canvas/70 px-2 py-0.5 text-[11px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    id="byok-base-url"
                    required
                    placeholder="https://api.openai.com/v1"
                    value={baseUrl}
                    onChange={(e) => {
                      setBaseUrl(e.target.value);
                      setTest(null);
                      setFetchedModels([]);
                    }}
                    className="min-h-11 w-full rounded-lg border border-line bg-canvas/70 px-3.5 py-2 font-mono text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="byok-api-key" className="block text-xs font-medium text-ink-2">
                      API Key <span className="font-normal text-danger-ink">(wajib)</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="byok-api-key"
                        type={showKey ? 'text' : 'password'}
                        autoComplete="off"
                        required
                        placeholder="sk-..."
                        value={apiKey}
                        onChange={(e) => {
                          setApiKey(e.target.value);
                          setTest(null);
                        }}
                        className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-canvas/70 px-3.5 py-2 font-mono text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent"
                      />
                      <Button
                        variant="secondary"
                        aria-label={showKey ? 'Sembunyikan kunci' : 'Tampilkan kunci'}
                        aria-pressed={showKey}
                        onClick={() => setShowKey((v) => !v)}
                      >
                        {showKey ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="byok-label" className="block text-xs font-medium text-ink-2">
                      Label <span className="font-normal text-ink-3">(opsional)</span>
                    </label>
                    <input
                      id="byok-label"
                      placeholder="Contoh: OpenAI Pribadi atau Kenari"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      className="min-h-11 w-full rounded-lg border border-line bg-canvas/70 px-3.5 py-2 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant={fetchedModels.length > 0 ? 'secondary' : 'primary'}
                    onClick={() => void runByokTest()}
                    disabled={!canTestByok || testing}
                  >
                    <Plug className="h-4 w-4" aria-hidden="true" />
                    {testing
                      ? 'Mengambil daftar model...'
                      : fetchedModels.length > 0
                        ? 'Muat ulang daftar model'
                        : 'Muat daftar model'}
                  </Button>
                  {fetchedModels.length === 0 && !manualByokInput && (
                    <button
                      type="button"
                      onClick={() => setManualByokInput(true)}
                      className="cursor-pointer text-xs text-ink-3 underline underline-offset-2 hover:text-ink"
                    >
                      Penyedia tidak mendukung daftar model? Isi ID manual
                    </button>
                  )}
                </div>

                {test && (
                  <div
                    role="status"
                    className={cn(
                      'rounded-lg border px-4 py-3 text-xs leading-relaxed',
                      test.ok
                        ? 'border-ready/30 bg-ready-soft/60 text-ready-ink'
                        : 'border-danger/35 bg-danger-soft text-danger-ink',
                    )}
                  >
                    {test.ok ? (
                      <p className="font-medium">
                        Koneksi berhasil
                        {test.models && test.models.length > 0
                          ? `, ${test.models.length} model siap dipilih di Langkah 2.`
                          : '. Penyedia tidak mengembalikan daftar model; isi ID model manual di Langkah 2.'}
                      </p>
                    ) : (
                      <p>
                        <span className="font-medium">Uji koneksi gagal: </span>
                        {test.reason}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Step 2: Dropdown model selection + activate session */}
              <div className="space-y-4 border-t border-line/70 pt-5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-soft font-mono text-[11px] font-semibold text-accent-ink">
                    2
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-2">
                    Pilih model dari daftar lalu aktifkan sesi
                  </span>
                </div>

                {fetchedModels.length > 0 || manualByokInput ? (
                  <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
                    <div className="space-y-1.5">
                      <label htmlFor="byok-model-id" className="block text-xs font-medium text-ink-2">
                        {fetchedModels.length > 0 && !manualByokInput
                          ? `Pilih model (${fetchedModels.length} tersedia)`
                          : 'ID model manual'}
                      </label>
                      {fetchedModels.length > 0 && !manualByokInput ? (
                        <ModelPicker
                          label="Pilih model sesi"
                          value={selectedModel}
                          options={fetchedModels}
                          onSelect={setSelectedModel}
                          fullWidth
                        />
                      ) : (
                        <input
                          id="byok-model-id"
                          value={selectedModel}
                          onChange={(e) => setSelectedModel(e.target.value)}
                          placeholder="Contoh: gpt-4o-mini atau deepseek-chat"
                          className="min-h-11 w-full rounded-lg border border-line bg-canvas/70 px-3.5 py-2 font-mono text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent"
                        />
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <span className="block text-xs font-medium text-ink-2">Reasoning effort</span>
                      <EffortSelect label="BYOK baru" value={effort} onChange={setEffort} />
                    </div>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-line bg-canvas/40 px-4 py-3 text-xs text-ink-3">
                    Klik <strong className="font-medium text-ink-2">Muat daftar model</strong> di Langkah 1 untuk mengambil seluruh model dari API key kamu ke dalam dropdown pencarian.
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <Button type="submit" variant="primary" disabled={!canActivateByok}>
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Aktifkan untuk sesi ini
                  </Button>
                </div>
              </div>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
