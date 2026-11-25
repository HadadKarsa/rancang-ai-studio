import { redirect } from 'next/navigation';

export default async function LegacyInterviewRedirect({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}?mode=interview`);
}
