'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  FolderKanban,
  BookMarked,
  SlidersHorizontal,
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  X,
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { cn } from '@/lib/cn';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui';

interface NavGroup {
  label: string;
  items: {
    href: string;
    label: string;
    hint: string;
    icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Ruang kerja',
    items: [
      { href: '/studio', label: 'Studio', hint: 'Proyek dan wawancara', icon: FolderKanban },
      { href: '/library', label: 'Library', hint: 'Artefak yang disimpan', icon: BookMarked },
    ],
  },
  {
    label: 'Konfigurasi',
    items: [
      { href: '/models', label: 'Models', hint: 'Model dan kredensial', icon: SlidersHorizontal },
      { href: '/docs', label: 'Dokumentasi', hint: 'Panduan memakai rancang-ai', icon: BookOpen },
    ],
  },
];

const STORE_KEY = 'rancang.rail.collapsed';

export interface RailProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Rail({ mobileOpen = false, onMobileClose }: RailProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORE_KEY) === '1');
    } catch {
      /* ignore private mode */
    }
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen, onMobileClose]);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  async function signOut() {
    setSigningOut(true);
    try {
      await api.post('/auth/logout');
    } catch {
      /* cookie cleared server-side either way */
    }
    router.push('/');
    router.refresh();
  }

  const isOn = (href: string) => {
    if (href === '/studio' && pathname.startsWith('/projects/')) return true;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const renderNav = (isCompact: boolean, closeOnNav?: () => void) => (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          'flex h-13 shrink-0 items-center border-b border-line px-3',
          isCompact ? 'justify-center' : 'justify-between',
        )}
      >
        <Link
          href="/studio"
          onClick={closeOnNav}
          aria-label="rancang-ai studio"
          className={cn(
            'flex items-center gap-2.5 rounded-lg px-1 py-1 text-ink transition-colors hover:text-accent-ink',
            isCompact && 'justify-center',
          )}
        >
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-xs font-semibold text-white"
          >
            R
          </span>
          {!isCompact && (
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight text-ink">rancang-ai</span>
              <span className="font-mono text-[10.5px] text-ink-3">spec studio</span>
            </span>
          )}
        </Link>

        {!isCompact && !closeOnNav && (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-controls="studio-rail-nav"
            aria-label="Ciutkan bilah samping"
            title="Ciutkan bilah samping"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-hover hover:text-ink"
          >
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        {closeOnNav && (
          <button
            type="button"
            onClick={closeOnNav}
            aria-label="Tutup menu navigasi"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {isCompact && !closeOnNav && (
        <div className="flex justify-center border-b border-line py-2">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-controls="studio-rail-nav"
            aria-label="Lebarkan bilah samping"
            title="Lebarkan bilah samping"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-hover hover:text-ink"
          >
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <nav
        id={closeOnNav ? 'studio-mobile-nav' : 'studio-rail-nav'}
        aria-label="Navigasi utama"
        className="flex-1 overflow-y-auto px-2.5 py-4 space-y-5"
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {!isCompact && (
              <p className="mb-1.5 px-2.5 text-xs font-medium text-ink-3">{group.label}</p>
            )}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isOn(item.href);
                const linkNode = (
                  <Link
                    href={item.href}
                    onClick={closeOnNav}
                    aria-current={active ? 'page' : undefined}
                    aria-label={item.label}
                    className={cn(
                      'group relative flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                      isCompact && 'justify-center px-0',
                      active
                        ? 'bg-surface font-medium text-ink shadow-xs ring-1 ring-line'
                        : 'text-ink-2 hover:bg-hover hover:text-ink',
                    )}
                  >
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-accent"
                      />
                    )}
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0',
                        active ? 'text-accent-ink' : 'text-ink-3 group-hover:text-ink',
                      )}
                      aria-hidden={true}
                    />
                    {!isCompact && <span className="truncate">{item.label}</span>}
                  </Link>
                );

                return (
                  <li key={item.href}>
                    {isCompact ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{linkNode}</TooltipTrigger>
                        <TooltipContent side="right">
                          <span className="font-medium">{item.label}</span>
                          <span className="ml-1.5 opacity-75">{item.hint}</span>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      linkNode
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <footer className="shrink-0 border-t border-line p-2.5">
        {!isCompact && (
          <div className="mb-1.5 flex items-center justify-between px-2.5 text-[11px] font-mono text-ink-3">
            <span>local</span>
            <span>v0.2.2</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={signingOut}
          aria-label="Keluar dari akun"
          title={isCompact ? 'Keluar' : undefined}
          className={cn(
            'flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-2 transition-colors hover:bg-hover hover:text-ink',
            isCompact && 'justify-center px-0',
          )}
        >
          <LogOut className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
          {!isCompact && <span>{signingOut ? 'Keluar...' : 'Keluar'}</span>}
        </button>
      </footer>
    </div>
  );

  return (
    <>
      {/* Desktop collapsible sidebar */}
      <aside
        data-collapsed={collapsed ? '1' : '0'}
        className={cn(
          'hidden md:flex shrink-0 flex-col border-r border-line bg-sidebar transition-[width] duration-150 sticky top-0 h-screen',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        {renderNav(collapsed)}
      </aside>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 flex md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigasi studio"
        >
          <div
            className="fixed inset-0 bg-ink/40 backdrop-blur-[2px]"
            onClick={onMobileClose}
            aria-hidden="true"
          />
          <aside className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col border-r border-line bg-sidebar shadow-popover">
            {renderNav(false, onMobileClose)}
          </aside>
        </div>
      )}
    </>
  );
}
