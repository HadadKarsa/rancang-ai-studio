import { z } from 'zod';
import { withRoute } from '@/lib/api/middleware';
import { assertProjectOwnership } from '@/lib/services/interview';
import { startBatch } from '@/lib/services/batchRunner';
import { resolveGenerationOrder } from '@/lib/services/orchestrator';
import { ConflictError, ValidationError } from '@/lib/errors';
import { isDocumentType } from '@/lib/documents/types';
import type { DocumentType } from '@/lib/db/enums';
import { parseOutputLanguage, parseRuntimeModelOverride } from '@/lib/llm/runtimeOverride';

const bodySchema = z.object({
  presetId: z.string().optional(),
  apiKey: z.string().min(8).max(400).optional(),
  /** Deprecated: wireframe is opt-in now. Accepted so old clients keep working. */
  skipWireframe: z.boolean().optional(),
  /** Explicit core document selection. */
  types: z.array(z.string()).optional(),
});

/**
 * POST /api/v1/projects/:projectId/documents/generate-all
 *
 * Starts the batch and returns 202 immediately. The work is owned by the
 * server (lib/services/batchRunner.ts), not by this request: it keeps running
 * whatever the caller does next. Progress is watched on
 * GET .../documents/generate-stream (which replays a snapshot) or read from
 * GET .../documents.
 *
 * One batch per project: a second start while one is running gets 409, whether
 * it comes from this endpoint or from a stream attach.
 *
 * Defaults to the six core documents.
 */
export const POST = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  const userId = ctx.session.user.id;
  await assertProjectOwnership(userId, projectId);

  let input: z.infer<typeof bodySchema> = {};
  const text = await ctx.req.text();
  if (text.length > 0) {
    const parsed = bodySchema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
    input = parsed.data;
  }

  let types: DocumentType[] | undefined;
  if (input.types && input.types.length > 0) {
    const out: DocumentType[] = [];
    for (const t of input.types) {
      if (t === 'all') { out.push('prd', 'architecture', 'database', 'api', 'tasks', 'memory'); continue; }
      if (!isDocumentType(t) || t === 'wireframe') throw new ValidationError(`Unknown document type: ${t}`, { type: t });
      out.push(t);
    }
    types = out;
  }

  const runtimeOverride = parseRuntimeModelOverride(ctx.req);
  const outputLanguage = parseOutputLanguage(ctx.req);
  const started = startBatch({
    userId, projectId, types, presetId: input.presetId, ephemeralKey: input.apiKey, runtimeOverride, outputLanguage,
  });
  if (started === 'already-running') {
    throw new ConflictError('Pembuatan dokumen sedang berjalan untuk proyek ini', { projectId });
  }

  const order = resolveGenerationOrder({ types });
  console.log(`[${ctx.requestId}] generate-all start project=${projectId} user=${userId} order=${order.join(',')}`);

  return Response.json({ started: true, order }, { status: 202 });
}, { bucket: 'generate' });

export const maxDuration = 300;
export const dynamic = 'force-dynamic';