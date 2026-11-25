import { generateText, streamText, type LanguageModel } from 'ai';
import { buildInterviewPrompt, parseInterviewTurn, buildDocumentPrompt, type GenerationInput, type InterviewTurn } from '@/lib/llm/prompts';
import { buildModel, buildProviderOptions } from '@/lib/llm/registry';
import { resolveProvider, type ResolvedProvider } from '@/lib/llm/credentials';
import { INTERVIEW_MAX_STEPS, INTERVIEW_MIN_STEPS, type DocumentType } from '@/lib/db/enums';
import { appendMessage, completeSession, countUserMessages, getSessionById, listMessages, updateSessionProgress } from '@/lib/db/repositories/interviews';
import { getProjectById } from '@/lib/db/repositories/projects';
import { getTemplateById } from '@/lib/db/repositories/templates';
import { createRun, markRunFailed, markRunSucceeded } from '@/lib/db/repositories/generationRuns';
import { ForbiddenError } from '@/lib/auth/errors';
import { AppError, NotFoundError, ProviderError, ProviderNotConfiguredError, ValidationError } from '@/lib/errors';
import { OUTPUT_TRUNCATED, OUTPUT_TRUNCATED_MESSAGE, isTruncated, isReasoningActive, resolveMaxOutputTokens } from '@/lib/llm/limits';
import { nowIso } from '@/lib/ids';

/**
 * Interview engine (T-305). Warm persona, adaptive 5–8 questions, JSON turns.
 * Every entry point re-checks project ownership.
 */
export async function assertProjectOwnership(userId: string, projectId: string): Promise<void> {
  const project = await getProjectById(projectId, userId);
  if (!project) throw new NotFoundError('Project not found');
}

export async function startInterviewTurn(input: {
  userId: string;
  sessionId: string;
}): Promise<InterviewTurn> {
  const session = await getSessionById(input.sessionId);
  if (!session) throw new NotFoundError('Session not found');
  await assertProjectOwnership(input.userId, session.projectId);
  if (session.status !== 'active') throw new ValidationError('Session is not active');

  const project = await getProjectById(session.projectId, input.userId);
  if (!project) throw new NotFoundError('Project not found');
  const template = session.templateId ? await getTemplateById(session.templateId) : null;

  const resolved = await resolveProvider({
    userId: input.userId,
    presetId: session.presetId ?? project.defaultPresetId,
    fallbackProvider: 'custom',
    fallbackModelId: 'deepseek-chat',
  });
  const model = buildModel({ provider: resolved.provider, modelId: resolved.modelId, apiKey: resolved.apiKey, baseUrl: resolved.baseUrl, presetBaseUrl: resolved.presetBaseUrl });

  const transcript = await listMessages(session.id);
  const userCount = await countUserMessages(session.id);
  const questionIndex = userCount + 1;
  const maxQuestions = Math.max(INTERVIEW_MIN_STEPS, Math.min(session.totalSteps, INTERVIEW_MAX_STEPS));

  const run = await createRun({
    projectId: session.projectId, sessionId: session.id, kind: 'interview_turn',
    provider: resolved.provider, modelId: resolved.modelId, presetId: resolved.presetId, credentialId: resolved.credentialId,
  });

  const started = Date.now();
  try {
    const prompt = buildInterviewPrompt({
      projectName: project.name,
      baselineAssumptions: template?.baselineAssumptions ?? [],
      transcript: transcript.map((m) => ({ role: m.role, content: m.content })),
      questionIndex,
      maxQuestions,
    });
    const result = await generateText({
      model,
      system: prompt.system,
      prompt: prompt.prompt,
      temperature: resolved.temperature,
      // Thinking tokens come out of the same budget as the JSON answer, so a
      // reasoning preset needs headroom or the turn truncates mid-object. A
      // turn without reasoning stays at the flat budget it always had.
      maxOutputTokens: isReasoningActive(resolved.reasoningEffort)
        ? resolveMaxOutputTokens({ maxTokens: resolved.maxTokens, reasoningEffort: resolved.reasoningEffort })
        : 1024,
      providerOptions: buildProviderOptions(resolved.provider, resolved.reasoningEffort),
    });
    // A truncated turn is half a JSON object. Appending it would put a broken
    // question in the transcript that every later document reads as context.
    if (isTruncated(result.finishReason)) {
      await markRunFailed(run.id, OUTPUT_TRUNCATED, OUTPUT_TRUNCATED_MESSAGE);
      throw new ProviderError(OUTPUT_TRUNCATED_MESSAGE);
    }
    const turn = parseInterviewTurn(result.text);
    const latency = Date.now() - started;

    await appendMessage({ sessionId: session.id, role: 'assistant', content: turn.question, questionIndex, metadata: turn.suggestions.length > 0 ? { suggestions: turn.suggestions } : null });
    await updateSessionProgress(session.id, questionIndex, maxQuestions);

    if (turn.isComplete || questionIndex >= maxQuestions) {
      await completeSession(session.id);
    }

    await markRunSucceeded(run.id, {
      promptTokens: result.usage?.inputTokens ?? null,
      completionTokens: result.usage?.outputTokens ?? null,
      latencyMs: latency,
    });
    return turn;
  } catch (e) {
    if (e instanceof AppError) {
      // Already recorded (truncation) or already the right shape for the client.
      throw e;
    }
    await markRunFailed(run.id, 'PROVIDER_ERROR', e instanceof Error ? e.message : String(e));
    if (e instanceof ProviderNotConfiguredError) {
      throw new ProviderNotConfiguredError('Model belum punya API key — atur di halaman Models');
    }
    throw new ProviderError(e instanceof Error ? e.message : 'Interview turn failed');
  }
}

export async function appendUserAnswer(input: { userId: string; sessionId: string; content: string }): Promise<{ questionIndex: number; isComplete: boolean }> {
  const session = await getSessionById(input.sessionId);
  if (!session) throw new NotFoundError('Session not found');
  await assertProjectOwnership(input.userId, session.projectId);
  if (session.status !== 'active') throw new ValidationError('Session is not active');
  if (input.content.trim().length === 0) throw new ValidationError('Answer is empty');

  const message = await appendMessage({ sessionId: session.id, role: 'user', content: input.content.trim() });
  const userCount = await countUserMessages(session.id);
  const isComplete = userCount >= Math.max(INTERVIEW_MIN_STEPS, Math.min(session.totalSteps, INTERVIEW_MAX_STEPS));
  return { questionIndex: userCount, isComplete };
}

export async function finalizeInterview(input: { userId: string; sessionId: string; summary?: string }): Promise<void> {
  const session = await getSessionById(input.sessionId);
  if (!session) throw new NotFoundError('Session not found');
  await assertProjectOwnership(input.userId, session.projectId);
  await completeSession(session.id, input.summary);
}

/** Full transcript in prompt-ready shape (shared by interview + generation). */
export async function loadTranscript(sessionId: string): Promise<GenerationInput['interviewTranscript']> {
  const messages = await listMessages(sessionId);
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

export type { InterviewTurn, GenerationInput, ResolvedProvider, LanguageModel };
