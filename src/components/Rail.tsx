'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/studio', label: 'Studio' },
  { href: '/library', label: 'Library' },
  { href: '/models', label: 'Models' },
];

/** App rail — friendly workbench nav. Studio is the home of the app. */
export function Rail() {
  const pathname = usePathname();
  return (
    <aside className="pg-rail rail">
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
        local · v0.1.2
      </footer>
    </aside>
  );
}
