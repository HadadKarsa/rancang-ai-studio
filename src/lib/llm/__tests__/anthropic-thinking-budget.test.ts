import { describe, expect, it } from 'vitest';
import {
  ANTHROPIC_MIN_THINKING_BUDGET,
  anthropicThinkingBudget,
  buildProviderOptions,
} from '@/lib/llm/registry';
import type { ReasoningEffort } from '@/lib/db/enums';

/**
 * Anthropic rejects a thinking budget below 1024 and a budget that is not
 * strictly below max_tokens, because thinking and the answer are billed against
 * the same output limit. These are pure functions: no key, no socket.
 */

const LEVELS = [
  ['low', 1024],
  ['medium', 4096],
  ['high', 6144],
] as const satisfies ReadonlyArray<readonly [ReasoningEffort, number]>;

describe('anthropicThinkingBudget at an 8192 output limit', () => {
  it('uses the level budget and keeps it below the limit', () => {
    for (const [effort, expected] of LEVELS) {
      const budget = anthropicThinkingBudget(effort, 8192);
      expect(budget).toBe(expected);
      expect(budget!).toBeLessThan(8192);
    }
  });

  it('disables thinking for none', () => {
    expect(anthropicThinkingBudget('none', 8192)).toBeNull();
  });
});

describe('anthropicThinkingBudget at a 2048 output limit', () => {
  it('caps low at its own 1024', () => {
    expect(anthropicThinkingBudget('low', 2048)).toBe(1024);
  });

  it('caps medium and high one token under the limit', () => {
    expect(anthropicThinkingBudget('medium', 2048)).toBe(2047);
    expect(anthropicThinkingBudget('high', 2048)).toBe(2047);
  });

  it('never returns a budget at or above the limit', () => {
    for (const [effort] of LEVELS) {
      expect(anthropicThinkingBudget(effort, 2048)!).toBeLessThan(2048);
    }
  });
});

describe('anthropicThinkingBudget at a limit too small to think', () => {
  it('disables thinking at the exact 1024 boundary', () => {
    // A 1024 limit cannot hold a 1024 budget and still leave room for an answer.
    for (const [effort] of LEVELS) {
      expect(anthropicThinkingBudget(effort, 1024)).toBeNull();
    }
  });

  it('enables the minimum budget at 1025, the smallest limit that can', () => {
    // budget < max_tokens and budget >= 1024, so 1025 is the first limit that works.
    for (const [effort] of LEVELS) {
      expect(anthropicThinkingBudget(effort, 1025)).toBe(1024);
      expect(anthropicThinkingBudget(effort, 1025)!).toBeLessThan(1025);
    }
  });

  it('caps the larger levels just under a small limit', () => {
    expect(anthropicThinkingBudget('low', 1026)).toBe(1024);
    expect(anthropicThinkingBudget('medium', 1026)).toBe(1025);
    expect(anthropicThinkingBudget('high', 1026)).toBe(1025);
  });

  it('keeps none as the level off switch regardless of size', () => {
    expect(anthropicThinkingBudget('none', 1024)).toBeNull();
    expect(anthropicThinkingBudget('none', 8192)).toBeNull();
  });

  it('exports the API minimum', () => {
    expect(ANTHROPIC_MIN_THINKING_BUDGET).toBe(1024);
  });
});

describe('buildProviderOptions threads the resolved output limit', () => {
  it('maps every level at 8192', () => {
    expect(buildProviderOptions('anthropic', 'none', 8192))
      .toEqual({ anthropic: { thinking: { type: 'disabled' } } });
    for (const [effort, expected] of LEVELS) {
      expect(buildProviderOptions('anthropic', effort, 8192))
        .toEqual({ anthropic: { thinking: { type: 'enabled', budgetTokens: expected } } });
    }
  });

  it('caps medium and high at 2048', () => {
    expect(buildProviderOptions('anthropic', 'low', 2048))
      .toEqual({ anthropic: { thinking: { type: 'enabled', budgetTokens: 1024 } } });
    for (const effort of ['medium', 'high'] as const) {
      expect(buildProviderOptions('anthropic', effort, 2048))
        .toEqual({ anthropic: { thinking: { type: 'enabled', budgetTokens: 2047 } } });
    }
  });

  it('sends disabled rather than an invalid budget when the limit is too small', () => {
    for (const effort of ['low', 'medium', 'high'] as const) {
      expect(buildProviderOptions('anthropic', effort, 1024))
        .toEqual({ anthropic: { thinking: { type: 'disabled' } } });
    }
  });

  it('leaves the other providers untouched by the limit', () => {
    expect(buildProviderOptions('openai', 'medium', 1024)).toEqual({ openai: { reasoningEffort: 'medium' } });
    expect(buildProviderOptions('google', 'high', 1024))
      .toEqual({ google: { thinkingConfig: { thinkingLevel: 'high' } } });
    expect(buildProviderOptions('openai', null, 1024)).toBeUndefined();
  });
});
