import { withRoute } from '@/lib/api/middleware';
import { ConflictError, ValidationError } from '@/lib/errors';
import { assertProjectOwnership } from '@/lib/services/interview';
import {
  beginBatch, endBatch, generateAllDocumentsStream,
  CORE_GENERATION_ORDER, type BatchStreamEvent,
} from '@/lib/services/orchestrator';
import { isDocumentType } from '@/lib/documents/types';
import type { DocumentType } from '@/lib/db/enums';

/**
 * GET /api/v1/projects/:projectId/documents/generate-stream
 *
 * Server-sent events: runs the batch and streams each document as it is
 * written, so the client can render the text live instead of waiting for a
 * 26-second blank.
 *
 * Events (names are a contract with the UI):
 *   start   {"order":["prd","architecture",...]}
 *   doc     {"type":"prd","status":"writing"}
 *   delta   {"type":"prd","text":"<token chunk>"}
 *   done    {"type":"prd","status":"ready","bytes":15230}
 *   error   {"type":"prd","message":"..."}
 *   finish  {"generated":[...],"failed":[...],"skipped":[...]}
 *
 * Wireframe is opt-in: `?types=wireframe` (or a comma list) selects documents
 * explicitly; with no `types` the six core documents are written and the batch
 * stops before wireframe.
 *
 * A second concurrent stream for the same project gets 409. On client
 * disconnect the loop stops, whatever was written is persisted, and the
 * document is left `failed` (the enum's error state — documents have no 'draft').
 */

function parseTypes(raw: string | null): DocumentType[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;
  const out: DocumentType[] = [];
  for (const p of parts) {
    if (p === 'all') return [...CORE_GENERATION_ORDER, 'wireframe'];
    if (!isDocumentType(p)) throw new ValidationError(`Unknown document type: ${p}`, { type: p });
    out.push(p);
  }
  return out;
}

function sseChunk(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export const GET = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  await assertProjectOwnership(ctx.session.user.id, projectId);

  const url = new URL(ctx.req.url);
  const types = parseTypes(url.searchParams.get('types'));
  const presetId = url.searchParams.get('presetId') ?? undefined;

  if (!beginBatch(projectId)) {
    throw new ConflictError('Pembuatan dokumen sedang berjalan untuk proyek ini', { projectId });
  }

  const userId = ctx.session.user.id;
  const requestId = ctx.requestId;
  const signal = ctx.req.signal;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const close = () => { if (!closed) { closed = true; try { controller.close(); } catch { /* already closed */ } } };
      const push = (event: string, data: unknown) => {
        if (closed) return;
        try { controller.enqueue(sseChunk(event, data)); } catch { closed = true; }
      };

      try {
        const gen = generateAllDocumentsStream({ userId, projectId, types, presetId, signal });
        for await (const ev of gen) {
          push(ev.event, ev.data);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`[${requestId}] generate-stream failed project=${projectId}`, e);
        push('error', { type: null, message });
        push('finish', { generated: [], failed: [], skipped: [], error: message });
      } finally {
        endBatch(projectId);
        close();
      }
    },
    cancel() {
      // The client went away; `req.signal` aborts and the generator persists
      // what it has, then exits. Release the guard here too in case the
      // generator never gets scheduled again.
      endBatch(projectId);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Stop nginx and friends from buffering the stream into one blob.
      'X-Accel-Buffering': 'no',
    },
  });
}, { bucket: 'generate' });

export const dynamic = 'force-dynamic';