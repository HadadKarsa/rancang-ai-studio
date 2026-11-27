import { z } from 'zod';
import { withRoute, parseJson } from '@/lib/api/middleware';
import { createCredential, listCredentialsForUser, deleteCredential, deactivateCredential, updateCredentialValidation } from '@/lib/db/repositories/credentials';
import { encryptKey, decryptKey } from '@/lib/crypto/keys';
import { testProviderConnection } from '@/lib/llm/registry';
import { normalizeModelList } from '@/lib/llm/credentialBinding';
import { CONNECTION_PROVIDERS } from '@/lib/llm/catalog';
import { ValidationError, NotFoundError, ProviderKeyInvalidError, ForbiddenError } from '@/lib/errors';
import { getCredentialRowForUser } from '@/lib/db/repositories/credentials';

const createSchema = z.object({
  provider: z.enum(CONNECTION_PROVIDERS),
  label: z.string().min(1).max(80),
  apiKey: z.string().min(8).max(400),
  baseUrl: z.string().url().max(300).nullable().optional(),
  /** Model ids the client already knows; the test call below fills this in when it runs. */
  cachedModels: z.array(z.string().max(200)).max(500).nullable().optional(),
  /** Validate against the provider before storing. Default true. */
  test: z.boolean().optional(),
});

export const GET = withRoute(async (ctx) => {
  if (ctx.session.user.role !== 'owner') {
    return Response.json({ credentials: [] });
  }
  const credentials = await listCredentialsForUser(ctx.session.user.id);
  return Response.json({ credentials });
}, { bucket: 'read' });

export const POST = withRoute(async (ctx) => {
  if (ctx.session.user.role !== 'owner') {
    throw new ForbiddenError('Hanya admin yang dapat mengelola koneksi bawaan server');
  }
  const body = await parseJson<unknown>(ctx.req);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid credential payload', parsed.error.flatten());
  const input = parsed.data;

  // Optional live validation before persisting. Its model list is the seed for
  // cached_models_json, so a later form can offer models without the key again.
  let testedModels: string[] | null = null;
  if (input.test !== false) {
    const test = await testProviderConnection({ provider: input.provider, apiKey: input.apiKey, baseUrl: input.baseUrl ?? null });
    if (!test.ok) throw new ProviderKeyInvalidError(`${input.provider}: ${test.reason}`);
    testedModels = normalizeModelList(test.models);
  }

  const enc = encryptKey(input.apiKey);
  const credential = await createCredential({
    userId: ctx.session.user.id,
    provider: input.provider,
    label: input.label,
    encryptedKeyB64: enc.encryptedKeyB64,
    keyIvB64: enc.keyIvB64,
    keyTagB64: enc.keyTagB64,
    keyLast4: input.apiKey.slice(-4),
    baseUrl: input.baseUrl ?? null,
    // A client-supplied list is only trusted when the test did not run; it is
    // still normalized so a junk entry cannot reach the column.
    cachedModels: testedModels ?? (input.cachedModels ? normalizeModelList(input.cachedModels) : null),
  });
  return Response.json({ credential }, { status: 201 });
}, { bucket: 'provider_test', idempotent: true });

const deleteSchema = z.object({
  mode: z.enum(['soft', 'hard']).optional(),
});

export const DELETE = withRoute(async (ctx) => {
  if (ctx.session.user.role !== 'owner') {
    throw new ForbiddenError('Hanya admin yang dapat mengelola koneksi bawaan server');
  }
  const url = new URL(ctx.req.url);
  const credentialId = url.searchParams.get('id');
  if (!credentialId) throw new ValidationError('Missing ?id=');

  const row = await getCredentialRowForUser(credentialId, ctx.session.user.id);
  if (!row) throw new NotFoundError('Credential not found');

  const mode = url.searchParams.get('mode') === 'hard' ? 'hard' : 'soft';
  if (mode === 'hard') {
    await deleteCredential(credentialId, ctx.session.user.id);
    return Response.json({ deleted: true, mode });
  }
  await deactivateCredential(credentialId, ctx.session.user.id);
  return Response.json({ deactivated: true });
}, { bucket: 'write' });

export const dynamic = 'force-dynamic';

