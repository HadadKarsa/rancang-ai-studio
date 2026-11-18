import { execute, query, queryOne } from '../client';
import { mapGenerationRun, type GenerationRun, type GenerationRunRow } from '../types';
import type { GenerationKind, GenerationStatus } from '../enums';
import { newId, nowIso } from '@/lib/ids';

export interface CreateRunInput {
  projectId: string;
  documentId?: string | null;
  sessionId?: string | null;
  kind: GenerationKind;
  provider: string;
  modelId: string;
  presetId?: string | null;
  credentialId?: string | null;
}

export async function createRun(input: CreateRunInput): Promise<GenerationRun> {
  const id = newId('run');
  await execute(
    `INSERT INTO generation_runs (id, project_id, document_id, session_id, kind, status, provider, model_id, preset_id, credential_id, created_at)
     VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?)`,
    [id, input.projectId, input.documentId ?? null, input.sessionId ?? null, input.kind, input.provider, input.modelId, input.presetId ?? null, input.credentialId ?? null, nowIso()],
  );
  const row = await getRunById(id);
  if (!row) throw new Error('run insert vanished');
  return row;
}

export async function getRunById(id: string): Promise<GenerationRun | null> {
  const row = await queryOne<GenerationRunRow>('SELECT * FROM generation_runs WHERE id = ?', [id]);
  return row ? mapGenerationRun(row) : null;
}

export async function markRunStreaming(id: string): Promise<void> {
  await execute("UPDATE generation_runs SET status = 'streaming' WHERE id = ?", [id]);
}

export async function markRunSucceeded(id: string, usage: { promptTokens?: number | null; completionTokens?: number | null; latencyMs?: number | null; costUsd?: number | null }): Promise<void> {
  await execute(
    "UPDATE generation_runs SET status = 'succeeded', prompt_tokens = ?, completion_tokens = ?, latency_ms = ?, cost_usd = ?, completed_at = ? WHERE id = ?",
    [usage.promptTokens ?? null, usage.completionTokens ?? null, usage.latencyMs ?? null, usage.costUsd ?? null, nowIso(), id],
  );
}

export async function markRunFailed(id: string, errorCode: string, errorMessage: string): Promise<void> {
  await execute(
    "UPDATE generation_runs SET status = 'failed', error_code = ?, error_message = ?, completed_at = ? WHERE id = ?",
    [errorCode, errorMessage.slice(0, 2000), nowIso(), id],
  );
}

export async function markRunAborted(id: string): Promise<void> {
  await execute("UPDATE generation_runs SET status = 'aborted', completed_at = ? WHERE id = ?", [nowIso(), id]);
}

export async function listRunsForProject(projectId: string, limit = 50): Promise<GenerationRun[]> {
  const rows = await query<GenerationRunRow>(
    'SELECT * FROM generation_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?',
    [projectId, limit],
  );
  return rows.map(mapGenerationRun);
}

/** 503 GENERATION_IN_PROGRESS check: any run still streaming for this document. */
export async function findActiveRunForDocument(documentId: string): Promise<GenerationRun | null> {
  const row = await queryOne<GenerationRunRow>(
    "SELECT * FROM generation_runs WHERE document_id = ? AND status IN ('queued','streaming') ORDER BY created_at DESC LIMIT 1",
    [documentId],
  );
  return row ? mapGenerationRun(row) : null;
}

/** Cleanup sweep: runs stuck in queued/streaming past the TTL are marked aborted. */
export async function sweepStaleRuns(olderThanMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const rs = await execute(
    "UPDATE generation_runs SET status = 'aborted', completed_at = ? WHERE status IN ('queued','streaming') AND created_at < ?",
    [nowIso(), cutoff],
  );
  return rs.rowsAffected ?? 0;
}

export type { GenerationStatus };
