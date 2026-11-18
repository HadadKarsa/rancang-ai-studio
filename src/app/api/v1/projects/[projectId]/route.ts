import { z } from 'zod';
import { withRoute, parseJson } from '@/lib/api/middleware';
import { getProjectById, updateProject, archiveProject, deleteProject, countProjectsByStatus } from '@/lib/db/repositories/projects';
import { listDocuments } from '@/lib/db/repositories/documents';
import { listTagsForProject, replaceProjectTags } from '@/lib/db/repositories/templates';
import { ValidationError, NotFoundError } from '@/lib/errors';


const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(['draft', 'interviewing', 'generating', 'ready', 'archived']).optional(),
  defaultPresetId: z.string().nullable().optional(),
  icon: z.string().max(64).nullable().optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  tags: z.array(z.string()).max(20).optional(),
});

export const GET = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  const project = await getProjectById(projectId, ctx.session.user.id);
  if (!project) throw new NotFoundError('Project not found');

  const [documents, tags, counts] = await Promise.all([
    listDocuments(projectId),
    listTagsForProject(projectId),
    countProjectsByStatus(ctx.session.user.id),
  ]);

  // Touch last_opened_at (fire and forget).
  void updateProject(projectId, ctx.session.user.id, { lastOpenedAt: new Date().toISOString() });

  return Response.json({ project, documents, tags, counts });
}, { bucket: 'read' });

export const PATCH = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  const body = await parseJson<unknown>(ctx.req);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid patch', parsed.error.flatten());

  const { tags, ...projectPatch } = parsed.data;
  const existing = await getProjectById(projectId, ctx.session.user.id);
  if (!existing) throw new NotFoundError('Project not found');

  await updateProject(projectId, ctx.session.user.id, projectPatch);
  if (tags) await replaceProjectTags(projectId, tags);

  return Response.json({ project: await getProjectById(projectId, ctx.session.user.id) });
}, { bucket: 'write' });

/** DELETE ?hard=1 destroys everything; default is soft-archive. */
export const DELETE = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  const hard = new URL(ctx.req.url).searchParams.get('hard') === '1';
  const existing = await getProjectById(projectId, ctx.session.user.id);
  if (!existing) throw new NotFoundError('Project not found');

  if (hard) {
    await deleteProject(projectId, ctx.session.user.id);
    return Response.json({ deleted: true, mode: 'hard' });
  }
  await archiveProject(projectId, ctx.session.user.id);
  return Response.json({ archived: true });
}, { bucket: 'write' });

export const dynamic = 'force-dynamic';
