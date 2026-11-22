import Link from 'next/link';

/**
 * / — the public landing page (v0.1.3).
 *
 * The promise, in one sentence: one conversation becomes a full app
 * specification. Set as an editorial page, not a SaaS template: a paper
 * ground, a spec-sheet margin, display type for the promise, and the seven
 * documents as a numbered index. Vermilion appears once — on the wet-ink
 * mark in the hero — because it means "being written" everywhere else.
 */

const DOCUMENTS = [
  { n: '01', name: 'PRD', note: 'Masalah, pengguna, dan lingkup yang disepakati.' },
  { n: '02', name: 'Arsitektur', note: 'Bagaimana bagian-bagian sistem disusun.' },
  { n: '03', name: 'Database', note: 'Tabel, relasi, dan aturan integritas.' },
  { n: '04', name: 'API', note: 'Endpoint, bentuk data, dan kode galat.' },
  { n: '05', name: 'Tugas', note: 'Urutan pekerjaan yang bisa langsung diambil.' },
  { n: '06', name: 'Memori', note: 'Keputusan dan asumsi yang tak boleh hilang.' },
  { n: '07', name: 'Wireframe', note: 'Layar pertama, dalam HTML yang bisa dibuka.' },
];

const BEATS = [
  {
    n: 'I',
    title: 'Bercerita',
    body: 'Kamu menjelaskan idemu seperti kepada rekan kerja. Tidak ada formulir panjang — hanya pertanyaan yang tepat, satu per satu.',
  },
  {
    n: 'II',
    title: 'Dirancang',
    body: 'Percakapan itu dirangkum menjadi tujuh dokumen yang saling merujuk, bukan tujuh berkas yang berdiri sendiri.',
  },
  {
    n: 'III',
    title: 'Diserahkan',
    body: 'Unduh sebagai Markdown, ZIP, atau JSON — siap dibaca tim, atau langsung dijadikan titik mulai pembangunan.',
  },
];

export default function LandingPage() {
  return (
    <main className="pg-landing">
      <header className="top">
        <Link href="/" className="brand">
          rancang-ai
          <small>spec studio</small>
        </Link>
        <nav className="topnav">
          <Link href="/login" className="quiet">Masuk</Link>
          <Link href="/register" className="btn primary">Mulai merancang</Link>
        </nav>
      </header>

      {/* ── hero ── */}
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Dari percakapan menjadi spesifikasi</span>
          <h1>
            Satu percakapan menjadi
            <span className="wet"> spesifikasi aplikasi</span> yang utuh.
          </h1>
          <p className="lede">
            rancang-ai mendengarkan idemu, mengajukan pertanyaan yang tepat, lalu menuliskannya
            menjadi dokumen yang bisa langsung dibaca tim — dari PRD sampai wireframe.
          </p>
          <div className="cta">
            <Link href="/register" className="btn primary">Mulai merancang</Link>
            <Link href="/login" className="btn ghost">Sudah punya akun? Masuk</Link>
          </div>
          <p className="fine mono">Tanpa kartu kredit · Bahasa Indonesia · Hasil bisa diunduh</p>
        </div>

        <aside className="hero-sheet card" aria-hidden="true">
          <div className="sheet-head">
            <span className="mono sheet-cap">spesifikasi</span>
            <span className="pill live"><span className="dot" />menulis</span>
          </div>
          <div className="sheet-body">
            <div className="line w-90" />
            <div className="line w-70" />
            <div className="line w-80" />
            <div className="line gap" />
            <div className="line w-60" />
            <div className="line w-85" />
            <div className="line w-45" />
            <span className="cursor" />
          </div>
          <div className="sheet-foot mono">
            <span>prd.md</span>
            <span>v1 · 1.482 kata</span>
          </div>
        </aside>
      </section>

      {/* ── how it works ── */}
      <section className="beats" aria-labelledby="how">
        <div className="sec-head">
          <span className="eyebrow" id="how">Cara kerjanya</span>
          <h2>Tiga langkah, satu alur.</h2>
        </div>
        <ol className="beat-grid">
          {BEATS.map((b) => (
            <li key={b.n} className="beat">
              <span className="beat-n mono">{b.n}</span>
              <h3>{b.title}</h3>
              <p className="muted">{b.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── the seven documents ── */}
      <section className="docs" aria-labelledby="docs">
        <div className="sec-head">
          <span className="eyebrow" id="docs">Yang kamu terima</span>
          <h2>Tujuh dokumen, saling merujuk.</h2>
          <p className="sec-lede muted">
            Setiap dokumen dibangun dari yang sebelumnya, jadi API cocok dengan database,
            dan tugas cocok dengan keduanya.
          </p>
        </div>
        <ul className="doc-index">
          {DOCUMENTS.map((d) => (
            <li key={d.n} className="doc-row">
              <span className="doc-n mono">{d.n}</span>
              <span className="doc-name">{d.name}</span>
              <span className="doc-note muted">{d.note}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── closing ── */}
      <section className="closing">
        <div className="closing-inner">
          <h2>Mulai dari satu kalimat tentang idemu.</h2>
          <p className="muted">Sisanya, kita rancang bersama — sampai jadi spesifikasi yang bisa dikerjakan.</p>
          <div className="cta">
            <Link href="/register" className="btn primary">Mulai merancang</Link>
            <Link href="/login" className="btn ghost">Masuk</Link>
          </div>
        </div>
      </section>

      <footer className="foot mono">
        <span>rancang-ai · spec studio</span>
        <span>v0.1.3</span>
      </footer>
    </main>
  );
}
