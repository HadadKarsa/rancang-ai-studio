import { describe, expect, it } from 'vitest';
import { bindToStoredCredential, normalizeEndpoint, normalizeModelList } from '@/lib/llm/credentialBinding';
import { isReasoningActive, isTruncated, resolveMaxOutputTokens, OUTPUT_TRUNCATED } from '@/lib/llm/limits';

/**
 * Defensive validation only: these are pure functions, so nothing here
 * decrypts a key, opens a socket or reproduces a vulnerability.
 */

describe('bindToStoredCredential', () => {
  const stored = { provider: 'custom' as const, baseUrl: 'https://gw.example.invalid/v1' };

  it('uses the stored provider and endpoint when the request names neither', () => {
    expect(bindToStoredCredential(stored, {})).toEqual({
      ok: true, provider: 'custom', baseUrl: 'https://gw.example.invalid/v1',
    });
  });

  it('accepts a request that agrees with the stored credential', () => {
    const r = bindToStoredCredential(stored, { provider: 'custom', baseUrl: 'https://gw.example.invalid/v1/' });
    expect(r.ok).toBe(true);
  });

  it('rejects a provider that differs from the stored one', () => {
    const r = bindToStoredCredential(stored, { provider: 'openai' });
    expect(r).toEqual({ ok: false, reason: 'Credential belongs to provider custom, not openai' });
  });

  it('rejects a base URL that differs from the stored one', () => {
    const r = bindToStoredCredential(stored, { baseUrl: 'https://attacker.example.invalid/v1' });
    expect(r.ok).toBe(false);
  });

  it('rejects a base URL when the stored credential has none', () => {
    const r = bindToStoredCredential({ provider: 'openai', baseUrl: null }, { baseUrl: 'https://attacker.example.invalid/v1' });
    expect(r.ok).toBe(false);
  });

  it('treats an empty or blank requested base URL as absent, not as a conflict', () => {
    expect(bindToStoredCredential(stored, { baseUrl: '' }).ok).toBe(true);
    expect(bindToStoredCredential(stored, { baseUrl: '   ' }).ok).toBe(true);
  });

  it('rejects before anything could be decrypted or sent (no stored key is consulted)', () => {
    // The function's whole input is the two target descriptions; a rejected
    // call cannot have touched a key because it never receives one.
    const r = bindToStoredCredential(stored, { provider: 'anthropic', baseUrl: 'https://attacker.example.invalid' });
    expect(r.ok).toBe(false);
  });
});

describe('normalizeEndpoint', () => {
  it('ignores case and trailing slashes', () => {
    expect(normalizeEndpoint('HTTPS://GW.Example.Invalid/v1//')).toBe('https://gw.example.invalid/v1');
  });
  it('maps null, undefined and blank to null', () => {
    expect(normalizeEndpoint(null)).toBeNull();
    expect(normalizeEndpoint(undefined)).toBeNull();
    expect(normalizeEndpoint('  ')).toBeNull();
  });
});

describe('normalizeModelList', () => {
  it('trims, strips the models/ prefix, drops empties and duplicates', () => {
    expect(normalizeModelList([
      ' models/gemini-2.0-flash ',
      'gemini-2.0-flash',
      '',
      '   ',
      'gpt-4o',
      'gpt-4o',
    ])).toEqual(['gemini-2.0-flash', 'gpt-4o']);
  });

  it('keeps the provider order', () => {
    expect(normalizeModelList(['b', 'a', 'c'])).toEqual(['b', 'a', 'c']);
  });

  it('ignores non-strings instead of storing them', () => {
    expect(normalizeModelList(['ok', 42, null, { id: 'x' }, undefined])).toEqual(['ok']);
  });

  it('returns an empty list for null or undefined', () => {
    expect(normalizeModelList(null)).toEqual([]);
    expect(normalizeModelList(undefined)).toEqual([]);
  });
});

describe('truncation', () => {
  it('recognises only finishReason length', () => {
    expect(isTruncated('length')).toBe(true);
    for (const other of ['stop', 'tool-calls', 'content-filter', 'error', 'other', 'unknown', null, undefined]) {
      expect(isTruncated(other)).toBe(false);
    }
  });

  it('has a stable code for the run and the error', () => {
    expect(OUTPUT_TRUNCATED).toBe('OUTPUT_TRUNCATED');
  });
});

describe('resolveMaxOutputTokens', () => {
  it('applies the 8192 floor when reasoning is active', () => {
    expect(resolveMaxOutputTokens({ maxTokens: 1024, reasoningEffort: 'low' })).toBe(8192);
    expect(resolveMaxOutputTokens({ maxTokens: 4096, reasoningEffort: 'medium' })).toBe(8192);
    expect(resolveMaxOutputTokens({ maxTokens: 12000, reasoningEffort: 'high' })).toBe(12000);
  });

  it('leaves the budget alone when reasoning is off or unset', () => {
    expect(resolveMaxOutputTokens({ maxTokens: 1024, reasoningEffort: 'none' })).toBe(1024);
    expect(resolveMaxOutputTokens({ maxTokens: 2048, reasoningEffort: null })).toBe(2048);
    expect(resolveMaxOutputTokens({ maxTokens: 2048, reasoningEffort: undefined })).toBe(2048);
  });

  it('agrees with isReasoningActive', () => {
    for (const effort of ['none', 'low', 'medium', 'high', null, undefined] as const) {
      expect(isReasoningActive(effort)).toBe(Boolean(effort) && effort !== 'none');
    }
  });
});
