import { z } from 'zod';
import { withRoute, parseJson } from '@/lib/api/middleware';
import { assertProjectOwnership, appendUserAnswer, startInterviewTurn, finalizeInterview } from '@/lib/services/interview';
import { createSession, abandonActiveSessions, getActiveSessionForProject, listSessionsForProject, listMessages, appendMessage } from '@/lib/db/repositories/interviews';
import { getProjectById, updateProject } from '@/lib/db/repositories/projects';
import { ValidationError, NotFoundError, ConflictError } from '@/lib/errors';
import { parseRuntimeModelOverride } from '@/lib/llm/runtimeOverride';


const startSchema = z.object({
  restart: z.boolean().optional(),
  presetId: z.string().optional(),
  totalSteps: z.number().int().min(5).max(8).optional(),
});

/** POST /api/v1/projects/:projectId/interview — start (or restart) a session. */
export const POST = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  await assertProjectOwnership(ctx.session.user.id, projectId);

  let input: z.infer<typeof startSchema> = {};
  const text = await ctx.req.text();
  if (text.length > 0) {
    const parsed = startSchema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
    input = parsed.data;
  }

  const active = await getActiveSessionForProject(projectId);
  if (active && !input.restart) {
    throw new ConflictError('An interview session is already active');
  }
  if (active && input.restart) {
    await abandonActiveSessions(projectId);
  }

  const project = await getProjectById(projectId, ctx.session.user.id);
  if (!project) throw new NotFoundError('Project not found');

  const session = await createSession({
    projectId,
    templateId: project.templateId,
    presetId: input.presetId ?? project.defaultPresetId,
    totalSteps: input.totalSteps,
  });
  void updateProject(projectId, ctx.session.user.id, { status: 'interviewing' });

  return Response.json({ session }, { status: 201 });
}, { bucket: 'write', idempotent: true });

/** GET — session list + active session + its transcript.
 *  `latest` is the most recent session whether active or completed, and
 *  `messages` is that session's transcript, so a reload restores the
 *  conversation instead of an empty page. */
export const GET = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  await assertProjectOwnership(ctx.session.user.id, projectId);

  const sessions = await listSessionsForProject(projectId);
  const active = await getActiveSessionForProject(projectId);
  const latest = active ?? sessions[0] ?? null;
  const messages = latest ? await listMessages(latest.id) : [];
  return Response.json({ sessions, active, latest, messages });
}, { bucket: 'read' });

const answerSchema = z.object({
  content: z.string().min(1).max(8000),
  /** When true, immediately asks the next question after storing the answer. */
  next: z.boolean().optional(),
});

/** PUT — append the user's answer; optionally pull the next question. */
export const PUT = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  const body = await parseJson<unknown>(ctx.req);
  const parsed = answerSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid answer', parsed.error.flatten());

  const active = await getActiveSessionForProject(projectId);
  if (!active) throw new NotFoundError('No active interview session');

  const result = await appendUserAnswer({ userId: ctx.session.user.id, sessionId: active.id, content: parsed.data.content });

  let nextTurn = null;
  if (parsed.data.next !== false && !result.isComplete) {
    const runtimeOverride = parseRuntimeModelOverride(ctx.req);
    nextTurn = await startInterviewTurn({ userId: ctx.session.user.id, sessionId: active.id, runtimeOverride });
  } else if (result.isComplete) {
    const { finalizeInterview } = await import('@/lib/services/interview');
    await finalizeInterview({ userId: ctx.session.user.id, sessionId: active.id });
    void updateProject(projectId, ctx.session.user.id, { status: 'ready' });
  }

  return Response.json({ ...result, nextTurn });
}, { bucket: 'generate' });

const patchSchema = z.object({
  action: z.literal('complete'),
  summary: z.string().max(4000).optional(),
});

/** PATCH — early completion shortcut ("Cukup, lanjut tulis spesifikasi"). */
export const PATCH = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  await assertProjectOwnership(ctx.session.user.id, projectId);

  const body = await parseJson<unknown>(ctx.req);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid action', parsed.error.flatten());

  let session = await getActiveSessionForProject(projectId);
  if (!session) {
    const project = await getProjectById(projectId, ctx.session.user.id);
    if (!project) throw new NotFoundError('Project not found');
    session = await createSession({
      projectId,
      templateId: project.templateId,
      presetId: project.defaultPresetId,
    });
    if (project.description?.trim()) {
      await appendMessage({
        sessionId: session.id,
        role: 'user',
        content: project.description.trim(),
      });
    }
  }

  await finalizeInterview({
    userId: ctx.session.user.id,
    sessionId: session.id,
    summary: parsed.data.summary,
  });
  await updateProject(projectId, ctx.session.user.id, { status: 'ready' });

  return Response.json({ session: { ...session, status: 'completed' }, completed: true });
}, { bucket: 'write' });

export const dynamic = 'force-dynamic';
