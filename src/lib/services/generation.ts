import { streamText, type ToolSet } from 'ai';
import { buildModel, buildProviderOptions } from '@/lib/llm/registry';
import { resolveProvider } from '@/lib/llm/credentials';
import { buildDocumentPrompt, type GenerationInput } from '@/lib/llm/prompts';
import { assertProjectOwnership, loadTranscript } from './interview';
import { getProjectById } from '@/lib/db/repositories/projects';
import { getDocumentByType, setDocumentStatus, createVersionSnapshot, getCurrentVersion } from '@/lib/db/repositories/documents';
import { createRun, markRunFailed, markRunSucceeded, markRunAborted, findActiveRunForDocument } from '@/lib/db/repositories/generationRuns';
import { getTemplateById } from '@/lib/db/repositories/templates';
import { listInjectedAssets } from '@/lib/db/repositories/assets';
import { getActiveSessionForProject, listSessionsForProject } from '@/lib/db/repositories/interviews';
import { DocumentLockedError, GenerationInProgressError, NotFoundError } from '@/lib/errors';
import { OUTPUT_TRUNCATED, OUTPUT_TRUNCATED_MESSAGE, isTruncated, resolveMaxOutputTokens } from '@/lib/llm/limits';
import type { DocumentType } from '@/lib/db/enums';

/**
 * Streaming generation service (T-306/T-307). Streams tokens to the client while
 * persisting the final content as a new document version. Regeneration includes
 * the current content + user instruction. Wireframe generation extracts
 * <screen> blocks into wireframe_screens rows.
 */
export interface StreamDocumentParams {
  userId: string;
  projectId: string;
  documentType: DocumentType;
  presetId?: string | null;
  /** Regeneration instruction; presence switches source to 'regenerate'. */
  instructions?: string | null;
  /** Session-only key (never persisted). */
  ephemeralKey?: string;
  abortSignal?: AbortSignal;
}

/** What streamDocumentGeneration returns: the ai SDK stream with helpers. */
export type GeneratedStream = ReturnType<typeof streamText<ToolSet, Record<string, unknown>>>;
export async function streamDocumentGeneration(params: StreamDocumentParams): Promise<GeneratedStream> {
  await assertProjectOwnership(params.userId, params.projectId);

  const doc = await getDocumentByType(params.projectId, params.documentType);
  if (!doc) throw new NotFoundError(`Document ${params.documentType} not found`);
  if (doc.isLocked) throw new DocumentLockedError();

  const active = await findActiveRunForDocument(doc.id);
  if (active) throw new GenerationInProgressError();

  const project = await getProjectById(params.projectId, params.userId);
  if (!project) throw new NotFoundError('Project not found');
  const template = project.templateId ? await getTemplateById(project.templateId) : null;

  const activeSession = await getActiveSessionForProject(params.projectId);
  const session =
    activeSession ??
    (await listSessionsForProject(params.projectId, 5)).find((s) => s.status !== 'abandoned') ??
    null;
  const transcript = session ? await loadTranscript(session.id) : [];

  const resolved = await resolveProvider({
    userId: params.userId,
    presetId: params.presetId ?? project.defaultPresetId,
    ephemeralKey: params.ephemeralKey,
    fallbackProvider: 'custom',
    fallbackModelId: 'deepseek-chat',
  });
  const model = buildModel({
    provider: resolved.provider, modelId: resolved.modelId, apiKey: resolved.apiKey,
    baseUrl: resolved.baseUrl, presetBaseUrl: resolved.presetBaseUrl,
  });

  const assets = await listInjectedAssets(params.projectId);
  const generationInput: GenerationInput = {
    projectName: project.name,
    projectDescription: project.description,
    interviewTranscript: transcript,
    baselineAssumptions: template?.baselineAssumptions ?? [],
    injectedAssets: assets.filter((a) => a.contentText).map((a) => ({ name: a.name, content: a.contentText as string })),
    userInstruction: params.instructions ?? undefined,
  };
  if (params.instructions) {
    const current = await getCurrentVersion(doc.id);
    generationInput.currentContent = current?.contentMd;
  }

  const prompt = buildDocumentPrompt(params.documentType, generationInput);
  const isRegen = Boolean(params.instructions);

  const run = await createRun({
    projectId: params.projectId, documentId: doc.id, sessionId: session?.id ?? null,
    kind: params.documentType === 'wireframe' ? 'wireframe_generate' : isRegen ? 'document_regenerate' : 'document_generate',
    provider: resolved.provider, modelId: resolved.modelId, presetId: resolved.presetId, credentialId: resolved.credentialId,
  });
  await setDocumentStatus(doc.id, 'generating');

  const started = Date.now();
  const maxOutputTokens = resolveMaxOutputTokens({
    maxTokens: resolved.maxTokens,
    reasoningEffort: resolved.reasoningEffort,
  });
  const result = streamText({
    model,
    system: prompt.system,
    prompt: prompt.prompt,
    temperature: resolved.temperature,
    maxOutputTokens,
    providerOptions: buildProviderOptions(resolved.provider, resolved.reasoningEffort, maxOutputTokens),
    abortSignal: params.abortSignal,
    onAbort: () => {
      void setDocumentStatus(doc.id, 'failed');
      void markRunAborted(run.id);
    },
    onError: (event) => {
      void setDocumentStatus(doc.id, 'failed');
      void markRunFailed(run.id, 'PROVIDER_ERROR', event.error instanceof Error ? event.error.message : String(event.error));
    },
    onEnd: async (event) => {
      const latency = Date.now() - started;
      try {
        if (event.finishReason === 'error' || event.finishReason === 'interrupted') {
          await setDocumentStatus(doc.id, 'failed');
          await markRunAborted(run.id);
          return;
        }
        // Truncated: the text is a prefix of a document, not a document. Keep
        // no version (a stored prefix would be read as finished work) and mark
        // the run failed so nothing downstream treats it as context.
        if (isTruncated(event.finishReason)) {
          await setDocumentStatus(doc.id, 'failed');
          await markRunFailed(run.id, OUTPUT_TRUNCATED, OUTPUT_TRUNCATED_MESSAGE);
          return;
        }
        const content = event.text;
        if (content.trim().length === 0) {
          await setDocumentStatus(doc.id, 'failed');
          await markRunFailed(run.id, 'PROVIDER_ERROR', 'Empty generation output');
          return;
        }
        if (params.documentType === 'wireframe') {
          await persistWireframeScreens(params.projectId, content);
        }
        await createVersionSnapshot({
          documentId: doc.id,
          contentMd: content,
          source: isRegen ? 'regenerate' : 'initial',
          changeSummary: isRegen ? params.instructions!.slice(0, 200) : null,
          modelUsed: resolved.modelId,
          provider: resolved.provider,
          presetId: resolved.presetId,
          promptTokens: event.usage?.inputTokens ?? null,
          completionTokens: event.usage?.outputTokens ?? null,
          generationMs: latency,
          createdByUserId: params.userId,
        });
        await setDocumentStatus(doc.id, 'ready');
        await markRunSucceeded(run.id, {
          promptTokens: event.usage?.inputTokens ?? null,
          completionTokens: event.usage?.outputTokens ?? null,
          latencyMs: latency,
        });
      } catch (e) {
        await setDocumentStatus(doc.id, 'failed');
        await markRunFailed(run.id, 'INTERNAL_ERROR', e instanceof Error ? e.message : String(e));
      }
    },
  });

  return result;
}

/** Non-streaming convenience for tests and dry runs. */
export async function generateDocumentToString(params: StreamDocumentParams): Promise<string> {
  const result = await streamDocumentGeneration(params);
  return result.text;
}

// ── wireframe extraction (T-307) ─────────────────────────────────────────────

const SCREEN_RE = /<screen\s+name="([^"]+)"\s*>([\s\S]*?)<\/screen>/g;

export function extractScreens(html: string): { name: string; html: string }[] {
  const out: { name: string; html: string }[] = [];
  for (const match of html.matchAll(SCREEN_RE)) {
    const name = (match[1] ?? '').trim();
    const body = (match[2] ?? '').trim();
    if (name.length > 0 && body.length > 0) out.push({ name, html: body });
  }
  return out;
}

export async function persistWireframeScreens(projectId: string, html: string): Promise<number> {
  const screens = extractScreens(html);
  if (screens.length === 0) return 0;
  const { upsertScreen } = await import('@/lib/db/repositories/wireframes');
  for (const screen of screens) {
    await upsertScreen({ projectId, name: screen.name, htmlContent: screen.html });
  }
  return screens.length;
}
