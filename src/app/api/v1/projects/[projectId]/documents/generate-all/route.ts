import { z } from 'zod';
import { withRoute } from '@/lib/api/middleware';
import { assertProjectOwnership } from '@/lib/services/interview';
import {
  generateAllDocuments, beginBatch, endBatch, resolveGenerationOrder,
  type BatchResult,
} from '@/lib/services/orchestrator';
import { ConflictError, ValidationError } from '@/lib/errors';
import { isDocumentType } from '@/lib/documents/types';
import type { DocumentType } from '@/lib/db/enums';

const bodySchema = z.object({
  presetId: z.string().optional(),
  apiKey: z.string().min(8).max(400).optional(),
  /** Deprecated: wireframe is opt-in now. Accepted so old clients keep working. */
  skipWireframe: z.boolean().optional(),
  /** Explicit document selection. Wireframe is only written when named here. */
  types: z.array(z.string()).optional(),
});

/**
 * POST /api/v1/projects/:projectId/documents/generate-all
 *
 * Starts the batch and returns 202 immediately — the work runs detached, since
 * the batch takes tens of seconds and a proxy in front of the app will drop a
 * long-held request. Progress is read from GET .../documents.
 *
 * Defaults to the six core documents and stops before wireframe; pass
 * `types: ["wireframe"]` to write the wireframe.
 */
export const POST = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  await assertProjectOwnership(ctx.session.user.id, projectId);

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
      if (t === 'all') { out.push('prd', 'architecture', 'database', 'api', 'tasks', 'memory', 'wireframe'); continue; }
      if (!isDocumentType(t)) throw new ValidationError(`Unknown document type: ${t}`, { type: t });
      out.push(t);
    }
    types = out;
  }

  if (!beginBatch(projectId)) {
    throw new ConflictError('Pembuatan dokumen sedang berjalan untuk proyek ini', { projectId });
  }

  const { requestId } = ctx;
  const userId = ctx.session.user.id;
  const order = resolveGenerationOrder({ types });
  console.log(`[${requestId}] generate-all start project=${projectId} user=${userId} order=${order.join(',')}`);

  void generateAllDocuments({
    userId,
    projectId,
    presetId: input.presetId,
    ephemeralKey: input.apiKey,
    types,
  })
    .then((result: BatchResult) => {
      console.log(
        `[${requestId}] generate-all done project=${projectId} generated=${result.generated.join(',') || '-'}` +
        ` failed=${result.failed.length} skipped=${result.skipped.join(',') || '-'}`,
      );
      for (const f of result.failed) {
        console.error(`[${requestId}] generate-all document failed project=${projectId} type=${f.type} error=${f.error}`);
      }
    })
    .catch((e: unknown) => {
      console.error(`[${requestId}] generate-all failed project=${projectId}`, e);
    })
    .finally(() => {
      endBatch(projectId);
    });

  return Response.json({ started: true, order }, { status: 202 });
}, { bucket: 'generate' });

export const maxDuration = 300;
export const dynamic = 'force-dynamic';