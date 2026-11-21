'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';

/** /register — one card, name + email + password, inline errors, back to the landing page. */
export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (name.trim().length === 0) next.name = 'Nama wajib diisi.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) next.email = 'Masukkan email yang valid.';
    if (password.length < 10) next.password = 'Kata sandi minimal 10 karakter.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      await api.post('/auth/register', { name: name.trim(), email: email.trim(), password });
      router.push('/studio');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') {
        setErrors({ email: 'Email ini sudah terdaftar. Coba masuk.' });
      } else {
        setErrors({ form: err instanceof ApiError ? err.message : 'Gagal membuat akun. Coba lagi.' });
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
            <h1>Buat akun</h1>
            <p className="muted">Satu percakapan menjadi spesifikasi aplikasi yang utuh.</p>
          </header>

          {errors.form && <div className="alert" role="alert">{errors.form}</div>}

          <form onSubmit={submit} noValidate>
            <div className={`field ${errors.name ? 'bad' : ''}`}>
              <label htmlFor="name">Nama</label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama kamu"
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name && <span className="err-msg">{errors.name}</span>}
            </div>

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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 10 karakter"
                aria-invalid={Boolean(errors.password)}
              />
              {errors.password ? <span className="err-msg">{errors.password}</span> : <span className="help">Minimal 10 karakter.</span>}
            </div>

            <button type="submit" className="btn primary auth-submit" disabled={busy}>
              {busy ? 'Membuat…' : 'Buat akun'}
            </button>
          </form>

          <p className="auth-switch muted">
            Sudah punya akun? <Link href="/login">Masuk</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
