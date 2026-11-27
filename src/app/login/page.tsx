import { LoginForm } from '@/components/auth/LoginForm';
import { isGoogleOAuthConfigured, sanitizeReturnTo } from '@/lib/auth/google';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const googleEnabled = isGoogleOAuthConfigured();
  const nextPath = sanitizeReturnTo(params.next);
  return (
    <LoginForm
      googleEnabled={googleEnabled}
      initialErrorCode={params.error ?? null}
      nextPath={nextPath}
    />
  );
}
