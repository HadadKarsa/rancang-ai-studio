import { withRoute } from '@/lib/api/middleware';
import { getManagedPublicConfig } from '@/lib/llm/managed';

/**
 * GET /api/v1/settings/managed (v0.2.5)
 * Returns public metadata about the Managed Rancang.ai models (never keys or private URLs)
 * plus whether the current user is the admin/owner allowed to manage them.
 */
export const GET = withRoute(async (ctx) => {
  const managed = await getManagedPublicConfig();
  return Response.json(
    {
      managed,
      isOwner: ctx.session.user.role === 'owner',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}, { bucket: 'read' });

export const dynamic = 'force-dynamic';
