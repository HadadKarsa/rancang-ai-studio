'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { Badge, Button, useToast } from '@/components/ui';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'member';
  authProvider: 'local' | 'github' | 'google' | 'email';
  hasPassword: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
}

const PROVIDER_LABELS: Record<UserProfile['authProvider'], string> = {
  google: 'Google',
  email: 'Email',
  local: 'Lokal',
  github: 'GitHub',
};

export default function ProfilePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useLocale();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Identity form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await api.get<{ profile: UserProfile }>('/account/profile');
      setProfile(res.profile);
      setName(res.profile.name);
      setEmail(res.profile.email);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Gagal memuat profil akun');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const profileDirty =
    profile !== null &&
    (name.trim() !== profile.name.trim() || email.trim().toLowerCase() !== profile.email.toLowerCase());

  async function submitProfile(e: FormEvent) {
    e.preventDefault();
    setProfileError(null);
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanName) {
      setProfileError('Nama lengkap wajib diisi.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      setProfileError('Masukkan alamat email yang valid.');
      return;
    }

    setSavingProfile(true);
    try {
      const res = await api.patch<{ profile: UserProfile }>('/account/profile', {
        name: cleanName,
        email: cleanEmail,
      });
      setProfile(res.profile);
      setName(res.profile.name);
      setEmail(res.profile.email);
      router.refresh();
      toast({ tone: 'success', title: 'Profil akun diperbarui' });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') {
        setProfileError('Email tersebut sudah digunakan oleh akun lain.');
      } else {
        setProfileError(err instanceof ApiError ? err.message : 'Gagal menyimpan profil.');
      }
    } finally {
      setSavingProfile(false);
    }
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    if (!profile) return;

    if (profile.hasPassword && currentPassword.length === 0) {
      setPasswordError('Masukkan kata sandi saat ini terlebih dahulu.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Kata sandi baru minimal 8 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await api.post<{ ok: boolean; hasPassword: boolean; mode: 'created' | 'changed' }>(
        '/account/password',
        {
          currentPassword: profile.hasPassword ? currentPassword : undefined,
          newPassword,
        },
      );
      setProfile((prev) => (prev ? { ...prev, hasPassword: res.hasPassword } : prev));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrent(false);
      setShowNew(false);
      toast({
        tone: 'success',
        title:
          res.mode === 'created'
            ? 'Kata sandi berhasil diatur. Sekarang kamu bisa masuk dengan email dan kata sandi.'
            : 'Kata sandi berhasil diperbarui.',
      });
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : 'Gagal menyimpan kata sandi.');
    } finally {
      setSavingPassword(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 space-y-5">
        <div className="h-7 w-40 animate-pulse rounded-md bg-subtle" />
        <div className="h-52 animate-pulse rounded-xl bg-subtle" />
        <div className="h-52 animate-pulse rounded-xl bg-subtle" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-7 sm:px-6 sm:py-9 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
              {t('Profil Akun', 'Account Profile')}
            </h1>
            {profile?.role === 'owner' && <Badge tone="live">Admin</Badge>}
            {profile && (
              <Badge tone="neutral">
                {t('Masuk via', 'Signed in via')} {PROVIDER_LABELS[profile.authProvider]}
              </Badge>
            )}
          </div>
          <p className="text-sm leading-relaxed text-ink-2">
            {t(
              'Kelola nama tampilan, alamat email, dan kata sandi untuk akun Rencang-Rancang kamu.',
              'Manage your display name, email address, and password for Rencang-Rancang.',
            )}
          </p>
        </div>

        <Link
          href="/studio"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {t('Kembali ke Studio', 'Back to Studio')}
        </Link>
      </div>

      {loadError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-ink"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{loadError}</span>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            Coba lagi
          </Button>
        </div>
      )}

      {profile && (
        <>
          {/* Section 1: Identity */}
          <form
            onSubmit={submitProfile}
            noValidate
            className="rounded-xl border border-line bg-surface p-5 shadow-panel sm:p-6 space-y-5"
          >
            <div className="flex items-start gap-3">
              <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" aria-hidden="true" />
              <div className="space-y-0.5">
                <h2 className="text-base font-semibold text-ink">{t('Identitas akun', 'Account identity')}</h2>
                <p className="text-xs leading-relaxed text-ink-2">
                  {t(
                    'Perubahan nama dan email langsung diterapkan pada sesi aktif dan bilah samping.',
                    'Changes to your name and email apply immediately across the active session.',
                  )}
                </p>
              </div>
            </div>

            {profileError && (
              <div
                role="alert"
                className="rounded-lg border border-danger/35 bg-danger-soft px-3.5 py-2.5 text-xs text-danger-ink"
              >
                {profileError}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="profile-name" className="block text-xs font-medium text-ink-2">
                  Nama lengkap
                </label>
                <input
                  id="profile-name"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama lengkapmu"
                  className="min-h-11 w-full rounded-lg border border-line bg-canvas/70 px-3.5 py-2 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="profile-email" className="block text-xs font-medium text-ink-2">
                  Alamat email
                </label>
                <input
                  id="profile-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@perusahaan.com"
                  className="min-h-11 w-full rounded-lg border border-line bg-canvas/70 px-3.5 py-2 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-4">
              <p className="font-mono text-[11px] text-ink-3">ID: {profile.id}</p>
              <Button type="submit" variant="primary" disabled={!profileDirty || savingProfile}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {savingProfile ? 'Menyimpan...' : 'Simpan profil'}
              </Button>
            </div>
          </form>

          {/* Section 2: Password setup / update */}
          <form
            onSubmit={submitPassword}
            noValidate
            className="rounded-xl border border-line bg-surface p-5 shadow-panel sm:p-6 space-y-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" aria-hidden="true" />
                <div className="space-y-0.5">
                  <h2 className="text-base font-semibold text-ink">
                    {profile.hasPassword ? t('Ubah kata sandi', 'Change password') : t('Atur kata sandi', 'Set password')}
                  </h2>
                  <p className="text-xs leading-relaxed text-ink-2">
                    {profile.hasPassword
                      ? t(
                          'Masukkan kata sandi saat ini untuk menyetel kata sandi baru.',
                          'Verify your current password to set a new one.',
                        )
                      : t(
                          'Akun ini belum memakai kata sandi. Atur sekarang agar kamu bisa masuk memakai email dan kata sandi kapan saja.',
                          'This account has no password yet. Set one now so you can also sign in with email and password.',
                        )}
                  </p>
                </div>
              </div>
              <Badge tone={profile.hasPassword ? 'ready' : 'warn'} dot>
                {profile.hasPassword ? t('Kata sandi aktif', 'Password active') : t('Belum diatur', 'Not set')}
              </Badge>
            </div>

            {!profile.hasPassword && (
              <div className="flex items-start gap-2.5 rounded-lg border border-ready/25 bg-ready-soft/60 px-3.5 py-3 text-xs leading-relaxed text-ink-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ready-ink" aria-hidden="true" />
                <p>
                  {profile.authProvider === 'google'
                    ? 'Kamu masuk dengan Google tanpa kata sandi. Menyetel kata sandi di sini tetap menjaga akses Google kamu dan menambahkan opsi masuk lewat email.'
                    : 'Akun lokal ini belum memiliki kata sandi. Menyetel kata sandi di sini menyiapkan akun untuk mode login penuh (AUTH_MODE=cloud).'}
                </p>
              </div>
            )}

            {passwordError && (
              <div
                role="alert"
                className="rounded-lg border border-danger/35 bg-danger-soft px-3.5 py-2.5 text-xs text-danger-ink"
              >
                {passwordError}
              </div>
            )}

            <div className="space-y-4">
              {profile.hasPassword && (
                <div className="space-y-1.5">
                  <label htmlFor="current-password" className="block text-xs font-medium text-ink-2">
                    Kata sandi saat ini
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="current-password"
                      type={showCurrent ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Masukkan kata sandi saat ini"
                      className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-canvas/70 px-3.5 py-2 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label={showCurrent ? 'Sembunyikan kata sandi saat ini' : 'Tampilkan kata sandi saat ini'}
                      aria-pressed={showCurrent}
                      onClick={() => setShowCurrent((v) => !v)}
                    >
                      {showCurrent ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="new-password" className="block text-xs font-medium text-ink-2">
                    Kata sandi baru
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="new-password"
                      type={showNew ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimal 8 karakter"
                      className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-canvas/70 px-3.5 py-2 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label={showNew ? 'Sembunyikan kata sandi baru' : 'Tampilkan kata sandi baru'}
                      aria-pressed={showNew}
                      onClick={() => setShowNew((v) => !v)}
                    >
                      {showNew ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="confirm-password" className="block text-xs font-medium text-ink-2">
                    Ulangi kata sandi baru
                  </label>
                  <input
                    id="confirm-password"
                    type={showNew ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ketik ulang kata sandi baru"
                    className="min-h-11 w-full rounded-lg border border-line bg-canvas/70 px-3.5 py-2 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end border-t border-line/70 pt-4">
              <Button
                type="submit"
                variant="primary"
                disabled={savingPassword || newPassword.length < 8 || confirmPassword.length === 0}
              >
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                {savingPassword
                  ? 'Menyimpan...'
                  : profile.hasPassword
                    ? 'Perbarui kata sandi'
                    : 'Atur kata sandi'}
              </Button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
