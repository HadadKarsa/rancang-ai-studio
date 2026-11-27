'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PublicThemeToggle } from '@/components/PublicThemeToggle';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { APP_VERSION } from '@/lib/version';

export function AuthShowcaseShell({
  mode,
  eyebrow,
  title,
  subtitle,
  children,
}: {
  mode: 'login' | 'register';
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const { t } = useLocale();

  const specLedger = [
    { code: '01', name: 'PRD', detail: t('Masalah, pengguna, dan batasan lingkup', 'Problem, users, and scope bounds'), tag: t('Inti', 'Core') },
    { code: '02', name: t('Arsitektur', 'Architecture'), detail: t('Komponen layanan dan diagram Mermaid', 'Service modules and Mermaid diagrams'), tag: t('Alur', 'Flow') },
    { code: '03', name: 'Database', detail: t('Tabel, relasi, dan aturan integritas', 'Tables, relations, and constraints'), tag: t('Skema', 'Schema') },
    { code: '04', name: 'API', detail: t('Endpoint, payload, auth, dan kode galat', 'Endpoints, payloads, auth, and errors'), tag: t('Kontrak', 'Contract') },
    { code: '05', name: t('Tugas', 'Tasks'), detail: t('Tahapan implementasi siap dikerjakan', 'Phased implementation checklist'), tag: t('Eksekusi', 'Build') },
    { code: '06', name: t('Memori', 'Memory'), detail: t('Ringkasan konteks untuk agen AI', 'Context pack for AI coding agents'), tag: t('Agen', 'Agent') },
  ];

  return (
    <div className="grid min-h-screen w-full bg-canvas text-ink lg:grid-cols-12">
      {/* Left 7 cols: Architectural Drafting Desk & Notched Spec Dossier (Desktop) */}
      <aside
        aria-label={t('Gambaran rancang-ai', 'rancang-ai overview')}
        className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-sidebar p-10 lg:col-span-7 lg:flex xl:p-14"
        style={{
          backgroundImage:
            'linear-gradient(to right, color-mix(in srgb, var(--line) 42%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--line) 42%, transparent) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
      >
        <div className="relative z-10 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 text-ink transition-colors hover:text-accent-ink"
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center bg-accent font-mono text-xs font-semibold text-white"
              style={{
                clipPath: 'polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 0 100%)',
              }}
            >
              R
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight text-ink">rancang-ai</span>
              <span className="font-mono text-[10.5px] text-ink-3">spec studio</span>
            </span>
          </Link>

          <Link
            href="/"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line bg-surface/85 px-3 text-xs font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t('Beranda', 'Home')}</span>
          </Link>
        </div>

        <div className="relative z-10 my-auto max-w-xl py-8 space-y-7">
          <div className="space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-ink">
              {mode === 'login'
                ? t('Meja spesifikasi teknis', 'Technical specification desk')
                : t('Mulai tanpa formulir panjang', 'Start without lengthy forms')}
            </p>
            <h2 className="text-2xl font-semibold leading-snug tracking-tight text-ink xl:text-[30px] xl:leading-[1.2]">
              {mode === 'login'
                ? t(
                    'Lanjutkan dokumen spesifikasi dari titik terakhir.',
                    'Pick up your specification suite right where you left off.',
                  )
                : t(
                    'Dari satu ide singkat menjadi enam dokumen teknis yang saling nyambung.',
                    'Turn one concise idea into six connected technical documents.',
                  )}
            </h2>
          </div>

          {/* Signature unique shape: offset backing sheet + chamfered architectural spec dossier */}
          <div className="relative pt-2 pr-2">
            <div
              aria-hidden="true"
              className="absolute inset-x-3 top-4 bottom-[-8px] border border-line/80 bg-canvas/45"
              style={{
                clipPath: 'polygon(0 0, calc(100% - 26px) 0, 100% 26px, 100% 100%, 0 100%)',
              }}
            />
            <div
              className="relative border border-line-strong/80 bg-surface p-5 xl:p-6"
              style={{
                clipPath: 'polygon(0 0, calc(100% - 26px) 0, 100% 26px, 100% 100%, 0 100%)',
              }}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 26 26"
                className="pointer-events-none absolute right-0 top-0 h-[26px] w-[26px]"
              >
                <polygon
                  points="0,0 0,26 26,26"
                  fill="var(--subtle)"
                  stroke="var(--line-strong)"
                  strokeWidth="1"
                />
              </svg>

              <div className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3 pr-7">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-ready" aria-hidden="true" />
                  <span className="font-mono text-xs font-medium text-ink">
                    {t('bundel-spesifikasi/', 'spec-bundle/')}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-ink-3">
                  {t('6 dokumen inti', '6 core docs')}
                </span>
              </div>

              <ol className="divide-y divide-line/65">
                {specLedger.map((doc) => (
                  <li key={doc.code} className="flex items-center justify-between gap-3 py-2 text-xs">
                    <div className="flex min-w-0 items-baseline gap-3">
                      <span className="font-mono text-[11px] text-accent-ink">{doc.code}</span>
                      <span className="font-medium text-ink">{doc.name}</span>
                      <span className="hidden truncate text-ink-2 xl:inline">{doc.detail}</span>
                    </div>
                    <span className="shrink-0 rounded border border-line bg-canvas/70 px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
                      {doc.tag}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-4 font-mono text-[11px] text-ink-3">
          <span>
            {t(
              'ID & EN · Ekspor MD & ZIP · BYOK sesi atau Bawaan',
              'ID & EN · Export MD & ZIP · Session BYOK or Managed',
            )}
          </span>
          <span>{APP_VERSION}</span>
        </div>
      </aside>

      {/* Right 5 cols: Crisp Focused Auth Surface */}
      <main className="flex min-h-screen flex-col justify-between bg-canvas px-5 py-6 sm:px-8 lg:col-span-5 lg:px-10 xl:px-14">
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 lg:hidden">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-ink"
              aria-label="rancang-ai"
            >
              <span
                aria-hidden="true"
                className="flex h-7 w-7 items-center justify-center bg-accent font-mono text-xs font-semibold text-white"
                style={{
                  clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%)',
                }}
              >
                R
              </span>
              <span className="text-sm font-semibold tracking-tight">rancang-ai</span>
            </Link>
          </div>

          <nav
            aria-label={t('Pilih mode autentikasi', 'Select authentication mode')}
            className="inline-flex items-center rounded-lg border border-line bg-sidebar/80 p-0.5 text-xs"
          >
            <Link
              href="/login"
              aria-current={mode === 'login' ? 'page' : undefined}
              className={
                mode === 'login'
                  ? 'inline-flex min-h-8 items-center rounded-md bg-surface px-3 font-medium text-ink shadow-xs'
                  : 'inline-flex min-h-8 items-center rounded-md px-3 text-ink-2 transition-colors hover:text-ink'
              }
            >
              {t('Masuk', 'Sign in')}
            </Link>
            <Link
              href="/register"
              aria-current={mode === 'register' ? 'page' : undefined}
              className={
                mode === 'register'
                  ? 'inline-flex min-h-8 items-center rounded-md bg-surface px-3 font-medium text-ink shadow-xs'
                  : 'inline-flex min-h-8 items-center rounded-md px-3 text-ink-2 transition-colors hover:text-ink'
              }
            >
              {t('Daftar', 'Sign up')}
            </Link>
          </nav>

          <div className="flex items-center gap-1.5">
            <LanguageToggle />
            <PublicThemeToggle />
          </div>
        </header>

        <div className="mx-auto my-auto w-full max-w-[400px] py-8">
          <div className="mb-7 space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="h-[2px] w-7 bg-accent" aria-hidden="true" />
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
                {eyebrow}
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[26px]">
              {title}
            </h1>
            <p className="text-sm leading-relaxed text-ink-2">{subtitle}</p>
          </div>

          {children}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line/60 pt-4 text-xs text-ink-3 lg:border-t-0">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-ink-2 transition-colors hover:text-ink lg:hidden"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t('Kembali', 'Back')}</span>
          </Link>
          <span className="font-mono text-[11px] lg:ml-auto">
            rancang-ai · {APP_VERSION}
          </span>
        </footer>
      </main>
    </div>
  );
}
