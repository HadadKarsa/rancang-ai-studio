import { z } from 'zod';
import { withRoute, parseJson } from '@/lib/api/middleware';
import { assertProjectOwnership } from '@/lib/services/interview';
import {
  getDocumentByType,
  listVersions,
  getCurrentVersion,
  deleteVersion,
  getVersionById,
  createVersionSnapshot,
  setDocumentStatus,
} from '@/lib/db/repositories/documents';
import { DocumentLockedError, DocumentNotFoundError, NotFoundError, ValidationError } from '@/lib/errors';
import { isDocumentType } from '@/lib/documents/types';


/** GET — version history for a document. */
export const GET = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  const type = ctx.params.get('type');
  if (!isDocumentType(type)) throw new DocumentNotFoundError(type);
  await assertProjectOwnership(ctx.session.user.id, projectId);

  const doc = await getDocumentByType(projectId, type);
  if (!doc) throw new NotFoundError(`Document ${type} not found`);
  const versions = await listVersions(doc.id);
  const current = await getCurrentVersion(doc.id);
  return Response.json({ versions, currentVersionId: current?.id ?? null });
}, { bucket: 'read' });

const deleteSchema = z.object({ versionId: z.string().min(1) });

/** DELETE — remove a non-head version (restore flow prunes intermediates). */
export const DELETE = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  const type = ctx.params.get('type');
  if (!isDocumentType(type)) throw new DocumentNotFoundError(type);
  await assertProjectOwnership(ctx.session.user.id, projectId);

  const body = await parseJson<unknown>(ctx.req);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());

  const doc = await getDocumentByType(projectId, type);
  if (!doc) throw new NotFoundError(`Document ${type} not found`);
  if (doc.currentVersionId === parsed.data.versionId) {
    throw new ValidationError('Cannot delete the current version; restore another version first');
  }
  await deleteVersion(parsed.data.versionId);
  return Response.json({ deleted: true });
}, { bucket: 'write' });

const restoreSchema = z.object({ versionId: z.string().min(1) });

/** POST — restore a historical version by creating a new head snapshot from its content. */
export const POST = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  const type = ctx.params.get('type');
  if (!isDocumentType(type)) throw new DocumentNotFoundError(type);
  await assertProjectOwnership(ctx.session.user.id, projectId);

  const body = await parseJson<unknown>(ctx.req);
  const parsed = restoreSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());

  const doc = await getDocumentByType(projectId, type);
  if (!doc) throw new NotFoundError(`Document ${type} not found`);
  if (doc.isLocked) throw new DocumentLockedError();

  const target = await getVersionById(parsed.data.versionId);
  if (!target || target.documentId !== doc.id) {
    throw new NotFoundError('Version not found for this document');
  }

  const version = await createVersionSnapshot({
    documentId: doc.id,
    contentMd: target.contentMd,
    source: 'restore',
    changeSummary: `Dipulihkan dari v${target.versionNumber}`,
    createdByUserId: ctx.session.user.id,
  });
  await setDocumentStatus(doc.id, 'ready');

  const [updatedDoc, versions] = await Promise.all([
    getDocumentByType(projectId, type),
    listVersions(doc.id),
  ]);

  return Response.json({
    document: updatedDoc,
    version,
    content: version.contentMd,
    versions,
  });
}, { bucket: 'write' });

export const dynamic = 'force-dynamic';
