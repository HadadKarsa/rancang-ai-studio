'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui';
import { AuthShowcaseShell } from './AuthShowcaseShell';
import { GoogleOAuthButton } from './GoogleOAuthButton';

function passwordStrengthLevel(value: string): 0 | 1 | 2 | 3 {
  if (value.length === 0) return 0;
  if (value.length < 8) return 1;
  if (value.length < 12) return 2;
  return 3;
}

export function RegisterForm({
  googleEnabled,
  nextPath = '/studio',
}: {
  googleEnabled: boolean;
  nextPath?: string;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const strength = passwordStrengthLevel(password);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (name.trim().length === 0) next.name = 'Nama wajib diisi.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) next.email = 'Masukkan email yang valid.';
    if (password.length < 8) next.password = 'Kata sandi minimal 8 karakter.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      await api.post('/auth/register', { name: name.trim(), email: email.trim(), password });
      window.location.assign(nextPath || '/studio');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') {
        setErrors({ email: 'Email ini sudah terdaftar. Silakan masuk.' });
      } else {
        setErrors({ form: err instanceof ApiError ? err.message : 'Gagal membuat akun. Coba lagi.' });
      }
      setBusy(false);
    }
  }

  return (
    <AuthShowcaseShell
      mode="register"
      eyebrow="Akun Baru"
      title="Mulai ruang kerjamu"
      subtitle="Buat akun untuk menyimpan proyek spesifikasi dan memilih model bawaan atau BYOK sesi."
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
          <GoogleOAuthButton nextPath={nextPath} label="Daftar dengan Google" />
        </div>
      )}

      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="name" className="block text-xs font-medium text-ink-2">
            Nama lengkap
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama lengkapmu"
            aria-invalid={Boolean(errors.name)}
            className="min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm text-ink placeholder:text-ink-3 transition-colors focus:border-accent focus:outline-none"
          />
          {errors.name && <p className="text-xs text-danger-ink">{errors.name}</p>}
        </div>

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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 8 karakter"
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

          <div className="grid grid-cols-3 gap-1.5 pt-0.5" aria-hidden="true">
            <span
              className={
                strength >= 1
                  ? strength === 1
                    ? 'h-1 rounded-full bg-danger'
                    : 'h-1 rounded-full bg-ready'
                  : 'h-1 rounded-full bg-subtle'
              }
            />
            <span
              className={
                strength >= 2 ? 'h-1 rounded-full bg-ready' : 'h-1 rounded-full bg-subtle'
              }
            />
            <span
              className={
                strength >= 3 ? 'h-1 rounded-full bg-ready' : 'h-1 rounded-full bg-subtle'
              }
            />
          </div>

          {errors.password ? (
            <p className="text-xs text-danger-ink">{errors.password}</p>
          ) : (
            <p className="text-xs text-ink-3">
              Minimal 8 karakter. Akun langsung aktif setelah mendaftar.
            </p>
          )}
        </div>

        <Button type="submit" variant="primary" size="lg" className="mt-2 w-full" disabled={busy}>
          {busy ? 'Membuat akun...' : 'Buat akun'}
        </Button>
      </form>

      <p className="mt-6 text-sm text-ink-2">
        Sudah punya akun?{' '}
        <Link href="/login" className="font-medium text-accent-ink underline underline-offset-4">
          Masuk di sini
        </Link>
      </p>
    </AuthShowcaseShell>
  );
}
