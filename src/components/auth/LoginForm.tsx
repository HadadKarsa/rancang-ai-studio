'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui';
import { PublicThemeToggle } from '@/components/PublicThemeToggle';
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
  const router = useRouter();
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
      router.push(nextPath || '/studio');
      router.refresh();
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-5 py-10 text-ink">
      <div className="w-full max-w-md">
        <div className="mb-5 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex min-h-10 items-center gap-1.5 text-sm text-ink-2 transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Kembali</span>
          </Link>
          <PublicThemeToggle />
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-panel sm:p-8">
          <header className="mb-6">
            <p className="font-mono text-xs text-ink-3">rancang-ai</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Masuk</h1>
            <p className="mt-1 text-sm text-ink-2">
              Lanjutkan proyek spesifikasi yang sedang kamu susun.
            </p>
          </header>

          {errors.form && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-danger/35 bg-danger-soft px-3.5 py-2.5 text-sm text-danger-ink"
            >
              {errors.form}
            </div>
          )}

          {googleEnabled && (
            <div className="mb-4">
              <GoogleOAuthButton nextPath={nextPath} label="Masuk dengan Google" />
            </div>
          )}

          <form onSubmit={submit} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-ink">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@perusahaan.com"
                aria-invalid={Boolean(errors.email)}
                className="w-full min-h-11 rounded-lg border border-line-strong bg-canvas px-3.5 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
              />
              {errors.email && <p className="text-xs text-danger-ink">{errors.email}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-ink">
                Kata sandi
              </label>
              <div className="flex gap-2">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi"
                  aria-invalid={Boolean(errors.password)}
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-canvas px-3.5 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
                />
                <Button
                  type="button"
                  variant="secondary"
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
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

            <Button type="submit" variant="primary" size="lg" className="w-full mt-2" disabled={busy}>
              {busy ? 'Memeriksa...' : 'Masuk'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-2">
            Belum punya akun?{' '}
            <Link href="/register" className="font-medium text-accent-ink underline underline-offset-4">
              Buat akun
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
