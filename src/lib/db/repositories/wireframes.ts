import { execute, query, queryOne, transaction } from '../client';
import { mapWireframeScreen, type WireframeScreen, type WireframeScreenRow } from '../types';
import { newId, nowIso } from '@/lib/ids';

export async function listScreens(projectId: string): Promise<WireframeScreen[]> {
  const rows = await query<WireframeScreenRow>(
    'SELECT * FROM wireframe_screens WHERE project_id = ? ORDER BY order_index, created_at',
    [projectId],
  );
  return rows.map(mapWireframeScreen);
}

export async function getScreenById(screenId: string, projectId: string): Promise<WireframeScreen | null> {
  const row = await queryOne<WireframeScreenRow>('SELECT * FROM wireframe_screens WHERE id = ? AND project_id = ?', [screenId, projectId]);
  return row ? mapWireframeScreen(row) : null;
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'screen';
}

export interface UpsertScreenInput {
  projectId: string;
  name: string;
  htmlContent: string;
  slug?: string;
  description?: string | null;
  viewport?: 'mobile' | 'tablet' | 'desktop';
  isEntry?: boolean;
}

/** Insert, or replace content when (project_id, slug) already exists. */
export async function upsertScreen(input: UpsertScreenInput): Promise<WireframeScreen> {
  const slug = input.slug ?? slugify(input.name);
  const existing = await queryOne<WireframeScreenRow>(
    'SELECT id FROM wireframe_screens WHERE project_id = ? AND slug = ?',
    [input.projectId, slug],
  );
  const now = nowIso();
  if (existing) {
    await execute(
      'UPDATE wireframe_screens SET name = ?, html_content = ?, description = ?, updated_at = ? WHERE id = ?',
      [input.name, input.htmlContent, input.description ?? null, now, existing.id],
    );
    return (await getScreenById(existing.id, input.projectId)) as WireframeScreen;
  }
  const id = newId('scr');
  const orderRow = await queryOne<{ n: number }>('SELECT COALESCE(MAX(order_index), -1) + 1 AS n FROM wireframe_screens WHERE project_id = ?', [input.projectId]);
  await execute(
    `INSERT INTO wireframe_screens (id, project_id, name, slug, description, html_content, viewport, order_index, is_entry, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.projectId, input.name, slug, input.description ?? null, input.htmlContent, input.viewport ?? 'desktop', orderRow?.n ?? 0, input.isEntry === true ? 1 : 0, now, now],
  );
  return (await getScreenById(id, input.projectId)) as WireframeScreen;
}

export async function updateScreen(screenId: string, projectId: string, patch: { name?: string; htmlContent?: string; description?: string | null; viewport?: 'mobile' | 'tablet' | 'desktop' }): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) { sets.push('name = ?'); params.push(patch.name); }
  if (patch.htmlContent !== undefined) { sets.push('html_content = ?'); params.push(patch.htmlContent); }
  if (patch.description !== undefined) { sets.push('description = ?'); params.push(patch.description); }
  if (patch.viewport !== undefined) { sets.push('viewport = ?'); params.push(patch.viewport); }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  params.push(nowIso(), screenId, projectId);
  await execute(`UPDATE wireframe_screens SET ${sets.join(', ')} WHERE id = ? AND project_id = ?`, params as never[]);
}

export async function deleteScreen(screenId: string, projectId: string): Promise<void> {
  await execute('DELETE FROM wireframe_screens WHERE id = ? AND project_id = ?', [screenId, projectId]);
}

/** Single batch: one UPDATE per screen, in the given order. */
export async function reorderScreens(projectId: string, orderedIds: string[]): Promise<void> {
  await transaction(async (tx) => {
    orderedIds.forEach((id, index) => {
      tx.run('UPDATE wireframe_screens SET order_index = ?, updated_at = ? WHERE id = ? AND project_id = ?', [index, nowIso(), id, projectId]);
    });
  });
}

export async function listFlowsForProject(projectId: string): Promise<{ id: string; fromScreenId: string; toScreenId: string; label: string | null; trigger: string | null }[]> {
  const rows = await query<{ id: string; from_screen_id: string; to_screen_id: string; label: string | null; trigger: string | null }>(
    'SELECT id, from_screen_id, to_screen_id, label, trigger FROM wireframe_flows WHERE project_id = ?',
    [projectId],
  );
  return rows.map((r) => ({ id: r.id, fromScreenId: r.from_screen_id, toScreenId: r.to_screen_id, label: r.label, trigger: r.trigger }));
}

export async function createFlow(projectId: string, fromScreenId: string, toScreenId: string, label?: string | null, trigger?: 'click' | 'submit' | 'auto' | null): Promise<string> {
  const id = newId('flw');
  await execute(
    'INSERT INTO wireframe_flows (id, project_id, from_screen_id, to_screen_id, label, trigger, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, projectId, fromScreenId, toScreenId, label ?? null, trigger ?? null, nowIso()],
  );
  return id;
}
