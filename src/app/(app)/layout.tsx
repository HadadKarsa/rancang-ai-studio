import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { getSession } from '@/lib/auth/session';

/**
 * Single shared shell for every in-app page so sidebar/topbar never remount across navigations.
 * Enforces server-side auth fail-closed in AUTH_MODE=cloud (redirects unauthenticated visitors to /login).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  return <AppShell initialUser={session.user}>{children}</AppShell>;
}
