import type { ProjectPurpose } from '@/lib/db/enums';

/**
 * Companion instructions handed to an AI coding agent alongside an exported
 * spec bundle (v0.2.3). Pure string templates: no LLM call, and no Node or DB
 * import, so the browser (copy to clipboard) and the server (zip/json export)
 * build byte-identical text from the same functions.
 */

export const PROJECT_PURPOSE_LABEL: Record<ProjectPurpose, string> = {
  documentation: 'Dokumentasi',
  team: 'Implementasi tim',
  ai_agent: 'Implementasi dengan AI agent',
};

export const AGENT_USAGE_HINT =
  'Lampirkan bundle ke agent, tempel instruksi ini, lalu minta agent merangkum lingkup dan pertanyaan terbuka sebelum mulai coding.';

export const AGENT_PLACEMENT_HINT =
  'Jika alatnya punya kolom system instructions, taruh instruksi ini di sana. Jika hanya punya chat, tempel sebagai pesan pertama.';

/** Reading order, matching the file names `renderZip` writes. */
const READING_ORDER = [
  '`06_Project_Memory.md` — konteks, keputusan yang sudah diambil, kosakata proyek',
  '`01_PRD.md` — masalah, pengguna, fitur, metrik',
  '`02_Architecture.md` — komponen dan alur data',
  '`03_Database.md` — skema, relasi, migrasi',
  '`04_API_Contracts.md` — endpoint, payload, bentuk error',
  '`05_Task_Checklist.md` — urutan pengerjaan dan kriteria selesai',
];

/**
 * The system prompt (or first chat message) that makes an AI agent treat the
 * attached bundle as the source of truth. Deterministic — same input, same
 * string, no model involved.
 */
export function buildAgentCompanionInstructions(
  project: { name: string; slug: string; description?: string | null; purpose?: ProjectPurpose | null },
  opts?: { hasWireframes?: boolean },
): string {
  const lines: string[] = [];

  lines.push(`# Instruksi untuk AI agent — ${project.name}`, '');
  lines.push(`Proyek: **${project.name}** (\`${project.slug}\`)`);
  if (project.description?.trim()) {
    lines.push('', project.description.trim().replace(/\n+/g, ' '));
  }
  lines.push('');

  lines.push('## Sumber kebenaran', '');
  lines.push(
    'Bundle spesifikasi yang saya lampirkan adalah satu-satunya sumber kebenaran untuk proyek ini. ' +
    'Jangan mengarang keputusan yang tidak ada di dalamnya, dan jangan mengganti nama entitas, endpoint, ' +
    'tabel, atau file yang sudah ditetapkan di sana.',
    '',
  );

  lines.push('## Urutan membaca', '');
  lines.push('Baca dalam urutan ini sebelum menulis kode:', '');
  for (const item of READING_ORDER) lines.push(`- ${item}`);
  if (opts?.hasWireframes) {
    lines.push('- `07_Wireframes.md` dan `wireframes/*.html` — layar acuan bila ada');
  }
  lines.push('');

  lines.push('## Gerbang sebelum menulis kode', '');
  lines.push('Sebelum menulis kode apa pun, lakukan ini lalu tunggu jawaban saya:', '');
  lines.push('1. Ringkas lingkup pekerjaan dalam beberapa kalimat.');
  lines.push('2. Daftar semua pertanyaan terbuka dan keputusan yang belum dikonfirmasi di spesifikasi.');
  lines.push('3. Sebutkan asumsi yang Anda ambil sendiri, kalau ada.');
  lines.push('');
  lines.push('Jangan mulai coding sebelum saya menjawab daftar itu.', '');

  lines.push('## Aturan implementasi', '');
  lines.push('- Ikuti skema database, kontrak API, dan bentuk error yang tertulis. Jangan mengubahnya diam-diam.');
  lines.push('- Kerjakan berurutan mengikuti `05_Task_Checklist.md`: satu tugas selesai dan terverifikasi sebelum lanjut.');
  lines.push('- Kalau sebuah keputusan spesifikasi ternyata tidak bisa dijalankan, berhenti dan angkat ke saya lebih dulu.');
  lines.push('- Setiap kali selesai satu tugas, sebutkan file yang Anda ubah dan cara Anda memverifikasinya.');

  return lines.join('\n');
}

/**
 * One document wrapped for pasting into a chat. Replaces the inline wrapper
 * that used to live in `DocumentPanel.tsx`, so the client and the export agree
 * on the shape.
 */
export function formatAgentSpecPrompt(
  project: { name: string; slug: string },
  docLabel: string,
  versionNum: number | undefined,
  markdown: string,
): string {
  const rev = versionNum === undefined ? '' : ` rev="${versionNum}"`;
  return [
    `<rancang_spec project="${project.name}" slug="${project.slug}" document="${docLabel}"${rev}>`,
    markdown.trim(),
    '</rancang_spec>',
  ].join('\n');
}
