'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/studio', label: 'Studio' },
  { href: '/models', label: 'Models' },
];

/** App rail — friendly workbench nav. Studio is the home of the app. */
export function Rail() {
  const pathname = usePathname();
  return (
    <aside className="rail">
      <Link href="/studio" className="brand">
        rancang-ai
        <small>spec studio</small>
      </Link>
      <nav>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={pathname.startsWith(item.href) ? 'on' : ''}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <footer className="mono muted">
        local · v1.0.0
      </footer>
      <style jsx>{`
        .rail {
          display: flex;
          flex-direction: column;
          gap: 28px;
          padding: 28px 24px;
          border-right: 1.5px solid var(--line);
          min-height: 100vh;
        }
        .brand {
          font-size: 21px;
          font-weight: 800;
          letter-spacing: -0.02em;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .brand small {
          font: 600 10px var(--mono);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-3);
        }
        nav { display: flex; flex-direction: column; gap: 4px; }
        nav a {
          padding: 9px 14px;
          border-radius: 10px;
          font-weight: 600;
          font-size: 14.5px;
          color: var(--ink-2);
        }
        nav a:hover { background: var(--card); color: var(--ink); }
        nav a.on { background: var(--ink); color: var(--paper); }
        footer { margin-top: auto; font-size: 11px; }
      `}</style>
    </aside>
  );
}
