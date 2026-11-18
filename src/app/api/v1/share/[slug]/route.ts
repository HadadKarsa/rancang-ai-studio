import { withRoute } from '@/lib/api/middleware';
import { getShareLinkBySlug, incrementViewCount } from '@/lib/db/repositories/shareLinks';
import { getProjectRowById } from '@/lib/db/repositories/projects';
import { listDocuments, getCurrentVersion, listCurrentVersionsForProject } from '@/lib/db/repositories/documents';
import { listScreens, listFlowsForProject } from '@/lib/db/repositories/wireframes';
import { verifyPassword, weakEtag } from '@/lib/crypto/password';
import { NotFoundError, ShareLinkExpiredError, ShareLinkRevokedError, AppError } from '@/lib/errors';


/**
 * GET /api/v1/share/:slug — public share view (04_API §3.13).
 * No auth. Throttled per IP. Password-protected links take ?password=.
 * Sets ETag; returns 304 on match. View counter increments per successful view.
 */
export const GET = withRoute(async (ctx) => {
  const slug = ctx.params.get('slug');
  const link = await getShareLinkBySlug(slug);
  if (!link) throw new NotFoundError('Share link not found');
  if (link.revokedAt) throw new ShareLinkRevokedError();
  if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) throw new ShareLinkExpiredError();
  if (link.maxViews !== null && link.viewCount >= link.maxViews) throw new ShareLinkExpiredError();

  const url = new URL(ctx.req.url);
  const password = url.searchParams.get('password');
  if (link.access === 'password') {
    if (!password || !link.passwordHash || !(await verifyPassword(password, link.passwordHash))) {
      throw new AppError('UNAUTHORIZED', 'Password required', 401);
    }
  }

  // Scope: single document or the whole project.
  if (link.scope === 'document' && link.documentId) {
    const { getDocumentById } = await import('@/lib/db/repositories/documents');
    const doc = await getDocumentById(link.documentId);
    if (!doc) throw new NotFoundError('Document not found');
    const version = await getCurrentVersion(doc.id);
    const content = version?.contentMd ?? '';
    const etag = weakEtag(content);
    if (ctx.req.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } });
    }
    await incrementViewCount(slug);
    return Response.json(
      { scope: 'document', document: { ...doc, id: doc.id }, content },
      { headers: { ETag: etag } },
    );
  }

  // Share view bypasses ownership: fetch project directly by id.
  const projectRow = await getProjectRowById(link.projectId);
  if (!projectRow) throw new NotFoundError('Project not found');

  const [documents, versions, screens, flows] = await Promise.all([
    listDocuments(projectRow.id),
    listCurrentVersionsForProject(projectRow.id),
    listScreens(projectRow.id),
    listFlowsForProject(projectRow.id),
  ]);

  const payload = {
    scope: 'project',
    project: { name: projectRow.name, description: projectRow.description, accentColor: projectRow.accentColor, icon: projectRow.icon },
    documents: documents.map((d) => ({ ...d, content: versions.get(d.type)?.contentMd ?? null })),
    wireframes: { screens, flows },
  };
  const etag = weakEtag(JSON.stringify(payload));
  if (ctx.req.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }
  await incrementViewCount(slug);
  return Response.json(payload, { headers: { ETag: etag } });
}, { bucket: 'share_public', public: true });

export const dynamic = 'force-dynamic';
