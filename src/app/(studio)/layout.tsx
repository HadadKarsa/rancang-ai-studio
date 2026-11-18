import { Rail } from '@/components/Rail';

/** Authenticated shell: rail on the left, content on the right. */
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <Rail />
      <main className="content">{children}</main>
      <style jsx global>{`
        .shell { display: flex; min-height: 100vh; }
        .content { flex: 1; min-width: 0; padding: 40px 48px; }
        @media (max-width: 720px) {
          .shell { flex-direction: column; }
          .rail { min-height: 0 !important; border-right: none; border-bottom: 1.5px solid var(--line); flex-direction: row !important; align-items: center; padding: 14px 20px !important; gap: 18px !important; }
          .rail nav { flex-direction: row !important; }
          .rail footer { display: none; }
          .content { padding: 24px 20px; }
        }
      `}</style>
    </div>
  );
}
