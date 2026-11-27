import { z } from 'zod';
import { withRoute, parseJson } from '@/lib/api/middleware';
import { createUser, ensureUserSettings, getUserByEmail, setPasswordHash } from '@/lib/db/repositories/users';
import { hashPassword } from '@/lib/crypto/password';
import { sessionCookie } from '@/lib/auth/session';
import { createSession } from '@/lib/db/repositories/sessions';
import { AppError, ValidationError } from '@/lib/errors';

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(120).optional(),
});

/** POST /api/v1/auth/register - create a member account and set the session cookie. */
export const POST = withRoute(async (ctx) => {
  const body = await parseJson<unknown>(ctx.req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid registration payload', parsed.error.flatten());
  const { email, password, name } = parsed.data;
  const normalized = email.trim().toLowerCase();

  const existing = await getUserByEmail(normalized);
  if (existing) throw new AppError('EMAIL_TAKEN', 'Email sudah terdaftar', 409);

  const passwordHash = await hashPassword(password);
  const user = await createUser({
    email: normalized,
    name: name?.trim() || normalized.split('@')[0],
    authProvider: 'email',
    role: 'member',
  });
  await setPasswordHash(user.id, passwordHash);
  await ensureUserSettings(user.id);

  const { token } = await createSession(user.id);
  return Response.json(
    { user: { id: user.id, email: user.email, name: user.name, role: user.role } },
    { status: 201, headers: { 'Set-Cookie': sessionCookie(token) } },
  );
}, { bucket: 'auth', public: true });

export const dynamic = 'force-dynamic';
