import { withRoute } from '@/lib/api/middleware';
import { listTemplates, createTemplate } from '@/lib/db/repositories/templates';
import { getSession } from '@/lib/auth/session';

/**
 * GET /api/v1/templates — system + user templates.
 * Public-friendly: falls back to system templates when unauthenticated.
 */
export const GET = withRoute(async (ctx) => {
  const templates = await listTemplates(ctx.session.user.id);
  return Response.json({ templates });
}, { bucket: 'read' });

export const POST = withRoute(async (ctx) => {
  const body = await ctx.req.json().catch(() => ({}));
  const { name, description, category, icon, accentColor, baselineAssumptions, defaultQuestions } = (body ?? {}) as Record<string, unknown>;
  if (typeof name !== 'string' || name.length === 0) {
    return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'name is required' } }, { status: 400 });
  }
  const template = await createTemplate({
    userId: ctx.session.user.id,
    name,
    description: typeof description === 'string' ? description : '',
    category: (category as never) ?? 'other',
    icon: typeof icon === 'string' ? icon : undefined,
    accentColor: typeof accentColor === 'string' ? accentColor : undefined,
    baselineAssumptions: Array.isArray(baselineAssumptions) ? (baselineAssumptions as string[]) : undefined,
    defaultQuestions: Array.isArray(defaultQuestions) ? (defaultQuestions as string[]) : undefined,
  });
  return Response.json({ template }, { status: 201 });
}, { bucket: 'write' });

export const dynamic = 'force-dynamic';
void getSession;
