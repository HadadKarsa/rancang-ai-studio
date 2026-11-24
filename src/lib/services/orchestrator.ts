import { assertProjectOwnership, loadTranscript } from './interview';
import { resolveProvider } from '@/lib/llm/credentials';
import { buildModel } from '@/lib/llm/registry';
import { generateText, streamText } from 'ai';
import { getProjectById } from '@/lib/db/repositories/projects';
import {
  getDocumentByType, getCurrentVersion, setDocumentStatus, createVersionSnapshot,
} from '@/lib/db/repositories/documents';
import { createRun, markRunFailed, markRunSucceeded } from '@/lib/db/repositories/generationRuns';
import { getTemplateById } from '@/lib/db/repositories/templates';
import { listInjectedAssets } from '@/lib/db/repositories/assets';
import { buildDocumentPrompt } from '@/lib/llm/prompts';
import { NotFoundError } from '@/lib/errors';
import type { DocumentType } from '@/lib/db/enums';
import type { GenerationInput } from '@/lib/llm/prompts';

/**
 * Batch generation orchestrator (T-308): generate the project's documents
 * sequentially, respecting dependencies.
 *
 * Wireframe is LAST and OPTIONAL: the default batch stops before it. It is
 * generated only when explicitly requested (`types: ['wireframe']`), because it
 * reads every other document and is the slowest, least essential one.
 */

/** Full generation order, wireframe last (it reads everything else). */
export const GENERATION_ORDER: DocumentType[] = ['prd', 'architecture', 'database', 'api', 'tasks', 'memory', 'wireframe'];

/** The six core documents — everything the default batch writes. */
export const CORE_GENERATION_ORDER: DocumentType[] = GENERATION_ORDER.filter((t) => t !== 'wireframe');

export interface BatchOptions {
  userId: string;
  projectId: string;
  presetId?: string | null;
  ephemeralKey?: string;
  /** Stop after N documents (used by tests). */
  limit?: number;
  /** Skip wireframe. The default already does; kept for older callers. */
  skipWireframe?: boolean;
  /** Explicit document selection. Wireframe is only generated this way. */
  types?: DocumentType[];
}

export interface BatchResult {
  generated: DocumentType[];
  failed: { type: DocumentType; error: string }[];
  skipped: DocumentType[];
}

/**
 * Which documents this batch writes, in dependency order.
 * No `types` → the six core documents (wireframe is opt-in).
 */
export function resolveGenerationOrder(opts: Pick<BatchOptions, 'types' | 'limit'>): DocumentType[] {
  const requested = opts.types && opts.types.length > 0 ? opts.types : CORE_GENERATION_ORDER;
  let order = GENERATION_ORDER.filter((t) => requested.includes(t));
  if (opts.limit) order = order.slice(0, opts.limit);
  return order;
}

// The one-batch-per-project guard lives in lib/services/batchRunner.ts, which
// owns the running batch. Nothing here tracks in-flight state any more: a
// generator instance is only ever driven by the runner.

// ── shared batch setup ──────────────────────────────────────────────────────

interface BatchContext {
  project: Awaited<ReturnType<typeof getProjectById>> & object;
  model: ReturnType<typeof buildModel>;
  resolved: Awaited<ReturnType<typeof resolveProvider>>;
  transcript: GenerationInput['interviewTranscript'];
  baselineAssumptions: string[];
  assets: { name: string; content: string }[];
}

async function prepareBatch(opts: BatchOptions): Promise<BatchContext> {
  await assertProjectOwnership(opts.userId, opts.projectId);
  const project = await getProjectById(opts.projectId, opts.userId);
  if (!project) throw new NotFoundError('Project not found');

  const resolved = await resolveProvider({
    userId: opts.userId, presetId: opts.presetId ?? project.defaultPresetId, ephemeralKey: opts.ephemeralKey,
    fallbackProvider: 'custom', fallbackModelId: 'deepseek-chat',
  });
  const model = buildModel({
    provider: resolved.provider, modelId: resolved.modelId, apiKey: resolved.apiKey,
    baseUrl: resolved.baseUrl, presetBaseUrl: resolved.presetBaseUrl,
  });
  const template = project.templateId ? await getTemplateById(project.templateId) : null;
  const assets = await listInjectedAssets(opts.projectId);

  return {
    project,
    model,
    resolved,
    transcript: await loadTranscriptForProject(opts.projectId),
    baselineAssumptions: template?.baselineAssumptions ?? [],
    assets: assets.filter((a) => a.contentText).map((a) => ({ name: a.name, content: a.contentText as string })),
  };
}

/** Prompt for one document, fed the documents already written this batch. */
async function promptFor(
  ctx: BatchContext,
  projectId: string,
  type: DocumentType,
  written: DocumentType[],
): Promise<{ system: string; prompt: string }> {
  const priorContext: { name: string; content: string }[] = [];
  for (const prior of written) {
    const priorDoc = await getDocumentByType(projectId, prior);
    if (!priorDoc) continue;
    const version = await getCurrentVersion(priorDoc.id);
    if (version) priorContext.push({ name: prior, content: version.contentMd.slice(0, 12_000) });
  }

  return buildDocumentPrompt(type, {
    projectName: ctx.project.name,
    projectDescription: ctx.project.description,
    interviewTranscript: ctx.transcript,
    baselineAssumptions: ctx.baselineAssumptions,
    injectedAssets: [...ctx.assets, ...priorContext],
  });
}

interface PersistInput {
  projectId: string;
  documentId: string;
  type: DocumentType;
  text: string;
  userId: string;
  startedAt: number;
  resolved: BatchContext['resolved'];
  usage?: { inputTokens?: number | null; outputTokens?: number | null } | null;
}

/**
 * The one place a generated document is written. Both the batch (generateText)
 * and the stream (streamText) go through here, so what lands in the database is
 * identical whichever path produced it: optional wireframe extraction, a
 * generation run, a version snapshot, then status 'ready'.
 */
async function persistDocument(input: PersistInput): Promise<void> {
  const { projectId, documentId, type, text, userId, startedAt, resolved } = input;
  const latency = Date.now() - startedAt;

  const run = await createRun({
    projectId, documentId,
    kind: type === 'wireframe' ? 'wireframe_generate' : 'document_generate',
    provider: resolved.provider, modelId: resolved.modelId,
    presetId: resolved.presetId, credentialId: resolved.credentialId,
  });
  if (type === 'wireframe') {
    const { persistWireframeScreens } = await import('./generation');
    await persistWireframeScreens(projectId, text);
  }
  await createVersionSnapshot({
    documentId, contentMd: text, source: 'initial',
    modelUsed: resolved.modelId, provider: resolved.provider, presetId: resolved.presetId,
    promptTokens: input.usage?.inputTokens ?? null, completionTokens: input.usage?.outputTokens ?? null,
    generationMs: latency, createdByUserId: userId,
  });
  await setDocumentStatus(documentId, 'ready');
  await markRunSucceeded(run.id, {
    promptTokens: input.usage?.inputTokens ?? null, completionTokens: input.usage?.outputTokens ?? null,
    latencyMs: latency,
  });
}

async function recordFailure(
  projectId: string, documentId: string, type: DocumentType,
  resolved: BatchContext['resolved'], error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const run = await createRun({
    projectId, documentId,
    kind: type === 'wireframe' ? 'wireframe_generate' : 'document_generate',
    provider: resolved.provider, modelId: resolved.modelId,
    presetId: resolved.presetId, credentialId: resolved.credentialId,
  });
  await markRunFailed(run.id, 'PROVIDER_ERROR', message);
  await setDocumentStatus(documentId, 'failed');
}

// ── batch (non-streaming) ───────────────────────────────────────────────────

export async function generateAllDocuments(opts: BatchOptions): Promise<BatchResult> {
  const ctx = await prepareBatch(opts);
  const result: BatchResult = { generated: [], failed: [], skipped: [] };
  const order = resolveGenerationOrder(opts);

  for (const type of order) {
    const doc = await getDocumentByType(opts.projectId, type);
    if (!doc || doc.isLocked) { result.skipped.push(type); continue; }

    await setDocumentStatus(doc.id, 'generating');
    const started = Date.now();
    try {
      const prompt = await promptFor(ctx, opts.projectId, type, result.generated);
      const res = await generateText({
        model: ctx.model, system: prompt.system, prompt: prompt.prompt,
        temperature: ctx.resolved.temperature, maxOutputTokens: ctx.resolved.maxTokens,
      });
      await persistDocument({
        projectId: opts.projectId, documentId: doc.id, type, text: res.text,
        userId: opts.userId, startedAt: started, resolved: ctx.resolved, usage: res.usage,
      });
      result.generated.push(type);
    } catch (e) {
      await recordFailure(opts.projectId, doc.id, type, ctx.resolved, e);
      result.failed.push({ type, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return result;
}

// ── batch (streaming) ───────────────────────────────────────────────────────

export type BatchStreamEvent =
  | { event: 'start'; data: { order: DocumentType[] } }
  | { event: 'doc'; data: { type: DocumentType; status: 'writing' } }
  | { event: 'delta'; data: { type: DocumentType; text: string } }
  | { event: 'done'; data: { type: DocumentType; status: 'ready'; bytes: number } }
  /** `type` is null when the failure is the batch itself, not one document. */
  | { event: 'error'; data: { type: DocumentType | null; message: string } }
  | { event: 'finish'; data: BatchResult };

export interface BatchStreamOptions extends BatchOptions {
  /**
   * The runner's own signal — aborted only by an explicit cancel or by the
   * process going away. Never a client connection: a page that navigates away
   * must not stop the work.
   */
  signal?: AbortSignal;
  /** Why the runner was stopped, for the `failed` entry and the error event. */
  stopMessage?: string;
}

/**
 * Same batch, streamed: yields one event per step so a page can render each
 * document as it is written. Persists through `persistDocument`, so the stored
 * document is identical to the non-streaming batch's.
 *
 * On abort (an explicit cancel) the partial text IS persisted as a version (so
 * the work is not thrown away) and the document's status is left `failed` — the
 * enum's error state; there is no 'draft' for documents. The type is reported
 * in `failed` on the finish event. Aborting is the runner's decision; a client
 * disconnecting never reaches this signal.
 */
export async function* generateAllDocumentsStream(
  opts: BatchStreamOptions,
): AsyncGenerator<BatchStreamEvent> {
  const ctx = await prepareBatch(opts);
  const result: BatchResult = { generated: [], failed: [], skipped: [] };
  const order = resolveGenerationOrder(opts);

  yield { event: 'start', data: { order } };

  for (const type of order) {
    if (opts.signal?.aborted) break;

    const doc = await getDocumentByType(opts.projectId, type);
    if (!doc || doc.isLocked) { result.skipped.push(type); continue; }

    await setDocumentStatus(doc.id, 'generating');
    yield { event: 'doc', data: { type, status: 'writing' } };

    const started = Date.now();
    let text = '';
    let aborted = false;
    let usage: { inputTokens?: number | null; outputTokens?: number | null } | null = null;

    try {
      const prompt = await promptFor(ctx, opts.projectId, type, result.generated);
      const stream = streamText({
        model: ctx.model, system: prompt.system, prompt: prompt.prompt,
        temperature: ctx.resolved.temperature, maxOutputTokens: ctx.resolved.maxTokens,
        abortSignal: opts.signal,
      });

      for await (const chunk of stream.textStream) {
        if (!chunk) continue;
        text += chunk;
        yield { event: 'delta', data: { type, text: chunk } };
      }

      if (opts.signal?.aborted) aborted = true;
      else usage = await Promise.resolve(stream.usage).catch(() => null);
    } catch (e) {
      if (opts.signal?.aborted) {
        aborted = true;
      } else {
        await recordFailure(opts.projectId, doc.id, type, ctx.resolved, e);
        const message = e instanceof Error ? e.message : String(e);
        result.failed.push({ type, error: message });
        yield { event: 'error', data: { type, message } };
        continue;
      }
    }

    if (aborted) {
      // Keep what was written; mark it failed so nothing treats it as finished.
      if (text.trim().length > 0) {
        try {
          await createVersionSnapshot({
            documentId: doc.id, contentMd: text, source: 'initial',
            modelUsed: ctx.resolved.modelId, provider: ctx.resolved.provider,
            presetId: ctx.resolved.presetId, generationMs: Date.now() - started,
            createdByUserId: opts.userId,
          });
        } catch { /* a disconnect must not throw out of the stream */ }
      }
      await setDocumentStatus(doc.id, 'failed');
      const message = opts.stopMessage ?? 'Dihentikan sebelum selesai';
      result.failed.push({ type, error: message });
      yield { event: 'error', data: { type, message } };
      break;
    }

    if (text.trim().length === 0) {
      await setDocumentStatus(doc.id, 'failed');
      const message = 'Model mengembalikan teks kosong';
      result.failed.push({ type, error: message });
      yield { event: 'error', data: { type, message } };
      continue;
    }

    try {
      await persistDocument({
        projectId: opts.projectId, documentId: doc.id, type, text,
        userId: opts.userId, startedAt: started, resolved: ctx.resolved, usage,
      });
      result.generated.push(type);
      yield { event: 'done', data: { type, status: 'ready', bytes: Buffer.byteLength(text, 'utf8') } };
    } catch (e) {
      await recordFailure(opts.projectId, doc.id, type, ctx.resolved, e);
      const message = e instanceof Error ? e.message : String(e);
      result.failed.push({ type, error: message });
      yield { event: 'error', data: { type, message } };
    }
  }

  yield { event: 'finish', data: result };
}

async function loadTranscriptForProject(projectId: string) {
  const { getActiveSessionForProject, listSessionsForProject } = await import('@/lib/db/repositories/interviews');
  const active = await getActiveSessionForProject(projectId);
  const session =
    active ??
    (await listSessionsForProject(projectId, 5)).find((s) => s.status !== 'abandoned') ??
    null;
  return session ? loadTranscript(session.id) : [];
}