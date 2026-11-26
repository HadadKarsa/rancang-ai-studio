import { z } from 'zod';
import { withRoute, parseJson } from '@/lib/api/middleware';
import { testProviderConnection } from '@/lib/llm/registry';
import { getActiveCredentialForProvider, getCredentialRowForUser, updateCredentialCachedModels } from '@/lib/db/repositories/credentials';
import { decryptKey } from '@/lib/crypto/keys';
import { PROVIDER_CATALOG, supportsNewConnection } from '@/lib/llm/catalog';
import { bindToStoredCredential, normalizeModelList } from '@/lib/llm/credentialBinding';
import { PROVIDERS, type ProviderId } from '@/lib/db/enums';
import { ValidationError } from '@/lib/errors';

/**
 * POST /api/v1/providers/test — validate a key and list available models.
 * Accepts either a raw key (the settings form's "Test connection" button,
 * nothing is persisted) or, with no key at all, tests the credential already
 * saved for that provider.
 *
 * A stored credential is tested against its OWN provider and endpoint. The
 * request may not redirect it: a provider or base URL that disagrees with the
 * row is rejected before the key is decrypted or any socket is opened.
 */
const testSchema = z.object({
  provider: z.enum(PROVIDERS as unknown as [ProviderId, ...ProviderId[]]),
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
  if (input.apiKey && !supportsNewConnection(input.provider)) {
    throw new ValidationError('New connections require an OpenAI-compatible provider');
  }

  // No key in the body means "test with the credential already saved for this
  // provider". That credential owns its base URL (Ollama, a custom
  // OpenAI-compatible endpoint); testing without it would hit the provider
  // default instead and fail for a reason the user cannot see.
  let apiKey = input.apiKey;
  let testProvider: ProviderId = input.provider;
  let testBaseUrl: string | null = input.baseUrl ?? null;
  /** Set only when the test ran against a stored credential — the row to cache onto. */
  let storedCredentialId: string | null = null;

  if (input.credentialId || !apiKey) {
    if (input.credentialId && apiKey) {
      throw new ValidationError('Send either apiKey or credentialId, not both');
    }
    const row = input.credentialId
      ? await getCredentialRowForUser(input.credentialId, userId)
      : await getActiveCredentialForProvider(userId, input.provider);
    if (!row || row.is_active !== 1) throw new ValidationError('Provide apiKey or credentialId');

    // Ownership is already enforced by both lookups above; this only decides
    // which provider and endpoint the stored key may be sent to.
    const binding = bindToStoredCredential(
      { provider: row.provider, baseUrl: row.base_url ?? null },
      { provider: input.provider, baseUrl: input.baseUrl },
    );
    if (!binding.ok) throw new ValidationError(binding.reason);

    apiKey = decryptKey({
      encryptedKeyB64: row.encrypted_key_b64,
      keyIvB64: row.key_iv_b64,
      keyTagB64: row.key_tag_b64,
    });
    testProvider = binding.provider;
    testBaseUrl = binding.baseUrl;
    storedCredentialId = row.id;
  }
  if (!apiKey) throw new ValidationError('Provide apiKey or credentialId');

  const result = await testProviderConnection({
    provider: testProvider,
    apiKey,
    baseUrl: testBaseUrl,
  });
  // A raw key in the body is never persisted, so there is no row to cache onto.
  if (result.ok) {
    const models = normalizeModelList(result.models);
    if (storedCredentialId) {
      await updateCredentialCachedModels(storedCredentialId, userId, models);
      return Response.json({ ok: true, models, credentialId: storedCredentialId }, { status: 200 });
    }
    return Response.json({ ok: true, models }, { status: 200 });
  }
  return Response.json(result, { status: 422 });
}, { bucket: 'provider_test' });

export const GET = withRoute(async () => Response.json({ providers: PROVIDER_CATALOG.filter((p) => supportsNewConnection(p.id)) }), { bucket: 'read' });

export const dynamic = 'force-dynamic';
