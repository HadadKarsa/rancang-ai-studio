import { beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '@libsql/client';
import path from 'node:path';
import { setDbForTest, query } from '@/lib/db/client';
import { runMigrations } from '@/lib/db/migrate';
import { setEnvForTest } from '@/lib/env';
import { PROJECT_PURPOSES } from '@/lib/db/enums';

/**
 * v0.2.3 project API: `purpose` is accepted on create and patch, rejected when
 * it is not one of the three values, and a patch that only carries `purpose`
 * leaves document state alone.
 *
 * The handlers are called directly (no HTTP server): `withRoute` resolves the
 * session through `getSession`, which falls back to the seeded local owner when
 * AUTH_MODE=local and there is no cookie — which is exactly this test's setup.
 */

// src/app/api/v1/projects/__tests__ → repo root is six levels up.
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../../migrations');

let POST: typeof import('@/app/api/v1/projects/route').POST;
let PATCH: typeof import('@/app/api/v1/projects/[projectId]/route').PATCH;
let GET: typeof import('@/app/api/v1/projects/[projectId]/route').GET;

async function freshDb() {
  const client = createClient({ url: ':memory:' });
  setDbForTest(client);
  await runMigrations(MIGRATIONS_DIR);
}

function routeCtx(params: Record<string, string> = {}) {
  return { params: Promise.resolve(params) };
}

function post(body: unknown): Request {
  return new Request('http://localhost:3000/api/v1/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patch(projectId: string, body: unknown): Request {
  return new Request(`http://localhost:3000/api/v1/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  setEnvForTest({
    DATABASE_URL: 'file::memory:',
    ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
    AUTH_MODE: 'local',
    APP_URL: 'http://localhost:3000',
  });
  await freshDb();
  ({ POST } = await import('@/app/api/v1/projects/route'));
  ({ PATCH, GET } = await import('@/app/api/v1/projects/[projectId]/route'));
});

describe('POST /api/v1/projects — purpose', () => {
  it('creates a project with each valid purpose and returns it', async () => {
    for (const purpose of PROJECT_PURPOSES) {
      const res = await POST(post({ name: `Proyek ${purpose}`, purpose }), routeCtx());
      expect(res.status).toBe(201);
      const body = await res.json() as { project: { id: string; purpose: string } };
      expect(body.project.purpose).toBe(purpose);
    }
  });

  it('defaults to null when purpose is omitted', async () => {
    const res = await POST(post({ name: 'Tanpa tujuan' }), routeCtx());
    expect(res.status).toBe(201);
    const body = await res.json() as { project: { purpose: unknown } };
    expect(body.project.purpose).toBeNull();
  });

  it('accepts an explicit null', async () => {
    const res = await POST(post({ name: 'Null eksplisit', purpose: null }), routeCtx());
    expect(res.status).toBe(201);
    const body = await res.json() as { project: { purpose: unknown } };
    expect(body.project.purpose).toBeNull();
  });

  it('rejects an unknown purpose with 400', async () => {
    const res = await POST(post({ name: 'Salah', purpose: 'for_fun' }), routeCtx());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/v1/projects/:id — purpose', () => {
  async function createProject(name = 'Patch target') {
    const res = await POST(post({ name }), routeCtx());
    const body = await res.json() as { project: { id: string } };
    return body.project.id;
  }

  it('sets and clears the purpose', async () => {
    const id = await createProject();

    let res = await PATCH(patch(id, { purpose: 'ai_agent' }), routeCtx({ projectId: id }));
    expect(res.status).toBe(200);
    expect((await res.json() as { project: { purpose: string } }).project.purpose).toBe('ai_agent');

    res = await PATCH(patch(id, { purpose: null }), routeCtx({ projectId: id }));
    expect(res.status).toBe(200);
    expect((await res.json() as { project: { purpose: unknown } }).project.purpose).toBeNull();
  });

  it('rejects an unknown purpose with 400 and leaves the stored value alone', async () => {
    const id = await createProject('Tetap team');
    await PATCH(patch(id, { purpose: 'team' }), routeCtx({ projectId: id }));

    const res = await PATCH(patch(id, { purpose: 'sesukanya' }), routeCtx({ projectId: id }));
    expect(res.status).toBe(400);

    const get = await GET(new Request(`http://localhost:3000/api/v1/projects/${id}`), routeCtx({ projectId: id }));
    expect((await get.json() as { project: { purpose: string } }).project.purpose).toBe('team');
  });

  it('does not change project status or document rows', async () => {
    const id = await createProject('Status aman');

    const before = await query<{ id: string; status: string; current_version_id: string | null }>(
      'SELECT id, status, current_version_id FROM spec_documents WHERE project_id = ? ORDER BY order_index', [id],
    );

    await PATCH(patch(id, { purpose: 'documentation' }), routeCtx({ projectId: id }));

    const after = await query<{ id: string; status: string; current_version_id: string | null }>(
      'SELECT id, status, current_version_id FROM spec_documents WHERE project_id = ? ORDER BY order_index', [id],
    );
    expect(after).toEqual(before);
    expect(before.length).toBe(7);
  });

  it('returns the purpose on GET after a change', async () => {
    const id = await createProject('Baca ulang');
    await PATCH(patch(id, { purpose: 'ai_agent' }), routeCtx({ projectId: id }));

    const get = await GET(new Request(`http://localhost:3000/api/v1/projects/${id}`), routeCtx({ projectId: id }));
    const body = await get.json() as { project: { purpose: string } };
    expect(body.project.purpose).toBe('ai_agent');
  });
});
