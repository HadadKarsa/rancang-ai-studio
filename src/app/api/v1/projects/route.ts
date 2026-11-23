import { z } from 'zod';
import { withRoute, parseJson } from '@/lib/api/middleware';
import { createProjectWithScaffold, listProjectsByUser } from '@/lib/db/repositories/projects';
import { listTagsForUser, createTag, attachTagsToProject } from '@/lib/db/repositories/templates';
import { ValidationError } from '@/lib/errors';
import { DOCUMENT_TYPES } from '@/lib/db/enums';

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  templateId: z.string().optional(),
  presetId: z.string().optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(64).optional(),
  tags: z.array(z.string()).max(10).optional(),
  /** Tags by name — created on the fly if absent. */
  newTags: z.array(z.string().min(1).max(40)).max(10).optional(),
});

export const POST = withRoute(async (ctx) => {
  const body = await parseJson<unknown>(ctx.req);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid project payload', parsed.error.flatten());
  }
  const input = parsed.data;

  const project = await createProjectWithScaffold({
    userId: ctx.session.user.id,
    name: input.name,
    description: input.description,
    templateId: input.templateId ?? null,
    defaultPresetId: input.presetId ?? null,
    accentColor: input.accentColor,
    icon: input.icon ?? null,
  });

  const tagIds: string[] = [];
  if (input.tags) tagIds.push(...input.tags);
  if (input.newTags) {
    for (const name of input.newTags) {
      const existing = (await listTagsForUser(ctx.session.user.id)).find((t) => t.name.toLowerCase() === name.toLowerCase());
      tagIds.push(existing ? existing.id : (await createTag(ctx.session.user.id, name)).id);
    }
  }
  if (tagIds.length > 0) await attachTagsToProject(project.id, tagIds);

  return Response.json({ project }, { status: 201 });
}, { bucket: 'write', idempotent: true });

const listQuerySchema = z.object({
  q: z.string().max(200).optional(),
  status: z.enum(['draft', 'interviewing', 'generating', 'ready', 'archived']).optional(),
  templateId: z.string().optional(),
  sort: z.enum(['created_at', 'updated_at', 'name']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  /** Keyset cursor: the sort-column value and id of the last row seen. */
  cursorValue: z.string().optional(),
  cursorId: z.string().optional(),
});

export const GET = withRoute(async (ctx) => {
  const url = new URL(ctx.req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = listQuerySchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());

  const result = await listProjectsByUser(ctx.session.user.id, parsed.data);
  return Response.json({
    projects: result.items,
    counts: result.counts,
    pagination: {
      total: result.total,
      limit: parsed.data.limit ?? 20,
      nextCursor: result.nextCursor,
    },
  });
}, { bucket: 'read' });

export const dynamic = 'force-dynamic';

