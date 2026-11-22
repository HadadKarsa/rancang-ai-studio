import { AppShell } from '@/components/AppShell';

/** Authenticated shell for the studio route group. */
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
