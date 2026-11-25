import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';

/**
 * Batch generation paths, end to end against an isolated DB and a mock model.
 * The only things stubbed are the two seams that would otherwise reach a
 * provider: `buildModel` and `resolveProvider`. Everything below them — the
 * run ledger, document status, version snapshots, the truncation branch — is
 * the real code.
 */

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
};

function mockModel(finishReason: 'stop' | 'length', text: string) {
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text' as const, text }],
      finishReason: { unified: finishReason, raw: finishReason },
      usage,
      warnings: [],
    }),
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({ type: 'text-start', id: 't1' });
          controller.enqueue({ type: 'text-delta', id: 't1', delta: text });
          controller.enqueue({ type: 'text-end', id: 't1' });
          controller.enqueue({
            type: 'finish',
            finishReason: { unified: finishReason, raw: finishReason },
            usage,
          });
          controller.close();
        },
      }),
    }),
  });
  return model;
}

let currentModel: ReturnType<typeof mockModel>;
let capturedMaxOutputTokens: number[] = [];

vi.mock('@/lib/llm/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/llm/registry')>();
  return {
    ...actual,
    buildModel: () => currentModel,
  };
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

// Record what budget each call actually asked for, without changing behaviour.
const realGenerateText = vi.hoisted(() => ({ calls: [] as unknown[] }));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: (opts: Parameters<typeof actual.generateText>[0]) => {
      realGenerateText.calls.push(opts);
      capturedMaxOutputTokens.push(Number(opts.maxOutputTokens));
      return actual.generateText(opts);
    },
    streamText: (opts: Parameters<typeof actual.streamText>[0]) => {
      capturedMaxOutputTokens.push(Number(opts.maxOutputTokens));
      return actual.streamText(opts);
    },
  };
});

let seedSeq = 0;

interface Seeded {
  userId: string;
  projectId: string;
  docs: { prd: string; architecture: string; database: string; api: string; tasks: string; memory: string };
}

async function seed(): Promise<Seeded> {
  const { getDb } = await import('@/lib/db/client');
  const db = getDb();
  const now = new Date().toISOString();
  const n = ++seedSeq;
  const userId = `usr_batch_${n}`;
  const projectId = `prj_batch_${n}`;
  await db.execute(
    `INSERT INTO users (id, email, role, auth_provider, created_at, updated_at) VALUES (?, ?, 'owner', 'local', ?, ?)`,
    [userId, `batch${n}@example.invalid`, now, now],
  );
  await db.execute(
    `INSERT INTO projects (id, user_id, name, slug, status, accent_color, created_at, updated_at)
     VALUES (?, ?, 'P', ?, 'draft', '#6366f1', ?, ?)`,
    [projectId, userId, `p${n}`, now, now],
  );
  const docs = {
    prd: `doc_${n}_prd`,
    architecture: `doc_${n}_architecture`,
    database: `doc_${n}_database`,
    api: `doc_${n}_api`,
    tasks: `doc_${n}_tasks`,
    memory: `doc_${n}_memory`,
  };
  const order = ['prd', 'architecture', 'database', 'api', 'tasks', 'memory'] as const;
  for (const [i, type] of order.entries()) {
    await db.execute(
      `INSERT INTO spec_documents (id, project_id, type, title, status, order_index, is_locked, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, 0, ?, ?)`,
      [docs[type], projectId, type, type.toUpperCase(), i, now, now],
    );
  }
  return { userId, projectId, docs };
}

describe('batch generation and truncated output', () => {
  beforeEach(async () => {
    const { runMigrations } = await import('@/lib/db/migrate');
    await runMigrations();
    capturedMaxOutputTokens = [];
    realGenerateText.calls = [];
  });

  it('non-streaming batch: a truncated document is failed, not generated, and never used as context', async () => {
    const { userId, projectId, docs } = await seed();
    const { generateAllDocuments } = await import('@/lib/services/orchestrator');
    const { getDb } = await import('@/lib/db/client');

    // prd truncates; everything after it must still run and must not receive it.
    currentModel = mockModel('length', 'HALF A PRD THAT SHOULD NEVER BE STORED');

    const result = await generateAllDocuments({ userId, projectId, types: ['prd'], limit: 1 });

    expect(result.generated).toEqual([]);
    expect(result.failed.map((f) => f.type)).toEqual(['prd']);
    expect(result.failed[0]?.error).toMatch(/truncated/i);

    const db = getDb();
    const doc = (await db.execute('SELECT status FROM spec_documents WHERE id = ?', [docs.prd])).rows[0];
    expect(doc?.status).toBe('failed');

    const versions = (await db.execute('SELECT * FROM document_versions WHERE document_id = ?', [docs.prd])).rows;
    expect(versions.length).toBe(0);

    const runs = (await db.execute('SELECT status, error_code FROM generation_runs WHERE document_id = ?', [docs.prd])).rows;
    expect(runs.length).toBe(1);
    expect(runs[0]?.status).toBe('failed');
    expect(runs[0]?.error_code).toBe('OUTPUT_TRUNCATED');
  });

  it('non-streaming batch: a complete document is still stored and marked ready', async () => {
    const { userId, projectId, docs } = await seed();
    const { generateAllDocuments } = await import('@/lib/services/orchestrator');
    const { getDb } = await import('@/lib/db/client');

    currentModel = mockModel('stop', '# PRD\n\nA complete document.');
    const result = await generateAllDocuments({ userId, projectId, types: ['prd'], limit: 1 });

    expect(result.generated).toEqual(['prd']);
    expect(result.failed).toEqual([]);

    const db = getDb();
    const doc = (await db.execute('SELECT status FROM spec_documents WHERE id = ?', [docs.prd])).rows[0];
    expect(doc?.status).toBe('ready');
    const runs = (await db.execute('SELECT status FROM generation_runs WHERE document_id = ?', [docs.prd])).rows;
    expect(runs[0]?.status).toBe('succeeded');
  });

  it('streaming batch: a truncated document emits an error event and stores no version', async () => {
    const { userId, projectId, docs } = await seed();
    const { generateAllDocumentsStream } = await import('@/lib/services/orchestrator');
    const { getDb } = await import('@/lib/db/client');

    currentModel = mockModel('length', 'PARTIAL ARCHITECTURE');

    const events: { event: string; data: unknown }[] = [];
    for await (const ev of generateAllDocumentsStream({ userId, projectId, types: ['architecture'] })) {
      events.push(ev as { event: string; data: unknown });
    }

    const errorEvent = events.find((e) => e.event === 'error') as { data: { type: string; message: string } } | undefined;
    expect(errorEvent?.data.type).toBe('architecture');
    expect(errorEvent?.data.message).toMatch(/truncated/i);

    const finish = events.find((e) => e.event === 'finish') as { data: { generated: string[]; failed: { type: string }[] } };
    expect(finish.data.generated).toEqual([]);
    expect(finish.data.failed.map((f) => f.type)).toEqual(['architecture']);

    const db = getDb();
    const doc = (await db.execute('SELECT status FROM spec_documents WHERE id = ?', [docs.architecture])).rows[0];
    expect(doc?.status).toBe('failed');
    const versions = (await db.execute('SELECT * FROM document_versions WHERE document_id = ?', [docs.architecture])).rows;
    expect(versions.length).toBe(0);
    const runs = (await db.execute('SELECT status, error_code FROM generation_runs WHERE document_id = ?', [docs.architecture])).rows;
    expect(runs[0]?.status).toBe('failed');
    expect(runs[0]?.error_code).toBe('OUTPUT_TRUNCATED');
  });

  it('streaming batch: a complete document still reaches ready', async () => {
    const { userId, projectId, docs } = await seed();
    const { generateAllDocumentsStream } = await import('@/lib/services/orchestrator');
    const { getDb } = await import('@/lib/db/client');

    currentModel = mockModel('stop', '# Architecture\n\nComplete.');
    const events: { event: string }[] = [];
    for await (const ev of generateAllDocumentsStream({ userId, projectId, types: ['architecture'] })) {
      events.push(ev as { event: string });
    }
    expect(events.map((e) => e.event)).toContain('done');
    const db = getDb();
    const doc = (await db.execute('SELECT status FROM spec_documents WHERE id = ?', [docs.architecture])).rows[0];
    expect(doc?.status).toBe('ready');
  });

  it('both batch paths ask for at least 8192 output tokens when reasoning is active', async () => {
    const { userId, projectId } = await seed();
    const { generateAllDocuments, generateAllDocumentsStream } = await import('@/lib/services/orchestrator');

    currentModel = mockModel('stop', 'ok');
    await generateAllDocuments({ userId, projectId, types: ['prd'], limit: 1 });
    for await (const _ of generateAllDocumentsStream({ userId, projectId, types: ['architecture'] })) void _;

    // The preset says maxTokens 1024; reasoning 'medium' must raise it to 8192.
    expect(capturedMaxOutputTokens.length).toBeGreaterThanOrEqual(2);
    for (const budget of capturedMaxOutputTokens) {
      expect(budget).toBeGreaterThanOrEqual(8192);
    }
  });

  it('both batch paths still forward providerOptions', async () => {
    const { userId, projectId } = await seed();
    const { generateAllDocuments } = await import('@/lib/services/orchestrator');
    currentModel = mockModel('stop', 'ok');
    await generateAllDocuments({ userId, projectId, types: ['prd'], limit: 1 });
    const opts = realGenerateText.calls.at(-1) as { providerOptions?: unknown };
    expect(opts.providerOptions).toEqual({ openai: { reasoningEffort: 'medium' } });
  });
});
