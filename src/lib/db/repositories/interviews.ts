import { execute, query, queryOne, transaction } from '../client';
import { mapInterviewMessage, mapInterviewSession, type InterviewMessage, type InterviewMessageRow, type InterviewSession, type InterviewSessionRow } from '../types';
import { newId, nowIso } from '@/lib/ids';

export async function getSessionById(sessionId: string): Promise<InterviewSession | null> {
  const row = await queryOne<InterviewSessionRow>('SELECT * FROM interview_sessions WHERE id = ?', [sessionId]);
  return row ? mapInterviewSession(row) : null;
}

export async function getActiveSessionForProject(projectId: string): Promise<InterviewSession | null> {
  const row = await queryOne<InterviewSessionRow>(
    "SELECT * FROM interview_sessions WHERE project_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1",
    [projectId],
  );
  return row ? mapInterviewSession(row) : null;
}

export async function listSessionsForProject(projectId: string, limit = 20): Promise<InterviewSession[]> {
  const rows = await query<InterviewSessionRow>(
    'SELECT * FROM interview_sessions WHERE project_id = ? ORDER BY created_at DESC LIMIT ?',
    [projectId, limit],
  );
  return rows.map(mapInterviewSession);
}

export async function createSession(input: { projectId: string; templateId?: string | null; presetId?: string | null; totalSteps?: number }): Promise<InterviewSession> {
  const id = newId('ses');
  const now = nowIso();
  await execute(
    `INSERT INTO interview_sessions (id, project_id, template_id, preset_id, status, current_step, total_steps, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', 1, ?, ?, ?)`,
    [id, input.projectId, input.templateId ?? null, input.presetId ?? null, input.totalSteps ?? 8, now, now],
  );
  const session = await getSessionById(id);
  if (!session) throw new Error('session insert vanished');
  return session;
}

/** Mark any active session for this project abandoned (used by restart=true). */
export async function abandonActiveSessions(projectId: string): Promise<void> {
  await execute(
    "UPDATE interview_sessions SET status = 'abandoned', updated_at = ? WHERE project_id = ? AND status = 'active'",
    [nowIso(), projectId],
  );
}

export async function appendMessage(input: { sessionId: string; role: 'assistant' | 'user' | 'system'; content: string; questionIndex?: number | null; metadata?: Record<string, unknown> | null; tokenCount?: number | null }): Promise<InterviewMessage> {
  const id = newId('msg');
  const now = nowIso();
  await execute(
    `INSERT INTO interview_messages (id, session_id, role, content, question_index, metadata_json, token_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.sessionId, input.role, input.content, input.questionIndex ?? null, input.metadata ? JSON.stringify(input.metadata) : null, input.tokenCount ?? null, now],
  );
  const row = await queryOne<InterviewMessageRow>('SELECT * FROM interview_messages WHERE id = ?', [id]);
  if (!row) throw new Error('message insert vanished');
  return mapInterviewMessage(row);
}

/** Ordered transcript. rowid breaks created_at ties deterministically (T-107). */
export async function listMessages(sessionId: string): Promise<InterviewMessage[]> {
  const rows = await query<InterviewMessageRow>(
    'SELECT * FROM interview_messages WHERE session_id = ? ORDER BY created_at, rowid',
    [sessionId],
  );
  return rows.map(mapInterviewMessage);
}

export async function updateSessionProgress(sessionId: string, currentStep: number, totalSteps?: number): Promise<void> {
  if (totalSteps !== undefined) {
    await execute('UPDATE interview_sessions SET current_step = ?, total_steps = ?, updated_at = ? WHERE id = ?', [currentStep, totalSteps, nowIso(), sessionId]);
  } else {
    await execute('UPDATE interview_sessions SET current_step = ?, updated_at = ? WHERE id = ?', [currentStep, nowIso(), sessionId]);
  }
}

export async function completeSession(sessionId: string, summary?: string): Promise<void> {
  const now = nowIso();
  await execute(
    "UPDATE interview_sessions SET status = 'completed', completed_at = ?, summary = COALESCE(?, summary), updated_at = ? WHERE id = ?",
    [now, summary ?? null, now, sessionId],
  );
}

export async function countUserMessages(sessionId: string): Promise<number> {
  const row = await queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM interview_messages WHERE session_id = ? AND role = 'user'", [sessionId]);
  return row?.n ?? 0;
}
