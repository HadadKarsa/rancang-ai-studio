'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/client/api';

interface LibraryItem {
  id: string;
  kind: 'document' | 'export' | 'wireframe';
  title: string;
  projectId: string | null;
  projectName: string | null;
  documentId: string | null;
  documentType: string | null;
  createdAt: string;
  bytes: number;
}

const KIND_LABEL: Record<LibraryItem['kind'], string> = {
  document: 'Dokumen',
  export: 'Ekspor',
  wireframe: 'Wireframe',
};

/** A project card is one project; a loose save is one artifact with no project. */
interface ProjectGroup {
  key: string;
  projectId: string;
  name: string;
  items: LibraryItem[];
  kinds: LibraryItem['kind'][];
  bytes: number;
  newest: string;
}

function kb(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function dateOf(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function groupByProject(items: LibraryItem[]): ProjectGroup[] {
  const map = new Map<string, ProjectGroup>();
  for (const item of items) {
    if (!item.projectId) continue;
    const existing = map.get(item.projectId);
    if (existing) {
      existing.items.push(item);
      if (!existing.kinds.includes(item.kind)) existing.kinds.push(item.kind);
      existing.bytes += item.bytes;
      if (item.createdAt > existing.newest) existing.newest = item.createdAt;
    } else {
      map.set(item.projectId, {
        key: item.projectId,
        projectId: item.projectId,
        name: item.projectName ?? 'Proyek tanpa nama',
        items: [item],
        kinds: [item.kind],
        bytes: item.bytes,
        newest: item.createdAt,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.newest.localeCompare(a.newest));
}

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [kind, setKind] = useState<'' | LibraryItem['kind']>('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async (type: '' | LibraryItem['kind'], cursor?: string) => {
    if (!cursor) setState('loading');
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (type) qs.set('type', type);
      if (cursor) qs.set('cursor', cursor);
      const r = await api.get<{ items: LibraryItem[]; nextCursor: string | null }>(`/library?${qs.toString()}`);
      setItems((prev) => (cursor ? [...prev, ...r.items] : r.items));
      setNextCursor(r.nextCursor);
      setState('ready');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal memuat library');
      setState('error');
    }
  }, []);

  useEffect(() => { void load(kind); }, [kind, load]);

  const groups = useMemo(() => groupByProject(items), [items]);
  const loose = useMemo(() => items.filter((i) => !i.projectId), [items]);

  /* A project card removes the project's saves — every one of them, said out
     loud in the dialog, because the button sits at project level. */
  async function removeProject(group: ProjectGroup) {
    setRemoving(true);
    setError(null);
    try {
      await Promise.all(group.items.map((i) => api.delete(`/library/${i.id}`)));
      setItems((prev) => prev.filter((i) => i.projectId !== group.projectId));
      setConfirmKey(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menghapus');
    } finally {
      setRemoving(false);
    }
  }

  async function removeOne(item: LibraryItem) {
    setRemoving(true);
    setError(null);
    try {
      await api.delete(`/library/${item.id}`);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setConfirmKey(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menghapus');
    } finally {
      setRemoving(false);
    }
  }

  const pendingGroup = groups.find((g) => g.key === confirmKey) ?? null;
  const pendingLoose = loose.find((i) => i.id === confirmKey) ?? null;

  return (
    <div className="pg-library">
      <header className="head">
        <div>
          <p className="eyebrow mono">tersimpan</p>
          <h1>Library</h1>
          <p className="muted">
            Satu kartu per proyek. Unduh seluruh isinya sebagai ZIP, atau hapus
            simpanan yang sudah tidak dipakai.
          </p>
        </div>
      </header>

      <div className="filters" role="group" aria-label="Saring jenis artefak">
        {([['', 'Semua'], ['document', 'Dokumen'], ['export', 'Ekspor'], ['wireframe', 'Wireframe']] as const).map(([v, label]) => (
          <button
            key={v || 'all'}
            type="button"
            aria-pressed={kind === v}
            className={`chip ${kind === v ? 'on' : ''}`}
            onClick={() => setKind(v)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      {state === 'loading' && items.length === 0 && (
        <div className="mono muted load">memuat…</div>
      )}

      {state === 'ready' && items.length === 0 && (
        <div className="empty card">
          <h2>Belum ada yang tersimpan.</h2>
          <p className="muted">
            Buka sebuah dokumen atau wireframe, lalu pilih &ldquo;Simpan ke
            library&rdquo; untuk menyimpannya di sini.
          </p>
        </div>
      )}

      {groups.length > 0 && (
        <section className="block" aria-label="Proyek tersimpan">
          <p className="cap mono">proyek · {groups.length}</p>
          <ul className="pgrid">
            {groups.map((g) => (
              <li key={g.key} className="pcard card">
                <div className="pcard-top">
                  <span className="mono kinds">{g.kinds.map((k) => KIND_LABEL[k]).join(' · ')}</span>
                  <span className="mono muted small">{kb(g.bytes)}</span>
                </div>
                <h2>{g.name}</h2>
                <dl className="stats">
                  <div><dt>artefak</dt><dd>{g.items.length}</dd></div>
                  <div><dt>terakhir</dt><dd>{dateOf(g.newest)}</dd></div>
                </dl>
                <ul className="titles" aria-label={`Isi ${g.name}`}>
                  {g.items.slice(0, 4).map((i) => (
                    <li key={i.id} title={i.title}>
                      <span className="k mono">{KIND_LABEL[i.kind]}</span>
                      <span className="t">{i.title}</span>
                    </li>
                  ))}
                  {g.items.length > 4 && (
                    <li className="more-li mono muted">+{g.items.length - 4} lagi</li>
                  )}
                </ul>
                <div className="pcard-foot">
                  <a
                    className="btn ghost sm zip"
                    href={`/api/v1/projects/${g.projectId}/export?format=zip`}
                    download
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M7 1.5v7.2M4 6l3 3 3-3M2.5 11.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Unduh ZIP
                  </a>
                  <button type="button" className="btn ghost sm danger-text" onClick={() => setConfirmKey(g.key)}>
                    Hapus
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {loose.length > 0 && (
        <section className="block" aria-label="Simpanan lepas">
          <p className="cap mono">simpanan lepas · {loose.length}</p>
          <p className="muted small note">
            Artefak yang disimpan tanpa proyek. Tidak punya ZIP, karena tidak ada
            proyek yang bisa dibundel.
          </p>
          <ul className="lgrid">
            {loose.map((item) => (
              <li key={item.id} className="lcard card">
                <div className="lcard-top">
                  <span className="mono kinds">{KIND_LABEL[item.kind]}</span>
                  <span className="mono muted small">{kb(item.bytes)}</span>
                </div>
                <h3>{item.title}</h3>
                <div className="lcard-foot">
                  <time className="mono muted small">{dateOf(item.createdAt)}</time>
                  <button type="button" className="btn ghost sm danger-text" onClick={() => setConfirmKey(item.id)}>
                    Hapus
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {nextCursor && (
        <button className="btn ghost more" onClick={() => void load(kind, nextCursor)}>Muat lagi</button>
      )}

      {(pendingGroup || pendingLoose) && (
        <div
          className="veil"
          role="dialog"
          aria-modal="true"
          aria-label="Hapus simpanan"
          onClick={(e) => { if (e.target === e.currentTarget && !removing) setConfirmKey(null); }}
        >
          <div className="sheet card">
            <p className="eyebrow mono">dari library saja</p>
            {pendingGroup ? (
              <>
                <h2>Hapus simpanan &ldquo;{pendingGroup.name}&rdquo;?</h2>
                <p className="muted">
                  {pendingGroup.items.length} artefak milik proyek ini dihapus dari
                  library. Proyek, wawancara, dan dokumennya tetap utuh — hanya
                  salinan yang kamu simpan yang hilang.
                </p>
              </>
            ) : (
              <>
                <h2>Hapus &ldquo;{pendingLoose?.title}&rdquo;?</h2>
                <p className="muted">Satu artefak lepas dihapus dari library.</p>
              </>
            )}
            <div className="sheet-foot">
              <button type="button" className="btn ghost" disabled={removing} onClick={() => setConfirmKey(null)}>
                Batal
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={removing}
                onClick={() => {
                  if (pendingGroup) void removeProject(pendingGroup);
                  else if (pendingLoose) void removeOne(pendingLoose);
                }}
              >
                {removing ? 'Menghapus…' : 'Hapus dari library'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
