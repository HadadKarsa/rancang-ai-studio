import { Rail } from '@/components/Rail';

/**
 * The signed-in shell: rail on the left, content on the right.
 * The only place the shell is defined — every authenticated route group
 * mounts this, and the public routes (/, /login, /register, /share) mount
 * nothing at all so they stay clean.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <Rail />
      <main className="content">{children}</main>
    </div>
  );
}
