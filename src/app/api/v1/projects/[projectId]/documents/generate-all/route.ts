import { z } from 'zod';
import { withRoute } from '@/lib/api/middleware';
import { assertProjectOwnership } from '@/lib/services/interview';
import { generateAllDocuments, type BatchResult } from '@/lib/services/orchestrator';
import { ConflictError, ValidationError } from '@/lib/errors';


const bodySchema = z.object({
  presetId: z.string().optional(),
  apiKey: z.string().min(8).max(400).optional(),
  skipWireframe: z.boolean().optional(),
});

/**
 * Projects with a batch currently running in this process. A second POST for the
 * same project gets 409 instead of starting a duplicate batch (which would
 * double the provider spend and race on document versions). Released in
 * `finally` so a throw cannot wedge the project forever.
 */
const inFlight = new Set<string>();

/**
 * POST /api/v1/projects/:projectId/documents/generate-all
 * Starts the batch and returns 202 immediately — the work runs detached, since
 * the batch takes tens of seconds and a proxy in front of the app will drop a
 * long-held request. Progress is read from GET .../documents.
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

  if (inFlight.has(projectId)) {
    throw new ConflictError('Pembuatan dokumen sedang berjalan');
  }
  inFlight.add(projectId);

  const { requestId } = ctx;
  const userId = ctx.session.user.id;
  console.log(`[${requestId}] generate-all start project=${projectId} user=${userId}`);

  void generateAllDocuments({
    userId,
    projectId,
    presetId: input.presetId,
    ephemeralKey: input.apiKey,
    skipWireframe: input.skipWireframe,
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
      inFlight.delete(projectId);
    });

  return Response.json({ started: true }, { status: 202 });
}, { bucket: 'generate' });

export const maxDuration = 300;
export const dynamic = 'force-dynamic';
