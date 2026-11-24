'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/client/api';

/* ── Types (mirror forge's /api/v1 responses) ─────────────────────── */
type ProjectStatus = 'draft' | 'interviewing' | 'generating' | 'ready' | 'archived';
interface Project {
  id: string; name: string; description: string | null;
  status: ProjectStatus; icon: string | null; accentColor: string;
  updatedAt: string; createdAt: string;
  docsReady: number; docsTotal: number;
}
type Counts = { all: number; draft: number; interviewing: number; generating: number; ready: number; archived: number };
interface ListResp {
  projects: Project[];
  counts: Counts;
  pagination: { total: number; limit: number; nextCursor: { value: string; id: string } | null };
}

const STATUS_ID: Record<ProjectStatus, string> = {
  draft: 'draft', interviewing: 'wawancara', generating: 'menulis', ready: 'siap', archived: 'arsip',
};
const STATUS_CLASS: Record<ProjectStatus, string> = {
  draft: '', interviewing: 'live', generating: 'live', ready: 'ok', archived: 'ready',
};
const FILTERS: { key: ProjectStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'draft', label: 'Draft' },
  { key: 'interviewing', label: 'Wawancara' },
  { key: 'generating', label: 'Menulis' },
  { key: 'ready', label: 'Siap' },
  { key: 'archived', label: 'Arsip' },
];

/* Sort is a pair because the API takes both: a column and a direction.
   Kept as one value so the select is a single control, not two. */
type SortKey = 'updated_at:desc' | 'created_at:desc' | 'name:asc';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'updated_at:desc', label: 'Terbaru diubah' },
  { key: 'created_at:desc', label: 'Terbaru dibuat' },
  { key: 'name:asc', label: 'Nama A–Z' },
];

/* The accent swatches offered at creation. Ink-adjacent and paper-safe: each
   one clears 4.5:1 against --card as a 14px glyph. The first is the default
   the API has always used, so an untouched picker changes nothing. */
const ACCENTS = ['#6366f1', '#c2401a', '#2f6b3a', '#8f6b2e', '#3d5a80', '#7a3b69'];

function timeAgo(iso: string): string {
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

/* Inline mark for projects without an icon — the fallback glyph used to be
   a unicode diamond the self-hosted fonts don't carry (tofu on screen). */
function Mark({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="2.5" fill="none" stroke={color} strokeWidth="1.8" />
      <circle cx="8" cy="8" r="2.4" fill={color} />
    </svg>
  );
}

/* Seven dots, one per scaffolded document: filled = written. The dots are
   ink, never vermilion — this is resting state, not wet ink. */
function DocBar({ ready, total }: { ready: number; total: number }) {
  return (
    <span className="docbar" title={`${ready} dari ${total} dokumen siap`}>
      <span className="dots" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={i < ready ? 'on' : ''} />
        ))}
      </span>
      <span className={`doccount mono ${ready >= total ? 'full' : ''}`}>{ready}/{total} dok</span>
    </span>
  );
}

export default function StudioPage() {
  const router = useRouter();
  const [data, setData] = useState<ListResp | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ProjectStatus | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('updated_at:desc');
  const [creating, setCreating] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newAccent, setNewAccent] = useState(ACCENTS[0]);
  const [debounceTick, setDebounceTick] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<Project | null>(null);
  const [delError, setDelError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuWrap = useRef<HTMLDivElement | null>(null);
  const menuFirst = useRef<HTMLButtonElement | null>(null);

  const query = useCallback((cursor?: { value: string; id: string }) => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (status !== 'all') params.set('status', status);
    const [col, dir] = sort.split(':') as [string, string];
    params.set('sort', col);
    params.set('order', dir);
    if (cursor) {
      params.set('cursorValue', cursor.value);
      params.set('cursorId', cursor.id);
    }
    return `/projects?${params.toString()}`;
  }, [q, status, sort]);

  // First page. Any change to q / status / sort starts the list over — the
  // cursor from the previous query is meaningless against a new one.
  useEffect(() => {
    let stale = false;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      api.get<ListResp>(query())
        .then((d) => { if (!stale) { setData(d); setError(null); } })
        .catch((e: unknown) => {
          if (!stale) setError(e instanceof ApiError ? e.message : 'Gagal memuat proyek');
        });
    }, 250);
    return () => { stale = true; if (debounce.current) clearTimeout(debounce.current); };
  }, [query, debounceTick]);

  async function loadMore() {
    const cursor = data?.pagination.nextCursor;
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await api.get<ListResp>(query(cursor));
      setData((prev) => prev
        ? {
            projects: [...prev.projects, ...next.projects.filter((p) => !prev.projects.some((q) => q.id === p.id))],
            counts: next.counts,
            pagination: next.pagination,
          }
        : next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal memuat proyek berikutnya');
    } finally {
      setLoadingMore(false);
    }
  }

  async function createProject() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const { project } = await api.post<{ project: Project }>('/projects', {
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        accentColor: newAccent,
      });
      router.push(`/projects/${project.id}/interview`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal membuat proyek');
      setCreating(false);
    }
  }

  const cards = useMemo(() => data?.projects ?? [], [data]);

  async function deleteProject(p: Project) {
    setDeleting(p.id);
    setDelError(null);
    try {
      // hard=1: the row and all its documents, versions and sessions go.
      await api.delete(`/projects/${p.id}?hard=1`);
      setConfirmDel(null);
      setDebounceTick((t) => t + 1);
    } catch (e) {
      setDelError(e instanceof ApiError ? e.message : 'Gagal menghapus proyek');
    } finally {
      setDeleting(null);
    }
  }

  async function toggleArchive(p: Project) {
    setMenuFor(null);
    setArchiving(p.id);
    setError(null);
    try {
      // Archive stamps archived_at; restore lets the server pick the status
      // that matches what the project actually holds.
      await api.patch(`/projects/${p.id}`, p.status === 'archived' ? { restore: true } : { status: 'archived' });
      setDebounceTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal mengubah status arsip');
    } finally {
      setArchiving(null);
    }
  }

  // The menu closes on a click anywhere else and on Escape. One document
  // listener, only while a menu is open, so nothing is listening at rest.
  // Focus moves to the first item on open, so a keyboard user is inside the
  // menu the moment it appears rather than tabbing into the next card.
  useEffect(() => {
    if (!menuFor) return;
    menuFirst.current?.focus();
    function onDown(e: MouseEvent) {
      if (menuWrap.current && !menuWrap.current.contains(e.target as Node)) setMenuFor(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      // Focus goes back to the button that opened it, never to the top of the
      // document — otherwise Escape loses your place in the grid.
      menuWrap.current?.querySelector<HTMLButtonElement>('.job-more')?.focus();
      setMenuFor(null);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuFor]);

  // Escape closes whichever modal is up. Bound to the document so it works
  // while focus is inside a text field too.
  useEffect(() => {
    if (!newOpen && !confirmDel) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (newOpen) setNewOpen(false);
      if (confirmDel && !deleting) setConfirmDel(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [newOpen, confirmDel, deleting]);

  // A card opens the project page, which decides what to show: the document
  // list when there is something written, the interview when there is not
  // (v0.1.3). It used to jump straight to a document or the interview, so
  // coming back always felt like starting over (Ndan's report).
  function cardHref(p: Project): string {
    return `/projects/${p.id}`;
  }
  const live = cards.filter((p) => p.status === 'interviewing' || p.status === 'generating').length;
  const filtered = q.trim().length > 0 || status !== 'all';

  return (
    <div className="pg-studio">
      <header className="head">
        <div>
          <p className="eyebrow mono">ruang kerja{live > 0 ? ` · ${live} sedang berjalan` : ''}</p>
          <h1>Studio</h1>
          <p className="muted lede">Ceritakan idemu sekali — rancang-ai mewawancarai, lalu menulis tujuh dokumen spesifikasi.</p>
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
          {FILTERS.map((f) => {
            const n = data?.counts[f.key === 'all' ? 'all' : f.key];
            return (
              <button
                key={f.key}
                className={`chip ${status === f.key ? 'on' : ''}`}
                aria-pressed={status === f.key}
                onClick={() => setStatus(f.key)}
              >
                {f.label}
                {data && <span className="n mono">{n ?? 0}</span>}
              </button>
            );
          })}
        </div>
        <label className="sort">
          <span className="mono">urut</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Urutkan proyek"
          >
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      {!data && !error && (
        <ul className="grid" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="job-wrap">
              <div className="job card skeleton">
                <div className="job-top">
                  <span className="sk sk-icon" />
                  <span className="sk sk-idx" />
                </div>
                <span className="sk sk-title" />
                <span className="sk sk-line" />
                <span className="sk sk-line short" />
                <div className="job-foot">
                  <span className="sk sk-pill" />
                  <span className="sk sk-when" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && cards.length === 0 && (
        <div className="empty">
          <p className="eyebrow mono">{filtered ? 'tidak ada hasil' : 'mulai di sini'}</p>
          <h2>{filtered ? 'Tidak ada proyek yang cocok.' : 'Lembar kerja masih kosong.'}</h2>
          <p className="muted">
            {filtered
              ? 'Coba kata kunci lain, atau buka filter Semua.'
              : 'Satu wawancara singkat — lima sampai delapan pertanyaan — dan idemu menjadi PRD, skema data, sampai rencana rilis.'}
          </p>
          {!filtered && (
            <button className="btn primary" onClick={() => setNewOpen(true)}>Mulai proyek pertama</button>
          )}
        </div>
      )}

      <ul className="grid">
        {cards.map((p, i) => (
          <li key={p.id} className="job-wrap">
            <Link href={cardHref(p)} className="job card">
              <div className="job-top">
                <span className="icon" style={{ background: p.accentColor + '22', color: p.accentColor }}>
                  <Mark color={p.accentColor} />
                </span>
                <span className="idx mono muted">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <h3>{p.name}</h3>
              <p className="muted desc">{p.description ?? 'Tanpa deskripsi.'}</p>
              <DocBar ready={p.docsReady} total={p.docsTotal} />
              <div className="job-foot">
                <span className={`pill ${STATUS_CLASS[p.status]}`}>
                  <span className="dot" />{STATUS_ID[p.status]}
                </span>
                <span className="mono muted when">{timeAgo(p.updatedAt)}</span>
              </div>
            </Link>

            {/* The overflow menu sits outside the card link: a button inside
                an <a> is invalid HTML and would navigate instead of opening. */}
            <div className="job-menu" ref={menuFor === p.id ? menuWrap : undefined}>
              <button
                type="button"
                className="job-more"
                aria-label={`Opsi untuk ${p.name}`}
                aria-haspopup="menu"
                aria-expanded={menuFor === p.id}
                aria-busy={archiving === p.id || undefined}
                onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
              >
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                  <circle cx="3" cy="8" r="1.4" fill="currentColor" />
                  <circle cx="8" cy="8" r="1.4" fill="currentColor" />
                  <circle cx="13" cy="8" r="1.4" fill="currentColor" />
                </svg>
              </button>
              {menuFor === p.id && (
                <div className="menu" role="menu" aria-label={`Opsi untuk ${p.name}`}>
                  <button
                    type="button"
                    role="menuitem"
                    ref={menuFirst}
                    className="menu-item"
                    onClick={() => void toggleArchive(p)}
                  >
                    {p.status === 'archived' ? 'Pulihkan' : 'Arsipkan'}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="menu-item danger"
                    onClick={() => { setMenuFor(null); setDelError(null); setConfirmDel(p); }}
                  >
                    Hapus permanen
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {data?.pagination.nextCursor && (
        <div className="more">
          <button type="button" className="btn ghost" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? 'Memuat…' : 'Muat lebih banyak'}
          </button>
          <span className="mono muted more-n">
            {cards.length} dari {data.pagination.total}
          </span>
        </div>
      )}

      {confirmDel && (
        <div className="veil" role="dialog" aria-modal="true" aria-label="Hapus proyek"
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) setConfirmDel(null); }}>
          <div className="sheet card">
            <p className="eyebrow mono">tindakan permanen</p>
            <h2>Hapus “{confirmDel.name}”?</h2>
            <p className="muted">
              Seluruh wawancara, dokumen, versi, dan riwayat proyek ini ikut terhapus permanen.
              Kalau hanya ingin menyembunyikannya dari daftar, pakai Arsipkan di menu kartu.
            </p>
            {delError && <div className="alert" role="alert">{delError}</div>}
            <div className="sheet-foot">
              <button type="button" className="btn ghost" disabled={!!deleting}
                onClick={() => setConfirmDel(null)}>Batal</button>
              <button type="button" className="btn danger" disabled={!!deleting}
                onClick={() => void deleteProject(confirmDel)}>
                {deleting ? 'Menghapus…' : 'Hapus permanen'}
              </button>
            </div>
          </div>
        </div>
      )}

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
            <fieldset className="swatches">
              <legend className="mono">warna kartu <span className="muted">(opsional)</span></legend>
              <div className="swatch-row" role="radiogroup" aria-label="Warna kartu">
                {ACCENTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={newAccent === c}
                    aria-label={`Warna ${c}`}
                    className={`swatch ${newAccent === c ? 'on' : ''}`}
                    onClick={() => setNewAccent(c)}
                  >
                    <Mark color={c} />
                  </button>
                ))}
              </div>
            </fieldset>
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
