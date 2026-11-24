'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Plus, RotateCcw, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { Badge, Button, useToast } from '@/components/ui';
import type { WorkspaceProject } from './types';

interface Session {
  id: string;
  projectId: string;
  status: 'active' | 'completed' | 'abandoned';
  currentStep: number;
  totalSteps: number;
  summary?: string | null;
  createdAt: string;
}

interface Message {
  id: string;
  sessionId: string;
  role: 'assistant' | 'user' | 'system';
  content: string;
  questionIndex: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface Turn {
  question: string;
  suggestions: string[];
  isComplete: boolean;
  reasoning: string;
}

interface InterviewResp {
  sessions: Session[];
  active: Session | null;
  latest: Session | null;
  messages: Message[];
}

interface AnswerResp {
  questionIndex: number;
  isComplete: boolean;
  nextTurn: Turn | null;
}

const CORE_LABELS = ['PRD', 'Arsitektur', 'Database', 'API', 'Tugas', 'Memori'];

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

interface InterviewPanelProps {
  project: WorkspaceProject;
  initialPrompt?: string | null;
  onPromptConsumed?: () => void;
  onStartWriting: () => void;
}

export function InterviewPanel({
  project,
  initialPrompt,
  onPromptConsumed,
  onStartWriting,
}: InterviewPanelProps) {
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [completed, setCompleted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const seedDispatchedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const iv = await api.get<InterviewResp>(`/projects/${project.id}/interview`);
      setSession(iv.active ?? iv.latest ?? null);
      setCompleted(!iv.active && iv.latest?.status === 'completed');
      setMessages(iv.messages ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal memuat sesi wawancara');
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, pending, completed]);

  const send = useCallback(
    async (raw: string) => {
      const content = raw.trim();
      if (!content || pending) return;
      setDraft('');
      setError(null);
      let s = session;
      const now = new Date().toISOString();
      const optimistic: Message = {
        id: `local-${now}`,
        sessionId: s?.id ?? 'local',
        role: 'user',
        content,
        questionIndex: null,
        metadata: null,
        createdAt: now,
      };
      setMessages((m) => [...m, optimistic]);
      setPending(true);
      try {
        if (!s) {
          const created = await api.post<{ session: Session }>(
            `/projects/${project.id}/interview`,
            {},
          );
          s = created.session;
          setSession(s);
        }
        const res = await api.put<AnswerResp>(`/projects/${project.id}/interview`, {
          content,
          next: true,
        });
        if (res.nextTurn) {
          const at = new Date().toISOString();
          setMessages((m) => [
            ...m,
            {
              id: `local-a-${at}`,
              sessionId: s!.id,
              role: 'assistant',
              content: res.nextTurn!.question,
              questionIndex: res.questionIndex,
              metadata: res.nextTurn!.suggestions.length
                ? { suggestions: res.nextTurn!.suggestions }
                : null,
              createdAt: at,
            },
          ]);
        }
        if (res.isComplete) {
          setCompleted(true);
          toast({
            tone: 'success',
            title: 'Wawancara selesai',
            description: 'Enam dokumen spesifikasi siap ditulis.',
          });
        }
      } catch (e) {
        setMessages((m) => m.filter((x) => x.id !== optimistic.id));
        setDraft(content);
        setError(e instanceof ApiError ? e.message : 'Jawaban gagal terkirim. Coba lagi.');
      } finally {
        setPending(false);
      }
    },
    [pending, session, project.id, toast],
  );

  useEffect(() => {
    if (
      !loading &&
      initialPrompt &&
      !seedDispatchedRef.current &&
      messages.length === 0 &&
      !completed
    ) {
      seedDispatchedRef.current = true;
      onPromptConsumed?.();
      void send(initialPrompt);
    }
  }, [loading, initialPrompt, messages.length, completed, onPromptConsumed, send]);

  async function restart() {
    setStarting(true);
    setError(null);
    try {
      const { session: s } = await api.post<{ session: Session }>(
        `/projects/${project.id}/interview`,
        { restart: true },
      );
      setSession(s);
      setMessages([]);
      setCompleted(false);
      setDraft('');
      toast({ tone: 'info', title: 'Sesi wawancara dimulai ulang' });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal memulai ulang wawancara');
    } finally {
      setStarting(false);
    }
  }

  const answers = messages.filter((m) => m.role === 'user').length;
  const total = session?.totalSteps ?? 8;
  const step = Math.min(answers + (completed ? 0 : 1), total);
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const suggestions =
    pending || completed
      ? []
      : ((lastAssistant?.metadata?.suggestions as string[] | undefined) ?? []);

  if (loading) {
    return (
      <div className="rounded-xl border border-line bg-surface p-8">
        <p className="font-mono text-xs text-ink-3">Memuat wawancara...</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_290px] lg:items-start">
      {/* Main conversation column */}
      <div className="flex min-w-0 flex-col rounded-2xl border border-line bg-surface shadow-panel overflow-hidden">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 border-b border-danger/30 bg-danger-soft px-5 py-3 text-sm text-danger-ink"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-5 p-5 sm:p-6" aria-live="polite">
          {messages.length === 0 && !completed && (
            <div className="rounded-xl border border-line bg-canvas p-5 space-y-2">
              <p className="font-mono text-xs text-ink-3">rancang-ai</p>
              <h2 className="text-lg font-semibold text-ink">Ceritakan idemu dulu.</h2>
              <p className="text-sm leading-relaxed text-ink-2">
                Tulis satu paragraf singkat: aplikasi apa yang ingin dibuat, siapa penggunanya, dan
                masalah utama yang diselesaikan. Setelah itu rancang-ai akan mengajukan pertanyaan
                lanjutan yang terarah.
              </p>
            </div>
          )}

          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="ml-auto max-w-2xl rounded-xl border border-line bg-sidebar px-4 py-3">
                <p className="font-mono text-[11px] text-ink-3">Kamu · {timeOf(m.createdAt)}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                  {m.content}
                </p>
              </div>
            ) : (
              <div key={m.id} className="max-w-2xl space-y-1">
                <p className="font-mono text-[11px] text-accent-ink">rancang-ai</p>
                <p className="text-[15px] font-medium leading-relaxed text-ink">{m.content}</p>
              </div>
            ),
          )}

          {pending && (
            <div className="max-w-2xl space-y-1">
              <p className="font-mono text-[11px] text-accent-ink">rancang-ai</p>
              <p className="inline-flex items-center gap-2 text-sm text-ink-2">
                <span className="wet-caret" aria-hidden="true" />
                <span>Menyusun pertanyaan berikutnya...</span>
              </p>
            </div>
          )}

          {!pending && !completed && suggestions.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-xs font-medium text-ink-3">Saran jawaban cepat</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-canvas px-3 py-1.5 text-left text-xs text-ink transition-colors hover:border-accent hover:bg-accent-soft/50"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0 text-accent-ink" aria-hidden="true" />
                    <span>{s}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {completed && (
            <section className="rounded-xl border border-ready/30 bg-ready-soft/50 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-ready-ink" aria-hidden="true" />
                <Badge tone="ready">Wawancara selesai · {answers} jawaban</Badge>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-ink">Enam dokumen inti siap ditulis.</h2>
                <p className="mt-1 text-sm text-ink-2">
                  Konteks dari percakapan sudah tersimpan. Lanjutkan ke mode Tulis Langsung untuk
                  membuat keenam dokumen secara berurutan.
                </p>
              </div>
              <ul className="flex flex-wrap gap-2">
                {CORE_LABELS.map((d) => (
                  <li
                    key={d}
                    className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink"
                  >
                    {d}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <Button variant="primary" onClick={onStartWriting}>
                  <span>Tulis dokumen spesifikasi</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button variant="secondary" onClick={() => void restart()} disabled={starting}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  {starting ? 'Mengulang...' : 'Ulangi wawancara'}
                </Button>
              </div>
            </section>
          )}

          <div ref={endRef} />
        </div>

        {!completed && (
          <form
            className="border-t border-line bg-sidebar/50 p-4 sm:p-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <label htmlFor="interview-answer" className="block text-xs font-medium text-ink-2">
              Jawabanmu
            </label>
            <textarea
              id="interview-answer"
              rows={3}
              value={draft}
              disabled={pending}
              placeholder={
                messages.length === 0
                  ? 'Contoh: Aplikasi kasir dan pencatatan stok untuk bengkel motor dengan dua kasir...'
                  : 'Tulis jawabanmu di sini...'
              }
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              className="w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-ink-3">
                Enter kirim · Shift+Enter baris baru
              </span>
              <Button type="submit" variant="primary" size="sm" disabled={pending || !draft.trim()}>
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pending ? 'Mengirim...' : 'Kirim jawaban'}</span>
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Right rail: progress & controls */}
      <aside className="rounded-2xl border border-line bg-surface p-5 shadow-panel space-y-4 lg:sticky lg:top-20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-ink-2">Kemajuan wawancara</span>
          <span className="font-mono text-sm font-semibold text-ink">
            {completed ? total : step}/{total}
          </span>
        </div>

        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
          role="progressbar"
          aria-label="Kemajuan wawancara"
          aria-valuenow={completed ? total : step}
          aria-valuemin={0}
          aria-valuemax={total}
        >
          {Array.from({ length: total }, (_, i) => {
            const n = i + 1;
            const isDone = completed || n < step;
            const isCurrent = !completed && n === step;
            return (
              <span
                key={n}
                className={`h-2 rounded-full ${
                  isDone ? 'bg-ready' : isCurrent ? 'bg-accent' : 'bg-subtle'
                }`}
              />
            );
          })}
        </div>

        <p className="text-xs leading-relaxed text-ink-2">
          {completed
            ? 'Seluruh jawaban tersimpan. Kamu dapat menulis dokumen kapan saja.'
            : 'Jawab secukupnya dulu; detail teknis bisa disunting langsung setelah dokumen dibuat.'}
        </p>

        {!completed && session && (
          <div className="border-t border-line pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-ink-2"
              onClick={() => void restart()}
              disabled={starting || pending}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {starting ? 'Memulai ulang...' : 'Mulai ulang wawancara'}
            </Button>
          </div>
        )}
      </aside>
    </div>
  );
}
