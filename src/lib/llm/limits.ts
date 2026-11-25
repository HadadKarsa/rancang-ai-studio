import type { ReasoningEffort } from '@/lib/db/enums';

/**
 * A generation that stopped because it ran out of output budget is not a
 * finished document. The provider says so with `finishReason: 'length'`; the
 * text it produced is a prefix, so it must never be stored as `ready` and never
 * fed to the next document in a batch as if it were complete.
 */
export const OUTPUT_TRUNCATED = 'OUTPUT_TRUNCATED';

export const OUTPUT_TRUNCATED_MESSAGE =
  'Model output hit the token budget and was truncated; the document was not saved';

export function isTruncated(finishReason: string | null | undefined): boolean {
  return finishReason === 'length';
}

/**
 * Output budget for a call. Thinking tokens come out of the same budget as the
 * answer, so a reasoning preset needs the agreed floor or the answer truncates
 * mid-document. `none` and null leave the preset's own maxTokens alone.
 */
export const REASONING_MIN_OUTPUT_TOKENS = 8192;

/** True when the preset asks the provider to think before answering. */
export function isReasoningActive(reasoningEffort: ReasoningEffort | null | undefined): boolean {
  return Boolean(reasoningEffort) && reasoningEffort !== 'none';
}

export function resolveMaxOutputTokens(input: {
  maxTokens: number;
  reasoningEffort: ReasoningEffort | null | undefined;
}): number {
  return isReasoningActive(input.reasoningEffort)
    ? Math.max(REASONING_MIN_OUTPUT_TOKENS, input.maxTokens)
    : input.maxTokens;
}
