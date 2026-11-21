import { createHash } from 'node:crypto';
import { execute, query, queryOne, transaction } from '../client';
import { mapDocumentVersion, mapSpecDocument, type DocumentVersion, type DocumentVersionRow, type SpecDocument, type SpecDocumentRow } from '../types';
import type { DocumentType, VersionSource, ProviderId } from '../enums';
import { newId, nowIso } from '@/lib/ids';

export async function getDocumentByType(projectId: string, type: DocumentType): Promise<SpecDocument | null> {
  const row = await queryOne<SpecDocumentRow>('SELECT * FROM spec_documents WHERE project_id = ? AND type = ?', [projectId, type]);
  return row ? mapSpecDocument(row) : null;
}

export async function listDocuments(projectId: string): Promise<SpecDocument[]> {
  const rows = await query<SpecDocumentRow>('SELECT * FROM spec_documents WHERE project_id = ? ORDER BY order_index', [projectId]);
  return rows.map(mapSpecDocument);
}

export async function getDocumentById(documentId: string): Promise<SpecDocument | null> {
  const row = await queryOne<SpecDocumentRow>('SELECT * FROM spec_documents WHERE id = ?', [documentId]);
  return row ? mapSpecDocument(row) : null;
}

export async function setDocumentStatus(documentId: string, status: SpecDocument['status']): Promise<void> {
  const now = nowIso();
  if (status === 'ready') {
    await execute('UPDATE spec_documents SET status = ?, last_generated_at = ?, updated_at = ? WHERE id = ?', [status, now, now, documentId]);
  } else {
    await execute('UPDATE spec_documents SET status = ?, updated_at = ? WHERE id = ?', [status, now, documentId]);
  }
}

/**
 * Repair documents whose status got stuck while their text is already stored.
 * A batch that is cancelled, or a server that dies mid-stream, leaves the row
 * `pending`/`generating` even though a version was persisted — and the
 * documents page filters on status, so the text the user already paid for
 * looks like it never arrived. `failed` is deliberately left alone: it is a
 * real signal, not a stuck state.
 */
export async function repairStaleDocumentStatuses(projectId: string): Promise<number> {
  const now = nowIso();
  const r = await execute(
    `UPDATE spec_documents SET status = 'ready', last_generated_at = COALESCE(last_generated_at, ?), updated_at = ?
     WHERE project_id = ? AND current_version_id IS NOT NULL AND status IN ('pending', 'generating')`,
    [now, now, projectId],
  );
  return r.rowsAffected;
}

export async function setDocumentLock(documentId: string, locked: boolean): Promise<void> {
  await execute('UPDATE spec_documents SET is_locked = ?, updated_at = ? WHERE id = ?', [locked ? 1 : 0, nowIso(), documentId]);
}

function contentHash(contentMd: string): string {
  return createHash('sha256').update(contentMd).digest('hex');
}

export interface CreateVersionInput {
  documentId: string;
  contentMd: string;
  source: VersionSource;
  changeSummary?: string | null;
  modelUsed?: string | null;
  provider?: ProviderId | null;
  presetId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  generationMs?: number | null;
  createdByUserId?: string | null;
}

/**
 * Insert a new version and repoint the document's head — atomically.
 * version_number is MAX(n)+1 computed inside the transaction.
 */
export async function createVersionSnapshot(input: CreateVersionInput): Promise<DocumentVersion> {
  const id = newId('ver');
  const now = nowIso();
  const hash = contentHash(input.contentMd);

  await transaction(async (tx) => {
    tx.run(
      `INSERT INTO document_versions
         (id, document_id, version_number, content_md, content_hash, source, change_summary,
          model_used, provider, preset_id, prompt_tokens, completion_tokens, generation_ms, created_by_user_id, created_at)
       VALUES (?, ?, (SELECT COALESCE(MAX(version_number), 0) + 1 FROM document_versions WHERE document_id = ?),
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.documentId, input.documentId, input.contentMd, hash, input.source, input.changeSummary ?? null,
       input.modelUsed ?? null, input.provider ?? null, input.presetId ?? null, input.promptTokens ?? null,
       input.completionTokens ?? null, input.generationMs ?? null, input.createdByUserId ?? null, now],
    );
    tx.run(
      'UPDATE spec_documents SET current_version_id = ?, updated_at = ? WHERE id = ?',
      [id, now, input.documentId],
    );
  });

  const row = await queryOne<DocumentVersionRow>('SELECT * FROM document_versions WHERE id = ?', [id]);
  if (!row) throw new Error('version insert vanished');
  return mapDocumentVersion(row);
}

export async function listVersions(documentId: string, limit = 50): Promise<DocumentVersion[]> {
  const rows = await query<DocumentVersionRow>(
    'SELECT * FROM document_versions WHERE document_id = ? ORDER BY version_number DESC LIMIT ?',
    [documentId, limit],
  );
  return rows.map(mapDocumentVersion);
}

export async function getVersionById(versionId: string): Promise<DocumentVersion | null> {
  const row = await queryOne<DocumentVersionRow>('SELECT * FROM document_versions WHERE id = ?', [versionId]);
  return row ? mapDocumentVersion(row) : null;
}

export async function getCurrentVersion(documentId: string): Promise<DocumentVersion | null> {
  const doc = await getDocumentById(documentId);
  if (!doc?.currentVersionId) return null;
  return getVersionById(doc.currentVersionId);
}

export async function deleteVersion(versionId: string): Promise<void> {
  // Deleting the head version is refused at the service layer; here we only guard the FK.
  await execute('DELETE FROM document_versions WHERE id = ?', [versionId]);
}

/** Latest version number per document for a whole project (documentSummary + exports). */
export async function listCurrentVersionsForProject(projectId: string): Promise<Map<DocumentType, DocumentVersion>> {
  const rows = await query<DocumentVersionRow & { type: DocumentType }>(
    `SELECT dv.*, sd.type FROM document_versions dv
     JOIN spec_documents sd ON sd.current_version_id = dv.id
     WHERE sd.project_id = ?`,
    [projectId],
  );
  const map = new Map<DocumentType, DocumentVersion>();
  for (const r of rows) map.set(r.type, mapDocumentVersion(r));
  return map;
}
