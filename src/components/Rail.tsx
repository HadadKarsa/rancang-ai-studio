'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client/api';

const NAV = [
  { href: '/studio', label: 'Studio' },
  { href: '/library', label: 'Library' },
  { href: '/models', label: 'Models' },
];

/** App rail — friendly workbench nav. Studio is the home of the app. */
export function Rail() {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

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

  return (
    <aside className="pg-rail rail">
      <Link href="/studio" className="brand">
        rancang.ai
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
      <footer className="mono muted rail-foot">
        <span>local · v0.1.2</span>
        <button type="button" className="signout" onClick={() => void signOut()} disabled={signingOut}>
          {signingOut ? 'keluar…' : 'Keluar'}
        </button>
      </footer>
    </aside>
  );
}
