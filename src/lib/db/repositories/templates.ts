import { execute, query, queryOne } from '../client';
import { mapProjectTemplate, mapTag, type ProjectTemplate, type ProjectTemplateRow, type Tag, type TagRow } from '../types';
import type { TemplateCategory } from '../enums';
import { newId, nowIso } from '@/lib/ids';

// ── project_templates ────────────────────────────────────────────────────────

export async function listTemplates(userId: string): Promise<ProjectTemplate[]> {
  const rows = await query<ProjectTemplateRow>(
    'SELECT * FROM project_templates WHERE is_system = 1 OR owner_user_id = ? ORDER BY is_system DESC, usage_count DESC, name',
    [userId],
  );
  return rows.map(mapProjectTemplate);
}

export async function getTemplateById(id: string): Promise<ProjectTemplate | null> {
  const row = await queryOne<ProjectTemplateRow>('SELECT * FROM project_templates WHERE id = ?', [id]);
  return row ? mapProjectTemplate(row) : null;
}

export async function getTemplateBySlug(slug: string): Promise<ProjectTemplate | null> {
  const row = await queryOne<ProjectTemplateRow>('SELECT * FROM project_templates WHERE slug = ?', [slug]);
  return row ? mapProjectTemplate(row) : null;
}

export interface CreateTemplateInput {
  userId: string;
  name: string;
  description: string;
  category?: TemplateCategory;
  icon?: string;
  accentColor?: string;
  baselineAssumptions?: string[];
  defaultQuestions?: string[];
}

export async function createTemplate(input: CreateTemplateInput): Promise<ProjectTemplate> {
  const id = newId('tpl');
  const now = nowIso();
  const slug = input.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || newId('tpl');
  await execute(
    `INSERT INTO project_templates
       (id, slug, name, description, category, icon, accent_color, baseline_assumptions_json, default_questions_json, is_system, owner_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [id, `${slug}-${id.slice(-6)}`, input.name, input.description, input.category ?? 'other', input.icon ?? 'Sparkles',
     input.accentColor ?? '#6366f1', JSON.stringify(input.baselineAssumptions ?? []), JSON.stringify(input.defaultQuestions ?? []),
     input.userId, now, now],
  );
  const row = await getTemplateById(id);
  if (!row) throw new Error('template insert vanished');
  return row;
}

export async function updateTemplate(id: string, userId: string, patch: { name?: string; description?: string; baselineAssumptions?: string[]; defaultQuestions?: string[] }): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) { sets.push('name = ?'); params.push(patch.name); }
  if (patch.description !== undefined) { sets.push('description = ?'); params.push(patch.description); }
  if (patch.baselineAssumptions !== undefined) { sets.push('baseline_assumptions_json = ?'); params.push(JSON.stringify(patch.baselineAssumptions)); }
  if (patch.defaultQuestions !== undefined) { sets.push('default_questions_json = ?'); params.push(JSON.stringify(patch.defaultQuestions)); }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  params.push(nowIso(), id, userId, 0);
  await execute(`UPDATE project_templates SET ${sets.join(', ')} WHERE id = ? AND owner_user_id = ? AND is_system = ?`, params as never[]);
}

export async function deleteTemplate(id: string, userId: string): Promise<void> {
  await execute('DELETE FROM project_templates WHERE id = ? AND owner_user_id = ? AND is_system = 0', [id, userId]);
}

export async function incrementTemplateUsage(templateId: string): Promise<void> {
  await execute('UPDATE project_templates SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?', [nowIso(), templateId]);
}

// ── tags ─────────────────────────────────────────────────────────────────────

export async function listTagsForUser(userId: string): Promise<Tag[]> {
  const rows = await query<TagRow & { project_count: number }>(
    `SELECT t.*, COUNT(pt.project_id) AS project_count
     FROM tags t LEFT JOIN project_tags pt ON pt.tag_id = t.id
     WHERE t.user_id = ? GROUP BY t.id ORDER BY t.name`,
    [userId],
  );
  return rows.map((r) => ({ ...mapTag(r), projectCount: r.project_count }));
}

export async function getTagById(id: string, userId: string): Promise<Tag | null> {
  const row = await queryOne<TagRow>('SELECT * FROM tags WHERE id = ? AND user_id = ?', [id, userId]);
  return row ? mapTag(row) : null;
}

export async function createTag(userId: string, name: string, color?: string): Promise<Tag> {
  const id = newId('tag');
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  await execute('INSERT INTO tags (id, user_id, name, slug, color, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, userId, name, slug, color ?? '#94a3b8', nowIso()]);
  const tag = await getTagById(id, userId);
  if (!tag) throw new Error('tag insert vanished');
  return tag;
}

export async function updateTag(id: string, userId: string, patch: { name?: string; color?: string }): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push('name = ?', 'slug = ?');
    params.push(patch.name, patch.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
  }
  if (patch.color !== undefined) { sets.push('color = ?'); params.push(patch.color); }
  if (sets.length === 0) return;
  params.push(id, userId);
  await execute(`UPDATE tags SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, params as never[]);
}

export async function deleteTag(id: string, userId: string): Promise<void> {
  await execute('DELETE FROM tags WHERE id = ? AND user_id = ?', [id, userId]);
}

export async function attachTagsToProject(projectId: string, tagIds: string[]): Promise<void> {
  const now = nowIso();
  for (const tagId of tagIds) {
    await execute('INSERT OR IGNORE INTO project_tags (project_id, tag_id, created_at) VALUES (?, ?, ?)', [projectId, tagId, now]);
  }
}

export async function detachTagFromProject(projectId: string, tagId: string): Promise<void> {
  await execute('DELETE FROM project_tags WHERE project_id = ? AND tag_id = ?', [projectId, tagId]);
}

export async function replaceProjectTags(projectId: string, tagIds: string[]): Promise<void> {
  await execute('DELETE FROM project_tags WHERE project_id = ?', [projectId]);
  await attachTagsToProject(projectId, tagIds);
}

export async function listTagsForProject(projectId: string): Promise<Tag[]> {
  const rows = await query<TagRow>(
    'SELECT t.* FROM tags t JOIN project_tags pt ON pt.tag_id = t.id WHERE pt.project_id = ? ORDER BY t.name',
    [projectId],
  );
  return rows.map(mapTag);
}
