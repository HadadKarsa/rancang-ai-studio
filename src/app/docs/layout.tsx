import { AppShell } from '@/components/AppShell';

/** The manual is part of the app, so it keeps the rail. */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
