import { withRoute } from '@/lib/api/middleware';
import { deleteLibraryItem, getLibraryItem } from '@/lib/db/repositories/library';
import { NotFoundError } from '@/lib/errors';

/** DELETE /api/v1/library/:id */
export const DELETE = withRoute(async (ctx) => {
  const id = ctx.params.get('id');
  const existing = await getLibraryItem(id, ctx.session.user.id);
  if (!existing) throw new NotFoundError('Library item not found');
  await deleteLibraryItem(id, ctx.session.user.id);
  return new Response(null, { status: 204 });
}, { bucket: 'write' });

export const dynamic = 'force-dynamic';
