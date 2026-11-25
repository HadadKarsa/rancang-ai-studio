import { redirect } from 'next/navigation';

export default async function LegacyDocumentRedirect({
  params,
}: {
  params: Promise<{ projectId: string; type: string }>;
}) {
  const { projectId, type } = await params;
  redirect(`/projects/${projectId}?mode=documents&doc=${encodeURIComponent(type)}`);
}
