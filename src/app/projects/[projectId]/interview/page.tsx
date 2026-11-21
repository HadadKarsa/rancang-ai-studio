'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/client/api';

/* ── Types (mirror forge's /api/v1) ───────────────────────────────── */
interface Session {
  id: string; projectId: string; status: 'active' | 'completed' | 'abandoned';
  currentStep: number; totalSteps: number; createdAt: string;
}
interface Message {
  id: string; sessionId: string; role: 'assistant' | 'user' | 'system';
  content: string; questionIndex: number | null; metadata: Record<string, unknown> | null;
  createdAt: string;
}
interface Turn { question: string; suggestions: string[]; isComplete: boolean; reasoning: string }
interface InterviewResp { sessions: Session[]; active: Session | null; latest: Session | null; messages: Message[] }
interface AnswerResp { questionIndex: number; isComplete: boolean; nextTurn: Turn | null }
interface ProjectResp { project: { id: string; name: string; description: string | null } }

const DOCS = ['PRD', 'Arsitektur', 'Database', 'API', 'Tugas', 'Memori'];

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

/* One arrow, drawn rather than typed: the self-hosted subsets carry no
   arrow glyphs, and a missing glyph renders as tofu. */
function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="ico">
      <path d="M2 7h9M7.5 3.5 11 7l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function InterviewPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const router = useRouter();

  const [projectName, setProjectName] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [completed, setCompleted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [iv, pj] = await Promise.all([
        api.get<InterviewResp>(`/projects/${projectId}/interview`),
        api.get<ProjectResp>(`/projects/${projectId}`),
      ]);
      setProjectName(pj.project?.name ?? null);
      setSession(iv.active ?? iv.latest ?? null);
      setCompleted(!iv.active && iv.latest?.status === 'completed');
      setMessages(iv.messages ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal memuat wawancara');
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, pending, completed]);

  const answers = messages.filter((m) => m.role === 'user').length;
  const total = session?.totalSteps ?? 8;
  const step = Math.min(answers + (completed ? 0 : 1), total);
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const suggestions = (pending || completed
    ? []
    : ((lastAssistant?.metadata?.suggestions as string[] | undefined) ?? []));

  async function send(raw: string) {
    const content = raw.trim();
    if (!content || pending) return;
    setDraft('');
    setError(null);
    let s = session;
    const now = new Date().toISOString();
    const optimistic: Message = {
      id: `local-${now}`, sessionId: s?.id ?? 'local', role: 'user',
      content, questionIndex: null, metadata: null, createdAt: now,
    };
    setMessages((m) => [...m, optimistic]);
    setPending(true);
    try {
      if (!s) {
        const created = await api.post<{ session: Session }>(`/projects/${projectId}/interview`, {});
        s = created.session;
        setSession(s);
      }
      const res = await api.put<AnswerResp>(`/projects/${projectId}/interview`, { content, next: true });
      if (res.nextTurn) {
        const at = new Date().toISOString();
        setMessages((m) => [...m, {
          id: `local-a-${at}`, sessionId: s!.id, role: 'assistant',
          content: res.nextTurn!.question, questionIndex: res.questionIndex,
          metadata: res.nextTurn!.suggestions.length ? { suggestions: res.nextTurn!.suggestions } : null,
          createdAt: at,
        }]);
      }
      if (res.isComplete) setCompleted(true);
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setDraft(content);
      setError(e instanceof ApiError ? e.message : 'Jawaban gagal terkirim. Coba lagi.');
    }
    setPending(false);
  }

  async function restart() {
    setStarting(true);
    setError(null);
    try {
      const { session: s } = await api.post<{ session: Session }>(`/projects/${projectId}/interview`, { restart: true });
      setSession(s);
      setMessages([]);
      setCompleted(false);
      setDraft('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal memulai ulang');
    }
    setStarting(false);
  }

  async function generateAll() {
    // The writing page opens the SSE stream itself — no request here, so the
    // first token lands as soon as it is produced.
    setGenerating(true);
    router.push(`/projects/${projectId}/write`);
  }

  if (loading) {
    return <div className="pg-interview"><p className="mono muted load">memuat wawancara…</p></div>;
  }

  return (
    <div className={`pg-interview${completed ? ' is-done' : ''}`}>
      <header className="top">
        <Link href="/studio" className="back">
          <svg className="chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M8 2 4 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Studio
        </Link>
        <h1>{projectName ?? 'Wawancara'}</h1>
        <p className="sub mono">
          {completed ? 'wawancara selesai' : `wawancara · pertanyaan ${step} dari ${total}`}
        </p>
      </header>

      {error && <div className="alert" role="alert">{error}</div>}

      <div className="cols">
        <main className="talk" aria-live="polite">
          {messages.length === 0 && !completed && (
            <div className="turn ask opening">
              <p className="who">rancang-ai</p>
              <p className="q">Ceritakan idemu dulu.</p>
              <p className="note">
                Satu paragraf saja: aplikasi apa, untuk siapa, masalah apa yang
                diselesaikan. Setelah itu saya yang bertanya — soal pemakai,
                alur inti, dan batasannya.
              </p>
            </div>
          )}

          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="turn say">
                <p className="who">kamu · {timeOf(m.createdAt)}</p>
                <p className="a">{m.content}</p>
              </div>
            ) : (
              <div key={m.id} className="turn ask">
                <p className="who">rancang-ai</p>
                <p className="q">{m.content}</p>
              </div>
            ),
          )}

          {pending && (
            <div className="turn ask pending">
              <p className="who">rancang-ai</p>
              <p className="wet"><span className="inkline" aria-hidden="true" />menyusun pertanyaan berikutnya</p>
            </div>
          )}

          {!pending && !completed && suggestions.length > 0 && (
            <div className="suggest">
              <p className="cap mono">saran jawaban</p>
              <div className="chips">
                {suggestions.map((s) => (
                  <button key={s} type="button" className="chip" onClick={() => void send(s)}>
                    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true" className="plus">
                      <path d="M5.5 1.5v8M1.5 5.5h8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <span>{s}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {completed && (
            <section className="finish">
              <p className="cap mono">wawancara selesai · {answers} jawaban</p>
              <h2>Enam dokumen siap ditulis.</h2>
              <p className="note">
                Semua yang kamu ceritakan sudah cukup. Rancang-ai menulis enam
                dokumen spesifikasi sekaligus, dan kamu bisa menonton tiap
                dokumen ditulis kata demi kata. Wireframe bisa dibuat belakangan.
              </p>
              <ol className="docs">
                {DOCS.map((d) => (
                  <li key={d}><span className="dot" aria-hidden="true" />{d}</li>
                ))}
              </ol>
              <div className="row">
                <button className="btn primary" onClick={() => void generateAll()} disabled={generating}>
                  {generating ? 'Membuka…' : 'Tulis dokumen'}
                  {!generating && <Arrow />}
                </button>
                <button className="btn ghost" onClick={() => void restart()} disabled={generating || starting}>
                  {starting ? 'Mengulang…' : 'Ulangi wawancara'}
                </button>
              </div>
            </section>
          )}

          <div ref={endRef} />
        </main>

        <aside className="ritual">
          <p className="cap mono">ritme</p>
          <div
            className="ticks"
            role="progressbar"
            aria-label="Kemajuan wawancara"
            aria-valuenow={completed ? total : step}
            aria-valuemin={0}
            aria-valuemax={total}
          >
            {Array.from({ length: total }, (_, i) => {
              const n = i + 1;
              const cls = completed || n < step ? 'done' : n === step ? 'now' : '';
              return <span key={n} className={`t ${cls}`} />;
            })}
          </div>
          <p className="count">
            <b>{completed ? total : step}</b>
            <span>/ {total}</span>
          </p>
          <p className="mood mono">
            {completed ? 'lengkap' : step <= 2 ? 'menggali' : step <= total - 2 ? 'menajam' : 'merapikan'}
          </p>
          <hr />
          <p className="hint">
            {completed
              ? 'Jawabanmu tersimpan. Dokumen bisa ditulis kapan saja.'
              : 'Jawab seadanya dulu — saya yang merapikan.'}
          </p>
          {!completed && session && (
            <button className="restart" onClick={() => void restart()} disabled={starting || pending}>
              {starting ? 'mengulang…' : 'mulai ulang'}
            </button>
          )}
        </aside>
      </div>

      {!completed && (
        <form
          className={`composer${messages.length === 0 ? ' first' : ''}`}
          onSubmit={(e) => { e.preventDefault(); void send(draft); }}
        >
          <label htmlFor="answer" className="cap mono">jawabanmu</label>
          <textarea
            id="answer"
            ref={boxRef}
            rows={2}
            value={draft}
            disabled={pending}
            placeholder={messages.length === 0 ? 'Aplikasi kasir untuk bengkel kecil, dipakai dua orang…' : 'Tulis jawabanmu…'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
          />
          <div className="foot">
            <span className="hint mono">Enter kirim · Shift+Enter baris baru</span>
            <button type="submit" className="send" disabled={pending || !draft.trim()}>
              {pending ? 'menunggu' : 'Kirim'}
              {!pending && <Arrow />}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}