import { APP_VERSION } from '@/lib/version';
import Link from 'next/link';
import { PublicThemeToggle } from '@/components/PublicThemeToggle';

const DOCUMENTS = [
  { n: '01', name: 'PRD', note: 'Masalah, pengguna, dan lingkup yang disepakati.' },
  { n: '02', name: 'Arsitektur', note: 'Susunan komponen sistem dan diagram alur Mermaid.' },
  { n: '03', name: 'Database', note: 'Tabel, relasi, ERD, dan aturan integritas.' },
  { n: '04', name: 'API', note: 'Endpoint, struktur payload, autentikasi, dan kode galat.' },
  { n: '05', name: 'Tugas', note: 'Urutan pekerjaan bertahap yang siap langsung dikerjakan.' },
  { n: '06', name: 'Memori', note: 'Paket konteks keputusan dan asumsi untuk agen AI.' },
  { n: '07', name: 'Wireframe', note: 'Layar HTML interaktif dengan pratinjau desktop hingga ponsel.' },
];

const WORKFLOW_STEPS = [
  {
    n: '01',
    title: 'Tulis satu kalimat ide, atau pilih template',
    body: 'Mulai langsung dari Quick-Start Composer di Studio. Tidak ada formulir panjang; rancang-ai bertanya satu per satu sesuai konteks aplikasimu.',
  },
  {
    n: '02',
    title: 'Tonton enam dokumen ditulis berurutan',
    body: 'Setiap dokumen merujuk dokumen sebelumnya sehingga kontrak API cocok dengan skema database, lengkap dengan diagram Mermaid.',
  },
  {
    n: '03',
    title: 'Sunting, revisi, lalu ekspor untuk tim atau agen',
    body: 'Sunting langsung di studio dengan riwayat versi, tulis ulang dengan instruksi revisi, salin paket untuk AI Agent, atau unduh ZIP dan tautan bagikan.',
  },
];

export default function LandingPage() {
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

          <nav aria-label="Navigasi publik" className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/docs"
              className="hidden sm:inline-flex min-h-10 items-center px-2.5 text-sm text-ink-2 transition-colors hover:text-ink"
            >
              Dokumentasi
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
            >
              Masuk
            </Link>
            <PublicThemeToggle />
            <Link
              href="/register"
              className="inline-flex min-h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-white shadow-xs transition-colors hover:bg-accent-hover"
            >
              Mulai merancang
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 sm:px-8">
        {/* Hero: editorial statement on the left, live PRD proof sheet on the right */}
        <section className="grid gap-10 py-14 lg:grid-cols-12 lg:items-center lg:gap-12 lg:py-20">
          <div className="lg:col-span-6">
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-[40px] sm:leading-[1.15]">
              Satu percakapan menjadi{' '}
              <span className="text-accent-ink">spesifikasi aplikasi</span> yang utuh.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-2">
              rancang-ai mewawancarai idemu secara terarah, menyusun tujuh dokumen spesifikasi yang
              saling merujuk, merender diagram arsitektur, dan menyiapkan paket siap pakai untuk tim
              maupun agen pemrograman.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-accent-hover"
              >
                Mulai merancang
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center rounded-xl border border-line-strong bg-surface px-5 text-sm font-medium text-ink transition-colors hover:bg-subtle"
              >
                Sudah punya akun? Masuk
              </Link>
            </div>
            <p className="mt-5 font-mono text-xs text-ink-3">
              Bawa kunci API sendiri · Bahasa Indonesia · Ekspor MD, ZIP, dan JSON ·{' '}
              <Link href="/docs" className="text-ink-2 underline underline-offset-4 hover:text-ink">
                Lihat panduan
              </Link>
            </p>
          </div>

          <figure className="lg:col-span-6 rounded-2xl border border-line bg-surface shadow-panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-line bg-sidebar/70 px-5 py-3">
              <span className="font-mono text-xs text-ink-2">01_PRD.md · catatan-kebun</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-ink">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                Menulis langsung
              </span>
            </div>
            <div className="space-y-4 p-5 sm:p-6 text-sm leading-relaxed text-ink">
              <div>
                <h2 className="text-[15px] font-semibold text-ink">Ringkasan produk</h2>
                <p className="mt-1 text-ink-2">
                  Pencatat tanam untuk pekebun rumahan: satu halaman per bedeng, jadwal siram
                  berbasis usia tanaman, dan riwayat panen yang bisa dibandingkan antar musim.
                </p>
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-ink">Masalah utama</h2>
                <p className="mt-1 text-ink-2">
                  Catatan tanam tersebar di buku tulis, obrolan, dan ingatan. Pekebun kesulitan
                  melacak bedeng mana yang terakhir dipupuk atau kapan benih disemai.
                </p>
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-ink">Batas lingkup v1</h2>
                <p className="mt-1 text-ink-2">
                  Tidak mencakup marketplace bibit, integrasi sensor IoT, dan akun bersama
                  <span className="wet-caret ml-1" aria-hidden="true" />
                </p>
              </div>
            </div>
            <figcaption className="flex items-center justify-between border-t border-line bg-sidebar/40 px-5 py-2.5 font-mono text-xs text-ink-3">
              <span>v1 · manual + streaming</span>
              <span>1.482 kata</span>
            </figcaption>
          </figure>
        </section>

        {/* Workflow: asymmetric editorial band */}
        <section aria-labelledby="alur-kerja" className="border-t border-line py-14 lg:py-16">
          <div className="max-w-xl">
            <h2 id="alur-kerja" className="text-2xl font-semibold tracking-tight text-ink">
              Satu ruang kerja, tanpa bolak-balik halaman.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">
              Wawancara, penulisan langsung, penyuntingan dokumen, dan wireframe berada dalam satu
              proyek yang sama sehingga konteks tidak pernah terputus.
            </p>
          </div>
          <ol className="mt-8 grid gap-5 md:grid-cols-3">
            {WORKFLOW_STEPS.map((step) => (
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

        {/* Seven documents index: horizontal spec list for visual contrast against the 3-col band */}
        <section aria-labelledby="tujuh-dokumen" className="border-t border-line py-14 lg:py-16">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <h2 id="tujuh-dokumen" className="text-2xl font-semibold tracking-tight text-ink">
                Tujuh dokumen yang saling merujuk.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                Dokumen dibangun secara berurutan. Setiap dokumen membawa keputusan dari dokumen
                sebelumnya agar tidak saling bertentangan saat mulai menulis kode.
              </p>
            </div>
            <ul className="lg:col-span-8 divide-y divide-line rounded-xl border border-line bg-surface">
              {DOCUMENTS.map((doc) => (
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
                Mulai dari satu kalimat tentang idemu.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                Sisanya kita rancang bersama hingga menjadi spesifikasi yang siap dikerjakan.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-accent-hover"
              >
                Mulai merancang
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center rounded-xl border border-line-strong bg-surface px-5 text-sm font-medium text-ink transition-colors hover:bg-subtle"
              >
                Masuk
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
              Dokumentasi
            </Link>
            <span>{APP_VERSION}</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
