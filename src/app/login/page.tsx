'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';

/** /login — one card, email + password, inline errors, back to the landing page. */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
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
      router.push('/studio');
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
    <main className="pg-auth">
      <div className="auth-wrap">
        <Link href="/" className="back mono">
          <svg className="chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M8 2 4 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Kembali
        </Link>

        <div className="card auth-card">
          <header className="auth-head">
            <span className="eyebrow">rancang-ai</span>
            <h1>Masuk</h1>
            <p className="muted">Lanjutkan proyek yang sedang kamu susun.</p>
          </header>

          {errors.form && <div className="alert" role="alert">{errors.form}</div>}

          <form onSubmit={submit} noValidate>
            <div className={`field ${errors.email ? 'bad' : ''}`}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@perusahaan.com"
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email && <span className="err-msg">{errors.email}</span>}
            </div>

            <div className={`field ${errors.password ? 'bad' : ''}`}>
              <label htmlFor="password">Kata sandi</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                aria-invalid={Boolean(errors.password)}
              />
              {errors.password && <span className="err-msg">{errors.password}</span>}
            </div>

            <button type="submit" className="btn primary auth-submit" disabled={busy}>
              {busy ? 'Masuk…' : 'Masuk'}
            </button>
          </form>

          <p className="auth-switch muted">
            Belum punya akun? <Link href="/register">Buat akun</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
