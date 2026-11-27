import { withRoute } from '@/lib/api/middleware';
import { getEnv } from '@/lib/env';
import { isGoogleOAuthConfigured } from '@/lib/auth/google';

/**
 * GET /api/v1/auth/providers (v0.2.6)
 * Public capability metadata for login/register UI (never exposes secrets).
 */
export const GET = withRoute(async () => {
  const env = getEnv();
  return Response.json(
    {
      googleEnabled: isGoogleOAuthConfigured(),
      authMode: env.AUTH_MODE,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}, { bucket: 'read', public: true });

export const dynamic = 'force-dynamic';
