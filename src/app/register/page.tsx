import { RegisterForm } from '@/components/auth/RegisterForm';
import { isGoogleOAuthConfigured, sanitizeReturnTo } from '@/lib/auth/google';

export const dynamic = 'force-dynamic';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const googleEnabled = isGoogleOAuthConfigured();
  const nextPath = sanitizeReturnTo(params.next);
  return <RegisterForm googleEnabled={googleEnabled} nextPath={nextPath} />;
}
