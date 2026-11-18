import { execute, queryOne } from '../client';
import type { IdempotencyKeyRow } from '../types';
import { nowIso } from '@/lib/ids';

const REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000; // 04_API §2.7

export async function findReplay(key: string, userId: string): Promise<IdempotencyKeyRow | null> {
  const row = await queryOne<IdempotencyKeyRow>(
    'SELECT * FROM idempotency_keys WHERE key = ? AND user_id = ?',
    [key, userId],
  );
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await execute('DELETE FROM idempotency_keys WHERE key = ? AND user_id = ?', [key, userId]);
    return null;
  }
  return row;
}

export async function storeResponse(input: {
  key: string;
  userId: string;
  endpoint: string;
  requestHash: string;
  responseCode: number;
  responseBody: string;
}): Promise<void> {
  const now = nowIso();
  await execute(
    `INSERT OR IGNORE INTO idempotency_keys (key, user_id, endpoint, request_hash, response_code, response_body, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.key, input.userId, input.endpoint, input.requestHash, input.responseCode, input.responseBody, now, new Date(Date.now() + REPLAY_WINDOW_MS).toISOString()],
  );
}
