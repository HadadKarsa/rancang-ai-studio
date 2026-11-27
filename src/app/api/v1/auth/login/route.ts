import { z } from 'zod';
import { withRoute, parseJson } from '@/lib/api/middleware';
import { getUserByEmail, getPasswordHash, touchLastSeen } from '@/lib/db/repositories/users';
import { verifyPassword } from '@/lib/crypto/password';
import { sessionCookie } from '@/lib/auth/session';
import { createSession } from '@/lib/db/repositories/sessions';
import { AppError, ValidationError } from '@/lib/errors';

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

/** POST /api/v1/auth/login - same message for unknown email and wrong password. */
export const POST = withRoute(async (ctx) => {
  const body = await parseJson<unknown>(ctx.req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid login payload', parsed.error.flatten());
  const normalized = parsed.data.email.trim().toLowerCase();

  const invalid = () => new AppError('INVALID_CREDENTIALS', 'Email atau kata sandi salah', 401);

  const user = await getUserByEmail(normalized);
  if (!user) throw invalid();
  const hash = await getPasswordHash(user.id);
  if (!hash) throw invalid();
  const ok = await verifyPassword(parsed.data.password, hash);
  if (!ok) throw invalid();

  await touchLastSeen(user.id);
  const { token } = await createSession(user.id);
  return Response.json(
    { user: { id: user.id, email: user.email, name: user.name, role: user.role } },
    { status: 200, headers: { 'Set-Cookie': sessionCookie(token) } },
  );
}, { bucket: 'auth', public: true });

export const dynamic = 'force-dynamic';
