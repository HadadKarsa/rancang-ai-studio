import { AppShell } from '@/components/AppShell';

/** Library sits inside the authenticated shell. */
export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
