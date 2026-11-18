import { z } from 'zod';
import { withRoute, parseJson } from '@/lib/api/middleware';
import { streamDocumentGeneration } from '@/lib/services/generation';
import { assertProjectOwnership } from '@/lib/services/interview';
import { getDocumentByType, listDocuments, listVersions, getCurrentVersion, setDocumentLock, getVersionById, deleteVersion } from '@/lib/db/repositories/documents';
import { ValidationError, NotFoundError, DocumentNotFoundError } from '@/lib/errors';
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
  if (!isDocumentType(type)) throw new DocumentNotFoundError(type);
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

export const dynamic = 'force-dynamic';

// Version endpoints live in ./versions/route.ts
