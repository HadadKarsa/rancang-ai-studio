import { getEnv } from '@/lib/env';
import { getOrCreateLocalUser } from '@/lib/db/repositories/users';
import { UnauthorizedError } from './errors';

/**
 * Session resolution (T-202/T-205).
 * - AUTH_MODE=local (default): auto-authenticated as the seeded local user.
 * - AUTH_MODE=cloud: Auth.js v5 JWT cookie. The Auth.js wiring itself lands with
 *   the frontend phases; the session interface below is what route handlers use.
 */
export interface AppSession {
  user: { id: string; email: string; name: string };
}

export async function getSession(): Promise<AppSession | null> {
  const env = getEnv();
  if (env.AUTH_MODE === 'local') {
    const user = await getOrCreateLocalUser(env.LOCAL_USER_EMAIL, env.LOCAL_USER_NAME);
    return { user: { id: user.id, email: user.email, name: user.name ?? 'Local Owner' } };
  }
  // Cloud mode: Auth.js auth() goes here once next-auth is wired (Phase 5+).
  // Until then cloud mode is explicitly unsupported and fails closed.
  throw new UnauthorizedError('Cloud auth is not wired yet; set AUTH_MODE=local');
}

export async function requireSession(): Promise<AppSession> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}
