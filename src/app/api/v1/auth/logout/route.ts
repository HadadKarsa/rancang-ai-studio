import { cookies } from 'next/headers';
import { withRoute } from '@/lib/api/middleware';
import { SESSION_COOKIE, clearedSessionCookie } from '@/lib/auth/session';
import { deleteSession } from '@/lib/db/repositories/sessions';

/** POST /api/v1/auth/logout — drop the session row and clear the cookie. */
export const POST = withRoute(async () => {
  let token: string | undefined;
  try {
    token = (await cookies()).get(SESSION_COOKIE)?.value;
  } catch {
    token = undefined;
  }
  if (token) await deleteSession(token);
  return new Response(null, { status: 204, headers: { 'Set-Cookie': clearedSessionCookie() } });
}, { bucket: 'auth', public: true });

export const dynamic = 'force-dynamic';
