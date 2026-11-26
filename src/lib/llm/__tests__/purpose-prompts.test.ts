import { describe, expect, it } from 'vitest';
import { buildInterviewPrompt, buildDocumentPrompt, PURPOSE_DIRECTIVE } from '@/lib/llm/prompts';
import type { GenerationInput } from '@/lib/llm/prompts';
import { PROJECT_PURPOSES } from '@/lib/db/enums';

/**
 * v0.2.3: the purpose reaches both prompt builders, and a project without one
 * produces exactly the v0.2.2 prompt (no stray section, no empty label).
 */

const baseInput: GenerationInput = {
  projectName: 'Kasir Warung',
  projectDescription: 'Aplikasi kasir sederhana untuk warung makan.',
  interviewTranscript: [
    { role: 'assistant', content: 'Siapa penggunanya?' },
    { role: 'user', content: 'Pemilik warung dan satu kasir.' },
  ],
  baselineAssumptions: ['Mobile-first'],
  injectedAssets: [],
};

/** The document-specific instruction is everything after the shared context block. */
function instructionPart(prompt: string): string {
  const marker = 'INJECTED CONTEXT (user assets):';
  const at = prompt.indexOf(marker);
  if (at === -1) return prompt;
  const afterAssets = prompt.indexOf('\n\n', at);
  return afterAssets === -1 ? '' : prompt.slice(afterAssets);
}

describe('buildDocumentPrompt — purpose threading', () => {
  it('emits no purpose section when the purpose is null or absent', () => {
    const withoutField = buildDocumentPrompt('prd', baseInput);
    const withNull = buildDocumentPrompt('prd', { ...baseInput, projectPurpose: null });

    expect(withoutField.prompt).not.toContain('TARGET PURPOSE');
    expect(withNull.prompt).toBe(withoutField.prompt);
  });

  it('names the purpose and its writing emphasis for each valid value', () => {
    for (const purpose of PROJECT_PURPOSES) {
      const { prompt } = buildDocumentPrompt('prd', { ...baseInput, projectPurpose: purpose });
      expect(prompt).toContain('TARGET PURPOSE');
      expect(prompt).toContain(PURPOSE_DIRECTIVE[purpose].label);
      expect(prompt).toContain(PURPOSE_DIRECTIVE[purpose].writingEmphasis.slice(0, 40));
    }
  });

  it('keeps the project description in the context block', () => {
    const { prompt } = buildDocumentPrompt('prd', { ...baseInput, projectPurpose: 'team' });
    expect(prompt).toContain('Aplikasi kasir sederhana untuk warung makan.');
  });

  it('leaves the document instruction and system prompt untouched', () => {
    const plain = buildDocumentPrompt('architecture', baseInput);
    const withPurpose = buildDocumentPrompt('architecture', { ...baseInput, projectPurpose: 'ai_agent' });

    expect(withPurpose.system).toBe(plain.system);
    expect(instructionPart(withPurpose.prompt)).toBe(instructionPart(plain.prompt));
    expect(instructionPart(withPurpose.prompt).length).toBeGreaterThan(50);
  });
});

describe('buildInterviewPrompt — purpose threading', () => {
  const base = {
    projectName: 'Kasir Warung',
    baselineAssumptions: ['Mobile-first'],
    transcript: baseInput.interviewTranscript,
    questionIndex: 2,
    maxQuestions: 8,
  };

  it('adds no purpose guidance when the purpose is null', () => {
    const { system, prompt } = buildInterviewPrompt({ ...base, projectPurpose: null });
    expect(system).not.toContain('PURPOSE GUIDANCE');
    expect(prompt).not.toContain('DESCRIPTION:');
  });

  it('passes the project detail into the interview prompt', () => {
    const { prompt } = buildInterviewPrompt({
      ...base, projectDescription: 'Aplikasi kasir sederhana untuk warung makan.',
    });
    expect(prompt).toContain('DESCRIPTION: Aplikasi kasir sederhana untuk warung makan.');
  });

  it('steers the questions by purpose', () => {
    for (const purpose of PROJECT_PURPOSES) {
      const { system } = buildInterviewPrompt({ ...base, projectPurpose: purpose });
      expect(system).toContain('PURPOSE GUIDANCE');
      expect(system).toContain(PURPOSE_DIRECTIVE[purpose].interviewFocus);
    }
  });

  it('keeps the strict-JSON contract in the system prompt', () => {
    const { system } = buildInterviewPrompt({ ...base, projectPurpose: 'ai_agent' });
    expect(system).toContain('STRICT JSON');
    expect(system).toContain('"isComplete"');
  });
});
