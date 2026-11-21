import { withRoute } from '@/lib/api/middleware';
import { ValidationError } from '@/lib/errors';
import {
  buildExportBundle, renderCombinedMarkdown, renderZip, renderJson,
  attachmentHeader, exportFilename, isExportFormat,
} from '@/lib/export/bundle';

/**
 * GET /api/v1/projects/:projectId/export?format=md|zip|json (T-410)
 *
 * - md   — every generated document concatenated into one .md file
 * - zip  — README.md + one .md per document + wireframes/*.html
 * - json — the same bundle as structured data (for tooling / agents)
 *
 * 404 when the project is not the caller's; 409 when no document has been
 * generated yet (with the missing types in `details`).
 */
export const GET = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  const url = new URL(ctx.req.url);
  const raw = url.searchParams.get('format') ?? 'md';
  if (!isExportFormat(raw)) {
    throw new ValidationError('Unsupported format. Use md, zip or json.', { format: raw });
  }

  const bundle = await buildExportBundle(ctx.session.user.id, projectId);
  const filename = exportFilename(bundle, raw);

  if (raw === 'json') {
    return new Response(JSON.stringify(renderJson(bundle), null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': attachmentHeader(filename),
        'Cache-Control': 'no-store',
      },
    });
  }

  if (raw === 'zip') {
    const zip = renderZip(bundle);
    return new Response(new Uint8Array(zip), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': attachmentHeader(filename),
        'Content-Length': String(zip.length),
        'Cache-Control': 'no-store',
      },
    });
  }

  const md = renderCombinedMarkdown(bundle);
  return new Response(md, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': attachmentHeader(filename),
      'Cache-Control': 'no-store',
    },
  });
}, { bucket: 'export' });

export const dynamic = 'force-dynamic';