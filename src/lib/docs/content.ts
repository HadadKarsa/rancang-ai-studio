import type { Locale } from '@/lib/i18n/LocaleProvider';

export interface DocCallout {
  tone: 'tip' | 'note' | 'security';
  title: string;
  body: string;
}

export interface DocTable {
  headers: string[];
  rows: string[][];
}

export interface DocArticle {
  id: string;
  groupId: string;
  title: string;
  summary: string;
  paragraphs?: string[];
  steps?: { title: string; detail: string }[];
  bullets?: { label: string; detail: string }[];
  table?: DocTable;
  callout?: DocCallout;
  codeBlock?: { label: string; content: string };
  link?: { href: string; label: string };
}

export interface DocGroup {
  id: string;
  title: string;
}

export interface DocsCatalog {
  pageTitle: string;
  pageSubtitle: string;
  searchPlaceholder: string;
  onThisPageLabel: string;
  groups: DocGroup[];
  articles: DocArticle[];
}

const ID_CATALOG: DocsCatalog = {
  pageTitle: 'Dokumentasi',
  pageSubtitle:
    'Panduan lengkap menggunakan rancang-ai dari pengaturan model hingga menyusun, meninjau, dan menyerahkan enam dokumen spesifikasi teknis ke tim atau agen AI.',
  searchPlaceholder: 'Cari topik, dokumen, atau langkah...',
  onThisPageLabel: 'Di halaman ini',
  groups: [
    { id: 'mulai', title: 'Memulai' },
    { id: 'model-akun', title: 'Model & Akun' },
    { id: 'enam-dokumen', title: 'Enam Dokumen Inti' },
    { id: 'ekspor-agen', title: 'Ekspor & AI Agent' },
  ],
  articles: [
    {
      id: 'pengenalan',
      groupId: 'mulai',
      title: 'Apa itu rancang-ai?',
      summary:
        'Studio spesifikasi perangkat lunak yang mengubah satu gagasan singkat menjadi enam dokumen teknis yang saling merujuk.',
      paragraphs: [
        'Menulis spesifikasi dari nol sering terputus antara kebutuhan produk, skema database, dan kontrak API. rancang-ai menyusun keenam dokumen itu secara berurutan di server sehingga setiap dokumen membaca hasil dokumen sebelumnya dan memakai nama entitas, endpoint, dan aturan yang konsisten.',
        'Semua proyek bisa ditulis dalam Bahasa Indonesia maupun English. Kamu cukup memilih bahasa output dokumen AI pada Studio atau ruang kerja proyek sebelum memulai generasi.',
      ],
      bullets: [
        { label: 'Dua alur kerja fleksibel', detail: 'Gunakan wawancara terarah untuk menggali konteks, atau langsung generate jika deskripsi proyek sudah cukup detail.' },
        { label: 'Generasi berjalan di server', detail: 'Kamu bebas membuka dokumen yang sudah selesai, menyegarkan halaman, atau berpindah menu tanpa memutus proses penulisan batch.' },
        { label: 'Siap untuk tim dan agen pemrograman', detail: 'Setiap bundel ZIP menyertakan 6 dokumen bernomor dan file AGENT_INSTRUCTIONS.md yang langsung bisa dipakai di Cursor, Codex, atau Claude Code.' },
      ],
      link: { href: '/studio', label: 'Buka Studio' },
    },
    {
      id: 'quickstart',
      groupId: 'mulai',
      title: 'Panduan cepat 5 menit',
      summary: 'Empat langkah singkat dari proyek kosong hingga bundel spesifikasi siap pakai.',
      steps: [
        {
          title: 'Pastikan model AI siap dipakai',
          detail: 'Buka halaman Models atau dropdown di kanan atas. Kamu bisa langsung memakai model Bawaan Rancang.ai atau menghubungkan API key milikmu sendiri untuk sesi browser ini.',
        },
        {
          title: 'Tulis ide proyek di Studio',
          detail: 'Isi judul, detail singkat, tujuan penggunaan (Dokumentasi, Implementasi tim, atau Implementasi dengan AI agent), dan pilih bahasa output AI (Indonesia atau English).',
        },
        {
          title: 'Pilih wawancara atau langsung generate',
          detail: 'Saat klik Mulai merancang, pilih Wawancara bila ingin menggali batasan dan edge case bersama AI, atau Langsung buat dokumen jika brief kamu sudah matang.',
        },
        {
          title: 'Tinjau, sunting, lalu ekspor',
          detail: 'Saat dokumen selesai satu per satu, kamu bisa langsung mengklik dokumen yang sudah jadi untuk membacanya, menyunting Markdown, melihat diagram Mermaid, atau mengunduh paket ZIP.',
        },
      ],
      callout: {
        tone: 'tip',
        title: 'Pintasan cepat',
        body: 'Tekan Cmd+K atau Ctrl+K kapan saja untuk mencari proyek, berpindah halaman, atau mengganti tema terang dan gelap tenang.',
      },
    },
    {
      id: 'alur-kerja',
      groupId: 'mulai',
      title: 'Wawancara vs Langsung Generate',
      summary: 'Kapan sebaiknya melewati wawancara dan kapan wawancara memberikan hasil spesifikasi yang jauh lebih tajam.',
      table: {
        headers: ['Aspek', 'Dengan Wawancara', 'Langsung Generate'],
        rows: [
          ['Cocok saat', 'Ide masih garis besar, banyak asumsi terbuka, atau butuh validasi lingkup.', 'Kamu sudah punya deskripsi detail, alur utama, dan batasan teknis yang jelas.'],
          ['Sumber kebenaran AI', 'Jawaban founder selama wawancara menjadi prioritas utama.', 'Judul dan deskripsi proyek menjadi brief utama, celah dicatat di bagian asumsi.'],
          ['Durasi', '5 sampai 8 pertanyaan singkat (bisa diakhiri lebih cepat kapan saja).', 'Langsung masuk ke tab Dokumen dan menulis 6 dokumen berurutan.'],
        ],
      },
      callout: {
        tone: 'note',
        title: 'Bisa lanjut atau hentikan kapan saja',
        body: 'Selama wawancara, tekan "Cukup, lanjut tulis spesifikasi" begitu konteks dirasa memadai. Saat batch dokumen berjalan, kamu juga dapat mengklik dokumen yang sudah selesai untuk meninjau hasilnya sambil dokumen berikutnya ditulis.',
      },
    },
    {
      id: 'model-keamanan',
      groupId: 'model-akun',
      title: 'Bawaan Rancang.ai vs API Key Sendiri (BYOK)',
      summary: 'Dua cara memakai model AI dengan kejelasan penuh soal penyimpanan API key.',
      table: {
        headers: ['Mode', 'Penyimpanan Kunci', 'Cocok untuk'],
        rows: [
          ['Bawaan Rancang.ai', 'Terenkripsi AES-256-GCM di server (dikelola Admin, tidak pernah dikirim ke browser).', 'Langsung mulai merancang tanpa menyiapkan API key sendiri.'],
          ['API Key Sendiri (BYOK)', 'Hanya di sessionStorage browser, tidak pernah disimpan ke database server.', 'Memakai model/kuota provider pribadi (OpenAI, Kenari, OpenRouter, Ollama, atau endpoint OpenAI-Compatible lain).'],
        ],
      },
      callout: {
        tone: 'security',
        title: 'Cara kerja keamanan BYOK sesi browser',
        body: 'API key BYOK disimpan sementara di sessionStorage browser dan dikirim lewat HTTPS hanya saat memanggil endpoint wawancara atau penulisan dokumen. Kunci otomatis terhapus saat tab ditutup atau kamu keluar akun. Disarankan memakai API key terpisah dengan batas biaya (spending limit).',
      },
      link: { href: '/models', label: 'Buka Pengaturan Model' },
    },
    {
      id: 'whitelist-admin',
      groupId: 'model-akun',
      title: 'Peran Admin, Whitelist Model & Profil',
      summary: 'Pemisahan hak akses antara Admin (owner) dan pengguna biasa (member), termasuk pengaturan kata sandi.',
      bullets: [
        { label: 'Kelola Bawaan Rancang.ai (Admin)', detail: 'Hanya akun berstatus admin yang dapat menambah, menyegarkan, menghapus koneksi bawaan, serta memilih whitelist model yang muncul di dropdown seluruh pengguna.' },
        { label: 'Akses pengguna biasa (Member)', detail: 'Pengguna melihat daftar model Bawaan Rancang.ai sesuai whitelist admin tanpa nama/endpoint penyedia, atau menghubungkan BYOK sesi milik sendiri.' },
        { label: 'Profil & atur kata sandi nanti', detail: 'Di halaman Profil, pengguna dapat mengubah nama, email, dan kata sandi. Pengguna yang mendaftar lewat Google tanpa kata sandi bisa menyetel kata sandi kapan saja dari Profil agar juga bisa masuk lewat email.' },
      ],
      link: { href: '/profile', label: 'Buka Profil Akun' },
    },
    {
      id: 'panduan-prd',
      groupId: 'enam-dokumen',
      title: '01. PRD (Kebutuhan Produk)',
      summary: 'Menyepakati siapa yang mengalami masalah, tujuan utama, batasan non-goals, alur pengguna, dan prioritas fitur P0/P1/P2.',
      paragraphs: [
        'PRD menjadi jangkar bagi lima dokumen berikutnya. Semakin jelas batasan versi pertama (apa yang masuk dan apa yang sengaja ditunda), semakin fokus pula skema database dan kontrak API yang dihasilkan.',
      ],
      bullets: [
        { label: 'Contoh fokus', detail: 'Pada aplikasi janji temu klinik, pasien memilih jadwal kosong dan menerima konfirmasi; pembayaran daring dicatat sebagai non-goal untuk versi berikutnya.' },
        { label: 'Checklist tinjauan', detail: 'Pastikan setiap fitur P0 memiliki kriteria penerimaan yang bisa diuji, misalnya dua pasien tidak boleh memesan slot yang sama secara bersamaan.' },
      ],
    },
    {
      id: 'panduan-architecture',
      groupId: 'enam-dokumen',
      title: '02. Arsitektur Sistem',
      summary: 'Memetakan tanggung jawab antarmuka, layanan backend, penyimpanan data, integrasi eksternal, dan diagram alur Mermaid.',
      paragraphs: [
        'Dokumen arsitektur menjabarkan alasan pemilihan pola sistem, aliran data inti, keputusan teknis beserta trade-off, rencana skala, dan skenario kegagalan.',
      ],
      bullets: [
        { label: 'Diagram Mermaid otomatis', detail: 'Blok kode mermaid dirender menjadi diagram interaktif langsung di pratinjau dokumen lengkap dengan tombol lihat kode sumber.' },
        { label: 'Checklist tinjauan', detail: 'Telusuri satu permintaan pengguna dari awal sampai akhir dan periksa apa yang terjadi jika layanan pihak ketiga gagal merespons.' },
      ],
    },
    {
      id: 'panduan-database',
      groupId: 'enam-dokumen',
      title: '03. Skema Database',
      summary: 'Menentukan entitas, relasi ERD, definisi tabel, constraint integritas, strategi indeks, dan pendekatan migrasi.',
      paragraphs: [
        'Skema disusun dengan SQL yang portabel sehingga mudah diterapkan ke PostgreSQL, SQLite/libSQL, maupun MySQL tanpa ketergantungan sintaks proprietary yang tidak perlu.',
      ],
      bullets: [
        { label: 'Contoh integritas', detail: 'Gunakan unique constraint pada kombinasi dokter dan waktu slot agar race condition tidak menghasilkan pemesanan ganda.' },
        { label: 'Checklist tinjauan', detail: 'Cocokkan setiap kolom sensitif (password hash, API key) agar tidak pernah disimpan sebagai teks biasa.' },
      ],
    },
    {
      id: 'panduan-api',
      groupId: 'enam-dokumen',
      title: '04. Kontrak API',
      summary: 'Menyepakati gaya API, autentikasi, format amplop galat, daftar endpoint lengkap dengan contoh JSON, pagination, dan rate limit.',
      paragraphs: [
        'Kontrak API menjadi perjanjian tegas antara frontend, backend, dan pengujian otomatis sehingga implementasi tidak perlu menebak struktur respons atau kode status HTTP.',
      ],
      bullets: [
        { label: 'Contoh konsistensi', detail: 'POST /appointments mengembalikan 201 beserta ID janji, atau 409 CONFLICT lengkap dengan kode galat yang jelas jika slot sudah terisi.' },
        { label: 'Checklist tinjauan', detail: 'Pastikan seluruh endpoint mutasi mencantumkan aturan izin akses dan validasi masukan.' },
      ],
    },
    {
      id: 'panduan-tasks',
      groupId: 'enam-dokumen',
      title: '05. Daftar Tugas Implementasi',
      summary: 'Memecah spesifikasi menjadi fase pengerjaan berurutan yang setiap tugasnya kecil, terukur, dan mencantumkan ketergantungan.',
      paragraphs: [
        'Setiap fase disusun dari fondasi skema dan kontrak hingga UI dan pengujian agar baik engineer maupun AI coding agent dapat mengeksekusi langkah demi langkah tanpa menumpuk perubahan besar.',
      ],
      bullets: [
        { label: 'Checklist tinjauan', detail: 'Pastikan tiap tugas punya kriteria selesai yang konkret dan urutan dependensinya masuk akal.' },
      ],
    },
    {
      id: 'panduan-memory',
      groupId: 'enam-dokumen',
      title: '06. Memori Proyek',
      summary: 'Paket konteks ringkas berisi ringkasan produk, keputusan arsitektur bertanggal, glosarium istilah, invarian terkunci, dan pertanyaan terbuka.',
      paragraphs: [
        'Memori Proyek dirancang sebagai dokumen pertama yang dibaca anggota tim baru atau AI coding agent sebelum menulis satu baris kode pun, agar konteks keputusan penting tidak hilang di tengah jalan.',
      ],
      bullets: [
        { label: 'Checklist tinjauan', detail: 'Pisahkan keputusan yang sudah dikunci dari pertanyaan terbuka yang masih butuh konfirmasi sebelum coding.' },
      ],
    },
    {
      id: 'ekspor-ai-agent',
      groupId: 'ekspor-agen',
      title: 'Menyerahkan Spesifikasi ke AI Coding Agent',
      summary: 'Cara paling efektif memakai bundel ZIP atau menu Salin untuk AI Agent di Cursor, Codex, Claude Code, atau Antigravity.',
      steps: [
        {
          title: 'Unduh paket ZIP atau salin instruksi agen',
          detail: 'Di header proyek, pilih Ekspor -> Unduh paket ZIP. Paket berisi 6 dokumen bernomor (01 sampai 06) ditambah AGENT_INSTRUCTIONS.md.',
        },
        {
          title: 'Letakkan bundel di folder proyek',
          detail: 'Ekstrak ke folder seperti docs/spec/ di repositori kode, lalu tempel instruksi agen ke system instructions atau pesan pertama chat.',
        },
        {
          title: 'Minta agen merangkum sebelum mulai coding',
          detail: 'Biasakan agen membaca 06_Project_Memory.md dan 01_PRD.md dulu, lalu mengonfirmasi pertanyaan terbuka sebelum mengeksekusi fase tugas.',
        },
      ],
      codeBlock: {
        label: 'Contoh prompt pembuka ke AI coding agent',
        content:
          'Baca seluruh spesifikasi di folder docs/spec/ dimulai dari 06_Project_Memory.md dan 01_PRD.md. Rangkum lingkup, invarian terkunci, dan pertanyaan terbuka yang perlu saya konfirmasi sebelum kamu mulai mengerjakan Phase 0 di 05_Task_Checklist.md.',
      },
    },
    {
      id: 'library-berbagi',
      groupId: 'ekspor-agen',
      title: 'Library, Versi & Tautan Berbagi',
      summary: 'Menyimpan snapshot dokumen per proyek, memulihkan versi lama, dan berbagi spesifikasi read-only.',
      bullets: [
        { label: 'Riwayat versi & sunting manual', detail: 'Setiap suntingan manual (Ctrl/Cmd+S) atau tulis ulang dengan instruksi revisi otomatis tersimpan sebagai versi baru yang dapat dibandingkan dan dipulihkan.' },
        { label: 'Library terkelompok per proyek', detail: 'Simpan dokumen penting ke Library agar mudah dibuka kembali per proyek tanpa mencampur dokumen lintas proyek.' },
        { label: 'Tautan bagikan read-only', detail: 'Buat tautan berbagi publik atau terlindungi kata sandi dengan masa berlaku yang bisa dicabut kapan saja.' },
      ],
      link: { href: '/library', label: 'Buka Library' },
    },
    {
      id: 'pemecahan-masalah',
      groupId: 'ekspor-agen',
      title: 'Pemecahan Masalah Umum',
      summary: 'Solusi cepat untuk kendala model, BYOK sesi, atau proses generasi dokumen.',
      bullets: [
        { label: 'Daftar model BYOK kosong saat diuji', detail: 'Beberapa gateway tidak menyediakan endpoint /v1/models. Gunakan tautan "Isi ID manual" di Langkah 1 pada halaman Models untuk mengetik ID model langsung.' },
        { label: 'Kunci BYOK hilang setelah membuka tab baru', detail: 'Ini perilaku keamanan yang disengaja: kunci BYOK disimpan khusus di sessionStorage tab aktif agar tidak menetap di disk atau server.' },
        { label: 'Dokumen berhenti karena kuota atau timeout penyedia', detail: 'Klik "Lanjutkan sisa" di bilah samping Document Studio untuk melanjutkan hanya dokumen yang belum selesai tanpa mengulang dokumen yang sudah siap.' },
      ],
    },
  ],
};

const EN_CATALOG: DocsCatalog = {
  pageTitle: 'Documentation',
  pageSubtitle:
    'Complete guide to using rancang-ai from configuring AI models to authoring, reviewing, and handing off six connected specification documents to your team or coding agent.',
  searchPlaceholder: 'Search topics, documents, or guides...',
  onThisPageLabel: 'On this page',
  groups: [
    { id: 'mulai', title: 'Getting Started' },
    { id: 'model-akun', title: 'Models & Accounts' },
    { id: 'enam-dokumen', title: 'Six Core Documents' },
    { id: 'ekspor-agen', title: 'Export & AI Agents' },
  ],
  articles: [
    {
      id: 'pengenalan',
      groupId: 'mulai',
      title: 'What is rancang-ai?',
      summary:
        'A software specification studio that turns a brief product idea into six cross-referenced technical documents.',
      paragraphs: [
        'Writing specs from scratch often drifts between product requirements, database schemas, and API contracts. rancang-ai generates all six documents sequentially on the server so each document reads prior outputs and keeps entity names, endpoints, and invariants aligned.',
        'Every project can be authored in either Indonesian or English. Pick your preferred AI output language right inside Studio or the project workspace before generating.',
      ],
      bullets: [
        { label: 'Two flexible workflows', detail: 'Use the guided interview to uncover constraints, or jump straight to document generation when your brief is already detailed.' },
        { label: 'Server-owned batch generation', detail: 'Click finished documents to read them right away, refresh the page, or switch routes without interrupting the running batch.' },
        { label: 'Built for teams and coding agents', detail: 'Every ZIP bundle packages all six numbered documents alongside AGENT_INSTRUCTIONS.md for Cursor, Codex, Claude Code, or Antigravity.' },
      ],
      link: { href: '/studio', label: 'Open Studio' },
    },
    {
      id: 'quickstart',
      groupId: 'mulai',
      title: '5-Minute Quickstart',
      summary: 'Four steps from a blank idea to a ready-to-build specification bundle.',
      steps: [
        {
          title: 'Confirm your AI model is ready',
          detail: 'Open Models or the top-right model switcher. Use the server-managed Rancang.ai models right away, or connect your own OpenAI-compatible API key for the current browser session.',
        },
        {
          title: 'Create a project in Studio',
          detail: 'Enter a project title, brief description, target purpose (Documentation, Team implementation, or AI agent implementation), and choose the AI document language (Indonesian or English).',
        },
        {
          title: 'Choose Interview or Direct Generation',
          detail: 'When clicking Start designing, pick Guided Interview to sharpen scope and edge cases, or Generate directly if your project brief is already thorough.',
        },
        {
          title: 'Review, edit, and export',
          detail: 'As documents finish one by one, click any completed document immediately to inspect Markdown and Mermaid diagrams, edit inline, or export the full ZIP bundle.',
        },
      ],
      callout: {
        tone: 'tip',
        title: 'Keyboard shortcut',
        body: 'Press Cmd+K or Ctrl+K anywhere to jump across projects, switch pages, or toggle between light and Deep Slate dark themes.',
      },
    },
    {
      id: 'alur-kerja',
      groupId: 'mulai',
      title: 'Interview vs Direct Generation',
      summary: 'When to skip the interview and when a short Q&A produces sharper technical contracts.',
      table: {
        headers: ['Aspect', 'Guided Interview', 'Direct Generation'],
        rows: [
          ['Best for', 'Early-stage ideas with open assumptions or unclear edge cases.', 'Detailed briefs where core flows and constraints are already spelled out.'],
          ['Primary source of truth', 'Founder answers during the interview take top priority.', 'Project title and description act as the brief; gaps are listed as explicit assumptions.'],
          ['Pace', '5 to 8 focused questions (can wrap up early anytime).', 'Goes straight to the Documents step and writes all 6 files sequentially.'],
        ],
      },
      callout: {
        tone: 'note',
        title: 'Inspect completed docs while the batch runs',
        body: 'During batch generation, clicking any completed document in the sidebar immediately pins the preview to that document while remaining files continue generating in the background.',
      },
    },
    {
      id: 'model-keamanan',
      groupId: 'model-akun',
      title: 'Managed Rancang.ai vs Session BYOK',
      summary: 'Two model modes with clear boundaries around where API keys live.',
      table: {
        headers: ['Mode', 'Key Storage', 'Best for'],
        rows: [
          ['Managed Rancang.ai', 'Encrypted AES-256-GCM on the server (admin-managed, never sent to the browser).', 'Starting immediately with curated models and zero API setup.'],
          ['Bring Your Own Key (BYOK)', 'Browser sessionStorage only; never written to the server database.', 'Using your own quota across OpenAI, Kenari, OpenRouter, Ollama, or any OpenAI-compatible gateway.'],
        ],
      },
      callout: {
        tone: 'security',
        title: 'How session-only BYOK works',
        body: 'Your BYOK API key is kept strictly in browser sessionStorage and sent over HTTPS only when invoking interview or document generation routes. Closing the tab or signing out wipes it automatically. We recommend using a scoped API key with a spending limit.',
      },
      link: { href: '/models', label: 'Open Model Settings' },
    },
    {
      id: 'whitelist-admin',
      groupId: 'model-akun',
      title: 'Admin Role, Model Whitelist & Profile',
      summary: 'Clear separation between Admin (owner) and regular users (member), plus password-later profile controls.',
      bullets: [
        { label: 'Admin-managed whitelist', detail: 'Only owner accounts can add, refresh, or remove managed connections and pick the exact whitelist of models exposed in the Rancang.ai model picker.' },
        { label: 'Clean member experience', detail: 'Members see only the whitelisted model IDs under Managed Rancang.ai (without provider names or private endpoints), or connect their own session BYOK key.' },
        { label: 'Profile & set password later', detail: 'Open Profile to edit your name, email, or password. Users who signed up via Google without a password can set one anytime from Profile while keeping Google sign-in active.' },
      ],
      link: { href: '/profile', label: 'Open Account Profile' },
    },
    {
      id: 'panduan-prd',
      groupId: 'enam-dokumen',
      title: '01. PRD (Product Requirements)',
      summary: 'Aligns on who has the problem, target outcomes, explicit non-goals, core user journeys, and P0/P1/P2 priorities.',
      paragraphs: [
        'The PRD anchors every downstream document. Clear version-one boundaries keep the architecture, database schema, and API surface focused instead of bloated.',
      ],
      bullets: [
        { label: 'Scope example', detail: 'For a clinic booking app, patients pick open slots and receive confirmation; online payments stay explicitly listed as a non-goal for v1.' },
        { label: 'Review checklist', detail: 'Verify every P0 feature has testable acceptance criteria, such as preventing two patients from booking the same slot concurrently.' },
      ],
    },
    {
      id: 'panduan-architecture',
      groupId: 'enam-dokumen',
      title: '02. System Architecture',
      summary: 'Maps UI, services, storage, external integrations, failure modes, and interactive Mermaid flowcharts.',
      paragraphs: [
        'Documents why a given pattern fits the constraints, traces core data flows, names technical trade-offs plainly, and outlines scaling paths.',
      ],
      bullets: [
        { label: 'Live Mermaid rendering', detail: 'Mermaid fenced blocks render directly inside the preview with an instant toggle to inspect the raw diagram source.' },
        { label: 'Review checklist', detail: 'Trace one end-to-end user action and verify what happens when an upstream integration times out or rejects a call.' },
      ],
    },
    {
      id: 'panduan-database',
      groupId: 'enam-dokumen',
      title: '03. Database Schema',
      summary: 'Defines entities, Mermaid ERD, column types, integrity constraints, indexing strategy, and migrations.',
      paragraphs: [
        'Generated in portable SQL so teams can adapt cleanly to PostgreSQL, SQLite/libSQL, or MySQL without fighting dialect lock-in.',
      ],
      bullets: [
        { label: 'Integrity example', detail: 'Enforce uniqueness on (doctor_id, slot_time) so concurrent requests cannot create duplicate active bookings.' },
        { label: 'Review checklist', detail: 'Check that credentials, tokens, and secrets are explicitly hashed or encrypted at rest.' },
      ],
    },
    {
      id: 'panduan-api',
      groupId: 'enam-dokumen',
      title: '04. API Contracts',
      summary: 'Locks down API style, authentication, error envelopes, endpoint payloads, pagination, and rate limiting.',
      paragraphs: [
        'Gives frontend, backend, and QA engineers a single contract for status codes, validation errors, and JSON response shapes.',
      ],
      bullets: [
        { label: 'Contract example', detail: 'POST /appointments returns 201 with the booking ID, or 409 CONFLICT with structured details when a slot is already claimed.' },
        { label: 'Review checklist', detail: 'Verify every write endpoint specifies authorization rules and predictable error codes.' },
      ],
    },
    {
      id: 'panduan-tasks',
      groupId: 'enam-dokumen',
      title: '05. Implementation Tasks',
      summary: 'Breaks the spec into sequential phases of small, verifiable tasks with explicit dependencies.',
      paragraphs: [
        'Ordered from schema and core contracts up through UI and verification so engineers and AI coding agents can ship incrementally without guesswork.',
      ],
      bullets: [
        { label: 'Review checklist', detail: 'Confirm each task carries a one-line acceptance check and references prerequisites accurately.' },
      ],
    },
    {
      id: 'panduan-memory',
      groupId: 'enam-dokumen',
      title: '06. Project Memory',
      summary: 'Dense context pack covering product summary, dated decisions, glossary, locked invariants, and open questions.',
      paragraphs: [
        'Designed to be the very first file a teammate or AI coding agent reads before touching code so key decisions never get reversed accidentally.',
      ],
      bullets: [
        { label: 'Review checklist', detail: 'Keep agreed invariants separated from open questions that still require human sign-off.' },
      ],
    },
    {
      id: 'ekspor-ai-agent',
      groupId: 'ekspor-agen',
      title: 'Handing Off to AI Coding Agents',
      summary: 'Best-practice workflow for using the ZIP bundle or Copy for AI Agent menu in Cursor, Codex, or Claude Code.',
      steps: [
        {
          title: 'Download the ZIP bundle or copy agent instructions',
          detail: 'From the project header, select Export -> Download ZIP bundle. It contains numbered documents 01 through 06 plus AGENT_INSTRUCTIONS.md.',
        },
        {
          title: 'Place the bundle in your repository',
          detail: 'Unzip into a folder like docs/spec/ in your codebase, then paste the companion instructions into system instructions or your first prompt.',
        },
        {
          title: 'Ask the agent to summarize before coding',
          detail: 'Have the agent read 06_Project_Memory.md and 01_PRD.md first, confirm any open questions, and then execute Phase 0 from 05_Task_Checklist.md.',
        },
      ],
      codeBlock: {
        label: 'Starter prompt for your AI coding agent',
        content:
          'Read the full specification in docs/spec/, starting with 06_Project_Memory.md and 01_PRD.md. Summarize scope, locked invariants, and any open questions for me to confirm before you start Phase 0 in 05_Task_Checklist.md.',
      },
    },
    {
      id: 'library-berbagi',
      groupId: 'ekspor-agen',
      title: 'Library, Versions & Share Links',
      summary: 'Project-grouped snapshots, version history restoration, and read-only sharing.',
      bullets: [
        { label: 'Version history & inline editing', detail: 'Every manual save (Ctrl/Cmd+S) or targeted AI revision creates a new version you can inspect and restore anytime.' },
        { label: 'Project-grouped Library', detail: 'Save snapshots to Library organized cleanly by project rather than one flat list.' },
        { label: 'Read-only share links', detail: 'Generate public or password-protected share links with optional expiration and one-click revocation.' },
      ],
      link: { href: '/library', label: 'Open Library' },
    },
    {
      id: 'pemecahan-masalah',
      groupId: 'ekspor-agen',
      title: 'Troubleshooting',
      summary: 'Quick answers for model catalogs, session BYOK keys, and interrupted runs.',
      bullets: [
        { label: 'BYOK model list is empty after testing', detail: 'Some custom gateways do not expose /v1/models. Use the "Enter ID manually" option in Step 1 on the Models page.' },
        { label: 'BYOK key disappeared in a new tab', detail: 'This is by design: session BYOK keys live only in the active browser tab sessionStorage and are never persisted on disk or server.' },
        { label: 'Batch stopped due to provider quota or timeout', detail: 'Click "Continue remaining" in the Document Studio sidebar to generate only unfinished documents without overwriting completed ones.' },
      ],
    },
  ],
};

export function getDocsCatalog(locale: Locale): DocsCatalog {
  return locale === 'en' ? EN_CATALOG : ID_CATALOG;
}
