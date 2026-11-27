import { execute, query, queryOne, transaction } from '../client';
import { mapUser, type User, type UserRow } from '../types';
import { newId, nowIso } from '@/lib/ids';

export async function getUserById(id: string): Promise<User | null> {
  const row = await queryOne<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
  return row ? mapUser(row) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const row = await queryOne<UserRow>('SELECT * FROM users WHERE email = ?', [email]);
  return row ? mapUser(row) : null;
}

/** Primary admin/owner account whose saved credentials back Managed Rancang.ai models. */
export async function getPrimaryOwnerUserId(): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    "SELECT id FROM users WHERE role = 'owner' ORDER BY created_at ASC LIMIT 1",
  );
  return row?.id ?? null;
}

export async function createUser(input: { email: string; name?: string; authProvider?: 'local' | 'github' | 'google' | 'email'; role?: 'owner' | 'member' }): Promise<User> {
  const id = newId('usr');
  const now = nowIso();
  await execute(
    `INSERT INTO users (id, email, name, role, auth_provider, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.email, input.name ?? null, input.role ?? 'member', input.authProvider ?? 'local', now, now],
  );
  const user = await getUserById(id);
  if (!user) throw new Error('user insert vanished');
  return user;
}

/** Insert-if-absent by email; returns the existing user otherwise. */
export async function upsertUser(input: { email: string; name?: string; authProvider?: 'local' | 'github' | 'google' | 'email' }): Promise<User> {
  const existing = await getUserByEmail(input.email);
  if (existing) return existing;
  return createUser(input);
}

/**
 * Local-mode bootstrap (AUTH_MODE=local): returns the seeded owner, creating it and
 * its settings row idempotently. Mirrors the migration seed's fixed ids.
 */
export async function getOrCreateLocalUser(email?: string, name?: string): Promise<User> {
  const localEmail = email ?? process.env.LOCAL_USER_EMAIL ?? 'owner@rancang.local';
  const localName = name ?? process.env.LOCAL_USER_NAME ?? 'Local Owner';
  const existing = await getUserByEmail(localEmail);
  if (existing) return existing;

  const id = newId('usr');
  const settingsId = newId('set');
  const now = nowIso();
  await transaction(async (tx) => {
    tx.run(
      `INSERT INTO users (id, email, name, role, auth_provider, created_at, updated_at)
       VALUES (?, ?, ?, 'owner', 'local', ?, ?)`,
      [id, localEmail, localName, now, now],
    );
    tx.run(
      `INSERT INTO user_settings (id, user_id, theme, save_keys_to_disk, editor_font_size, onboarding_completed, created_at, updated_at)
       VALUES (?, ?, 'system', 1, 14, 0, ?, ?)`,
      [settingsId, id, now, now],
    );
  });
  const user = await getUserById(id);
  if (!user) throw new Error('local user insert vanished');
  return user;
}

export async function touchLastSeen(userId: string): Promise<void> {
  await execute('UPDATE users SET last_seen_at = ?, updated_at = ? WHERE id = ?', [nowIso(), nowIso(), userId]);
}

/** Ensure a user_settings row exists idempotently for any newly created account. */
export async function ensureUserSettings(userId: string): Promise<void> {
  const existing = await queryOne<{ id: string }>('SELECT id FROM user_settings WHERE user_id = ?', [userId]);
  if (existing) return;
  const now = nowIso();
  await execute(
    `INSERT INTO user_settings (id, user_id, theme, save_keys_to_disk, editor_font_size, onboarding_completed, created_at, updated_at)
     VALUES (?, ?, 'system', 1, 14, 0, ?, ?)`,
    [newId('set'), userId, now, now],
  );
}

/**
 * Find or create a user from a verified Google OAuth profile (v0.2.6).
 * Preserves existing role if the email already exists (e.g., admin owner account).
 */
export async function upsertGoogleUser(input: {
  email: string;
  name: string;
  avatarUrl?: string | null;
}): Promise<User> {
  const normalized = input.email.trim().toLowerCase();
  const now = nowIso();
  const existing = await getUserByEmail(normalized);
  if (existing) {
    await execute(
      `UPDATE users
         SET name = COALESCE(name, ?),
             avatar_url = COALESCE(?, avatar_url),
             email_verified_at = COALESCE(email_verified_at, ?),
             last_seen_at = ?,
             updated_at = ?
       WHERE id = ?`,
      [input.name, input.avatarUrl ?? null, now, now, now, existing.id],
    );
    await ensureUserSettings(existing.id);
    return (await getUserById(existing.id)) ?? existing;
  }

  const id = newId('usr');
  await execute(
    `INSERT INTO users (id, email, email_verified_at, name, avatar_url, role, auth_provider, last_seen_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'member', 'google', ?, ?, ?)`,
    [id, normalized, now, input.name, input.avatarUrl ?? null, now, now, now],
  );
  await ensureUserSettings(id);
  const created = await getUserById(id);
  if (!created) throw new Error('google user insert vanished');
  return created;
}

/** v0.1.2: the scrypt hash for a first-party account (null for seeded/cloud users). */
export async function getPasswordHash(userId: string): Promise<string | null> {
  const row = await queryOne<{ password_hash: string | null }>('SELECT password_hash FROM users WHERE id = ?', [userId]);
  return row?.password_hash ?? null;
}

export async function setPasswordHash(userId: string, hash: string): Promise<void> {
  await execute('UPDATE users SET password_hash = ?, auth_provider = ?, updated_at = ? WHERE id = ?', [hash, 'email', nowIso(), userId]);
}

/** Update only the password hash while preserving auth_provider (e.g. Google/local user setting password later). */
export async function updateUserPasswordHash(userId: string, hash: string): Promise<void> {
  await execute('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hash, nowIso(), userId]);
}

export async function hasUserPassword(userId: string): Promise<boolean> {
  const hash = await getPasswordHash(userId);
  return Boolean(hash && hash.length > 0);
}

export async function updateUserProfile(
  userId: string,
  input: { name: string; email: string },
): Promise<User> {
  const normalized = input.email.trim().toLowerCase();
  const cleanName = input.name.trim();
  await execute(
    'UPDATE users SET name = ?, email = ?, updated_at = ? WHERE id = ?',
    [cleanName, normalized, nowIso(), userId],
  );
  const updated = await getUserById(userId);
  if (!updated) throw new Error('user update vanished');
  return updated;
}
