import { Rail } from '@/components/Rail';

/** Library sits inside the authenticated shell: rail on the left, content on the right. */
export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <Rail />
      <main className="content">{children}</main>
    </div>
  );
}
