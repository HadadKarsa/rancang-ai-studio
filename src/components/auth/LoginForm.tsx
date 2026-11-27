'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { Button } from '@/components/ui';
import { AuthShowcaseShell } from './AuthShowcaseShell';
import { GoogleOAuthButton } from './GoogleOAuthButton';

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: 'Login Google belum dikonfigurasi di server ini. Silakan masuk dengan email dan kata sandi.',
  google_denied: 'Login Google dibatalkan. Kamu bisa mencoba lagi atau masuk dengan email.',
  google_state_invalid: 'Sesi login Google kedaluwarsa. Silakan coba masuk lagi.',
  google_unverified: 'Email pada akun Google tersebut belum terverifikasi.',
  google_failed: 'Gagal memverifikasi akun Google. Coba lagi sebentar lagi.',
};

export function LoginForm({
  googleEnabled,
  initialErrorCode,
  nextPath = '/studio',
}: {
  googleEnabled: boolean;
  initialErrorCode?: string | null;
  nextPath?: string;
}) {
  const { t } = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>(() =>
    initialErrorCode && OAUTH_ERROR_MESSAGES[initialErrorCode]
      ? { form: OAUTH_ERROR_MESSAGES[initialErrorCode] }
      : {},
  );
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) next.email = 'Masukkan email yang valid.';
    if (password.length === 0) next.password = 'Kata sandi wajib diisi.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      await api.post('/auth/login', { email: email.trim(), password });
      window.location.assign(nextPath || '/studio');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
        setErrors({ form: 'Email atau kata sandi salah.' });
      } else {
        setErrors({ form: err instanceof ApiError ? err.message : 'Gagal masuk. Coba lagi.' });
      }
      setBusy(false);
    }
  }

  return (
    <AuthShowcaseShell
      mode="login"
      eyebrow={t('Akses Studio', 'Studio Access')}
      title={t('Masuk ke akunmu', 'Sign in to your account')}
      subtitle={t(
        'Buka proyek spesifikasi, pustaka dokumen, dan pengaturan modelmu.',
        'Access your specification projects, document library, and model settings.',
      )}
    >
      {errors.form && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-danger/35 bg-danger-soft px-3.5 py-2.5 text-sm text-danger-ink"
        >
          {errors.form}
        </div>
      )}

      {googleEnabled && (
        <div className="mb-5">
          <GoogleOAuthButton
            nextPath={nextPath}
            label={t('Masuk dengan Google', 'Sign in with Google')}
          />
        </div>
      )}

      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-xs font-medium text-ink-2">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('nama@perusahaan.com', 'name@company.com')}
            aria-invalid={Boolean(errors.email)}
            className="min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm text-ink placeholder:text-ink-3 transition-colors focus:border-accent focus:outline-none"
          />
          {errors.email && <p className="text-xs text-danger-ink">{errors.email}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-xs font-medium text-ink-2">
            {t('Kata sandi', 'Password')}
          </label>
          <div className="flex gap-2">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('Masukkan kata sandi', 'Enter your password')}
              aria-invalid={Boolean(errors.password)}
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm text-ink placeholder:text-ink-3 transition-colors focus:border-accent focus:outline-none"
            />
            <Button
              type="button"
              variant="secondary"
              aria-label={showPassword ? t('Sembunyikan kata sandi', 'Hide password') : t('Tampilkan kata sandi', 'Show password')}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
          {errors.password && <p className="text-xs text-danger-ink">{errors.password}</p>}
        </div>

        <Button type="submit" variant="primary" size="lg" className="mt-2 w-full" disabled={busy}>
          {busy ? t('Memeriksa...', 'Checking...') : t('Masuk ke Studio', 'Sign in to Studio')}
        </Button>
      </form>

      <p className="mt-6 text-sm text-ink-2">
        {t('Belum punya akun?', "Don't have an account?")}{' '}
        <Link href="/register" className="font-medium text-accent-ink underline underline-offset-4">
          {t('Buat akun sekarang', 'Create one now')}
        </Link>
      </p>
    </AuthShowcaseShell>
  );
}
