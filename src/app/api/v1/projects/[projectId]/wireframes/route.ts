import { withRoute } from '@/lib/api/middleware';
import { assertProjectOwnership } from '@/lib/services/interview';
import { listScreens } from '@/lib/db/repositories/wireframes';

/** GET /api/v1/projects/:projectId/wireframes — every screen with its HTML. */
export const GET = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  await assertProjectOwnership(ctx.session.user.id, projectId);
  const screens = await listScreens(projectId);
  return Response.json({
    screens: screens.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      htmlContent: s.htmlContent,
      viewport: s.viewport,
      orderIndex: s.orderIndex,
      isEntry: s.isEntry,
    })),
  });
}, { bucket: 'read' });

export const dynamic = 'force-dynamic';
