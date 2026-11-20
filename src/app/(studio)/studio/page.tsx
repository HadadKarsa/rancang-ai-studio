'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/client/api';

/* ── Types (mirror forge's /api/v1 responses) ─────────────────────── */
type ProjectStatus = 'draft' | 'interviewing' | 'generating' | 'ready' | 'archived';
interface Project {
  id: string; name: string; slug: string; description: string | null;
  status: ProjectStatus; icon: string | null; accentColor: string;
  updatedAt: string; createdAt: string;
}
interface ListResp { projects: Project[]; pagination: { total: number; limit: number; nextCursor: string | null } }

const STATUS_ID: Record<ProjectStatus, string> = {
  draft: 'draft', interviewing: 'menulis', generating: 'menulis', ready: 'siap', archived: 'arsip',
};
const STATUS_CLASS: Record<ProjectStatus, string> = {
  draft: '', interviewing: 'live', generating: 'live', ready: 'ok', archived: 'ready',
};
const FILTERS: { key: ProjectStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'draft', label: 'Draft' },
  { key: 'interviewing', label: 'Menulis' },
  { key: 'generating', label: 'Menulis' },
  { key: 'ready', label: 'Siap' },
  { key: 'archived', label: 'Arsip' },
];

function timeAgo(iso: string): string {
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

export default function StudioPage() {
  const router = useRouter();
  const [data, setData] = useState<ListResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ProjectStatus | 'all'>('all');
  const [creating, setCreating] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (status !== 'all') params.set('status', status);
      api.get<ListResp>(`/projects?${params.toString()}`)
        .then(setData)
        .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Gagal memuat proyek'));
    }, 250);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [q, status]);

  async function createProject() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const { project } = await api.post<{ project: Project }>('/projects', {
        name: newName.trim(),
        description: newDesc.trim() || undefined,
      });
      router.push(`/projects/${project.id}/interview`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal membuat proyek');
      setCreating(false);
    }
  }

  const cards = useMemo(() => data?.projects ?? [], [data]);

  return (
    <div className="pg-studio">
      <header className="head">
        <div>
          <h1>Studio</h1>
          <p className="muted">Ubah ide jadi spesifikasi aplikasi lengkap — lewat percakapan.</p>
        </div>
        <button className="btn primary" onClick={() => setNewOpen(true)}>+ Proyek baru</button>
      </header>

      <div className="tools">
        <input
          className="search"
          type="search"
          placeholder="Cari nama atau deskripsi…"
          aria-label="Cari proyek"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="chips" role="group" aria-label="Filter status">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`chip ${status === f.key ? 'on' : ''}`}
              aria-pressed={status === f.key}
              onClick={() => setStatus(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      {!data && !error && <div className="loading mono" aria-live="polite">memuat…</div>}

      {data && cards.length === 0 && (
        <div className="empty card">
          <h2>Belum ada proyek{q || status !== 'all' ? ' yang cocok' : ''}.</h2>
          <p className="muted">
            {q || status !== 'all'
              ? 'Coba kata kunci lain, atau buka filter Semua.'
              : 'Mulai satu: ceritakan idemu lewat wawancara singkat, rancang-ai menulis spesifikasinya.'}
          </p>
          {!q && status === 'all' && (
            <button className="btn primary" onClick={() => setNewOpen(true)}>Mulai proyek pertama</button>
          )}
        </div>
      )}

      <ul className="grid">
        {cards.map((p) => (
          <li key={p.id}>
            <Link href={`/projects/${p.id}/interview`} className="job card">
              <div className="job-top">
                <span className="mono icon" style={{ background: p.accentColor + '22', color: p.accentColor }}>
                  {p.icon ?? '◆'}
                </span>
                <span className={`pill ${STATUS_CLASS[p.status]}`}>
                  <span className="dot" />{STATUS_ID[p.status]}
                </span>
              </div>
              <h3>{p.name}</h3>
              <p className="muted desc">{p.description ?? 'Tanpa deskripsi.'}</p>
              <div className="job-foot mono muted">
                <span>{timeAgo(p.updatedAt)}</span>
                {p.status === 'ready' && <span className="go">buka dokumen →</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {newOpen && (
        <div className="veil" role="dialog" aria-modal="true" aria-label="Proyek baru"
          onClick={(e) => { if (e.target === e.currentTarget) setNewOpen(false); }}>
          <form className="sheet card" onSubmit={(e) => { e.preventDefault(); void createProject(); }}>
            <h2>Proyek baru</h2>
            <div className="field">
              <label htmlFor="np-name">Nama</label>
              <input id="np-name" autoFocus required maxLength={120}
                placeholder="mis. Kasir Warung Bu Sari" value={newName}
                onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="np-desc">Deskripsi singkat <span className="muted">(opsional)</span></label>
              <textarea id="np-desc" rows={3} maxLength={2000}
                placeholder="Aplikasi apa yang ingin dibangun?" value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)} />
            </div>
            <div className="sheet-foot">
              <button type="button" className="btn ghost" onClick={() => setNewOpen(false)}>Batal</button>
              <button type="submit" className="btn primary" disabled={creating || !newName.trim()}>
                {creating ? 'Membuat…' : 'Mulai wawancara'}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
