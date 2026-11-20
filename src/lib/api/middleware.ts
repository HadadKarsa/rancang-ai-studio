import { createHash, randomUUID } from 'node:crypto';
import { getEnv } from '@/lib/env';
import { AppError, RateLimitError, ValidationError } from '@/lib/errors';
import { requireSession, type AppSession } from '@/lib/auth/session';

/**
 * Shared route-handler plumbing (T-400/T-205): auth, CSRF origin check,
 * rate limiting, idempotency, error envelope, request ids.
 */

// ── Error envelope ───────────────────────────────────────────────────────────

export function toErrorResponse(e: unknown, requestId: string): Response {
  if (e instanceof AppError) {
    return Response.json(
      { error: { code: e.code, message: e.message, details: e.details, requestId } },
      { status: e.status, headers: { 'X-Request-Id': requestId } },
    );
  }
  console.error(`[${requestId}] unhandled error:`, e);
  return Response.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId } },
    { status: 500, headers: { 'X-Request-Id': requestId } },
  );
}

// ── Rate limiting (in-memory sliding window, 04_API §2.6) ────────────────────

type Bucket = 'read' | 'write' | 'generate' | 'export' | 'share_public' | 'provider_test';

const BUCKET_LIMITS: Record<Bucket, { limit: number; windowMs: number }> = {
  read: { limit: 300, windowMs: 60_000 },
  write: { limit: 60, windowMs: 60_000 },
  generate: { limit: 10, windowMs: 60_000 },
  export: { limit: 5, windowMs: 60_000 },
  share_public: { limit: 120, windowMs: 60_000 },
  provider_test: { limit: 10, windowMs: 60_000 },
};

const hits = new Map<string, number[]>();

export function checkRateLimit(bucket: Bucket, scope: string): { remaining: number; reset: number } {
  const { limit, windowMs } = BUCKET_LIMITS[bucket];
  const key = `${bucket}:${scope}`;
  const now = Date.now();
  const window = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (window.length >= limit) {
    const retryAfter = Math.ceil((windowMs - (now - (window[0] ?? now))) / 1000);
    throw new RateLimitError(retryAfter);
  }
  window.push(now);
  hits.set(key, window);
  // Bounded map: drop empty buckets opportunistically.
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return { remaining: limit - window.length, reset: Math.ceil((now + windowMs) / 1000) };
}

function rateHeaders(result: { remaining: number; reset: number }, bucket: Bucket): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(BUCKET_LIMITS[bucket].limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(result.reset),
  };
}

// ── CSRF origin (04_API §1.3) ────────────────────────────────────────────────

function assertOrigin(req: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const origin = req.headers.get('origin');
  if (!origin) return; // non-browser clients (curl) — no CSRF surface
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError('FORBIDDEN', `Invalid origin: ${origin}`, 403);
  }
  const requestHost = req.headers.get('host');
  // Same-origin by host: covers APP_URL, the tunnel hostname, and any dev host.
  // Cross-host origins must still match APP_URL exactly.
  if (requestHost && originHost === requestHost) return;
  const appUrl = getEnv().APP_URL;
  if (origin !== appUrl) {
    throw new AppError('FORBIDDEN', `Origin mismatch: ${origin}`, 403);
  }
}

// ── Idempotency (04_API §2.7) ────────────────────────────────────────────────

export function requestHash(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');
}

// ── Route wrapper ────────────────────────────────────────────────────────────

export interface RouteContext {
  req: Request;
  session: AppSession;
  requestId: string;
  /** Path params; guaranteed present for the named key (throws otherwise). */
  params: Record<string, string> & { get(name: string): string };
}

export interface HandlerOptions {
  bucket?: Bucket;
  /** Require an Idempotency-Key-capable POST; replays return the stored response. */
  idempotent?: boolean;
  /** Skip auth (public share endpoints). */
  public?: boolean;
}

export function withRoute(
  handler: (ctx: RouteContext) => Promise<Response>,
  options: HandlerOptions = {},
): (req: Request, routeCtx: { params: Promise<Record<string, string>> }) => Promise<Response> {
  return async (req, routeCtx) => {
    const requestId = randomUUID();
    const url = new URL(req.url);
    try {
      assertOrigin(req);

      const bucket = options.bucket ?? 'read';
      // Public share endpoints are throttled per IP; everything else per user.
      let rateScope = 'anon';
      let session: AppSession | null = null;
      if (!options.public) {
        session = await requireSession();
        rateScope = session.user.id;
      } else {
        rateScope = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon';
      }
      const rate = checkRateLimit(bucket, rateScope);

      const rawParams = (await routeCtx?.params) ?? {};
      void rawParams;
      const params = new Proxy(rawParams as Record<string, string>, {
        get(target, prop) {
          if (prop === 'get') return (name: string) => {
            const value = target[name];
            if (value === undefined) throw new Error(`Missing route param: ${name}`);
            return value;
          };
          return target[prop as string];
        },
      }) as RouteContext['params'];

      // Idempotency replay (POST + Idempotency-Key header).
      if (options.idempotent && req.method === 'POST' && session) {
        const idemKey = req.headers.get('idempotency-key');
        if (idemKey) {
          const { findReplay, storeResponse } = await import('@/lib/db/repositories/idempotency');
          const clone = req.clone();
          let body: unknown = null;
          try { body = await clone.json(); } catch { /* empty body */ }
          const hash = requestHash(body);
          const replay = await findReplay(idemKey, session.user.id);
          if (replay) {
            if (replay.request_hash !== hash) {
              throw new AppError('CONFLICT', 'Idempotency-Key reused with a different body', 409);
            }
            return new Response(replay.response_body, {
              status: replay.response_code,
              headers: {
                'Content-Type': 'application/json',
                'Idempotent-Replay': 'true',
                'X-Request-Id': requestId,
                ...rateHeaders(rate, bucket),
              },
            });
          }
          const response = await handler({ req, session: session, requestId, params });
          if (response.status < 500) {
            const responseBody = await response.clone().text();
            await storeResponse({
              key: idemKey, userId: session.user.id, endpoint: url.pathname,
              requestHash: hash, responseCode: response.status, responseBody,
            });
          }
          return new Response(response.body, {
            status: response.status,
            headers: { ...Object.fromEntries(response.headers), 'X-Request-Id': requestId, ...rateHeaders(rate, bucket) },
          });
        }
      }

      const response = await handler({ req, session: session as AppSession, requestId, params });
      const headers = new Headers(response.headers);
      headers.set('X-Request-Id', requestId);
      for (const [k, v] of Object.entries(rateHeaders(rate, bucket))) headers.set(k, v);
      return new Response(response.body, { status: response.status, headers });
    } catch (e) {
      const retryAfter = e instanceof AppError && e.code === 'RATE_LIMITED'
        ? String((e.details as { retryAfterSeconds: number }).retryAfterSeconds)
        : undefined;
      const response = toErrorResponse(e, requestId);
      if (retryAfter) response.headers.set('Retry-After', retryAfter);
      return response;
    }
  };
}

// ── Body parsing ─────────────────────────────────────────────────────────────

export async function parseJson<T>(req: Request, maxBytes = 1024 * 1024): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new AppError('PAYLOAD_TOO_LARGE', 'JSON body exceeds 1 MB', 413);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ValidationError('Malformed JSON body');
  }
}
