import { z } from 'zod';
import { withRoute, parseJson } from '@/lib/api/middleware';
import { createLibraryItem, listLibraryItems, type LibraryKind } from '@/lib/db/repositories/library';
import { ValidationError } from '@/lib/errors';

const KINDS = ['document', 'export', 'wireframe'] as const;

const createSchema = z.object({
  kind: z.enum(KINDS),
  title: z.string().min(1).max(200),
  projectId: z.string().max(64).nullable().optional(),
  documentId: z.string().max(64).nullable().optional(),
  payload: z.string().min(1).max(2 * 1024 * 1024),
});

/** POST /api/v1/library — save an artifact. */
export const POST = withRoute(async (ctx) => {
  const body = await parseJson<unknown>(ctx.req, 3 * 1024 * 1024);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid library payload', parsed.error.flatten());
  const item = await createLibraryItem({
    userId: ctx.session.user.id,
    kind: parsed.data.kind,
    title: parsed.data.title,
    projectId: parsed.data.projectId ?? null,
    documentId: parsed.data.documentId ?? null,
    payload: parsed.data.payload,
  });
  return Response.json({ item }, { status: 201 });
}, { bucket: 'write', idempotent: true });

const listSchema = z.object({
  type: z.enum(KINDS).optional(),
  q: z.string().max(200).optional(),
  cursor: z.string().max(40).optional(),
});

/** GET /api/v1/library?type=&q=&cursor= */
export const GET = withRoute(async (ctx) => {
  const url = new URL(ctx.req.url);
  const parsed = listSchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
  const result = await listLibraryItems(ctx.session.user.id, {
    type: parsed.data.type as LibraryKind | undefined,
    q: parsed.data.q,
    cursor: parsed.data.cursor,
  });
  return Response.json(result);
}, { bucket: 'read' });

export const dynamic = 'force-dynamic';
