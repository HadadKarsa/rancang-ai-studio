import { expect, it } from 'vitest';
import { getDb } from '../client';
import { runMigrations } from '../migrate';
import { createLibraryItem, getLibraryItem, getLibraryPayload, listLibraryItems } from './library';

it('isolates project metadata and keeps legacy snapshots readable by their owner', async () => {
  await runMigrations();
  const db = getDb();
  const now = new Date().toISOString();
  for (const id of ['reader', 'other']) {
    await db.execute({
      sql: "INSERT INTO users (id,email,role,auth_provider,created_at,updated_at) VALUES (?,?,'owner','local',?,?)",
      args: [id, id + '@example.invalid', now, now],
    });
    await db.execute({
      sql: "INSERT INTO projects (id,user_id,name,slug,status,accent_color,created_at,updated_at) VALUES (?,?,?,?,'draft','#112233',?,?)",
      args: ['p-' + id, id, id, id, now, now],
    });
  }
  const input = { userId: 'reader', kind: 'document' as const, title: 'PRD', payload: 'Saved text' };
  await expect(createLibraryItem({ ...input, projectId: 'p-other' })).rejects.toThrow();
  const item = await createLibraryItem({ ...input, projectId: 'p-reader' });
  expect(item.projectName).toBe('reader');
  expect(await getLibraryPayload(item.id, 'other')).toBeNull();
  expect((await listLibraryItems('other')).items).toEqual([]);

  await db.execute({ sql: 'UPDATE library_items SET project_id = ? WHERE id = ?', args: ['p-other', item.id] });
  expect(await getLibraryItem(item.id, 'reader')).toMatchObject({ projectId: null, projectName: null });
  expect(await getLibraryPayload(item.id, 'reader')).toBe('Saved text');
});
