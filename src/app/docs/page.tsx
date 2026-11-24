'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

interface Section {
  id: string;
  title: string;
  kicker: string;
}

const SECTIONS: Section[] = [
  { id: 'mulai', title: 'Mulai dari sini', kicker: '01' },
  { id: 'model', title: 'Menyiapkan model', kicker: '02' },
  { id: 'proyek', title: 'Quick-Start & template', kicker: '03' },
  { id: 'workspace', title: 'Ruang kerja terpadu', kicker: '04' },
  { id: 'wawancara', title: 'Wawancara & konteks langsung', kicker: '05' },
  { id: 'menulis', title: 'Menulis dokumen langsung', kicker: '06' },
  { id: 'studio-dokumen', title: 'Document Studio & Mermaid', kicker: '07' },
  { id: 'wireframe', title: 'Editor wireframe', kicker: '08' },
  { id: 'ekspor', title: 'Ekspor, AI Agent & bagikan', kicker: '09' },
  { id: 'library', title: 'Library master-detail', kicker: '10' },
];

const FLOW = [
  { n: '01', label: 'Siapkan model', sub: '/models' },
  { n: '02', label: 'Ide / Template', sub: '/studio' },
  { n: '03', label: 'Wawancara', sub: 'konteks langsung' },
  { n: '04', label: 'Tulis langsung', sub: '6 dokumen inti' },
  { n: '05', label: 'Sunting & Mermaid', sub: 'versi & revisi' },
  { n: '06', label: 'Ekspor & Bagikan', sub: 'ZIP · AI Agent' },
];

function DocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-accent-ink underline underline-offset-4">
      {children}
    </Link>
  );
}

export default function DocsPage() {
  const [active, setActive] = useState<string>(SECTIONS[0]!.id);
  const refs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActive(visible[0].target.id);
      },
      { rootMargin: '-88px 0px -60% 0px', threshold: [0, 1] },
    );
    refs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const setRef = useMemo(
    () => (id: string) => (el: HTMLElement | null) => {
      if (el) refs.current.set(id, el);
      else refs.current.delete(id);
    },
    [],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-5 py-7 sm:px-8">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Dokumentasi rancang-ai</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-2">
          Panduan lengkap memakai rancang-ai v0.2.0 dari menyiapkan model AI hingga menghasilkan,
          menyunting, dan mengekspor spesifikasi proyek.
        </p>
      </header>

      {/* Flow Overview */}
      <section
        aria-label="Alur kerja rancang-ai"
        className="rounded-2xl border border-line bg-surface p-5 shadow-panel"
      >
        <p className="font-mono text-xs text-ink-3 mb-4">Alur kerja end-to-end</p>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {FLOW.map((step) => {
            const wet = step.n === '04';
            return (
              <li
                key={step.n}
                className={cn(
                  'rounded-xl border p-3',
                  wet ? 'border-accent/35 bg-accent-soft/50' : 'border-line bg-canvas',
                )}
              >
                <span
                  className={cn(
                    'font-mono text-[11px] font-medium',
                    wet ? 'text-accent-ink' : 'text-ink-3',
                  )}
                >
                  {step.n}
                </span>
                <p className="mt-1 text-sm font-semibold text-ink">{step.label}</p>
                <p className="font-mono text-[11px] text-ink-3 mt-0.5">{step.sub}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid gap-8 lg:grid-cols-[230px_1fr] lg:items-start">
        <nav
          aria-label="Daftar isi dokumentasi"
          className="rounded-2xl border border-line bg-sidebar p-2 lg:sticky lg:top-20"
        >
          <p className="px-2.5 pb-1.5 pt-1 text-xs font-medium text-ink-3">Daftar isi</p>
          <ol className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {SECTIONS.map((s) => (
              <li key={s.id} className="shrink-0">
                <a
                  href={`#${s.id}`}
                  aria-current={active === s.id ? 'true' : undefined}
                  className={cn(
                    'flex min-h-9 items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors',
                    active === s.id
                      ? 'bg-surface font-medium text-ink shadow-xs ring-1 ring-line'
                      : 'text-ink-2 hover:bg-hover hover:text-ink',
                  )}
                >
                  <span className="font-mono text-[11px] text-ink-3">{s.kicker}</span>
                  <span>{s.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="min-w-0 space-y-10 rounded-2xl border border-line bg-surface p-6 shadow-panel sm:p-8 prose-fresh max-w-none">
          <section id="mulai" ref={setRef('mulai')} className="scroll-mt-20">
            <p className="font-mono text-xs text-ink-3">01 · Mulai dari sini</p>
            <h2>Mulai dari sini</h2>
            <p>
              rancang-ai membantu mengubah satu ide aplikasi menjadi tujuh dokumen spesifikasi yang
              saling terhubung. Gunakan tombol pencarian <kbd className="font-mono">Cmd/Ctrl+K</kbd>{' '}
              di bilah atas untuk berpindah cepat antar proyek, halaman, atau mengganti mode terang
              dan gelap tenang.
            </p>
          </section>

          <section id="model" ref={setRef('model')} className="scroll-mt-20">
            <p className="font-mono text-xs text-ink-3">02 · Menyiapkan model</p>
            <h2>Menyiapkan model</h2>
            <p>
              Buka <DocLink href="/models">Models</DocLink> untuk menghubungkan penyedia AI
              (OpenAI, Anthropic, Google, Groq, OpenRouter, Ollama, atau endpoint kompatibel
              OpenAI). Setelah pengujian berhasil dan kamu menyimpan preset default, indikator model
              aktif di bilah atas langsung menampilkan model yang sedang dipakai.
            </p>
          </section>

          <section id="proyek" ref={setRef('proyek')} className="scroll-mt-20">
            <p className="font-mono text-xs text-ink-3">03 · Quick-Start &amp; template</p>
            <h2>Quick-Start Composer dan template</h2>
            <p>
              Di <DocLink href="/studio">Studio</DocLink>, ketik satu kalimat ide langsung pada
              Quick-Start Composer lalu tekan <strong>Mulai merancang</strong>. Kamu juga bisa
              memilih salah satu template bawaan (B2B Micro-SaaS, Mobile Marketplace, AI Agent Tool,
              atau Internal Ops Dashboard) untuk menyertakan asumsi dasar otomatis.
            </p>
          </section>

          <section id="workspace" ref={setRef('workspace')} className="scroll-mt-20">
            <p className="font-mono text-xs text-ink-3">04 · Ruang kerja terpadu</p>
            <h2>Ruang kerja proyek terpadu</h2>
            <p>
              Setiap proyek berjalan di satu halaman terpadu dengan header persisten berisi status
              dokumen (misalnya <span className="font-mono">6/7 dok</span>), tombol Ekspor, dan
              dialog Bagikan. Kamu dapat berpindah mulus antara mode <strong>Wawancara</strong>,{' '}
              <strong>Tulis Langsung</strong>, dan <strong>Dokumen &amp; Wireframe</strong> tanpa
              kehilangan konteks. Tautan lama (<span className="font-mono">/interview</span>,{' '}
              <span className="font-mono">/write</span>,{' '}
              <span className="font-mono">/documents/[type]</span>) otomatis diarahkan ke mode yang
              sesuai.
            </p>
          </section>

          <section id="wawancara" ref={setRef('wawancara')} className="scroll-mt-20">
            <p className="font-mono text-xs text-ink-3">05 · Wawancara</p>
            <h2>Wawancara dan ringkasan konteks langsung</h2>
            <p>
              Saat menjawab pertanyaan di mode Wawancara, panel kanan menampilkan{' '}
              <strong>Ringkasan konteks terkumpul</strong> secara langsung. Jika konteks sudah dirasa
              cukup kapan saja, tekan <strong>Cukup, lanjut tulis spesifikasi</strong> untuk
              mengunci sesi dan langsung masuk ke penulisan dokumen.
            </p>
          </section>

          <section id="menulis" ref={setRef('menulis')} className="scroll-mt-20">
            <p className="font-mono text-xs text-ink-3">06 · Menulis dokumen</p>
            <h2>Menulis dokumen langsung (SSE)</h2>
            <p>
              Mode <strong>Tulis Langsung</strong> menjalankan batch penulisan enam dokumen inti
              (PRD, Arsitektur, Database, API, Tugas, Memori) secara berurutan di server. Kamu bisa
              menutup tab, berpindah mode, menghentikan sementara, atau melanjutkan sisa dokumen
              kapan saja.
            </p>
          </section>

          <section id="studio-dokumen" ref={setRef('studio-dokumen')} className="scroll-mt-20">
            <p className="font-mono text-xs text-ink-3">07 · Document Studio</p>
            <h2>Document Studio, Mermaid, suntingan, dan versi</h2>
            <ul>
              <li>
                <strong>Diagram Mermaid otomatis:</strong> blok kode{' '}
                <span className="font-mono">mermaid</span> pada Arsitektur, Database (ERD), atau
                dokumen lain dirender menjadi diagram interaktif dengan tombol lihat kode sumber.
              </li>
              <li>
                <strong>Sunting langsung:</strong> beralih ke mode <strong>Sunting</strong>, ubah
                Markdown, isi catatan perubahan, lalu simpan sebagai versi baru (
                <span className="font-mono">Ctrl/Cmd+S</span>).
              </li>
              <li>
                <strong>Tulis ulang dengan instruksi revisi:</strong> berikan arahan spesifik saat
                menulis ulang satu dokumen agar revisi tepat sasaran.
              </li>
              <li>
                <strong>Riwayat versi dan pemulihan:</strong> buka pemilih versi di header dokumen
                untuk membaca revisi lama atau memulihkannya sebagai versi terbaru.
              </li>
            </ul>
          </section>

          <section id="wireframe" ref={setRef('wireframe')} className="scroll-mt-20">
            <p className="font-mono text-xs text-ink-3">08 · Editor wireframe</p>
            <h2>Editor wireframe</h2>
            <p>
              Wireframe dibuat terpisah dari dokumen inti dan dapat disunting langsung di mode
              Dokumen &amp; Wireframe dengan pratinjau sandbox untuk lebar desktop, tablet, dan
              ponsel.
            </p>
          </section>

          <section id="ekspor" ref={setRef('ekspor')} className="scroll-mt-20">
            <p className="font-mono text-xs text-ink-3">09 · Ekspor &amp; AI Agent</p>
            <h2>Ekspor, Salin untuk AI Agent, dan tautan bagikan</h2>
            <p>
              Gunakan menu <strong>Salin untuk AI Agent</strong> untuk menyalin satu dokumen atau
              seluruh proyek dalam format prompt siap tempel ke alat pemrograman AI. Menu{' '}
              <strong>Ekspor</strong> di header menyediakan paket ZIP, gabungan Markdown, dan JSON.
              Tombol <strong>Bagikan</strong> membuat tautan baca saja publik maupun ber kata sandi.
            </p>
          </section>

          <section id="library" ref={setRef('library')} className="scroll-mt-20">
            <p className="font-mono text-xs text-ink-3">10 · Library</p>
            <h2>Library master-detail</h2>
            <p>
              <DocLink href="/library">Library</DocLink> menampilkan daftar artefak di kiri dan
              pratinjau penuh (Markdown, diagram Mermaid, atau HTML wireframe) di kanan, lengkap
              dengan tombol salin, unduh berkas, unduh ZIP proyek, dan tautan kembali ke proyek.
            </p>
          </section>
        </article>
      </div>
    </div>
  );
}
