import { execute, query, queryOne, transaction } from '../client';
import { mapProject, type Project, type ProjectRow } from '../types';
import { DOCUMENT_TYPES, type DocumentType, type ProjectStatus } from '../enums';
import { newId, nowIso } from '@/lib/ids';

export interface CreateProjectInput {
  userId: string;
  name: string;
  description?: string | null;
  templateId?: string | null;
  defaultPresetId?: string | null;
  accentColor?: string;
  icon?: string | null;
}

const DOC_TITLES: Record<DocumentType, string> = {
  prd: 'Product Requirements',
  architecture: 'System Architecture',
  database: 'Database Schema',
  api: 'API Contracts',
  tasks: 'Task Checklist',
  memory: 'Project Memory',
  wireframe: 'Wireframe Sandbox',
};

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'project';
}

/**
 * Create a project and its scaffold in one transaction (T-106):
 * 1 project row, 7 spec_documents rows (status='pending'), 1 active interview session.
 */
export async function createProjectWithScaffold(input: CreateProjectInput): Promise<Project> {
  const id = newId('prj');
  const now = nowIso();
  const slug = slugify(input.name);
  const docIds: string[] = [];
  const sessionId = newId('ses');

  await transaction(async (tx) => {
    tx.run(
      `INSERT INTO projects (id, user_id, template_id, default_preset_id, name, slug, description, status, icon, accent_color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
      [id, input.userId, input.templateId ?? null, input.defaultPresetId ?? null, input.name, slug, input.description ?? null, input.icon ?? null, input.accentColor ?? '#6366f1', now, now],
    );
    DOCUMENT_TYPES.forEach((type, index) => {
      const docId = newId('doc');
      docIds.push(docId);
      tx.run(
        `INSERT INTO spec_documents (id, project_id, type, title, status, order_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
        [docId, id, type, DOC_TITLES[type], index + 1, now, now],
      );
    });
    tx.run(
      `INSERT INTO interview_sessions (id, project_id, template_id, preset_id, status, current_step, total_steps, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', 1, 8, ?, ?)`,
      [sessionId, id, input.templateId ?? null, input.defaultPresetId ?? null, now, now],
    );
  });

  const project = await getProjectById(id, input.userId);
  if (!project) throw new Error('project insert vanished');
  return project;
}

export async function getProjectById(id: string, userId: string): Promise<Project | null> {
  const row = await queryOne<ProjectRow>('SELECT * FROM projects WHERE id = ? AND user_id = ?', [id, userId]);
  return row ? mapProject(row) : null;
}

/** Ownership-free lookup for the public share view. */
export async function getProjectRowById(id: string): Promise<Project | null> {
  const row = await queryOne<ProjectRow>('SELECT * FROM projects WHERE id = ?', [id]);
  return row ? mapProject(row) : null;
}

export interface ListProjectsOpts {
  q?: string;
  status?: ProjectStatus;
  tagIds?: string[];
  templateId?: string;
  sort?: 'created_at' | 'updated_at' | 'name';
  order?: 'asc' | 'desc';
  limit?: number;
  cursorCreated?: string;
  cursorId?: string;
}

export interface ProjectWithProgress extends Project {
  /** Documents that have a stored current version and status 'ready'. */
  docsReady: number;
  /** How many documents a project is scaffolded with (DOCUMENT_TYPES.length). */
  docsTotal: number;
}

export interface ProjectCounts {
  all: number;
  draft: number;
  interviewing: number;
  generating: number;
  ready: number;
  archived: number;
}

export interface ProjectListResult {
  items: ProjectWithProgress[];
  nextCursor: { createdAt: string; id: string } | null;
  total: number;
  counts: ProjectCounts;
}

interface FilterParts {
  where: string;
  params: unknown[];
}

/**
 * Shared WHERE builder for the list and its chip counts. `includeStatus` is
 * false for the counts query so every status is visible to the tabs while the
 * search/template/tag filters still apply to them.
 */
function buildProjectFilters(userId: string, opts: ListProjectsOpts, includeStatus: boolean): FilterParts {
  const params: unknown[] = [userId];
  let where = 'p.user_id = ?';

  if (includeStatus) {
    // Archived excluded unless explicitly requested (04_API §3.3).
    if (opts.status) {
      where += ' AND p.status = ?';
      params.push(opts.status);
    } else {
      where += " AND p.status != 'archived'";
    }
  }
  if (opts.q) {
    where += " AND (LOWER(p.name) LIKE ? OR LOWER(COALESCE(p.description, '')) LIKE ?)";
    const like = `%${opts.q.toLowerCase()}%`;
    params.push(like, like);
  }
  if (opts.templateId) {
    where += ' AND p.template_id = ?';
    params.push(opts.templateId);
  }
  if (opts.tagIds && opts.tagIds.length > 0) {
    // AND semantics: project must carry every requested tag.
    where += ` AND (SELECT COUNT(DISTINCT pt.tag_id) FROM project_tags pt
                WHERE pt.project_id = p.id AND pt.tag_id IN (${opts.tagIds.map(() => '?').join(',')})) = ?`;
    params.push(...opts.tagIds, opts.tagIds.length);
  }
  return { where, params };
}

/** Chip counts for the dashboard: one GROUP BY, over the same filters minus status. */
export async function countProjectsForList(userId: string, opts: ListProjectsOpts = {}): Promise<ProjectCounts> {
  const { where, params } = buildProjectFilters(userId, opts, false);
  const rows = await query<{ status: ProjectStatus; n: number }>(
    `SELECT p.status AS status, COUNT(*) AS n FROM projects p WHERE ${where} GROUP BY p.status`,
    params as never[],
  );
  const counts: ProjectCounts = { all: 0, draft: 0, interviewing: 0, generating: 0, ready: 0, archived: 0 };
  for (const r of rows) {
    const n = Number(r.n);
    if (r.status === 'archived') counts.archived = n;
    else if (r.status === 'draft' || r.status === 'interviewing' || r.status === 'generating' || r.status === 'ready') counts[r.status] = n;
  }
  counts.all = counts.draft + counts.interviewing + counts.generating + counts.ready;
  return counts;
}

export async function listProjectsByUser(userId: string, opts: ListProjectsOpts = {}): Promise<ProjectListResult> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const sortCol = opts.sort === 'created_at' || opts.sort === 'name' ? opts.sort : 'updated_at';
  const dir = opts.order === 'asc' ? 'ASC' : 'DESC';
  const { where: baseWhere, params: baseParams } = buildProjectFilters(userId, opts, true);
  let where = baseWhere;
  const params = [...baseParams];

  const totalRow = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM projects p WHERE ${where}`, params as never[]);
  const total = totalRow?.n ?? 0;

  if (opts.cursorCreated && opts.cursorId && sortCol !== 'name') {
    where += ` AND (p.${sortCol} < ? OR (p.${sortCol} = ? AND p.id < ?))`;
    params.push(opts.cursorCreated, opts.cursorCreated, opts.cursorId);
  }

  const nameCol = sortCol === 'name' ? 'LOWER(p.name)' : `p.${sortCol}`;
  // One aggregate join for document progress — no per-project query.
  const rows = await query<ProjectRow & { docs_ready: number | null }>(
    `SELECT p.*, COALESCE(d.docs_ready, 0) AS docs_ready FROM projects p
     LEFT JOIN (
       SELECT project_id, COUNT(*) AS docs_ready FROM spec_documents
       WHERE current_version_id IS NOT NULL AND status = 'ready'
       GROUP BY project_id
     ) d ON d.project_id = p.id
     WHERE ${where}
     ORDER BY ${nameCol} ${dir}, p.id ${dir} LIMIT ?`,
    [...params, limit + 1] as never[],
  );

  const hasMore = rows.length > limit;
  const docsTotal = DOCUMENT_TYPES.length;
  const items: ProjectWithProgress[] = rows.slice(0, limit).map((r) => ({
    ...mapProject(r),
    docsReady: Number(r.docs_ready ?? 0),
    docsTotal,
  }));
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? { createdAt: last.createdAt, id: last.id } : null;
  const counts = await countProjectsForList(userId, opts);
  return { items, nextCursor, total, counts };
}

export interface UpdateProjectPatch {
  name?: string;
  description?: string | null;
  status?: ProjectStatus;
  defaultPresetId?: string | null;
  icon?: string | null;
  accentColor?: string;
  lastOpenedAt?: string;
  /** Set null on restore so the archive timestamp does not linger. */
  archivedAt?: string | null;
}

export async function updateProject(id: string, userId: string, patch: UpdateProjectPatch): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) { sets.push('name = ?'); params.push(patch.name); }
  if (patch.description !== undefined) { sets.push('description = ?'); params.push(patch.description); }
  if (patch.status !== undefined) { sets.push('status = ?'); params.push(patch.status); }
  if (patch.defaultPresetId !== undefined) { sets.push('default_preset_id = ?'); params.push(patch.defaultPresetId); }
  if (patch.icon !== undefined) { sets.push('icon = ?'); params.push(patch.icon); }
  if (patch.accentColor !== undefined) { sets.push('accent_color = ?'); params.push(patch.accentColor); }
  if (patch.lastOpenedAt !== undefined) { sets.push('last_opened_at = ?'); params.push(patch.lastOpenedAt); }
  if (patch.archivedAt !== undefined) { sets.push('archived_at = ?'); params.push(patch.archivedAt); }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  params.push(nowIso(), id, userId);
  await execute(`UPDATE projects SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, params as never[]);
}

/** Count documents that carry a stored, ready version — used to derive a restore status. */
export async function countReadyDocuments(projectId: string): Promise<number> {
  const row = await queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM spec_documents WHERE project_id = ? AND current_version_id IS NOT NULL AND status = 'ready'",
    [projectId],
  );
  return Number(row?.n ?? 0);
}

/** True when the project has an interview session that actually has messages. */
export async function hasInterviewContent(projectId: string): Promise<boolean> {
  const row = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM interview_messages m
     JOIN interview_sessions s ON s.id = m.session_id
     WHERE s.project_id = ?`,
    [projectId],
  );
  return Number(row?.n ?? 0) > 0;
}

/** Soft delete: archived_at set, status='archived'. */
export async function archiveProject(id: string, userId: string): Promise<void> {
  const now = nowIso();
  await execute(
    "UPDATE projects SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    [now, now, id, userId],
  );
}

/** Hard delete — cascades to all children. Irreversible. */
export async function deleteProject(id: string, userId: string): Promise<void> {
  await execute('DELETE FROM projects WHERE id = ? AND user_id = ?', [id, userId]);
}

export async function countProjectsByStatus(userId: string): Promise<Record<ProjectStatus, number>> {
  const rows = await query<{ status: ProjectStatus; n: number }>(
    'SELECT status, COUNT(*) AS n FROM projects WHERE user_id = ? GROUP BY status',
    [userId],
  );
  const out: Record<string, number> = { draft: 0, interviewing: 0, generating: 0, ready: 0, archived: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out as Record<ProjectStatus, number>;
}
