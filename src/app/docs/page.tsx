'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

/* The manual. Static content — no API call, because a manual that needs the
   server to explain the server is a manual you cannot read when it breaks.
   Every claim here is checked against the code: see docs/v0.1.3-contract.md
   §5 for the list of what is deliberately not documented (PDF export, cloud
   auth, team collaboration — none of them exist yet). */

interface Section {
  id: string;
  title: string;
  kicker: string;
}

const SECTIONS: Section[] = [
  { id: 'mulai', title: 'Mulai dari sini', kicker: '01' },
  { id: 'model', title: 'Menyiapkan model', kicker: '02' },
  { id: 'proyek', title: 'Membuat proyek', kicker: '03' },
  { id: 'wawancara', title: 'Wawancara', kicker: '04' },
  { id: 'menulis', title: 'Menulis dokumen', kicker: '05' },
  { id: 'membaca', title: 'Membaca & menyunting', kicker: '06' },
  { id: 'wireframe', title: 'Editor wireframe', kicker: '07' },
  { id: 'ekspor', title: 'Ekspor & bagikan', kicker: '08' },
  { id: 'library', title: 'Library', kicker: '09' },
  { id: 'masalah', title: 'Kalau ada masalah', kicker: '10' },
];

function DocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="inline-link">{children}</Link>;
}

/* The whole manual in one picture, because 520 lines of prose opened with no
   map at all. Drawn as inline SVG so it inherits the tokens: nodes are --well
   discs, the spine is --line-2, and the one vermilion dot is the step where
   ink is actually wet (writing). Two orientations, swapped by CSS, because a
   horizontal spine at 390px is a smear. */
const FLOW = [
  { n: '01', label: 'Siapkan model', sub: '/models' },
  { n: '02', label: 'Buat proyek', sub: '/studio' },
  { n: '03', label: 'Wawancara', sub: 'pertanyaan' },
  { n: '04', label: 'Tulis dokumen', sub: 'tujuh berkas' },
  { n: '05', label: 'Baca & sunting', sub: 'versi' },
  { n: '06', label: 'Ekspor & bagikan', sub: 'MD · ZIP · JSON' },
];

function FlowDiagram() {
  return (
    <figure className="flow" aria-labelledby="flow-cap">
      <figcaption id="flow-cap" className="cap mono">
        alur — satu ide jadi satu set dokumen
      </figcaption>

      {/* horizontal: the spine runs left to right between the discs */}
      <svg className="flow-h" viewBox="0 0 900 104" role="img" aria-label="Alur: siapkan model, buat proyek, wawancara, tulis dokumen, baca dan sunting, ekspor dan bagikan">
        <line x1="24" y1="26" x2="876" y2="26" stroke="var(--line-2)" strokeWidth="1" />
        {FLOW.map((s, i) => {
          const x = 24 + i * 170.4;
          const wet = s.n === '04';
          return (
            <g key={s.n}>
              <circle cx={x} cy={26} r={wet ? 7 : 5} fill={wet ? 'var(--vermilion)' : 'var(--card)'} stroke={wet ? 'var(--vermilion)' : 'var(--line-2)'} strokeWidth="1" />
              <text x={x} y={54} textAnchor="middle" className="fl-n">{s.n}</text>
              <text x={x} y={72} textAnchor="middle" className="fl-l">{s.label}</text>
              <text x={x} y={88} textAnchor="middle" className="fl-s">{s.sub}</text>
            </g>
          );
        })}
      </svg>

      {/* vertical: same six steps down a spine, for a phone */}
      <svg className="flow-v" viewBox="0 0 300 400" role="img" aria-label="Alur: siapkan model, buat proyek, wawancara, tulis dokumen, baca dan sunting, ekspor dan bagikan">
        <line x1="14" y1="14" x2="14" y2="386" stroke="var(--line-2)" strokeWidth="1" />
        {FLOW.map((s, i) => {
          const y = 14 + i * 74.4;
          const wet = s.n === '04';
          return (
            <g key={s.n}>
              <circle cx={14} cy={y} r={wet ? 7 : 5} fill={wet ? 'var(--vermilion)' : 'var(--card)'} stroke={wet ? 'var(--vermilion)' : 'var(--line-2)'} strokeWidth="1" />
              <text x={34} y={y + 4} className="fl-l">{s.label}</text>
              <text x={34} y={y + 20} className="fl-s">{s.n} · {s.sub}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export default function DocsPage() {
  const [active, setActive] = useState<string>(SECTIONS[0]!.id);
  const refs = useRef(new Map<string, HTMLElement>());

  /* Scroll-spy: the nav marks where you are, without a library. */
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
    <div className="pg-docs">
      <header className="top">
        <div>
          <p className="eyebrow mono">panduan</p>
          <h1>Dokumentasi</h1>
          <p className="muted lede">
            Cara memakai rancang-ai dari awal sampai dokumen jadi: menyiapkan
            model, menjalankan wawancara, menulis dan membaca dokumen,
            mengekspor, lalu menyimpan ke library.
          </p>
        </div>
      </header>

      <FlowDiagram />

      <div className="layout">
        <nav className="toc" aria-label="Daftar isi">
          <p className="cap mono">isi</p>
          <ol>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={active === s.id ? 'on' : ''}
                  aria-current={active === s.id ? 'true' : undefined}
                >
                  <span className="num mono">{s.kicker}</span>
                  <span>{s.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="prose">
          <section id="mulai" ref={setRef('mulai')}>
            <p className="cap mono">01 · mulai dari sini</p>
            <h2>Mulai dari sini</h2>
            <p>
              rancang-ai mengubah satu ide menjadi satu set dokumen spesifikasi.
              Kamu menceritakan idemu, aplikasi bertanya balik seperti seorang
              analis, lalu menulis dokumennya. Tidak ada yang perlu diisi ke
              formulir panjang.
            </p>
            <p>Urutannya selalu sama, dan setiap langkah punya halamannya sendiri:</p>
            <ol className="steps">
              <li>
                <b>Siapkan model.</b> Satu penyedia dan satu model di{' '}
                <DocLink href="/models">Models</DocLink>. Tanpa ini, tidak ada
                yang bisa menulis.
              </li>
              <li>
                <b>Buat proyek.</b> Satu proyek adalah satu aplikasi yang ingin
                kamu rancang. Dibuat dari <DocLink href="/studio">Studio</DocLink>.
              </li>
              <li>
                <b>Jalankan wawancara.</b> Lima sampai delapan pertanyaan, satu
                per satu, dengan saran jawaban kalau kamu bingung.
              </li>
              <li>
                <b>Tulis dokumen.</b> Enam dokumen ditulis berurutan dan bisa
                kamu tonton kata demi kata.
              </li>
              <li>
                <b>Baca, sunting, ekspor.</b> Unduh sebagai Markdown, ZIP, atau
                JSON; bagikan sebagai tautan baca-saja; simpan ke library.
              </li>
            </ol>
            <div className="callout">
              <p>
                <b>Yang perlu kamu punya:</b> satu akun di sini, dan satu kunci
                API penyedia model (atau langganan yang sudah tersimpan). Tidak
                ada biaya lain dari rancang-ai — token model ditagih oleh
                penyedianya, ke akunmu sendiri.
              </p>
            </div>
          </section>

          <section id="model" ref={setRef('model')}>
            <p className="cap mono">02 · menyiapkan model</p>
            <h2>Menyiapkan model</h2>
            <p>
              Buka <DocLink href="/models">Models</DocLink>. Halaman ini punya
              tiga bagian: daftar penyedia, formulir kredensial, dan daftar
              preset.
            </p>

            <h3>1. Pilih penyedia</h3>
            <p>
              Setiap penyedia punya kartu dengan status <span className="mono">TERHUBUNG</span>{' '}
              atau <span className="mono">BELUM</span>. Yang tersedia: OpenAI,
              Anthropic, Google, Groq, OpenRouter, Ollama, dan penyedia lain yang
              kompatibel dengan API OpenAI.
            </p>

            <h3>2. Pilih cara mengakses</h3>
            <ul>
              <li>
                <b>Langganan</b> — memakai kredensial yang sudah tersimpan untuk
                penyedia itu. Pilih ini kalau kamu sudah pernah menyimpan
                kuncinya.
              </li>
              <li>
                <b>Kunci sendiri (BYOK)</b> — tempel API key-mu. Untuk Ollama dan
                penyedia lain yang berjalan di mesinmu sendiri, isi juga{' '}
                <b>Base URL</b>; kalau dikosongkan, alamat bawaan penyedia yang
                dipakai dan permintaan akan gagal kalau penyedianya tidak
                dijangkau dari server ini.
              </li>
            </ul>
            <p>
              Kunci disimpan terenkripsi dan hanya empat karakter terakhirnya
              yang ditampilkan kembali. Ada tombol mata untuk menampilkan isian
              saat kamu mengetik — itu hanya di layar, bukan di server.
            </p>

            <h3>3. Uji, lalu simpan</h3>
            <p>
              Tombol <b>Uji koneksi</b> memanggil penyedia dengan kunci itu dan
              mengembalikan daftar model yang tersedia. Tombol simpan baru
              terbuka setelah uji berhasil dan kamu memilih satu model. Kalau uji
              gagal, pesannya menyebut penyebabnya — kunci ditolak, alamat tidak
              terjangkau, atau model tidak ada.
            </p>

            <h3>Preset</h3>
            <p>
              Setelah tersimpan, kredensial itu menjadi satu <b>preset</b>: nama,
              penyedia, dan model. Satu preset ditandai sebagai bawaan dan
              dipakai semua proyek yang tidak memilih sendiri. Kamu bisa
              mengganti model sebuah preset tanpa menyimpan kunci baru, dan
              menguji ulang kredensial yang sudah ada.
            </p>
            <div className="callout warn">
              <p>
                <b>Model yang dipakai menulis dokumen panjang.</b> Dokumen
                terbesar di sini bisa puluhan ribu karakter. Model kecil akan
                kehabisan jendela konteks atau berhenti di tengah; pilih model
                yang sanggup menulis panjang.
              </p>
            </div>
          </section>

          <section id="proyek" ref={setRef('proyek')}>
            <p className="cap mono">03 · membuat proyek</p>
            <h2>Membuat proyek</h2>
            <p>
              Di <DocLink href="/studio">Studio</DocLink>, tekan{' '}
              <b>+ Proyek baru</b>. Isi nama (wajib, maksimal 120 karakter) dan
              deskripsi singkat (opsional). Setelah disimpan, kamu langsung
              dibawa ke wawancara proyek itu.
            </p>
            <p>
              Studio menampilkan semua proyekmu sebagai kartu, dengan pencarian
              nama/deskripsi dan saringan status: <span className="mono">draft</span>,{' '}
              <span className="mono">wawancara</span>,{' '}
              <span className="mono">menulis</span>, <span className="mono">siap</span>,{' '}
              <span className="mono">arsip</span>. Kartu membuka halaman proyek;
              menu <b>⋯</b> di sudut kartu menyimpan pilihan <b>Arsipkan</b> dan
              <b>Hapus permanen</b>. Hapus membuang proyek beserta seluruh
              wawancara, dokumen, dan versinya — permanen, dan dialognya
              menyebutkan itu.
            </p>
            <div className="callout">
              <p>
                <b>Halaman proyek.</b> Kalau proyek sudah punya dokumen, halaman
                proyek membuka daftar dokumen beserta pratinjaunya. Kalau belum,
                halaman itu mengarahkanmu ke wawancara. Wawancara selalu bisa
                dibuka lagi lewat tombol <b>Lihat wawancara</b> di kanan atas.
              </p>
            </div>
          </section>

          <section id="wawancara" ref={setRef('wawancara')}>
            <p className="cap mono">04 · wawancara</p>
            <h2>Wawancara</h2>
            <p>
              Wawancara berjalan seperti percakapan. Di awal, tulis satu paragraf
              tentang idemu: aplikasi apa, untuk siapa, masalah apa yang
              diselesaikan. Setelah itu aplikasi yang bertanya — biasanya lima
              sampai delapan pertanyaan soal pemakai, alur inti, dan batasan.
            </p>
            <ul>
              <li>
                <b>Enter</b> mengirim jawaban, <b>Shift+Enter</b> membuat baris
                baru.
              </li>
              <li>
                Di bawah pertanyaan kadang muncul <b>saran jawaban</b>; menekannya
                langsung mengirim jawaban itu. Kamu tetap bisa menulis sendiri.
              </li>
              <li>
                Rel di kanan menunjukkan kemajuan: berapa pertanyaan sudah
                dijawab dari totalnya.
              </li>
              <li>
                <b>Mulai ulang</b> mengosongkan percakapan dan memulai sesi baru.
                Jawaban lama tidak dipakai lagi.
              </li>
            </ul>
            <p>
              Setelah pertanyaan terakhir, halaman menampilkan ringkasan dan
              tombol <b>Tulis dokumen</b>. Kamu tidak harus menjawab sempurna —
              jawaban seadanya sudah cukup untuk mulai; dokumennya bisa
              disunting setelah jadi.
            </p>
          </section>

          <section id="menulis" ref={setRef('menulis')}>
            <p className="cap mono">05 · menulis dokumen</p>
            <h2>Menulis dokumen</h2>
            <p>
              Dari wawancara, <b>Tulis dokumen</b> membuka halaman penulisan.
              Enam dokumen ditulis berurutan: <b>PRD</b>, <b>Arsitektur</b>,{' '}
              <b>Database</b>, <b>API</b>, <b>Tugas</b>, <b>Memori</b>.
              Wireframe tidak termasuk — ia dibuat terpisah, belakangan.
            </p>
            <p>
              Teks muncul kata demi kata di panel kanan; daftar di kiri
              menunjukkan dokumen mana yang sedang ditulis, mana yang sudah jadi,
              dan mana yang menunggu. Kamu boleh menutup tab: penulisan berjalan
              di server, dan saat kamu kembali halaman itu menyambung lagi ke
              proses yang sama.
            </p>
            <ul>
              <li>
                <b>Hentikan</b> menghentikan batch. Dokumen yang sudah selesai
                tetap tersimpan; yang sedang ditulis ditandai gagal.
              </li>
              <li>
                <b>Lanjutkan</b> menulis sisa dokumen yang belum jadi, tanpa
                mengulang yang sudah selesai.
              </li>
              <li>
                Satu proyek hanya boleh punya satu batch berjalan. Memulai batch
                kedua saat satu masih jalan akan ditolak dengan pesan bahwa
                pembuatan dokumen sedang berjalan.
              </li>
            </ul>
            <div className="callout warn">
              <p>
                <b>Token itu uang.</b> Setiap dokumen yang ditulis memakai token
                penyedia modelmu. Menekan <b>Lanjutkan</b> berulang kali pada
                dokumen yang sama akan menagih berulang kali. Kalau satu dokumen
                terus gagal, periksa model dan kuncinya dulu.
              </p>
            </div>
          </section>

          <section id="membaca" ref={setRef('membaca')}>
            <p className="cap mono">06 · membaca &amp; menyunting</p>
            <h2>Membaca &amp; menyunting</h2>
            <p>
              Halaman proyek menampilkan daftar dokumen di kiri dan isi dokumen
              yang dipilih di kanan, sudah dirender — tabel, daftar bertingkat,
              dan blok kode tampil sebagaimana mestinya, bukan sebagai teks
              mentah. Mengganti pilihan di daftar langsung mengganti pratinjau
              tanpa berpindah halaman.
            </p>
            <p>
              Untuk menyunting, buka dokumennya lewat tautan{' '}
              <b>buka halaman</b> di pratinjau. Halaman dokumen punya:
            </p>
            <ul>
              <li>
                <b>Tab dokumen</b> untuk berpindah antara PRD, Arsitektur, dan
                seterusnya. Dokumen yang belum jadi tampil redup.
              </li>
              <li>
                <b>Riwayat versi</b>: setiap penulisan ulang membuat versi baru.
                Versi lama tetap bisa dibaca.
              </li>
              <li>
                <b>Kunci dokumen</b> supaya penulisan ulang tidak menimpanya.
              </li>
              <li>
                <b>Simpan ke library</b> untuk menyimpan salinan dokumen itu.
              </li>
            </ul>
            <p>
              Wireframe bukan markdown, jadi ia tidak dirender di pratinjau;
              pratinjau menautkan ke editornya.
            </p>
          </section>

          <section id="wireframe" ref={setRef('wireframe')}>
            <p className="cap mono">07 · editor wireframe</p>
            <h2>Editor wireframe</h2>
            <p>
              Wireframe adalah layar HTML sederhana untuk alur utama aplikasimu.
              Ia dibuat dari halaman penulisan lewat tombol <b>Buat wireframe</b>,
              dan dibuka di editornya sendiri.
            </p>
            <ul>
              <li>
                <b>Layar</b> — tiap layar punya nama dan slug; satu ditandai{' '}
                <span className="mono">entry</span> sebagai layar pertama.
              </li>
              <li>
                <b>HTML</b> — panel kiri berisi HTML layar yang sedang aktif dan
                bisa langsung disunting. Pratinjau mengikuti ketikanmu, tetapi
                penyimpanan dilakukan dengan tombol <b>Simpan</b>; selama ada
                perubahan yang belum disimpan, statusnya berbunyi{' '}
                <span className="mono">belum disimpan</span>.
              </li>
              <li>
                <b>Pratinjau</b> — panel kanan merender HTML itu, dengan pilihan
                lebar desktop, tablet, atau ponsel.
              </li>
            </ul>
            <p>
              Wireframe sengaja polos: kotak, label, dan alur — bukan desain
              final. Gunanya untuk menyepakati susunan layar sebelum ada kode.
            </p>
          </section>

          <section id="ekspor" ref={setRef('ekspor')}>
            <p className="cap mono">08 · ekspor &amp; bagikan</p>
            <h2>Ekspor &amp; bagikan</h2>
            <h3>Unduh</h3>
            <p>
              Di halaman proyek, halaman dokumen, dan halaman penulisan ada
              tombol unduh dengan tiga format:
            </p>
            <ul>
              <li>
                <b>MD</b> — semua dokumen yang sudah jadi digabung menjadi satu
                berkas Markdown.
              </li>
              <li>
                <b>ZIP</b> — satu berkas ZIP berisi README, satu berkas{' '}
                <span className="mono">.md</span> per dokumen, dan{' '}
                <span className="mono">wireframes/*.html</span>. Ini yang paling
                praktis untuk diserahkan ke orang lain.
              </li>
              <li>
                <b>JSON</b> — bundel yang sama sebagai data terstruktur, untuk
                dipakai alat lain atau agen.
              </li>
            </ul>
            <p>
              Unduhan hanya jalan kalau dokumen inti (PRD, Arsitektur,
              Database, API, Tugas, Memori) sudah jadi. Kalau ada yang kurang,
              unduhan ditolak dan pesannya menyebut dokumen mana yang masih
              kosong. Ekspor PDF belum ada.
            </p>

            <h3>Tautan bagikan</h3>
            <p>
              Di halaman dokumen ada bagian <b>Bagikan</b>. Tombolnya membuat
              tautan baca-saja ke dokumen itu dan langsung menyalinnya ke
              clipboard. Tautan itu bisa dibuka tanpa masuk — cocok untuk
              menunjukkan hasil ke klien. Tautan bisa dicabut kembali; setelah
              dicabut, alamatnya tidak lagi menampilkan apa pun.
            </p>
          </section>

          <section id="library" ref={setRef('library')}>
            <p className="cap mono">09 · library</p>
            <h2>Library</h2>
            <p>
              <DocLink href="/library">Library</DocLink> adalah tempat artefak
              yang kamu simpan: dokumen, ekspor, dan wireframe. Isinya dikelompokkan{' '}
              <b>satu kartu per proyek</b>, bukan satu kartu per artefak.
            </p>
            <ul>
              <li>
                Setiap kartu menyebut nama proyek, jumlah artefak, ukuran
                totalnya, dan kapan terakhir disimpan.
              </li>
              <li>
                <b>Unduh ZIP</b> mengunduh seluruh isi proyek itu dalam satu
                berkas — pembuat ZIP-nya sama dengan tombol unduh di halaman
                proyek.
              </li>
              <li>
                Kartu tidak bisa diklik: library adalah tempat mengunduh dan
                menghapus, bukan pintu masuk ke dokumen. Untuk membaca, buka
                proyeknya dari Studio.
              </li>
              <li>
                <b>Hapus</b> pada kartu proyek menghapus salinan yang tersimpan
                di library saja. Proyek, wawancara, dan dokumennya tetap utuh.
              </li>
              <li>
                Artefak yang disimpan tanpa proyek masuk ke bagian{' '}
                <b>Simpanan lepas</b>, dan tidak punya tombol ZIP karena tidak
                ada proyek yang bisa dibundel.
              </li>
            </ul>
            <p>
              Saringan jenis (Dokumen, Ekspor, Wireframe) tetap berlaku: ia
              menyaring artefak sebelum dikelompokkan, jadi kartu hanya berisi
              jenis yang kamu pilih.
            </p>
          </section>

          <section id="masalah" ref={setRef('masalah')}>
            <p className="cap mono">10 · kalau ada masalah</p>
            <h2>Kalau ada masalah</h2>

            <h3>Penulisan tidak mau mulai</h3>
            <p>
              Paling sering karena belum ada model. Buka{' '}
              <DocLink href="/models">Models</DocLink> dan pastikan satu penyedia
              berstatus <span className="mono">TERHUBUNG</span> dengan satu preset
              bertanda bawaan. Pesan error yang menyebut kunci tidak ada berarti
              kredensial untuk penyedia itu belum tersimpan atau tidak aktif.
            </p>

            <h3>Penyedia menolak kunci</h3>
            <p>
              Pesan yang menyebut kunci ditolak datang dari penyedianya, bukan
              dari rancang-ai: kuncinya salah, sudah dicabut, atau kuotanya habis.
              Uji ulang di Models; kalau uji juga gagal di sana, ganti kuncinya.
            </p>

            <h3>Penulisan berhenti di tengah</h3>
            <p>
              Dokumen yang belum selesai ditandai gagal dan pesannya menyebut
              sebabnya. Tekan <b>Lanjutkan</b> untuk menulis sisanya — dokumen
              yang sudah jadi tidak diulang. Kalau sambungan browser yang putus,
              buka lagi halamannya: penulisan tetap berjalan di server, dan
              halaman akan menyambung kembali.
            </p>

            <h3>Batch ditolak karena sedang berjalan</h3>
            <p>
              Satu proyek hanya boleh punya satu batch pada satu waktu. Kalau kamu
              baru saja menekan tombol dari tab lain, tunggu batch itu selesai
              atau hentikan dulu, lalu mulai lagi.
            </p>

            <h3>Error penyedia (502) atau rate limit (429)</h3>
            <p>
              Keduanya datang dari penyedia model. Untuk rate limit, tunggu
              sebentar lalu lanjutkan. Untuk error penyedia, coba lagi sekali;
              kalau tetap gagal, ganti model di preset — penyedia kadang
              menolak satu model tertentu sementara model lain jalan.
            </p>

            <h3>Halaman kosong atau &ldquo;memuat…&rdquo; terus</h3>
            <p>
              Muat ulang halaman. Kalau tetap kosong, periksa apakah kamu masih
              masuk — sesi yang kedaluwarsa membuat semua permintaan ditolak, dan
              halaman akan mengarahkanmu ke masuk.
            </p>

            <div className="callout">
              <p>
                <b>Yang belum ada, dan tidak dijanjikan di sini:</b> ekspor PDF,
                masuk lewat akun cloud, dan kolaborasi tim. Kalau kamu butuh
                salah satunya, itu permintaan fitur, bukan pengaturan yang
                terlewat.
              </p>
            </div>
          </section>
        </article>
      </div>
    </div>
  );
}
