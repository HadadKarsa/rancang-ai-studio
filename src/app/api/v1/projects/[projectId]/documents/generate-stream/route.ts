import { withRoute } from '@/lib/api/middleware';
import { ConflictError } from '@/lib/errors';
import { assertProjectOwnership } from '@/lib/services/interview';
import { snapshot, subscribe, isBatchRunning, type BatchSnapshot } from '@/lib/services/batchRunner';
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
 * No batch running for this project → 409 with the plain JSON error envelope
 * (not SSE), as before. A batch that already finished is not replayed: a page
 * that comes back after the end reads GET .../documents instead.
 *
 * Starting a batch is POST .../documents/generate-all.
 */

const encoder = new TextEncoder();

function sseChunk(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const PING_MS = 15_000;

/* An SSE body is only useful if each chunk leaves the process as it is
   written. Two layers in front of this route will happily hold it:
   Next's dev server response compression, and the Cloudflare quick tunnel
   used for review. Both decide "is this worth a packet yet?" by size, so a
   first chunk of a few hundred bytes sits in a buffer until the next one
   arrives — which is how a snapshot at 0.1s and a delta at 4s both landed
   at 19.5s through the tunnel.

   The fix is a 2KB comment line before anything else. It is not an event:
   EventSource and our own parser skip a line starting with `:`, so the
   client sees nothing. It only exists to push the buffer over the flush
   threshold on the very first write, so the connection is genuinely live
   from the first byte. */
const PAD = `: ${' '.repeat(2048)}\n\n`;

export const GET = withRoute(async (ctx) => {
  const projectId = ctx.params.get('projectId');
  await assertProjectOwnership(ctx.session.user.id, projectId);

  const initial: BatchSnapshot | null = isBatchRunning(projectId) ? snapshot(projectId) : null;
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

      // Flush the first byte out of any buffering layer before the payload.
      if (!closed) {
        try { controller.enqueue(encoder.encode(PAD)); } catch { closed = true; }
      }

      // Replay everything written so far, partial text included.
      push('snapshot', initial);

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
      // `no-transform` is the instruction; `identity` is the belt to it, so a
      // compressor in front cannot decide to gzip a stream that must trickle.
      'Content-Encoding': 'identity',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Stop nginx and friends from buffering the stream into one blob.
      'X-Accel-Buffering': 'no',
    },
  });
}, { bucket: 'read' });

export const dynamic = 'force-dynamic';