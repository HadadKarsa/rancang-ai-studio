'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { clearByokSession } from '@/lib/client/byokSession';
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
  authMode = 'cloud',
  initialErrorCode,
  nextPath = '/studio',
}: {
  googleEnabled: boolean;
  authMode?: 'local' | 'cloud';
  initialErrorCode?: string | null;
  nextPath?: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>(() =>
    initialErrorCode && OAUTH_ERROR_MESSAGES[initialErrorCode]
      ? { form: OAUTH_ERROR_MESSAGES[initialErrorCode] }
      : {},
  );
  const [busy, setBusy] = useState(false);
  const [enteringLocal, setEnteringLocal] = useState(false);

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

  async function enterAsLocalOwner() {
    setEnteringLocal(true);
    clearByokSession();
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    window.location.assign('/profile');
  }

  return (
    <AuthShowcaseShell
      mode="login"
      eyebrow="Akses Studio"
      title="Masuk ke akunmu"
      subtitle="Buka proyek spesifikasi, pustaka dokumen, dan pengaturan modelmu."
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
          <GoogleOAuthButton nextPath={nextPath} label="Masuk dengan Google" />
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
            placeholder="nama@perusahaan.com"
            aria-invalid={Boolean(errors.email)}
            className="min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm text-ink placeholder:text-ink-3 transition-colors focus:border-accent focus:outline-none"
          />
          {errors.email && <p className="text-xs text-danger-ink">{errors.email}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-xs font-medium text-ink-2">
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
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm text-ink placeholder:text-ink-3 transition-colors focus:border-accent focus:outline-none"
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

        <Button type="submit" variant="primary" size="lg" className="mt-2 w-full" disabled={busy}>
          {busy ? 'Memeriksa...' : 'Masuk ke Studio'}
        </Button>
      </form>

      <p className="mt-6 text-sm text-ink-2">
        Belum punya akun?{' '}
        <Link href="/register" className="font-medium text-accent-ink underline underline-offset-4">
          Buat akun sekarang
        </Link>
      </p>

      {authMode === 'local' && (
        <div className="mt-6 rounded-lg border border-line bg-surface/80 p-3.5 space-y-2.5">
          <div className="flex items-start gap-2 text-xs leading-relaxed text-ink-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" aria-hidden="true" />
            <span>
              Server berjalan dalam <strong className="font-medium text-ink">mode lokal</strong>. Kamu bisa masuk langsung sebagai Admin lokal untuk mengatur profil, kata sandi, dan model bawaan.
            </span>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full"
            disabled={enteringLocal}
            onClick={() => void enterAsLocalOwner()}
          >
            {enteringLocal ? 'Membuka sesi admin...' : 'Masuk sebagai Admin lokal'}
          </Button>
        </div>
      )}
    </AuthShowcaseShell>
  );
}
