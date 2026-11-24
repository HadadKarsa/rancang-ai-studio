import { withRoute } from '@/lib/api/middleware';
import { deleteLibraryItem, getLibraryItem, getLibraryPayload } from '@/lib/db/repositories/library';
import { NotFoundError } from '@/lib/errors';

/** GET /api/v1/library/:id — metadata + full payload for master-detail preview. */
export const GET = withRoute(async (ctx) => {
  const id = ctx.params.get('id');
  const item = await getLibraryItem(id, ctx.session.user.id);
  if (!item) throw new NotFoundError('Library item not found');
  const payload = await getLibraryPayload(id, ctx.session.user.id);
  return Response.json({ item, payload: payload ?? '' });
}, { bucket: 'read' });

/** DELETE /api/v1/library/:id */
export const DELETE = withRoute(async (ctx) => {
  const id = ctx.params.get('id');
  const existing = await getLibraryItem(id, ctx.session.user.id);
  if (!existing) throw new NotFoundError('Library item not found');
  await deleteLibraryItem(id, ctx.session.user.id);
  return new Response(null, { status: 204 });
}, { bucket: 'write' });

export const dynamic = 'force-dynamic';
