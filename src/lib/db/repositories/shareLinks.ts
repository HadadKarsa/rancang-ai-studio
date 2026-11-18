import { execute, query, queryOne } from '../client';
import { mapShareLink, type ShareLink, type ShareLinkRow } from '../types';
import { newId, newShareSlug, nowIso } from '@/lib/ids';

export interface CreateShareLinkInput {
  projectId: string;
  documentId?: string | null;
  scope: 'project' | 'document' | 'wireframe';
  access?: 'public' | 'password';
  passwordHash?: string | null;
  expiresAt?: string | null;
  maxViews?: number | null;
  createdByUserId?: string | null;
}

export async function createShareLink(input: CreateShareLinkInput): Promise<ShareLink> {
  const id = newId('shr');
  const slug = newShareSlug();
  await execute(
    `INSERT INTO share_links
       (id, project_id, document_id, slug, scope, access, password_hash, expires_at, max_views, created_by_user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.projectId, input.documentId ?? null, slug, input.scope, input.access ?? 'public',
     input.passwordHash ?? null, input.expiresAt ?? null, input.maxViews ?? null, input.createdByUserId ?? null, nowIso()],
  );
  const row = await getShareLinkById(id);
  if (!row) throw new Error('share link insert vanished');
  return row;
}

export async function getShareLinkById(id: string): Promise<ShareLink | null> {
  const row = await queryOne<ShareLinkRow>('SELECT * FROM share_links WHERE id = ?', [id]);
  return row ? mapShareLink(row) : null;
}

export async function getShareLinkBySlug(slug: string): Promise<ShareLink | null> {
  const row = await queryOne<ShareLinkRow>('SELECT * FROM share_links WHERE slug = ?', [slug]);
  return row ? mapShareLink(row) : null;
}

export async function listShareLinksForProject(projectId: string): Promise<ShareLink[]> {
  const rows = await query<ShareLinkRow>('SELECT * FROM share_links WHERE project_id = ? ORDER BY created_at DESC', [projectId]);
  return rows.map(mapShareLink);
}

export async function countActiveShareLinks(projectId: string): Promise<number> {
  const row = await queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM share_links WHERE project_id = ? AND revoked_at IS NULL', [projectId]);
  return row?.n ?? 0;
}

export async function incrementViewCount(slug: string): Promise<void> {
  await execute('UPDATE share_links SET view_count = view_count + 1, last_viewed_at = ? WHERE slug = ?', [nowIso(), slug]);
}

export async function revokeShareLink(id: string, projectId: string): Promise<void> {
  await execute('UPDATE share_links SET revoked_at = ? WHERE id = ? AND project_id = ?', [nowIso(), id, projectId]);
}
