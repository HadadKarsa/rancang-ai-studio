import { z } from 'zod';
import { withRoute, parseJson } from '@/lib/api/middleware';
import { testProviderConnection } from '@/lib/llm/registry';
import { getActiveCredentialForProvider, getCredentialRowForUser } from '@/lib/db/repositories/credentials';
import { decryptKey } from '@/lib/crypto/keys';
import { PROVIDER_CATALOG } from '@/lib/llm/catalog';
import { ValidationError } from '@/lib/errors';

/**
 * POST /api/v1/providers/test — validate a key and list available models.
 * Accepts either a raw key (the settings form's "Test connection" button,
 * nothing is persisted) or, with no key at all, tests the credential already
 * saved for that provider (subscription mode / re-testing a stored one).
 */
const testSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google', 'groq', 'openrouter', 'ollama', 'custom']),
  apiKey: z.string().min(1).max(400).optional(),
  credentialId: z.string().max(100).optional(),
  baseUrl: z.string().max(500).optional(),
});

export const POST = withRoute(async (ctx) => {
  const userId = ctx.session.user.id;
  const body = await parseJson<unknown>(ctx.req);
  const parsed = testSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid test payload', parsed.error.flatten());
  const input = parsed.data;

  // No key in the body means "test with the credential already saved for this
  // provider". That credential owns its base URL (Ollama, a custom
  // OpenAI-compatible endpoint); testing without it would hit the provider
  // default instead and fail for a reason the user cannot see.
  let apiKey = input.apiKey;
  let storedBaseUrl: string | null = null;
  if (!apiKey) {
    const row = input.credentialId
      ? await getCredentialRowForUser(input.credentialId, userId)
      : await getActiveCredentialForProvider(userId, input.provider);
    if (!row || row.is_active !== 1) throw new ValidationError('Provide apiKey or credentialId');
    apiKey = decryptKey({
      encryptedKeyB64: row.encrypted_key_b64,
      keyIvB64: row.key_iv_b64,
      keyTagB64: row.key_tag_b64,
    });
    storedBaseUrl = row.base_url ?? null;
  }
  if (!apiKey) throw new ValidationError('Provide apiKey or credentialId');

  const result = await testProviderConnection({
    provider: input.provider,
    apiKey,
    baseUrl: input.baseUrl ?? storedBaseUrl,
  });
  return Response.json(result, { status: result.ok ? 200 : 422 });
}, { bucket: 'provider_test' });

/** GET — provider catalog for the settings form (one form, subscription or BYOK). */
export const GET = withRoute(async () => Response.json({ providers: PROVIDER_CATALOG }), { bucket: 'read' });

export const dynamic = 'force-dynamic';
