'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client/api';

/* Nav is four places, not a menu: the workbench, what you kept, the model
   that writes, and the manual. Each glyph is drawn on the same 16px grid as
   the project marks — a stroke, never a font character, because the
   self-hosted subsets carry no pictographs. */
const NAV = [
  { href: '/studio', label: 'Studio', hint: 'Proyek dan wawancara', icon: 'studio' },
  { href: '/library', label: 'Library', hint: 'Artefak yang disimpan', icon: 'library' },
  { href: '/models', label: 'Models', hint: 'Model dan kredensial', icon: 'models' },
  { href: '/docs', label: 'Dokumentasi', hint: 'Cara memakai rancang-ai', icon: 'docs' },
] as const;

type IconName = (typeof NAV)[number]['icon'];

const STORE_KEY = 'rancang.rail.collapsed';

function Glyph({ name }: { name: IconName }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (name === 'studio') {
    return (
      <svg {...common}>
        <rect x="2" y="2.5" width="12" height="11" rx="2" />
        <path d="M2 6h12M5.5 9.5h5" />
      </svg>
    );
  }
  if (name === 'library') {
    return (
      <svg {...common}>
        <path d="M2.5 3.5h4l1.2 1.6h5.8v7.4a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" />
      </svg>
    );
  }
  if (name === 'models') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="2.2" />
        <path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6 11 5M5 11l-1.4 1.4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M3 2.5h7.5L13 5v8.5H3z" />
      <path d="M10.2 2.6V5H12.8M5.2 8h5.6M5.2 10.6h5.6" />
    </svg>
  );
}

/** App rail — the one shell for every signed-in page. Collapses to glyphs. */
export function Rail() {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);

  /* Read once on mount: the server cannot know the preference, and rendering
     the expanded rail first would make the page jump on every navigation. */
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORE_KEY) === '1');
    } catch {
      /* private mode: stay expanded, do not fail the page */
    }
    setReady(true);
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORE_KEY, next ? '1' : '0');
      } catch {
        /* nothing to remember without storage */
      }
      return next;
    });
  }, []);

  async function signOut() {
    setSigningOut(true);
    try {
      await api.post('/auth/logout');
    } catch {
      /* the cookie is cleared server-side either way; go home regardless */
    }
    router.push('/');
    router.refresh();
  }

  const isOn = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside
      className={`rail pg-rail${collapsed ? ' is-collapsed' : ''}${ready ? '' : ' is-idle'}`}
      data-collapsed={collapsed ? '1' : '0'}
    >
      <div className="rail-top">
        <Link href="/studio" className="brand" aria-label="rancang-ai — studio">
          <span className="brand-mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M3 14.5V3.5h6.2a3.4 3.4 0 0 1 0 6.8H3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9.4 10.3 14.6 14.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </span>
          <span className="brand-word">
            rancang-ai
            <small>spec studio</small>
          </span>
        </Link>

        <button
          type="button"
          className="rail-toggle"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="rail-nav"
          aria-label={collapsed ? 'Lebarkan menu' : 'Ciutkan menu'}
          title={collapsed ? 'Lebarkan menu' : 'Ciutkan menu'}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d={collapsed ? 'M5.5 2.5 9.5 7l-4 4.5' : 'M8.5 2.5 4.5 7l4 4.5'}
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <nav id="rail-nav" ref={navRef} aria-label="Navigasi utama">
        {NAV.map((item) => {
          const on = isOn(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${on ? ' on' : ''}`}
              aria-current={on ? 'page' : undefined}
              aria-label={item.label}
              title={collapsed ? `${item.label} — ${item.hint}` : item.hint}
            >
              <span className="glyph" aria-hidden="true">
                <Glyph name={item.icon} />
              </span>
              <span className="nav-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <footer className="rail-foot">
        <span className="mono ver">local · v0.1.3</span>
        <button
          type="button"
          className="signout"
          onClick={() => void signOut()}
          disabled={signingOut}
          aria-label="Keluar dari akun"
          title={collapsed ? 'Keluar' : undefined}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M9 2.5H3.5v9H9M6.5 7h6M10 4.6 12.4 7 10 9.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="nav-label">{signingOut ? 'keluar…' : 'Keluar'}</span>
        </button>
      </footer>
    </aside>
  );
}
