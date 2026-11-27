import { redirect } from 'next/navigation';

export default async function LegacyWriteRedirect({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}?mode=documents`);
}
