import { execute, query, queryOne } from '../client';
import { mapProjectAsset, type ProjectAsset, type ProjectAssetRow } from '../types';
import { newId, nowIso } from '@/lib/ids';

export async function listAssetsForProject(projectId: string): Promise<ProjectAsset[]> {
  const rows = await query<ProjectAssetRow>(
    'SELECT * FROM project_assets WHERE project_id = ? ORDER BY created_at DESC',
    [projectId],
  );
  return rows.map(mapProjectAsset);
}

export async function getAssetById(assetId: string, projectId: string): Promise<ProjectAsset | null> {
  const row = await queryOne<ProjectAssetRow>('SELECT * FROM project_assets WHERE id = ? AND project_id = ?', [assetId, projectId]);
  return row ? mapProjectAsset(row) : null;
}

export interface CreateAssetInput {
  projectId: string;
  kind: 'file' | 'snippet' | 'url';
  name: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  storagePath?: string | null;
  contentText?: string | null;
  sourceUrl?: string | null;
  injectIntoGeneration?: boolean;
}

export async function createAsset(input: CreateAssetInput): Promise<ProjectAsset> {
  const id = newId('ast');
  await execute(
    `INSERT INTO project_assets
       (id, project_id, kind, name, mime_type, size_bytes, storage_path, content_text, source_url, inject_into_generation, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.projectId, input.kind, input.name, input.mimeType ?? null, input.sizeBytes ?? null,
     input.storagePath ?? null, input.contentText ?? null, input.sourceUrl ?? null,
     input.injectIntoGeneration === false ? 0 : 1, nowIso()],
  );
  const asset = await getAssetById(id, input.projectId);
  if (!asset) throw new Error('asset insert vanished');
  return asset;
}

export async function updateAsset(assetId: string, projectId: string, patch: { name?: string; injectIntoGeneration?: boolean }): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) { sets.push('name = ?'); params.push(patch.name); }
  if (patch.injectIntoGeneration !== undefined) { sets.push('inject_into_generation = ?'); params.push(patch.injectIntoGeneration ? 1 : 0); }
  if (sets.length === 0) return;
  params.push(assetId, projectId);
  await execute(`UPDATE project_assets SET ${sets.join(', ')} WHERE id = ? AND project_id = ?`, params as never[]);
}

export async function deleteAsset(assetId: string, projectId: string): Promise<void> {
  await execute('DELETE FROM project_assets WHERE id = ? AND project_id = ?', [assetId, projectId]);
}

/** Injected assets feed the generation context (T-306 step 1). */
export async function listInjectedAssets(projectId: string): Promise<ProjectAsset[]> {
  const rows = await query<ProjectAssetRow>(
    'SELECT * FROM project_assets WHERE project_id = ? AND inject_into_generation = 1 ORDER BY created_at',
    [projectId],
  );
  return rows.map(mapProjectAsset);
}
