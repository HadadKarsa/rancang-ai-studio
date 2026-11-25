import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';

/**
 * Interactive (interview) path: a truncated turn must fail the run with
 * OUTPUT_TRUNCATED and must not append a broken question to the transcript,
 * which every later document reads as context.
 */

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
};

let currentModel: ReturnType<typeof model>;

vi.mock('@/lib/llm/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/llm/registry')>();
  return { ...actual, buildModel: () => currentModel };
});

vi.mock('@/lib/llm/credentials', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/llm/credentials')>();
  return {
    ...actual,
    resolveProvider: async () => ({
      provider: 'custom' as const,
      modelId: 'mock-model',
      apiKey: 'synthetic-not-a-key',
      baseUrl: 'http://127.0.0.1:9/v1',
      presetBaseUrl: null,
      temperature: 0.7,
      maxTokens: 1024,
      topP: 1,
      systemPersona: null,
      presetId: null,
      credentialId: null,
      reasoningEffort: 'medium' as const,
    }),
  };
});

function model(finishReason: 'stop' | 'length', text: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text' as const, text }],
      finishReason: { unified: finishReason, raw: finishReason },
      usage,
      warnings: [],
    }),
  });
}

const turnJson = JSON.stringify({ question: 'Siapa penggunanya?', suggestions: ['a'], isComplete: false, reasoning: '' });

let seq = 0;

async function seedSession(): Promise<string> {
  const { getDb } = await import('@/lib/db/client');
  const db = getDb();
  const now = new Date().toISOString();
  const n = ++seq;
  await db.execute(
    `INSERT INTO users (id, email, role, auth_provider, created_at, updated_at) VALUES (?, ?, 'owner', 'local', ?, ?)`,
    [`usr_iv_${n}`, `iv${n}@example.invalid`, now, now],
  );
  await db.execute(
    `INSERT INTO projects (id, user_id, name, slug, status, accent_color, created_at, updated_at)
     VALUES (?, ?, 'P', ?, 'interviewing', '#6366f1', ?, ?)`,
    [`prj_iv_${n}`, `usr_iv_${n}`, `p${n}`, now, now],
  );
  await db.execute(
    `INSERT INTO interview_sessions (id, project_id, status, current_step, total_steps, created_at, updated_at)
     VALUES (?, ?, 'active', 0, 6, ?, ?)`,
    [`ses_iv_${n}`, `prj_iv_${n}`, now, now],
  );
  return `ses_iv_${n}`;
}

describe('interview turn and truncated output', () => {
  beforeEach(async () => {
    const { runMigrations } = await import('@/lib/db/migrate');
    await runMigrations();
  });

  it('a truncated turn fails the run with OUTPUT_TRUNCATED and appends no message', async () => {
    const sessionId = await seedSession();
    const { startInterviewTurn } = await import('@/lib/services/interview');
    const { getDb } = await import('@/lib/db/client');

    currentModel = model('length', '{"question":"Siapa pengg');

    await expect(
      startInterviewTurn({ userId: `usr_iv_${seq}`, sessionId }),
    ).rejects.toThrow(/truncated/i);

    const db = getDb();
    const runs = (await db.execute('SELECT status, error_code FROM generation_runs WHERE session_id = ?', [sessionId])).rows;
    expect(runs.length).toBe(1);
    expect(runs[0]?.status).toBe('failed');
    expect(runs[0]?.error_code).toBe('OUTPUT_TRUNCATED');

    const messages = (await db.execute('SELECT * FROM interview_messages WHERE session_id = ?', [sessionId])).rows;
    expect(messages.length).toBe(0);
  });

  it('a complete turn still appends the question and succeeds', async () => {
    const sessionId = await seedSession();
    const { startInterviewTurn } = await import('@/lib/services/interview');
    const { getDb } = await import('@/lib/db/client');

    currentModel = model('stop', turnJson);
    const turn = await startInterviewTurn({ userId: `usr_iv_${seq}`, sessionId });
    expect(turn.question).toBe('Siapa penggunanya?');

    const db = getDb();
    const runs = (await db.execute('SELECT status FROM generation_runs WHERE session_id = ?', [sessionId])).rows;
    expect(runs[0]?.status).toBe('succeeded');
    const messages = (await db.execute('SELECT role, content FROM interview_messages WHERE session_id = ?', [sessionId])).rows;
    expect(messages.length).toBe(1);
    expect(messages[0]?.content).toBe('Siapa penggunanya?');
  });
});
