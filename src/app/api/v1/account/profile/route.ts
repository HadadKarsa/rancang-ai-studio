import { z } from 'zod';
import { withRoute, parseJson } from '@/lib/api/middleware';
import {
  getUserByEmail,
  getUserById,
  hasUserPassword,
  updateUserProfile,
} from '@/lib/db/repositories/users';
import { AppError, NotFoundError, ValidationError } from '@/lib/errors';

const updateSchema = z.object({
  name: z.string().trim().min(1, 'Nama wajib diisi').max(120),
  email: z.string().trim().email('Masukkan email yang valid').max(200),
});

/**
 * GET /api/v1/account/profile (v0.2.7)
 * Returns the authenticated user's profile and whether they already have a local password.
 */
export const GET = withRoute(async (ctx) => {
  const user = await getUserById(ctx.session.user.id);
  if (!user) throw new NotFoundError('Akun tidak ditemukan');
  const hasPassword = await hasUserPassword(user.id);
  return Response.json(
    {
      profile: {
        id: user.id,
        name: user.name ?? '',
        email: user.email,
        role: user.role,
        authProvider: user.authProvider,
        hasPassword,
        emailVerifiedAt: user.emailVerifiedAt,
        createdAt: user.createdAt,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}, { bucket: 'read' });

/**
 * PATCH /api/v1/account/profile (v0.2.7)
 * Updates the authenticated user's display name and email address.
 */
export const PATCH = withRoute(async (ctx) => {
  const body = await parseJson<unknown>(ctx.req);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Data profil tidak valid', parsed.error.flatten());
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const existing = await getUserByEmail(normalizedEmail);
  if (existing && existing.id !== ctx.session.user.id) {
    throw new AppError('EMAIL_TAKEN', 'Email sudah digunakan oleh akun lain', 409);
  }

  const updated = await updateUserProfile(ctx.session.user.id, {
    name: parsed.data.name,
    email: normalizedEmail,
  });
  const hasPassword = await hasUserPassword(updated.id);

  return Response.json(
    {
      profile: {
        id: updated.id,
        name: updated.name ?? '',
        email: updated.email,
        role: updated.role,
        authProvider: updated.authProvider,
        hasPassword,
        emailVerifiedAt: updated.emailVerifiedAt,
        createdAt: updated.createdAt,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}, { bucket: 'write' });

export const dynamic = 'force-dynamic';
