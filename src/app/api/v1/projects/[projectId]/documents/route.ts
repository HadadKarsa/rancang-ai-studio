import { withRoute } from '@/lib/api/middleware';
import { assertProjectOwnership } from '@/lib/services/interview';
import { listDocuments, listCurrentVersionsForProject, repairStaleDocumentStatuses } from '@/lib/db/repositories/documents';

/**
 * GET /api/v1/projects/:projectId/documents
 * Lightweight status list for the whole project — what the UI polls while a
 * batch generation runs in the background (POST .../documents/generate-all).
 * Deliberately excludes content: only what a progress view needs.
 *
 * Response: { documents: [{ type, status, hasContent, version, updatedAt }] }
 * in generation order (order_index). version is 0 when no version exists yet.
 */
export const GET = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  await assertProjectOwnership(ctx.session.user.id, projectId);

  // Self-heal before reading: a cancelled or interrupted batch can leave a
  // document `pending`/`generating` while its text is already stored, which
  // reads as "the document never arrived".
  const repaired = await repairStaleDocumentStatuses(projectId);
  if (repaired > 0) console.log(`[documents] repaired ${repaired} stale status(es) project=${projectId}`);

  const [docs, current] = await Promise.all([
    listDocuments(projectId),
    listCurrentVersionsForProject(projectId),
  ]);

  return Response.json({
    documents: docs.map((d) => {
      const head = current.get(d.type);
      return {
        type: d.type,
        status: d.status,
        hasContent: d.currentVersionId !== null,
        version: head?.versionNumber ?? 0,
        updatedAt: d.updatedAt,
      };
    }),
  });
}, { bucket: 'read' });

export const dynamic = 'force-dynamic';