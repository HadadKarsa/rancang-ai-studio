import { Rail } from '@/components/Rail';

/** Authenticated shell: rail on the left, content on the right. */
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <Rail />
      <main className="content">{children}</main>    </div>
  );
}
