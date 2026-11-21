import { cookies } from 'next/headers';
import { getEnv } from '@/lib/env';
import { getOrCreateLocalUser, getUserById } from '@/lib/db/repositories/users';
import { findValidSession } from '@/lib/db/repositories/sessions';
import { UnauthorizedError } from './errors';

/**
 * Session resolution (v0.1.2).
 * - A valid `rancang_session` cookie wins, in any mode: a registered account is
 *   who you are once you have signed in.
 * - AUTH_MODE=local with no cookie: the seeded owner, so the app works before
 *   anyone registers.
 * - AUTH_MODE=cloud with no cookie: no session (fail closed).
 */
export interface AppSession {
  user: { id: string; email: string; name: string };
}

export const SESSION_COOKIE = 'rancang_session';
export const SESSION_TTL_DAYS = 30;

export async function getSession(): Promise<AppSession | null> {
  const env = getEnv();

  let token: string | undefined;
  try {
    const jar = await cookies();
    token = jar.get(SESSION_COOKIE)?.value;
  } catch {
    // Outside a request scope (e.g. a script): no cookie to read.
    token = undefined;
  }

  if (token) {
    const row = await findValidSession(token);
    if (row) {
      const user = await getUserById(row.user_id);
      if (user) {
        return { user: { id: user.id, email: user.email, name: user.name ?? user.email } };
      }
    }
  }

  if (env.AUTH_MODE === 'local') {
    const user = await getOrCreateLocalUser(env.LOCAL_USER_EMAIL, env.LOCAL_USER_NAME);
    return { user: { id: user.id, email: user.email, name: user.name ?? 'Local Owner' } };
  }

  return null;
}

export async function requireSession(): Promise<AppSession> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

/** Set-Cookie value for a fresh session token. Secure when the app is served over https. */
export function sessionCookie(value: string, maxAgeSeconds = SESSION_TTL_DAYS * 24 * 60 * 60): string {
  const secure = getEnv().APP_URL.startsWith('https');
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}

/** Set-Cookie value that clears the session cookie. */
export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
