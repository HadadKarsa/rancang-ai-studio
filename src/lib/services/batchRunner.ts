import {
  generateAllDocumentsStream,
  resolveGenerationOrder,
  type BatchResult,
  type BatchStreamEvent,
} from './orchestrator';
import type { DocumentType } from '@/lib/db/enums';
import { updateProject } from '@/lib/db/repositories/projects';

/**
 * Batch runner: the server owns document generation, the page only watches.
 *
 * Why this exists — Ndan's bug: "kenapa kalau pindah tab atau lihat home padahal
 * ga tutup tab malah sambungan terputus?" Before this module the SSE route drove
 * the generator itself, so the HTTP request *was* the batch: any in-app
 * navigation unmounted /write, the browser aborted the fetch, `req.signal`
 * aborted, and the orchestrator stopped mid-document and marked it `failed`.
 * The work died with the display.
 *
 * Now the batch is a module-scope registry keyed by project. A request only
 * attaches to it (see the GET route, which is a pure tail). The runner has its
 * own AbortController, aborted only by `cancelBatch` or by finishing. A client
 * that goes away costs nothing but one listener.
 *
 * One batch per project per process: `startBatch` returns 'already-running'
 * rather than starting a duplicate, which would double the provider spend and
 * race on document versions.
 */

export type BatchDocStatus = 'queued' | 'writing' | 'ready' | 'failed';

export interface BatchDocState {
  status: BatchDocStatus;
  /** Everything written for this document so far — partial while it is writing. */
  text: string;
  bytes: number | null;
  error: string | null;
}

/** What a re-attaching client is sent as its first event. Plain JSON. */
export interface BatchSnapshot {
  projectId: string;
  order: DocumentType[];
  docs: ({ type: DocumentType } & BatchDocState)[];
  startedAt: number;
  elapsedMs: number;
  finished: boolean;
  result: BatchResult | null;
}

export type BatchListener = (ev: BatchStreamEvent) => void;

export interface BatchState {
  projectId: string;
  userId: string;
  types?: DocumentType[];
  presetId?: string | null;
  ephemeralKey?: string;
  order: DocumentType[];
  docs: Map<DocumentType, BatchDocState>;
  startedAt: number;
  finished: boolean;
  result: BatchResult | null;
  listeners: Set<BatchListener>;
  /** The runner's own signal. Never a client's. */
  abort: AbortController;
  /** Set by cancelBatch, so the failed document says why. */
  stopMessage?: string;
}

export interface StartBatchOptions {
  userId: string;
  projectId: string;
  types?: DocumentType[];
  presetId?: string | null;
  ephemeralKey?: string;
}

/**
 * A finished batch stays readable for ten minutes so a page that was away
 * during the last document can still replay it, then it is dropped.
 */
const FINISHED_TTL_MS = 10 * 60_000;

/**
 * The registry lives on `globalThis`, not in a module-scope const.
 *
 * Next compiles each route handler into its own bundle, so a module-scope Map
 * is one Map *per route*: the POST that starts a batch and the GET that tails
 * it would each see their own empty registry, and the tail would 409 on a batch
 * that is plainly running. `globalThis` is the one object every bundle in the
 * process shares (the same reason a Prisma client is kept there in dev).
 */
interface Registry {
  batches: Map<string, BatchState>;
  finishedAt: Map<string, number>;
}

const globalKey = Symbol.for('rancang-ai.batchRunner');
const g = globalThis as unknown as { [globalKey]?: Registry };
const store: Registry = (g[globalKey] ??= { batches: new Map(), finishedAt: new Map() });

const registry = store.batches;
const finishedAt = store.finishedAt;

function prune(): void {
  const now = Date.now();
  for (const [projectId, at] of finishedAt) {
    if (now - at < FINISHED_TTL_MS) continue;
    const state = registry.get(projectId);
    // Only drop it if nothing re-attached in the meantime.
    if (state && state.listeners.size === 0) {
      registry.delete(projectId);
      finishedAt.delete(projectId);
    } else if (state) {
      finishedAt.set(projectId, now);
    } else {
      finishedAt.delete(projectId);
    }
  }
}

function docOf(state: BatchState, type: DocumentType): BatchDocState {
  let doc = state.docs.get(type);
  if (!doc) {
    doc = { status: 'queued', text: '', bytes: null, error: null };
    state.docs.set(type, doc);
  }
  return doc;
}

function applyEvent(state: BatchState, ev: BatchStreamEvent): void {
  switch (ev.event) {
    case 'start': {
      state.order = ev.data.order;
      for (const type of ev.data.order) docOf(state, type);
      break;
    }
    case 'doc': {
      const doc = docOf(state, ev.data.type);
      doc.status = 'writing';
      doc.error = null;
      break;
    }
    case 'delta': {
      docOf(state, ev.data.type).text += ev.data.text;
      break;
    }
    case 'done': {
      const doc = docOf(state, ev.data.type);
      doc.status = 'ready';
      doc.bytes = ev.data.bytes;
      doc.error = null;
      break;
    }
    case 'error': {
      if (ev.data.type) {
        const doc = docOf(state, ev.data.type);
        doc.status = 'failed';
        doc.error = ev.data.message;
      }
      break;
    }
    case 'finish': {
      state.result = ev.data;
      state.finished = true;
      break;
    }
  }
}

function emit(state: BatchState, ev: BatchStreamEvent): void {
  for (const listener of state.listeners) {
    try {
      listener(ev);
    } catch (e) {
      // A dead listener must not take the batch down with it.
      console.error(`[batchRunner] listener failed project=${state.projectId}`, e);
      state.listeners.delete(listener);
    }
  }
}

async function runBatch(state: BatchState): Promise<void> {
  const { projectId, userId, types, presetId, ephemeralKey } = state;
  try {
    const gen = generateAllDocumentsStream({
      userId, projectId, types, presetId, ephemeralKey,
      signal: state.abort.signal,
      stopMessage: state.stopMessage,
    });
    for await (const ev of gen) {
      applyEvent(state, ev);
      emit(state, ev);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[batchRunner] project=${projectId} failed`, e);
    // prepareBatch can throw before the generator yields anything (no provider
    // configured, project gone). Without this the page waits forever.
    if (!state.finished) {
      const result: BatchResult = state.result ?? { generated: [], failed: [], skipped: [] };
      state.result = result;
      const ev: BatchStreamEvent = { event: 'error', data: { type: null, message } };
      applyEvent(state, ev);
      emit(state, ev);
      const finish: BatchStreamEvent = { event: 'finish', data: result };
      applyEvent(state, finish);
      emit(state, finish);
    }
  } finally {
    state.finished = true;
    finishedAt.set(projectId, Date.now());
    // Documents that exist mean the project is no longer "interviewing"; the
    // studio card and the interview CTA both key off this.
    const produced = state.result?.generated.length ?? 0;
    if (produced > 0) {
      void updateProject(projectId, userId, { status: 'ready' }).catch((e) =>
        console.error(`[batchRunner] status->ready failed project=${projectId}`, e),
      );
    }
  }
}

/**
 * Claim the project and start writing. Returns 'already-running' when a batch
 * is live, so the caller can answer 409 instead of spending tokens twice.
 */
export function startBatch(opts: StartBatchOptions): 'started' | 'already-running' {
  prune();
  const existing = registry.get(opts.projectId);
  if (existing && !existing.finished) return 'already-running';

  const order = resolveGenerationOrder({ types: opts.types });
  const state: BatchState = {
    projectId: opts.projectId,
    userId: opts.userId,
    types: opts.types,
    presetId: opts.presetId ?? null,
    ephemeralKey: opts.ephemeralKey,
    order,
    docs: new Map(),
    startedAt: Date.now(),
    finished: false,
    result: null,
    listeners: new Set(),
    abort: new AbortController(),
  };
  for (const type of order) docOf(state, type);

  registry.set(opts.projectId, state);
  console.log(`[batchRunner] start project=${opts.projectId} order=${order.join(',')}`);
  finishedAt.delete(opts.projectId);
  // The studio card reads projects.status — without this the card still says
  // "wawancara" after the documents are written (Ndan's report).
  void updateProject(opts.projectId, opts.userId, { status: 'generating' }).catch((e) =>
    console.error(`[batchRunner] status->generating failed project=${opts.projectId}`, e),
  );

  void runBatch(state);
  return 'started';
}

/** The current state, or null when this project has no batch at all. */
export function snapshot(projectId: string): BatchSnapshot | null {
  const state = registry.get(projectId);
  if (!state) return null;
  return {
    projectId,
    order: state.order,
    docs: state.order.map((type) => ({ type, ...docOf(state, type) })),
    startedAt: state.startedAt,
    elapsedMs: Date.now() - state.startedAt,
    finished: state.finished,
    result: state.result,
  };
}

/** Attach a listener. Returns the unsubscribe — never an abort. */
export function subscribe(projectId: string, listener: BatchListener): () => void {
  const state = registry.get(projectId);
  if (!state) return () => {};
  state.listeners.add(listener);
  return () => { state.listeners.delete(listener); };
}

/** Stop the runner explicitly. False when nothing is running. */
export function cancelBatch(projectId: string): boolean {
  const state = registry.get(projectId);
  if (!state || state.finished) return false;
  state.stopMessage = 'Dibatalkan oleh pengguna';
  state.abort.abort();
  return true;
}

/** True while a batch is live (used by the routes to answer 409). */
export function isBatchRunning(projectId: string): boolean {
  const state = registry.get(projectId);
  return !!state && !state.finished;
}