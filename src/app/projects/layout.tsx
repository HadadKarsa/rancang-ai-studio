import { AppShell } from '@/components/AppShell';

/** Every project page (interview, write, documents) keeps the rail. */
export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
