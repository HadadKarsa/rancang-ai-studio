'use client';

/**
 * Thin fetch wrapper over forge's /api/v1 contract.
 * Error envelope: { error: { code, message, details? } } — AppError codes.
 */

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function handle(res: Response) {
  if (res.ok) return res.status === 204 ? null : res.json();
  let code = 'UNKNOWN';
  let message = `Request failed (${res.status})`;
  let details: unknown;
  try {
    const body = await res.json();
    if (body?.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details;
    }
  } catch {
    /* non-JSON error body */
  }
  throw new ApiError(code, message, res.status, details);
}

export const api = {
  async get<T>(path: string): Promise<T> {
    return handle(await fetch(`/api/v1${path}`, { credentials: 'same-origin' }));
  },
  async send<T>(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    const headers: Record<string, string> = { ...(extraHeaders ?? {}) };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return handle(
      await fetch(`/api/v1${path}`, {
        method,
        credentials: 'same-origin',
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    );
  },
  post<T>(path: string, body?: unknown, extraHeaders?: Record<string, string>) {
    return this.send<T>('POST', path, body, extraHeaders);
  },
  put<T>(path: string, body?: unknown, extraHeaders?: Record<string, string>) {
    return this.send<T>('PUT', path, body, extraHeaders);
  },
  patch<T>(path: string, body?: unknown, extraHeaders?: Record<string, string>) {
    return this.send<T>('PATCH', path, body, extraHeaders);
  },
  delete<T>(path: string) {
    return this.send<T>('DELETE', path);
  },
};
