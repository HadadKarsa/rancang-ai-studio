'use client';

import { APP_VERSION } from '@/lib/version';
import Link from 'next/link';
import { PublicThemeToggle } from '@/components/PublicThemeToggle';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useLocale } from '@/lib/i18n/LocaleProvider';

export default function LandingPage() {
  const { t } = useLocale();

  const documents = [
    { n: '01', name: 'PRD', note: t('Masalah, pengguna, dan lingkup yang disepakati.', 'Problem statement, users, and agreed v1 scope.') },
    { n: '02', name: t('Arsitektur', 'Architecture'), note: t('Susunan komponen sistem dan diagram alur Mermaid.', 'System component layout and Mermaid flow diagrams.') },
    { n: '03', name: 'Database', note: t('Tabel, relasi, ERD, dan aturan integritas.', 'Tables, relationships, ERD, and integrity rules.') },
    { n: '04', name: 'API', note: t('Endpoint, struktur payload, autentikasi, dan kode galat.', 'Endpoints, payloads, auth contracts, and error codes.') },
    { n: '05', name: t('Tugas', 'Tasks'), note: t('Urutan pekerjaan bertahap yang siap langsung dikerjakan.', 'Phased implementation checklist ready for execution.') },
    { n: '06', name: t('Memori', 'Memory'), note: t('Paket konteks keputusan dan asumsi untuk agen AI.', 'Decision log and context pack for AI coding agents.') },
  ];

  const workflowSteps = [
    {
      n: '01',
      title: t('Tulis satu kalimat ide, atau pilih template', 'Write one concise idea, or pick a template'),
      body: t(
        'Mulai langsung dari Quick-Start Composer di Studio. Pilih wawancara singkat atau langsung generate jika detail proyekmu sudah matang.',
        'Start directly in the Studio Composer. Choose a guided interview or jump straight into generation when your brief is already detailed.',
      ),
    },
    {
      n: '02',
      title: t('Tonton enam dokumen ditulis berurutan', 'Watch six documents generate in sequence'),
      body: t(
        'Setiap dokumen merujuk dokumen sebelumnya sehingga kontrak API cocok dengan skema database, lengkap dengan diagram Mermaid dalam bahasa Indonesia atau English.',
        'Each document reads prior outputs so API contracts align with database schemas, complete with Mermaid diagrams in Indonesian or English.',
      ),
    },
    {
      n: '03',
      title: t('Sunting, revisi, lalu ekspor untuk tim atau agen', 'Edit, revise, then export for teams or agents'),
      body: t(
        'Sunting langsung di studio dengan riwayat versi, tulis ulang dengan instruksi revisi, salin paket untuk AI Agent, atau unduh ZIP dan tautan bagikan.',
        'Edit inline with full version history, run targeted AI revisions, copy agent-ready prompts, or export ZIP bundles and read-only share links.',
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/95 backdrop-blur-xs">
        <div className="mx-auto flex h-15 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 text-ink">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-xs font-semibold text-white"
            >
              R
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-[15px] font-semibold tracking-tight">rancang-ai</span>
              <span className="hidden sm:inline font-mono text-xs text-ink-3">spec studio</span>
            </span>
          </Link>

          <nav aria-label={t('Navigasi publik', 'Public navigation')} className="flex items-center gap-2 sm:gap-2.5">
            <Link
              href="/docs"
              className="hidden sm:inline-flex min-h-10 items-center px-2.5 text-sm text-ink-2 transition-colors hover:text-ink"
            >
              {t('Dokumentasi', 'Docs')}
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
            >
              {t('Masuk', 'Sign in')}
            </Link>
            <LanguageToggle />
            <PublicThemeToggle />
            <Link
              href="/register"
              className="inline-flex min-h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-white shadow-xs transition-colors hover:bg-accent-hover"
            >
              {t('Mulai merancang', 'Start designing')}
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 sm:px-8">
        {/* Hero: editorial statement on the left, live PRD proof sheet on the right */}
        <section className="grid gap-10 py-14 lg:grid-cols-12 lg:items-center lg:gap-12 lg:py-20">
          <div className="lg:col-span-6">
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-[40px] sm:leading-[1.15]">
              {t('Satu percakapan menjadi ', 'One conversation into a complete ')}
              <span className="text-accent-ink">
                {t('spesifikasi aplikasi', 'application specification')}
              </span>
              {t(' yang utuh.', '.')}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-2">
              {t(
                'rancang-ai mewawancarai idemu secara terarah, menyusun enam dokumen spesifikasi yang saling merujuk, merender diagram arsitektur, dan menyiapkan paket siap pakai untuk tim maupun agen pemrograman.',
                'rancang-ai interviews your product idea, drafts six cross-referenced technical specs, renders Mermaid architecture diagrams, and packages everything cleanly for engineering teams and AI coding agents.',
              )}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-accent-hover"
              >
                {t('Mulai merancang', 'Start designing')}
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center rounded-xl border border-line-strong bg-surface px-5 text-sm font-medium text-ink transition-colors hover:bg-subtle"
              >
                {t('Sudah punya akun? Masuk', 'Already have an account? Sign in')}
              </Link>
            </div>
            <p className="mt-5 font-mono text-xs text-ink-3">
              {t(
                'Bawaan server atau BYOK sesi · Indonesia & English · Ekspor MD & ZIP · ',
                'Managed or Session BYOK · Indonesian & English · Export MD & ZIP · ',
              )}
              <Link href="/docs" className="text-ink-2 underline underline-offset-4 hover:text-ink">
                {t('Lihat panduan', 'Read the docs')}
              </Link>
            </p>
          </div>

          <figure className="lg:col-span-6 rounded-2xl border border-line bg-surface shadow-panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-line bg-sidebar/70 px-5 py-3">
              <span className="font-mono text-xs text-ink-2">01_PRD.md · catatan-kebun</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-ink">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                {t('Menulis langsung', 'Live writing')}
              </span>
            </div>
            <div className="space-y-4 p-5 sm:p-6 text-sm leading-relaxed text-ink">
              <div>
                <h2 className="text-[15px] font-semibold text-ink">
                  {t('Ringkasan produk', 'Product summary')}
                </h2>
                <p className="mt-1 text-ink-2">
                  {t(
                    'Pencatat tanam untuk pekebun rumahan: satu halaman per bedeng, jadwal siram berbasis usia tanaman, dan riwayat panen yang bisa dibandingkan antar musim.',
                    'Planting log for home gardeners: one page per bed, watering schedules based on crop age, and harvest history compared across seasons.',
                  )}
                </p>
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-ink">
                  {t('Masalah utama', 'Core problem')}
                </h2>
                <p className="mt-1 text-ink-2">
                  {t(
                    'Catatan tanam tersebar di buku tulis, obrolan, dan ingatan. Pekebun kesulitan melacak bedeng mana yang terakhir dipupuk atau kapan benih disemai.',
                    'Planting notes sit scattered across notebooks and chats, making it hard to track which bed was fertilized last or when seeds were sown.',
                  )}
                </p>
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-ink">
                  {t('Batas lingkup v1', 'v1 scope boundaries')}
                </h2>
                <p className="mt-1 text-ink-2">
                  {t(
                    'Tidak mencakup marketplace bibit, integrasi sensor IoT, dan akun bersama',
                    'Excludes seed marketplaces, IoT sensor integrations, and shared multi-user accounts',
                  )}
                  <span className="wet-caret ml-1" aria-hidden="true" />
                </p>
              </div>
            </div>
            <figcaption className="flex items-center justify-between border-t border-line bg-sidebar/40 px-5 py-2.5 font-mono text-xs text-ink-3">
              <span>v1 · manual + streaming</span>
              <span>{t('1.482 kata', '1,482 words')}</span>
            </figcaption>
          </figure>
        </section>

        {/* Workflow: asymmetric editorial band */}
        <section aria-labelledby="alur-kerja" className="border-t border-line py-14 lg:py-16">
          <div className="max-w-xl">
            <h2 id="alur-kerja" className="text-2xl font-semibold tracking-tight text-ink">
              {t('Satu ruang kerja, tanpa bolak-balik halaman.', 'One unified workspace, zero context switching.')}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">
              {t(
                'Wawancara, penulisan langsung, dan penyuntingan dokumen berada dalam satu proyek yang sama sehingga konteks tidak pernah terputus.',
                'Interviewing, live generation, and document editing live in the same workspace so decisions stay intact from start to export.',
              )}
            </p>
          </div>
          <ol className="mt-8 grid gap-5 md:grid-cols-3">
            {workflowSteps.map((step) => (
              <li
                key={step.n}
                className="rounded-xl border border-line bg-surface p-5 shadow-panel"
              >
                <span className="font-mono text-xs font-medium text-accent-ink">{step.n}</span>
                <h3 className="mt-2.5 text-base font-semibold text-ink">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Six documents index */}
        <section aria-labelledby="enam-dokumen" className="border-t border-line py-14 lg:py-16">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <h2 id="enam-dokumen" className="text-2xl font-semibold tracking-tight text-ink">
                {t('Enam dokumen yang saling merujuk.', 'Six cross-referenced documents.')}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                {t(
                  'Dokumen dibangun secara berurutan. Setiap dokumen membawa keputusan dari dokumen sebelumnya agar tidak saling bertentangan saat mulai menulis kode.',
                  'Documents are generated in dependency order, carrying forward every schema, route, and constraint so nothing contradicts when coding begins.',
                )}
              </p>
            </div>
            <ul className="lg:col-span-8 divide-y divide-line rounded-xl border border-line bg-surface">
              {documents.map((doc) => (
                <li
                  key={doc.n}
                  className="grid grid-cols-[40px_1fr] sm:grid-cols-[44px_140px_1fr] items-baseline gap-2 px-5 py-3.5 text-sm"
                >
                  <span className="font-mono text-xs text-ink-3">{doc.n}</span>
                  <span className="font-semibold text-ink">{doc.name}</span>
                  <span className="col-start-2 sm:col-start-3 text-ink-2">{doc.note}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Closing band */}
        <section className="my-10 rounded-2xl border border-line bg-sidebar px-6 py-10 sm:px-10 sm:py-12">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-lg">
              <h2 className="text-2xl font-semibold tracking-tight text-ink">
                {t('Mulai dari satu kalimat tentang idemu.', 'Start with one sentence about your idea.')}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                {t(
                  'Sisanya kita rancang bersama hingga menjadi spesifikasi yang siap dikerjakan.',
                  'We shape the rest together into an engineering-ready specification bundle.',
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-accent-hover"
              >
                {t('Mulai merancang', 'Start designing')}
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center rounded-xl border border-line-strong bg-surface px-5 text-sm font-medium text-ink transition-colors hover:bg-subtle"
              >
                {t('Masuk', 'Sign in')}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 font-mono text-xs text-ink-3 sm:px-8">
          <span>rancang-ai · spec studio</span>
          <nav aria-label="Footer" className="flex items-center gap-4">
            <Link href="/docs" className="hover:text-ink transition-colors">
              {t('Dokumentasi', 'Documentation')}
            </Link>
            <span>{APP_VERSION}</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
