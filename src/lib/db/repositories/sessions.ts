import { randomBytes } from 'node:crypto';
import { execute, queryOne } from '../client';
import { newId, nowIso } from '@/lib/ids';

/** Cookie session rows (migrations/001 sessions table). Value = session_token. */

export interface SessionRow {
  id: string;
  session_token: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

export const SESSION_TTL_DAYS = 30;

function token(): string {
  return randomBytes(32).toString('base64url');
}

export async function createSession(userId: string, ttlDays = SESSION_TTL_DAYS): Promise<{ token: string; expiresAt: string }> {
  const id = newId('ses');
  const value = token();
  const now = new Date();
  const expires = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
  await execute(
    'INSERT INTO sessions (id, session_token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, value, userId, expires.toISOString(), now.toISOString()],
  );
  return { token: value, expiresAt: expires.toISOString() };
}

/** Returns the row only if it exists and has not expired; deletes a stale row. */
export async function findValidSession(value: string): Promise<SessionRow | null> {
  const row = await queryOne<SessionRow>('SELECT * FROM sessions WHERE session_token = ?', [value]);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await execute('DELETE FROM sessions WHERE id = ?', [row.id]);
    return null;
  }
  return row;
}

export async function deleteSession(value: string): Promise<void> {
  await execute('DELETE FROM sessions WHERE session_token = ?', [value]);
}

export async function deleteExpiredSessions(): Promise<void> {
  await execute('DELETE FROM sessions WHERE expires_at <= ?', [nowIso()]);
}
