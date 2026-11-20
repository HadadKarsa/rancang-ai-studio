'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/client/api';

/* ── Types (mirror forge's /api/v1) ───────────────────────────────── */
interface Session {
  id: string; projectId: string; status: 'active' | 'completed' | 'abandoned';
  questionIndex: number; maxQuestions: number; createdAt: string;
}
interface Message {
  id: string; sessionId: string; role: 'assistant' | 'user' | 'system';
  content: string; questionIndex: number | null; metadata: Record<string, unknown> | null;
  createdAt: string;
}
interface Turn { question: string; suggestions: string[]; isComplete: boolean; reasoning: string }
interface InterviewResp { sessions: Session[]; active: Session | null }
interface AnswerResp { questionIndex: number; isComplete: boolean; nextTurn: Turn | null }

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export default function InterviewPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  /* The transcript lives only in this tab: the API exposes sessions, not
     messages (gap noted in the report). Reload restarts the view, not the
     session — answers already sent are kept server-side. */
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'sending' | 'done' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const data = await api.get<InterviewResp>(`/projects/${projectId}/interview`);
      setSession(data.active);
      // No messages endpoint exists, so a fresh view starts with an empty
      // transcript even when a session is already active.
      setMessages([]);
      setTurn(null);
      setState('ready');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal memuat sesi');
      setState('error');
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, turn?.question]);

  async function start(restart = false) {
    setStarting(true);
    setError(null);
    try {
      const { session: s } = await api.post<{ session: Session }>(`/projects/${projectId}/interview`, restart ? { restart: true } : {});
      setSession(s);
      setMessages([]);
      setTurn(null);
      // The engine answers the user's first message with question 1 — no
      // separate turn endpoint exists, so the composer opens straight away.
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal memulai wawancara');
    }
    setStarting(false);
  }

  async function answer(content: string) {
    if (!content.trim() || !session) return;
    setDraft('');
    setState('sending');
    setError(null);
    const now = new Date().toISOString();
    setMessages((m) => [...m, { id: `local-${now}`, sessionId: session.id, role: 'user', content, questionIndex: null, metadata: null, createdAt: now }]);
    try {
      const res = await api.put<AnswerResp>(`/projects/${projectId}/interview`, { content, next: true });
      if (res.nextTurn) setTurn(res.nextTurn);
      if (res.isComplete) {
        setTurn(null);
        setState('done');
      } else {
        setState('ready');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal mengirim jawaban');
      setState('ready');
    }
  }

  async function generateAll() {
    setGenerating(true);
    setError(null);
    try {
      await api.post(`/projects/${projectId}/documents/generate-all`, {});
      router.push(`/projects/${projectId}/documents/prd`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal memulai pembuatan dokumen');
      setGenerating(false);
    }
  }

  if (state === 'loading') {
    return <div className="mono muted" style={{ padding: 40 }}>memuat…</div>;
  }

  const step = session?.questionIndex ?? 0;
  const total = session?.maxQuestions ?? 7;

  return (
    <div className="pg-interview">
      <header className="head">
        <Link href="/studio" className="mono muted back"><svg className="chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M8 2 4 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>Studio</Link>
        <div className="meter" role="progressbar" aria-valuenow={step} aria-valuemin={0} aria-valuemax={total}>
          <span className="mono label">{state === 'done' ? 'selesai' : `pertanyaan ${Math.min(step + 1, total)} / ${total}`}</span>
          <div className="bar"><span style={{ width: `${Math.min(100, (state === 'done' ? total : step) / total * 100)}%` }} /></div>
        </div>
      </header>

      {error && <div className="alert" role="alert">{error}</div>}

      {!session && state !== 'done' && (
        <div className="start card">
          <p className="eyebrow mono">wawancara spesifikasi</p>
          <h1>Ceritakan idemu.<br />Saya tanya sisanya.</h1>
          <p className="muted">
            5–8 pertanyaan: siapa pemakainya, alur inti, batasannya.
            Jawab dengan bahasa sehari-hari — rancang-ai yang merapikan
            menjadi tujuh dokumen spesifikasi.
          </p>
          <button className="btn primary" onClick={() => void start(false)} disabled={starting}>
            {starting ? 'Menyiapkan…' : 'Mulai wawancara'}
          </button>
        </div>
      )}

      {session && messages.length === 0 && !turn && state !== 'done' && (
        <div className="start card">
          <p className="eyebrow mono">langkah pertama</p>
          <h2>Ceritakan idemu dulu.</h2>
          <p className="muted">
            Satu paragraf saja: aplikasi apa, untuk siapa, dan masalah apa
            yang diselesaikan. Rancang-ai menanggapi dengan pertanyaan pertama.
          </p>
        </div>
      )}

      {session && (
        <>
          <ol className="transcript">
            {messages.map((m) => (
              <li key={m.id} className={`msg ${m.role}`}>
                <span className="mono who">{m.role === 'user' ? 'kamu' : 'rancang'}</span>
                <div className="bubble">{m.content}</div>
                <time className="mono muted at">{timeOf(m.createdAt)}</time>
              </li>
            ))}
            {turn && (
              <li className={`msg assistant ${state === 'sending' ? 'pending' : ''}`}>
                <span className="mono who">rancang</span>
                <div className="bubble">
                  {state === 'sending' ? <span className="cursor" aria-hidden="true" /> : null}
                  {turn.question}
                </div>
              </li>
            )}
            <div ref={endRef} />
          </ol>

          {turn && turn.suggestions.length > 0 && (
            <div className="slips">
              {turn.suggestions.map((s) => (
                <button key={s} className="slip" onClick={() => void answer(s)} disabled={state === 'sending'}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {state === 'done' ? (
            <div className="done card">
              <p className="eyebrow mono">wawancara selesai</p>
              <h2>Spesifikasi siap ditulis.</h2>
              <p className="muted">Tujuh dokumen sekaligus — butuh beberapa menit. Kamu bisa menontonnya ditulis.</p>
              <div className="row">
                <button className="btn primary" onClick={() => void generateAll()} disabled={generating}>
                  {generating ? <><span className="cursor" aria-hidden="true" /> Menulis…</> : 'Buat semua dokumen'}
                </button>
                <button className="btn ghost" onClick={() => void start(true)} disabled={generating}>Mulai ulang</button>
              </div>
            </div>
          ) : (
            <form
              className="composer"
              onSubmit={(e) => { e.preventDefault(); void answer(draft); }}
            >
              <textarea
                rows={2}
                aria-label="Jawaban"
                placeholder="Tulis jawabanmu… (Enter kirim, Shift+Enter baris baru)"
                value={draft}
                disabled={state === 'sending'}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void answer(draft);
                  }
                }}
              />
              <button type="submit" className="btn primary" disabled={state === 'sending' || !draft.trim()}>
                {state === 'sending' ? 'Mengirim…' : 'Kirim'}
              </button>
            </form>
          )}
        </>
      )}

    </div>
  );
}
