import { z } from 'zod';
import { withRoute, parseJson } from '@/lib/api/middleware';
import { testProviderConnection } from '@/lib/llm/registry';
import { resolveApiKey } from '@/lib/llm/credentials';
import { PROVIDER_CATALOG } from '@/lib/llm/catalog';
import { PROVIDERS, type ProviderId } from '@/lib/db/enums';
import { ValidationError } from '@/lib/errors';

/**
 * POST /api/v1/providers/test — validate a key and list available models.
 * Accepts either a raw key (the settings form's "Test connection" button,
 * nothing is persisted) or credentialId (re-test a stored key).
 */
const testSchema = z.object({
  provider: z.enum(PROVIDERS as [ProviderId, ...ProviderId[]]),
  apiKey: z.string().min(1).max(400).optional(),
  credentialId: z.string().optional(),
  baseUrl: z.string().url().max(300).nullable().optional(),
});

export const POST = withRoute(async (ctx) => {
  const body = await parseJson<unknown>(ctx.req);
  const parsed = testSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid test payload', parsed.error.flatten());
  const input = parsed.data;

  let apiKey = input.apiKey;
  if (!apiKey && input.credentialId) {
    apiKey = await resolveApiKey(ctx.session.user.id, input.provider, undefined);
  }
  if (!apiKey) throw new ValidationError('Provide apiKey or credentialId');

  const result = await testProviderConnection({ provider: input.provider, apiKey, baseUrl: input.baseUrl ?? null });
  return Response.json(result, { status: result.ok ? 200 : 422 });
}, { bucket: 'provider_test' });

/** GET — provider catalog for the settings form (one form, subscription or BYOK). */
export const GET = withRoute(async () => Response.json({ providers: PROVIDER_CATALOG }), { bucket: 'read' });

export const dynamic = 'force-dynamic';
