import { Suspense } from 'react';
import { ProjectWorkspace } from '@/components/workspace/ProjectWorkspace';

export default function ProjectPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
          <div className="h-24 rounded-2xl border border-line bg-surface animate-pulse" />
        </div>
      }
    >
      <ProjectWorkspace />
    </Suspense>
  );
}
