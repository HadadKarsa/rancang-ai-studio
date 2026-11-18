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
    <div className="wrap">
      <header className="head">
        <Link href="/studio" className="mono muted back">← Studio</Link>
        <div className="meter" role="progressbar" aria-valuenow={step} aria-valuemin={0} aria-valuemax={total}>
          <span className="mono label">{state === 'done' ? 'selesai' : `pertanyaan ${Math.min(step + 1, total)} / ${total}`}</span>
          <div className="bar"><span style={{ width: `${Math.min(100, (state === 'done' ? total : step) / total * 100)}%` }} /></div>
        </div>
      </header>

      {error && <div className="alert" role="alert">{error}</div>}

      {!session && state !== 'done' && (
        <div className="start card">
          <h1>Wawancara spesifikasi</h1>
          <p className="muted">
            5–8 pertanyaan tentang idemu: siapa pemakainya, alur inti, dan batasannya.
            Jawab dengan bahasa sehari-hari — rancang-ai yang merapikan.
          </p>
          <button className="btn primary" onClick={() => void start(false)} disabled={starting}>
            {starting ? 'Menyiapkan…' : 'Mulai wawancara'}
          </button>
        </div>
      )}

      {session && messages.length === 0 && !turn && state !== 'done' && (
        <div className="start card">
          <h2>Ceritakan idemu dulu.</h2>
          <p className="muted">
            Satu paragraf saja: aplikasi apa, untuk siapa, dan masalah apa yang
            diselesaikan. Rancang-ai menanggapi dengan pertanyaan pertama.
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
              <li className="msg assistant pending">
                <span className="mono who">rancang</span>
                <div className="bubble">{turn.question}</div>
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
              <h2>Wawancara selesai.</h2>
              <p className="muted">Spesifikasi siap ditulis — 7 dokumen sekaligus, butuh beberapa menit.</p>
              <div className="row">
                <button className="btn primary" onClick={() => void generateAll()} disabled={generating}>
                  {generating ? 'Menulis…' : 'Buat semua dokumen'}
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

      <style jsx>{`
        .wrap { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
        .head { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
        .back { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; }
        .meter { display: flex; flex-direction: column; gap: 5px; align-items: flex-end; min-width: 200px; }
        .label { font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-2); }
        .bar { width: 200px; height: 6px; background: var(--line); border-radius: 99px; overflow: hidden; }
        .bar span { display: block; height: 100%; background: var(--vermilion); transition: width 300ms; }
        .start { padding: 40px 36px; display: flex; flex-direction: column; gap: 14px; align-items: flex-start; }
        .start h1 { font-size: 26px; letter-spacing: -0.02em; }
        .transcript { list-style: none; display: flex; flex-direction: column; gap: 18px; padding: 8px 0; }
        .msg { display: flex; flex-direction: column; gap: 4px; max-width: 85%; }
        .msg.user { align-self: flex-end; align-items: flex-end; }
        .msg.assistant { align-self: flex-start; }
        .who { font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-3); }
        .bubble { background: var(--card); border: 1.5px solid var(--line); border-radius: 14px; padding: 12px 16px; font-size: 14.5px; white-space: pre-wrap; }
        .msg.user .bubble { background: var(--ink); color: var(--paper); border-color: var(--ink); }
        .at { font-size: 9.5px; }
        .pending .bubble { border-style: dashed; }
        .slips { display: flex; gap: 8px; flex-wrap: wrap; }
        .slip { border: 1.5px dashed var(--line-2); border-radius: 10px; padding: 8px 14px; font-size: 13px; color: var(--ink-2); background: transparent; }
        .slip:hover { border-color: var(--vermilion); color: var(--vermilion-ink); border-style: solid; }
        .composer { display: flex; gap: 10px; align-items: flex-end; position: sticky; bottom: 16px; }
        .composer textarea { flex: 1; border: 1.5px solid var(--line-2); border-radius: 12px; padding: 12px 14px; background: var(--card); resize: vertical; outline: none; }
        .composer textarea:focus { border-color: var(--ink); }
        .done { padding: 26px; display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
        .done h2 { font-size: 19px; }
        .row { display: flex; gap: 10px; }
        .alert { border: 1.5px solid var(--vermilion); background: var(--vermilion-wash); color: var(--vermilion-ink); border-radius: 10px; padding: 10px 14px; font-size: 13.5px; }
        @media (max-width: 720px) {
          .msg { max-width: 100%; }
          .meter { min-width: 0; }
          .bar { width: 130px; }
        }
      `}</style>
    </div>
  );
}
