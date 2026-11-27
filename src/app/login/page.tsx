import { LoginForm } from '@/components/auth/LoginForm';
import { isGoogleOAuthConfigured, sanitizeReturnTo } from '@/lib/auth/google';
import { getEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const env = getEnv();
  const googleEnabled = isGoogleOAuthConfigured();
  const nextPath = sanitizeReturnTo(params.next);
  return (
    <LoginForm
      googleEnabled={googleEnabled}
      authMode={env.AUTH_MODE}
      initialErrorCode={params.error ?? null}
      nextPath={nextPath}
    />
  );
}
