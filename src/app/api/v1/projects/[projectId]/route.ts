import { z } from 'zod';
import { withRoute, parseJson } from '@/lib/api/middleware';
import { getProjectById, updateProject, archiveProject, deleteProject, countProjectsByStatus, countReadyDocuments, hasInterviewContent, type UpdateProjectPatch } from '@/lib/db/repositories/projects';
import { listDocuments } from '@/lib/db/repositories/documents';
import { listTagsForProject, replaceProjectTags } from '@/lib/db/repositories/templates';
import { ValidationError, NotFoundError } from '@/lib/errors';
import { PROJECT_PURPOSES } from '@/lib/db/enums';


const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  /** Writes projects.purpose only — never touches document status or versions. */
  purpose: z.enum(PROJECT_PURPOSES).nullable().optional(),
  status: z.enum(['draft', 'interviewing', 'generating', 'ready', 'archived']).optional(),
  defaultPresetId: z.string().nullable().optional(),
  icon: z.string().max(64).nullable().optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  tags: z.array(z.string()).max(20).optional(),
  /** Un-archive: status omitted means derive it from documents/interview. */
  restore: z.boolean().optional(),
});

/**
 * Where a restored project belongs: finished documents mean it is `ready`,
 * a started interview means `interviewing`, nothing yet means `draft`.
 */
async function deriveRestoreStatus(projectId: string): Promise<'draft' | 'interviewing' | 'ready'> {
  if ((await countReadyDocuments(projectId)) > 0) return 'ready';
  if (await hasInterviewContent(projectId)) return 'interviewing';
  return 'draft';
}

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

  const { tags, restore, ...restPatch } = parsed.data;
  const projectPatch: UpdateProjectPatch = { ...restPatch };
  const existing = await getProjectById(projectId, ctx.session.user.id);
  if (!existing) throw new NotFoundError('Project not found');

  // Archive: stamp archived_at. Restore: clear it and land on a real status.
  if (projectPatch.status === 'archived') {
    await archiveProject(projectId, ctx.session.user.id);
    const rest = { ...projectPatch };
    delete rest.status;
    if (Object.keys(rest).length > 0) await updateProject(projectId, ctx.session.user.id, rest);
  } else {
    const isRestore = restore === true || (existing.status === 'archived' && projectPatch.status !== undefined);
    if (isRestore) {
      projectPatch.status = projectPatch.status ?? (await deriveRestoreStatus(projectId));
      projectPatch.archivedAt = null;
    }
    await updateProject(projectId, ctx.session.user.id, projectPatch);
  }

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
