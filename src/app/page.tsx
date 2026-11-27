'use client';

import { APP_VERSION } from '@/lib/version';
import Link from 'next/link';
import { PublicThemeToggle } from '@/components/PublicThemeToggle';
import { LanguageToggle } from '@/components/LanguageToggle';
import { BrandMark } from '@/components/BrandMark';
import { useLocale } from '@/lib/i18n/LocaleProvider';

export default function LandingPage() {
  const { t } = useLocale();

  const documents = [
    { n: '01', name: 'PRD', note: t('Masalah, pengguna, dan lingkup versi pertama yang disepakati.', 'Problem statement, users, and agreed v1 scope.') },
    { n: '02', name: t('Arsitektur', 'Architecture'), note: t('Susunan komponen sistem, alur data, dan diagram Mermaid.', 'System component layout, data flows, and Mermaid diagrams.') },
    { n: '03', name: 'Database', note: t('Tabel, relasi ERD, indeks, dan aturan integritas data.', 'Tables, ERD relations, indexes, and integrity constraints.') },
    { n: '04', name: 'API', note: t('Endpoint, struktur payload JSON, autentikasi, dan kode galat.', 'Endpoints, JSON payloads, auth contracts, and error codes.') },
    { n: '05', name: t('Tugas', 'Tasks'), note: t('Urutan pekerjaan bertahap yang kecil, terukur, dan siap dieksekusi.', 'Phased, verifiable implementation checklist ready for execution.') },
    { n: '06', name: t('Memori', 'Memory'), note: t('Paket konteks keputusan, glosarium, dan invarian untuk tim atau agen AI.', 'Decision log, glossary, and invariants for teammates or AI coding agents.') },
  ];

  const workflowSteps = [
    {
      n: '01',
      title: t('Ceritakan idemu, atau mulai dari template', 'Share your idea, or start from a template'),
      body: t(
        'Tulis garis besar aplikasi di Studio. Pilih wawancara terarah untuk menggali detail, atau langsung generate jika brief proyekmu sudah matang.',
        'Describe your app in Studio. Pick a guided interview to sharpen constraints, or generate directly when your brief is already detailed.',
      ),
    },
    {
      n: '02',
      title: t('Enam dokumen tersusun saling merujuk', 'Six documents drafted in dependency order'),
      body: t(
        'Setiap dokumen membaca hasil dokumen sebelumnya sehingga kontrak API cocok dengan skema database, lengkap dengan diagram Mermaid dalam bahasa Indonesia atau English.',
        'Each document reads prior outputs so API contracts align with database schemas, complete with Mermaid diagrams in Indonesian or English.',
      ),
    },
    {
      n: '03',
      title: t('Tinjau, sunting, lalu serahkan ke tim atau agen', 'Review, refine, then hand off to teams or agents'),
      body: t(
        'Sunting langsung dengan riwayat versi, revisi terarah, salin instruksi siap pakai untuk AI coding agent, atau unduh bundel ZIP dan tautan bagikan.',
        'Edit inline with full version history, run targeted AI revisions, copy agent-ready instructions, or export ZIP bundles and read-only share links.',
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/95 backdrop-blur-xs">
        <div className="mx-auto flex h-15 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 text-ink">
            <BrandMark size={28} />
            <span className="flex items-baseline gap-2">
              <span className="text-[15px] font-semibold tracking-tight">Rencang-Rancang</span>
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
              className="inline-flex min-h-10 items-center rounded-lg border border-line bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
            >
              {t('Masuk', 'Sign in')}
            </Link>
            <LanguageToggle />
            <PublicThemeToggle />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 sm:px-8">
        {/* Hero: editorial statement on the left, live PRD proof sheet on the right */}
        <section className="grid gap-10 py-14 lg:grid-cols-12 lg:items-center lg:gap-12 lg:py-20">
          <div className="lg:col-span-6">
            <p className="mb-3 inline-flex items-center gap-2 font-mono text-[11.5px] uppercase tracking-[0.12em] text-accent-ink">
              <span className="h-[2px] w-5 bg-accent" aria-hidden="true" />
              <span>{t('Rencang (teman) · Rancang (merancang)', 'Rencang (companion) · Rancang (design)')}</span>
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-[40px] sm:leading-[1.14]">
              {t('Teman merancang ', 'Your companion for designing ')}
              <span className="text-accent-ink">
                {t('spesifikasi sistem', 'software specifications')}
              </span>
              {t(', dari ide mentah sampai siap dikerjakan.', ', from raw idea to build-ready contracts.')}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-2">
              {t(
                'Rencang-Rancang duduk di sebelahmu sebagai rekan berpikir: membantu memilah lingkup, menyusun enam dokumen teknis yang saling nyambung, merender diagram arsitektur, dan menyiapkan paket siap pakai untuk tim maupun AI coding agent.',
                'Rencang-Rancang sits beside you as a thinking partner: sharpening scope, drafting six cross-referenced technical specs, rendering Mermaid architecture diagrams, and packaging everything cleanly for teams and AI coding agents.',
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
                {t('Baca dokumentasi', 'Read the docs')}
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
              <span>v1 · Rencang-Rancang</span>
              <span>{t('1.482 kata', '1,482 words')}</span>
            </figcaption>
          </figure>
        </section>

        {/* Philosophy band: Javanese meaning of Rencang + Rancang */}
        <section aria-labelledby="filosofi-nama" className="border-t border-line py-12 lg:py-14">
          <div className="grid gap-6 rounded-2xl border border-line bg-sidebar/65 p-6 sm:p-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-4 space-y-2">
              <div className="flex items-center gap-2.5">
                <BrandMark size={26} />
                <span className="font-mono text-xs uppercase tracking-[0.12em] text-accent-ink">
                  {t('Di balik nama', 'Behind the name')}
                </span>
              </div>
              <h2 id="filosofi-nama" className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                {t('Mengapa Rencang-Rancang?', 'Why Rencang-Rancang?')}
              </h2>
            </div>
            <div className="lg:col-span-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-surface p-4 space-y-1.5">
                <p className="font-mono text-xs font-semibold text-accent-ink">
                  rencang <span className="font-normal text-ink-3">· {t('Bahasa Jawa', 'Javanese')}</span>
                </p>
                <p className="text-sm font-medium text-ink">
                  {t('Berarti teman atau rekan seperjalanan.', 'Means companion, friend, or trusted partner.')}
                </p>
                <p className="text-xs leading-relaxed text-ink-2">
                  {t(
                    'Merancang sistem sendirian sering melewatkan celah kecil. Rencang hadir sebagai teman diskusi yang jujur bertanya sebelum kamu terjebak asumsi.',
                    'Designing software alone makes blind spots easy to miss. Rencang acts as an honest sounding board before assumptions harden into code.',
                  )}
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface p-4 space-y-1.5">
                <p className="font-mono text-xs font-semibold text-accent-ink">
                  rancang <span className="font-normal text-ink-3">· {t('Bahasa Indonesia', 'Indonesian')}</span>
                </p>
                <p className="text-sm font-medium text-ink">
                  {t('Proses menyusun spesifikasi sebelum menulis kode.', 'The craft of designing specifications before coding.')}
                </p>
                <p className="text-xs leading-relaxed text-ink-2">
                  {t(
                    'Menyatukan PRD, arsitektur, skema database, kontrak API, tugas, dan memori proyek agar tim maupun agen AI bergerak dari satu sumber kebenaran.',
                    'Uniting PRD, architecture, database schema, API contracts, tasks, and project memory so both engineers and AI agents build from one source of truth.',
                  )}
                </p>
              </div>
            </div>
          </div>
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
                {t('Punya satu ide sistem? Mari rancang bersama.', 'Have a system idea? Let us design it together.')}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                {t(
                  'Mulai dari satu kalimat di Studio; Rencang-Rancang menemani sampai spesifikasi siap dieksekusi.',
                  'Start with one sentence in Studio; Rencang-Rancang stays beside you until the spec is ready to build.',
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
          <span className="inline-flex items-center gap-2">
            <BrandMark size={18} />
            <span>Rencang-Rancang · spec studio</span>
          </span>
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
