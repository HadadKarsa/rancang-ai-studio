import { z } from 'zod';
import { withRoute, parseJson } from '@/lib/api/middleware';
import { createPreset, listPresetsForUser, updatePreset, deletePreset, getPresetForUser } from '@/lib/db/repositories/credentials';
import { PROVIDERS, type ProviderId } from '@/lib/db/enums';
import { ValidationError, NotFoundError } from '@/lib/errors';

const createSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).nullable().optional(),
  provider: z.enum(PROVIDERS as [ProviderId, ...ProviderId[]]),
  credentialId: z.string().nullable().optional(),
  modelId: z.string().min(1).max(120),
  /** Preset-level base URL override; wins over the credential's (03_DATABASE §3.7). */
  baseUrl: z.string().url().max(300).nullable().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(256).max(32000).optional(),
  topP: z.number().min(0).max(1).optional(),
  systemPersona: z.string().max(4000).nullable().optional(),
  /** v0.2.2 Slice A — forwarded to the provider as its reasoning/thinking setting. */
  reasoningEffort: z.enum(['none', 'low', 'medium', 'high']).nullable().optional(),
  isDefault: z.boolean().optional(),
});

export const GET = withRoute(async (ctx) => {
  const presets = await listPresetsForUser(ctx.session.user.id);
  return Response.json({ presets });
}, { bucket: 'read' });

export const POST = withRoute(async (ctx) => {
  const body = await parseJson<unknown>(ctx.req);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid preset payload', parsed.error.flatten());

  const preset = await createPreset({ userId: ctx.session.user.id, ...parsed.data });
  return Response.json({ preset }, { status: 201 });
}, { bucket: 'write', idempotent: true });

const patchSchema = createSchema.partial();

export const PATCH = withRoute(async (ctx) => {
  const presetId = new URL(ctx.req.url).searchParams.get('id');
  if (!presetId) throw new ValidationError('Missing ?id=');
  const existing = await getPresetForUser(presetId, ctx.session.user.id);
  if (!existing) throw new NotFoundError('Preset not found');

  const body = await parseJson<unknown>(ctx.req);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid patch', parsed.error.flatten());

  await updatePreset(presetId, ctx.session.user.id, parsed.data);
  return Response.json({ preset: await getPresetForUser(presetId, ctx.session.user.id) });
}, { bucket: 'write' });

export const DELETE = withRoute(async (ctx) => {
  const presetId = new URL(ctx.req.url).searchParams.get('id');
  if (!presetId) throw new ValidationError('Missing ?id=');
  const existing = await getPresetForUser(presetId, ctx.session.user.id);
  if (!existing) throw new NotFoundError('Preset not found');
  await deletePreset(presetId, ctx.session.user.id);
  return Response.json({ deleted: true });
}, { bucket: 'write' });

export const dynamic = 'force-dynamic';
