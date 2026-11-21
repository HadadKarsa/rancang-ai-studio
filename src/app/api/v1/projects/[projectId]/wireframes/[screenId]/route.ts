import { z } from 'zod';
import { withRoute, parseJson } from '@/lib/api/middleware';
import { assertProjectOwnership } from '@/lib/services/interview';
import { getScreenById, updateScreen } from '@/lib/db/repositories/wireframes';
import { NotFoundError, PayloadTooLargeError, ValidationError } from '@/lib/errors';

const MAX_BYTES = 512 * 1024;

const patchSchema = z.object({
  htmlContent: z.string(),
  name: z.string().min(1).max(120).optional(),
  viewport: z.enum(['mobile', 'tablet', 'desktop']).optional(),
});

/** PATCH /api/v1/projects/:projectId/wireframes/:screenId — save the edited HTML. */
export const PATCH = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  const screenId = ctx.params.get('screenId');
  await assertProjectOwnership(ctx.session.user.id, projectId);

  const body = await parseJson<unknown>(ctx.req, MAX_BYTES + 16 * 1024);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid wireframe patch', parsed.error.flatten());
  if (Buffer.byteLength(parsed.data.htmlContent, 'utf8') > MAX_BYTES) {
    throw new PayloadTooLargeError('Wireframe HTML exceeds 512 KB');
  }

  const existing = await getScreenById(screenId, projectId);
  if (!existing) throw new NotFoundError('Wireframe screen not found');

  await updateScreen(screenId, projectId, {
    htmlContent: parsed.data.htmlContent,
    name: parsed.data.name,
    viewport: parsed.data.viewport,
  });
  const screen = await getScreenById(screenId, projectId);
  return Response.json({
    screen: screen && {
      id: screen.id,
      name: screen.name,
      slug: screen.slug,
      htmlContent: screen.htmlContent,
      viewport: screen.viewport,
      orderIndex: screen.orderIndex,
      isEntry: screen.isEntry,
    },
  });
}, { bucket: 'write' });

export const dynamic = 'force-dynamic';
