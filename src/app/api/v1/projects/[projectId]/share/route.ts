import { z } from 'zod';
import { withRoute, parseJson } from '@/lib/api/middleware';
import { assertProjectOwnership } from '@/lib/services/interview';
import { createShareLink, listShareLinksForProject, revokeShareLink, countActiveShareLinks } from '@/lib/db/repositories/shareLinks';
import { hashPassword } from '@/lib/crypto/password';
import { ValidationError } from '@/lib/errors';


const createSchema = z.object({
  scope: z.enum(['project', 'document', 'wireframe']),
  documentId: z.string().optional(),
  access: z.enum(['public', 'password']).optional(),
  password: z.string().min(4).max(128).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  maxViews: z.number().int().min(1).max(10_000).nullable().optional(),
});

export const GET = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  await assertProjectOwnership(ctx.session.user.id, projectId);
  const links = await listShareLinksForProject(projectId);
  const activeCount = await countActiveShareLinks(projectId);
  return Response.json({
    links: links.map((l) => ({ ...l, passwordHash: undefined })),
    activeCount,
  });
}, { bucket: 'read' });

export const POST = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  await assertProjectOwnership(ctx.session.user.id, projectId);

  const body = await parseJson<unknown>(ctx.req);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid share payload', parsed.error.flatten());
  const input = parsed.data;

  if (input.access === 'password' && !input.password) {
    throw new ValidationError('Password required when access=password');
  }

  const link = await createShareLink({
    projectId,
    documentId: input.documentId ?? null,
    scope: input.scope,
    access: input.access ?? 'public',
    passwordHash: input.password ? await hashPassword(input.password) : null,
    expiresAt: input.expiresAt ?? null,
    maxViews: input.maxViews ?? null,
    createdByUserId: ctx.session.user.id,
  });

  return Response.json(
    { link: { ...link, passwordHash: undefined }, url: `/share/${link.slug}` },
    { status: 201 },
  );
}, { bucket: 'write', idempotent: true });

export const DELETE = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  const linkId = new URL(ctx.req.url).searchParams.get('id');
  if (!linkId) throw new ValidationError('Missing ?id=');
  await assertProjectOwnership(ctx.session.user.id, projectId);
  await revokeShareLink(linkId, projectId);
  return Response.json({ revoked: true });
}, { bucket: 'write' });

export const dynamic = 'force-dynamic';
