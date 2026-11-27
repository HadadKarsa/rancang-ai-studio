import { z } from 'zod';
import { withRoute, parseJson } from '@/lib/api/middleware';
import { getPasswordHash, updateUserPasswordHash } from '@/lib/db/repositories/users';
import { hashPassword, verifyPassword } from '@/lib/crypto/password';
import { AppError, ValidationError } from '@/lib/errors';

const schema = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: z.string().min(8, 'Kata sandi baru minimal 8 karakter').max(200),
});

/**
 * POST /api/v1/account/password (v0.2.7)
 * - If the account already has a password, verifies currentPassword before updating.
 * - If the account has no password yet (e.g., Google OAuth user or seeded local owner),
 *   sets a password directly without requiring currentPassword.
 */
export const POST = withRoute(async (ctx) => {
  const body = await parseJson<unknown>(ctx.req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Kata sandi baru minimal 8 karakter', parsed.error.flatten());
  }

  const existingHash = await getPasswordHash(ctx.session.user.id);
  if (existingHash) {
    const current = parsed.data.currentPassword ?? '';
    if (!current) {
      throw new ValidationError('Masukkan kata sandi saat ini terlebih dahulu');
    }
    const ok = await verifyPassword(current, existingHash);
    if (!ok) {
      throw new AppError('INVALID_CREDENTIALS', 'Kata sandi saat ini tidak cocok', 401);
    }
  }

  const nextHash = await hashPassword(parsed.data.newPassword);
  await updateUserPasswordHash(ctx.session.user.id, nextHash);

  return Response.json(
    {
      ok: true,
      hasPassword: true,
      mode: existingHash ? 'changed' : 'created',
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}, { bucket: 'auth' });

export const dynamic = 'force-dynamic';
