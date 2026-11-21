import { assertProjectOwnership, loadTranscript } from './interview';
import { resolveProvider } from '@/lib/llm/credentials';
import { buildModel } from '@/lib/llm/registry';
import { generateText } from 'ai';
import { getProjectById } from '@/lib/db/repositories/projects';
import { getDocumentByType, getCurrentVersion } from '@/lib/db/repositories/documents';
import { getTemplateById } from '@/lib/db/repositories/templates';
import { listInjectedAssets } from '@/lib/db/repositories/assets';
import { buildDocumentPrompt } from '@/lib/llm/prompts';
import { NotFoundError, ProviderError } from '@/lib/errors';
import type { DocumentType } from '@/lib/db/enums';

/**
 * Batch generation orchestrator (T-308): generate all 7 documents sequentially,
 * respecting dependencies. Wireframe last (it reads everything else).
 * Runs in the background from the API route; progress lands in generation_runs.
 */
export const GENERATION_ORDER: DocumentType[] = ['prd', 'architecture', 'database', 'api', 'tasks', 'memory', 'wireframe'];

export interface BatchOptions {
  userId: string;
  projectId: string;
  presetId?: string | null;
  ephemeralKey?: string;
  /** Stop after N documents (used by tests). */
  limit?: number;
  /** Skip wireframe (interactive-only flow). */
  skipWireframe?: boolean;
}

export interface BatchResult {
  generated: DocumentType[];
  failed: { type: DocumentType; error: string }[];
  skipped: DocumentType[];
}

export async function generateAllDocuments(opts: BatchOptions): Promise<BatchResult> {
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

  const result: BatchResult = { generated: [], failed: [], skipped: [] };
  const order = opts.skipWireframe ? GENERATION_ORDER.filter((t) => t !== 'wireframe') : GENERATION_ORDER;
  const selected = opts.limit ? order.slice(0, opts.limit) : order;

  for (const type of selected) {
    const doc = await getDocumentByType(opts.projectId, type);
    if (!doc) { result.skipped.push(type); continue; }
    if (doc.isLocked) { result.skipped.push(type); continue; }

    // Feed previously generated docs as context (dependency chain).
    const priorContext: { name: string; content: string }[] = [];
    for (const prior of result.generated) {
      const version = await getCurrentVersion((await getDocumentByType(opts.projectId, prior))!.id);
      if (version) priorContext.push({ name: prior, content: version.contentMd.slice(0, 12_000) });
    }

    const prompt = buildDocumentPrompt(type, {
      projectName: project.name,
      projectDescription: project.description,
      interviewTranscript: await loadTranscriptForProject(opts.projectId),
      baselineAssumptions: template?.baselineAssumptions ?? [],
      injectedAssets: [
        ...assets.filter((a) => a.contentText).map((a) => ({ name: a.name, content: a.contentText as string })),
        ...priorContext,
      ],
    });

    const started = Date.now();
    // Mark it in flight so a polling UI sees which document is being written.
    const { setDocumentStatus: setStatus } = await import('@/lib/db/repositories/documents');
    await setStatus(doc.id, 'generating');
    try {
      const res = await generateText({
        model, system: prompt.system, prompt: prompt.prompt,
        temperature: resolved.temperature, maxOutputTokens: resolved.maxTokens,
      });
      const { createVersionSnapshot, setDocumentStatus } = await import('@/lib/db/repositories/documents');
      const { createRun, markRunSucceeded } = await import('@/lib/db/repositories/generationRuns');
      const run = await createRun({
        projectId: opts.projectId, documentId: doc.id,
        kind: type === 'wireframe' ? 'wireframe_generate' : 'document_generate',
        provider: resolved.provider, modelId: resolved.modelId, presetId: resolved.presetId, credentialId: resolved.credentialId,
      });
      if (type === 'wireframe') {
        const { extractScreens, persistWireframeScreens } = await import('./generation');
        await persistWireframeScreens(opts.projectId, res.text);
      }
      await createVersionSnapshot({
        documentId: doc.id, contentMd: res.text, source: 'initial',
        modelUsed: resolved.modelId, provider: resolved.provider, presetId: resolved.presetId,
        promptTokens: res.usage?.inputTokens ?? null, completionTokens: res.usage?.outputTokens ?? null,
        generationMs: Date.now() - started, createdByUserId: opts.userId,
      });
      await setDocumentStatus(doc.id, 'ready');
      await markRunSucceeded(run.id, {
        promptTokens: res.usage?.inputTokens ?? null, completionTokens: res.usage?.outputTokens ?? null,
        latencyMs: Date.now() - started,
      });
      result.generated.push(type);
    } catch (e) {
      const { setDocumentStatus } = await import('@/lib/db/repositories/documents');
      const { createRun, markRunFailed } = await import('@/lib/db/repositories/generationRuns');
      const run = await createRun({
        projectId: opts.projectId, documentId: doc.id, kind: 'document_generate',
        provider: resolved.provider, modelId: resolved.modelId, presetId: resolved.presetId, credentialId: resolved.credentialId,
      });
      await markRunFailed(run.id, 'PROVIDER_ERROR', e instanceof Error ? e.message : String(e));
      await setDocumentStatus(doc.id, 'failed');
      result.failed.push({ type, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return result;
}

async function loadTranscriptForProject(projectId: string) {
  const { getActiveSessionForProject } = await import('@/lib/db/repositories/interviews');
  const session = await getActiveSessionForProject(projectId);
  return session ? loadTranscript(session.id) : [];
}


