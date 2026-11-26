import { beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '@libsql/client';
import path from 'node:path';
import { setDbForTest, query, queryOne } from '@/lib/db/client';
import { runMigrations } from '@/lib/db/migrate';
import { createProjectWithScaffold, updateProject, getProjectById } from '@/lib/db/repositories/projects';
import {
  getDocumentByType, createVersionSnapshot, setDocumentStatus, getCurrentVersion,
} from '@/lib/db/repositories/documents';
import { PROJECT_PURPOSES } from '@/lib/db/enums';

/**
 * v0.2.3 `projects.purpose`: the column, its legacy NULL behaviour, and the
 * invariant that changing a purpose never disturbs documents that already
 * exist. Runs against a throwaway in-memory database — the live data/rancang.db
 * is never opened here.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../migrations');

async function freshDb() {
  const client = createClient({ url: ':memory:' });
  setDbForTest(client);
  await runMigrations(MIGRATIONS_DIR);
  return client;
}

async function seedUser(id = 'usr_test') {
  const now = new Date().toISOString();
  await query(
    `INSERT INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [id, `${id}@example.invalid`, 'Test User', now, now],
  );
  return id;
}

describe('migration 004 — projects.purpose', () => {
  beforeEach(async () => { await freshDb(); });

  it('applies idempotently: a second run adds nothing', async () => {
    const again = await runMigrations(MIGRATIONS_DIR);
    expect(again).toEqual([]);
  });

  it('leaves a pre-existing row readable with purpose = null', async () => {
    const userId = await seedUser();
    const now = new Date().toISOString();
    // A row written the way v0.2.2 wrote it: no purpose column in the INSERT.
    await query(
      `INSERT INTO projects (id, user_id, name, slug, description, status, accent_color, created_at, updated_at)
       VALUES ('prj_legacy', ?, 'Legacy', 'legacy', 'old project', 'ready', '#6366f1', ?, ?)`,
      [userId, now, now],
    );

    const project = await getProjectById('prj_legacy', userId);
    expect(project).not.toBeNull();
    expect(project!.purpose).toBeNull();
  });

  it('rejects a value outside the enum at the database level', async () => {
    const userId = await seedUser();
    const now = new Date().toISOString();
    await expect(
      query(
        `INSERT INTO projects (id, user_id, name, slug, status, purpose, accent_color, created_at, updated_at)
         VALUES ('prj_bad', ?, 'Bad', 'bad', 'draft', 'not_a_purpose', '#6366f1', ?, ?)`,
        [userId, now, now],
      ),
    ).rejects.toThrow();
  });
});

describe('project purpose — create and update', () => {
  beforeEach(async () => { await freshDb(); });

  it('persists each valid purpose on create', async () => {
    const userId = await seedUser();
    for (const purpose of PROJECT_PURPOSES) {
      const project = await createProjectWithScaffold({
        userId, name: `Project ${purpose}`, description: 'detail', purpose,
      });
      expect(project.purpose).toBe(purpose);

      const reread = await getProjectById(project.id, userId);
      expect(reread!.purpose).toBe(purpose);
    }
  });

  it('stores null when the purpose is omitted', async () => {
    const userId = await seedUser();
    const project = await createProjectWithScaffold({ userId, name: 'No purpose', description: null });
    expect(project.purpose).toBeNull();
  });

  it('updates and clears the purpose', async () => {
    const userId = await seedUser();
    const project = await createProjectWithScaffold({ userId, name: 'Switchable' });

    await updateProject(project.id, userId, { purpose: 'ai_agent' });
    expect((await getProjectById(project.id, userId))!.purpose).toBe('ai_agent');

    await updateProject(project.id, userId, { purpose: null });
    expect((await getProjectById(project.id, userId))!.purpose).toBeNull();
  });

  it('does not disturb document status or an edited version when the purpose changes', async () => {
    const userId = await seedUser();
    const project = await createProjectWithScaffold({ userId, name: 'Has docs' });
    const prd = await getDocumentByType(project.id, 'prd');
    expect(prd).not.toBeNull();

    const version = await createVersionSnapshot({
      documentId: prd!.id, contentMd: '# PRD\n\nedited by hand', source: 'manual_edit',
    });
    await setDocumentStatus(prd!.id, 'ready');

    const before = await queryOne<{ status: string; current_version_id: string; updated_at: string }>(
      'SELECT status, current_version_id, updated_at FROM spec_documents WHERE id = ?', [prd!.id],
    );

    await updateProject(project.id, userId, { purpose: 'team' });

    const after = await queryOne<{ status: string; current_version_id: string; updated_at: string }>(
      'SELECT status, current_version_id, updated_at FROM spec_documents WHERE id = ?', [prd!.id],
    );
    expect(after).toEqual(before);
    expect(after!.current_version_id).toBe(version.id);

    const current = await getCurrentVersion(prd!.id);
    expect(current!.contentMd).toBe('# PRD\n\nedited by hand');
    expect(current!.source).toBe('manual_edit');

    const versions = await query<{ n: number }>(
      'SELECT COUNT(*) AS n FROM document_versions WHERE document_id = ?', [prd!.id],
    );
    expect(Number(versions[0]!.n)).toBe(1);
  });
});
