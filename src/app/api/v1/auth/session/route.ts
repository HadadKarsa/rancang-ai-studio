import { withRoute } from '@/lib/api/middleware';

/** GET /api/v1/auth/session — the current user, or 401. */
export const GET = withRoute(async (ctx) => {
  return Response.json({ user: ctx.session.user });
}, { bucket: 'read' });

export const dynamic = 'force-dynamic';
