import { z } from 'zod';
import { withRoute, parseJson } from '@/lib/api/middleware';
import { assertProjectOwnership } from '@/lib/services/interview';
import { generateAllDocuments } from '@/lib/services/orchestrator';
import { ValidationError } from '@/lib/errors';


const bodySchema = z.object({
  presetId: z.string().optional(),
  apiKey: z.string().min(8).max(400).optional(),
  skipWireframe: z.boolean().optional(),
});

/**
 * POST /api/v1/projects/:projectId/documents/generate-all
 * Batch generation, sequential with dependency context. Returns the batch
 * result when done (long request; the UI shows per-document status via GET).
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

  const result = await generateAllDocuments({
    userId: ctx.session.user.id,
    projectId,
    presetId: input.presetId,
    ephemeralKey: input.apiKey,
    skipWireframe: input.skipWireframe,
  });
  return Response.json(result);
}, { bucket: 'generate' });

export const maxDuration = 300;
export const dynamic = 'force-dynamic';
