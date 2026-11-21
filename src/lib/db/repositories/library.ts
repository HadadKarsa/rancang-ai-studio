import { execute, query, queryOne } from '../client';
import { newId, nowIso } from '@/lib/ids';

export type LibraryKind = 'document' | 'export' | 'wireframe';

export interface LibraryItemRow {
  id: string;
  user_id: string;
  kind: LibraryKind;
  title: string;
  project_id: string | null;
  document_id: string | null;
  payload: string;
  bytes: number;
  created_at: string;
}

export interface LibraryItem {
  id: string;
  kind: LibraryKind;
  title: string;
  projectId: string | null;
  projectName: string | null;
  documentId: string | null;
  documentType: string | null;
  createdAt: string;
  bytes: number;
}

/** Row joined to the project + document it came from, for readable lists. */
type JoinedRow = LibraryItemRow & { project_name: string | null; document_type: string | null };

function mapJoined(r: JoinedRow): LibraryItem {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    projectId: r.project_id,
    projectName: r.project_name,
    documentId: r.document_id,
    documentType: r.document_type,
    createdAt: r.created_at,
    bytes: r.bytes,
  };
}

export interface CreateLibraryInput {
  userId: string;
  kind: LibraryKind;
  title: string;
  projectId?: string | null;
  documentId?: string | null;
  payload: string;
}

export async function createLibraryItem(input: CreateLibraryInput): Promise<LibraryItem> {
  const id = newId('lib');
  const bytes = Buffer.byteLength(input.payload, 'utf8');
  await execute(
    `INSERT INTO library_items (id, user_id, kind, title, project_id, document_id, payload, bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.userId, input.kind, input.title, input.projectId ?? null, input.documentId ?? null, input.payload, bytes, nowIso()],
  );
  const item = await getLibraryItem(id, input.userId);
  if (!item) throw new Error('library insert vanished');
  return item;
}

export async function getLibraryItem(id: string, userId: string): Promise<LibraryItem | null> {
  const row = await queryOne<JoinedRow>(
    `SELECT l.*, p.name AS project_name, d.type AS document_type
       FROM library_items l
       LEFT JOIN projects p ON p.id = l.project_id
       LEFT JOIN spec_documents d ON d.id = l.document_id
      WHERE l.id = ? AND l.user_id = ?`,
    [id, userId],
  );
  return row ? mapJoined(row) : null;
}

export interface ListLibraryOpts {
  type?: LibraryKind;
  q?: string;
  cursor?: string;
  limit?: number;
}

export async function listLibraryItems(userId: string, opts: ListLibraryOpts = {}): Promise<{ items: LibraryItem[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const where: string[] = ['l.user_id = ?'];
  const params: unknown[] = [userId];
  if (opts.type) { where.push('l.kind = ?'); params.push(opts.type); }
  if (opts.q) { where.push('l.title LIKE ?'); params.push(`%${opts.q}%`); }
  // Keyset on created_at DESC, id DESC. The cursor is the last item's created_at.
  if (opts.cursor) { where.push('l.created_at < ?'); params.push(opts.cursor); }

  const rows = await query<JoinedRow>(
    `SELECT l.*, p.name AS project_name, d.type AS document_type
       FROM library_items l
       LEFT JOIN projects p ON p.id = l.project_id
       LEFT JOIN spec_documents d ON d.id = l.document_id
      WHERE ${where.join(' AND ')}
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ?`,
    [...params, limit + 1] as never[],
  );
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = page.map(mapJoined);
  const nextCursor = hasMore ? items[items.length - 1]!.createdAt : null;
  return { items, nextCursor };
}

export async function getLibraryPayload(id: string, userId: string): Promise<string | null> {
  const row = await queryOne<{ payload: string }>('SELECT payload FROM library_items WHERE id = ? AND user_id = ?', [id, userId]);
  return row?.payload ?? null;
}

export async function deleteLibraryItem(id: string, userId: string): Promise<boolean> {
  const r = await execute('DELETE FROM library_items WHERE id = ? AND user_id = ?', [id, userId]);
  return r.rowsAffected > 0;
}
