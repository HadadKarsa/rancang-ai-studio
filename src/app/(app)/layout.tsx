import { AppShell } from '@/components/AppShell';

/** Single shared shell for every in-app page so sidebar/topbar never remount across navigations. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
