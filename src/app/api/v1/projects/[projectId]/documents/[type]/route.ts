import { z } from 'zod';
import { withRoute, parseJson } from '@/lib/api/middleware';
import { streamDocumentGeneration } from '@/lib/services/generation';
import { assertProjectOwnership } from '@/lib/services/interview';
import { getDocumentByType, listDocuments, listVersions, getCurrentVersion, setDocumentLock, createVersionSnapshot, setDocumentStatus } from '@/lib/db/repositories/documents';
import { ValidationError, NotFoundError, DocumentNotFoundError, DocumentLockedError } from '@/lib/errors';
import { isDocumentType } from '@/lib/documents/types';


const generateSchema = z.object({
  presetId: z.string().optional(),
  instructions: z.string().max(4000).optional(),
  /** Session-only key — accepted but never persisted (04_API §3.9). */
  apiKey: z.string().min(8).max(400).optional(),
});

/**
 * POST /api/v1/projects/:projectId/documents/:type — stream generation.
 * Response: SSE data stream (Vercel AI SDK data-stream protocol).
 */
export const POST = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  const type = ctx.params.get('type');
  if (!isDocumentType(type) || type === 'wireframe') throw new DocumentNotFoundError(type);
  await assertProjectOwnership(ctx.session.user.id, projectId);

  let input: z.infer<typeof generateSchema> = {};
  const text = await ctx.req.text();
  if (text.length > 0) {
    const parsed = generateSchema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
    input = parsed.data;
  }

  const result = await streamDocumentGeneration({
    userId: ctx.session.user.id,
    projectId,
    documentType: type,
    presetId: input.presetId,
    instructions: input.instructions,
    ephemeralKey: input.apiKey,
    abortSignal: ctx.req.signal,
  });

  return result.toTextStreamResponse();
}, { bucket: 'generate' });

/** GET — document metadata (+ ?content=1 for current markdown, ?versions=1 for history). */
export const GET = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  const type = ctx.params.get('type');
  if (!isDocumentType(type)) throw new DocumentNotFoundError(type);
  await assertProjectOwnership(ctx.session.user.id, projectId);

  const doc = await getDocumentByType(projectId, type);
  if (!doc) throw new NotFoundError(`Document ${type} not found`);

  const url = new URL(ctx.req.url);
  const wantContent = url.searchParams.get('content') === '1';
  const wantVersions = url.searchParams.get('versions') === '1';

  const [current, versions] = await Promise.all([
    wantContent ? getCurrentVersion(doc.id) : Promise.resolve(null),
    wantVersions ? listVersions(doc.id) : Promise.resolve([]),
  ]);

  return Response.json({ document: doc, content: current?.contentMd ?? null, versions });
}, { bucket: 'read' });

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  isLocked: z.boolean().optional(),
});

/** PATCH — rename or lock/unlock. */
export const PATCH = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  const type = ctx.params.get('type');
  if (!isDocumentType(type)) throw new DocumentNotFoundError(type);
  await assertProjectOwnership(ctx.session.user.id, projectId);

  const body = await parseJson<unknown>(ctx.req);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid patch', parsed.error.flatten());

  const doc = await getDocumentByType(projectId, type);
  if (!doc) throw new NotFoundError(`Document ${type} not found`);
  if (parsed.data.isLocked !== undefined) await setDocumentLock(doc.id, parsed.data.isLocked);

  return Response.json({ document: await getDocumentByType(projectId, type) });
}, { bucket: 'write' });

const editSchema = z.object({
  contentMd: z.string().min(1).max(500_000),
  changeSummary: z.string().max(200).optional(),
});

/** PUT — save inline manual edit as a new document version. */
export const PUT = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  const type = ctx.params.get('type');
  if (!isDocumentType(type)) throw new DocumentNotFoundError(type);
  await assertProjectOwnership(ctx.session.user.id, projectId);

  const body = await parseJson<unknown>(ctx.req, 1024 * 1024);
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid document content', parsed.error.flatten());

  const doc = await getDocumentByType(projectId, type);
  if (!doc) throw new NotFoundError(`Document ${type} not found`);
  if (doc.isLocked) throw new DocumentLockedError();

  const version = await createVersionSnapshot({
    documentId: doc.id,
    contentMd: parsed.data.contentMd,
    source: 'manual_edit',
    changeSummary: parsed.data.changeSummary?.trim() || 'Suntingan manual',
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

// Version endpoints live in ./versions/route.ts
