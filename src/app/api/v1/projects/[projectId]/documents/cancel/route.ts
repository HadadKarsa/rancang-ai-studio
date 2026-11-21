import { withRoute } from '@/lib/api/middleware';
import { assertProjectOwnership } from '@/lib/services/interview';
import { cancelBatch } from '@/lib/services/batchRunner';
import { NotFoundError } from '@/lib/errors';

/**
 * POST /api/v1/projects/:projectId/documents/cancel
 *
 * Stops the server-owned batch for this project. The runner aborts, the
 * document being written keeps its partial text (saved as a version) and is
 * marked `failed`, and the batch finishes with what it has.
 *
 * 200 {"cancelled":true}  — it was running and is now stopping.
 * 404                     — nothing was running (Indonesian message).
 */
export const POST = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  await assertProjectOwnership(ctx.session.user.id, projectId);

  if (!cancelBatch(projectId)) {
    throw new NotFoundError('Tidak ada pembuatan dokumen yang sedang berjalan untuk proyek ini');
  }

  console.log(`[${ctx.requestId}] generate-cancel project=${projectId}`);
  return Response.json({ cancelled: true }, { status: 200 });
}, { bucket: 'write' });

export const dynamic = 'force-dynamic';