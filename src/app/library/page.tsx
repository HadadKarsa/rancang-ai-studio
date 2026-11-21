'use client';

import { useCallback, useEffect, useState } from 'react';
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

const FILTERS: { value: '' | LibraryItem['kind']; label: string }[] = [
  { value: '', label: 'Semua' },
  { value: 'document', label: 'Dokumen' },
  { value: 'export', label: 'Ekspor' },
  { value: 'wireframe', label: 'Wireframe' },
];

function kb(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<'' | LibraryItem['kind']>('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async (kind: '' | LibraryItem['kind'], cursor?: string) => {
    setState('loading');
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (kind) qs.set('type', kind);
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

  useEffect(() => { void load(filter); }, [filter, load]);

  async function remove(id: string) {
    setError(null);
    try {
      await api.delete(`/library/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
      setConfirmId(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menghapus');
    }
  }

  return (
    <div className="pg-library">
      <header className="head">
        <div>
          <h1>Library</h1>
          <p className="muted">Artefak yang kamu simpan dari proyek — dokumen, ekspor, dan wireframe.</p>
        </div>
      </header>

      <div className="filters" role="tablist" aria-label="Saring jenis">
        {FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            role="tab"
            aria-selected={filter === f.value}
            className={`chip ${filter === f.value ? 'on' : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      {state === 'loading' && items.length === 0 && <div className="mono muted" style={{ padding: 40 }}>memuat…</div>}

      {state === 'ready' && items.length === 0 && (
        <div className="empty card">
          <h2>Belum ada yang tersimpan.</h2>
          <p className="muted">Buka sebuah dokumen atau wireframe, lalu pilih &ldquo;Simpan ke library&rdquo; untuk menyimpannya di sini.</p>
        </div>
      )}

      {items.length > 0 && (
        <ul className="grid">
          {items.map((item) => (
            <li key={item.id} className="card item">
              <div className="item-top">
                <span className="kind mono">{KIND_LABEL[item.kind]}</span>
                <span className="mono muted small">{kb(item.bytes)}</span>
              </div>
              <h3>{item.title}</h3>
              {item.projectName && <p className="muted small">{item.projectName}</p>}
              <div className="item-foot">
                <time className="mono muted small">{new Date(item.createdAt).toLocaleDateString('id-ID')}</time>
                {confirmId === item.id ? (
                  <div className="confirm">
                    <button className="btn danger sm" onClick={() => void remove(item.id)}>Hapus</button>
                    <button className="btn ghost sm" onClick={() => setConfirmId(null)}>Batal</button>
                  </div>
                ) : (
                  <button className="btn ghost sm" onClick={() => setConfirmId(item.id)}>Hapus</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <button className="btn ghost more" onClick={() => void load(filter, nextCursor)}>Muat lagi</button>
      )}
    </div>
  );
}
