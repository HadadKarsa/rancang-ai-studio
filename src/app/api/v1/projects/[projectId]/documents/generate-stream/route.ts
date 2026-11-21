import { withRoute } from '@/lib/api/middleware';
import { ConflictError } from '@/lib/errors';
import { assertProjectOwnership } from '@/lib/services/interview';
import { snapshot, subscribe, type BatchSnapshot } from '@/lib/services/batchRunner';
import type { BatchStreamEvent } from '@/lib/services/orchestrator';

/**
 * GET /api/v1/projects/:projectId/documents/generate-stream
 *
 * A pure TAIL of the server-owned batch (src/lib/services/batchRunner.ts).
 * This request never drives generation and never aborts it: the batch runs in
 * the process, this connection only watches. Navigating away from /write,
 * switching tabs, or losing the tunnel therefore costs one listener and
 * nothing else — the documents keep being written.
 *
 * Events on connect:
 *   snapshot  {projectId, order, docs:[{type,status,text,bytes,error}],
 *              startedAt, elapsedMs, finished, result}
 *             — the whole state so far, including the partial text of the
 *               document being written. Always the first event.
 * then, live, in the existing shapes:
 *   start   {"order":[...]}
 *   doc     {"type":"prd","status":"writing"}
 *   delta   {"type":"prd","text":"<token chunk>"}
 *   done    {"type":"prd","status":"ready","bytes":15230}
 *   error   {"type":"prd","message":"..."}
 *   finish  {"generated":[...],"failed":[...],"skipped":[...]}
 *
 * A `: ping` comment line is sent every 15s so a proxy or tunnel does not drop
 * an idle connection. Comments are ignored by EventSource and by the client's
 * parser.
 *
 * No batch for this project → 409 with the plain JSON error envelope (not SSE).
 * A batch that already finished is still replayed (snapshot + finish) while it
 * is in the registry, so a client that was away for the last document can catch
 * up; after that it is 409 too.
 *
 * Starting a batch is POST .../documents/generate-all.
 */

const encoder = new TextEncoder();

function sseChunk(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const PING_MS = 15_000;

export const GET = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  await assertProjectOwnership(ctx.session.user.id, projectId);

  const initial: BatchSnapshot | null = snapshot(projectId);
  if (!initial) {
    throw new ConflictError('Tidak ada pembuatan dokumen yang berjalan untuk proyek ini', { projectId });
  }

  const requestId = ctx.requestId;
  let unsubscribe: (() => void) | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        if (ping) clearInterval(ping);
        unsubscribe?.();
        try { controller.close(); } catch { /* already closed */ }
      };
      const push = (event: string, data: unknown) => {
        if (closed) return;
        try { controller.enqueue(sseChunk(event, data)); } catch { closed = true; }
      };

      // Replay everything written so far, partial text included.
      push('snapshot', initial);

      if (initial.finished) {
        close();
        return;
      }

      unsubscribe = subscribe(projectId, (ev: BatchStreamEvent) => {
        push(ev.event, ev.data);
        if (ev.event === 'finish') close();
      });

      // A silent stream through a quick tunnel gets dropped. Keep it warm.
      ping = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          closed = true;
          if (ping) clearInterval(ping);
          unsubscribe?.();
        }
      }, PING_MS);

      console.log(`[${requestId}] generate-stream attach project=${projectId} docs=${initial.docs.length}`);
    },
    cancel() {
      // The client went away. Detach only — the runner is not ours to stop.
      closed = true;
      if (ping) clearInterval(ping);
      unsubscribe?.();
      console.log(`[${requestId}] generate-stream detach project=${projectId}`);
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
}, { bucket: 'read' });

export const dynamic = 'force-dynamic';