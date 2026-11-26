import { describe, expect, it } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { renderZip, renderJson, renderCombinedMarkdown, type ExportBundle } from '@/lib/export/bundle';
import {
  PROJECT_PURPOSE_LABEL, AGENT_USAGE_HINT, buildAgentCompanionInstructions, formatAgentSpecPrompt,
} from '@/lib/export/agentInstructions';
import { DOCUMENT_TYPES } from '@/lib/documents/types';
import type { ProjectPurpose } from '@/lib/db/enums';

/**
 * v0.2.3 export surface: only an `ai_agent` bundle gains the companion
 * instructions; every other purpose — including null — keeps the v0.2.2 zip
 * structure byte for byte.
 */

function bundleWith(purpose: ProjectPurpose | null): ExportBundle {
  return {
    project: {
      id: 'prj_1', name: 'Kasir Warung', slug: 'kasir-warung',
      description: 'Aplikasi kasir sederhana.', status: 'ready', purpose,
    },
    documents: DOCUMENT_TYPES.filter((t) => t !== 'wireframe').map((type, i) => ({
      type, title: `Doc ${type}`, order: i + 1, status: 'ready', versionNumber: 2,
      lastGeneratedAt: '2026-11-26T00:00:00.000Z', contentMd: `# ${type}\n\nisi`,
    })),
    wireframes: [],
    missing: [],
    missingCore: [],
    wireframe: 'absent',
    generatedAt: '2026-11-26T00:00:00.000Z',
  };
}

/** Read the entry names out of a zip produced by our own writer. */
function zipEntryNames(zip: Buffer): string[] {
  const names: string[] = [];
  let i = 0;
  while (i < zip.length - 4) {
    if (zip.readUInt32LE(i) !== 0x04034b50) { i++; continue; }
    const method = zip.readUInt16LE(i + 8);
    const compressedSize = zip.readUInt32LE(i + 18);
    const nameLen = zip.readUInt16LE(i + 26);
    const extraLen = zip.readUInt16LE(i + 28);
    const name = zip.subarray(i + 30, i + 30 + nameLen).toString('utf8');
    names.push(name);
    const dataStart = i + 30 + nameLen + extraLen;
    const data = zip.subarray(dataStart, dataStart + compressedSize);
    if (method === 8) inflateRawSync(data); // throws if the entry is malformed
    i = dataStart + compressedSize;
  }
  return names;
}

describe('agent instruction module', () => {
  it('labels every purpose', () => {
    expect(PROJECT_PURPOSE_LABEL.documentation).toBe('Dokumentasi');
    expect(PROJECT_PURPOSE_LABEL.team).toBe('Implementasi tim');
    expect(PROJECT_PURPOSE_LABEL.ai_agent).toBe('Implementasi dengan AI agent');
  });

  it('builds deterministic instructions naming the project and the reading order', () => {
    const project = { name: 'Kasir Warung', slug: 'kasir-warung', description: 'Kasir untuk warung.', purpose: 'ai_agent' as const };
    const a = buildAgentCompanionInstructions(project, { hasWireframes: false });
    const b = buildAgentCompanionInstructions(project, { hasWireframes: false });

    expect(a).toBe(b);
    expect(a).toContain('Kasir Warung');
    expect(a).toContain('`06_Project_Memory.md`');
    expect(a).toContain('`05_Task_Checklist.md`');
    expect(a).toContain('Gerbang sebelum menulis kode');
    expect(a).not.toContain('07_Wireframes.md');
  });

  it('mentions the wireframes only when they exist', () => {
    const project = { name: 'X', slug: 'x', description: null, purpose: 'ai_agent' as const };
    expect(buildAgentCompanionInstructions(project, { hasWireframes: true })).toContain('07_Wireframes.md');
  });

  it('wraps a single document in the spec tag', () => {
    const out = formatAgentSpecPrompt({ name: 'Kasir', slug: 'kasir' }, 'PRD', 3, '# Isi');
    expect(out).toContain('document="PRD" rev="3"');
    expect(out).toContain('# Isi');
    expect(out.trim().endsWith('</rancang_spec>')).toBe(true);
  });
});

describe('renderZip — purpose gating', () => {
  it('adds AGENT_INSTRUCTIONS.md for an ai_agent bundle', () => {
    const names = zipEntryNames(renderZip(bundleWith('ai_agent')));
    expect(names).toContain('AGENT_INSTRUCTIONS.md');
    expect(names).toContain('README.md');
    expect(names).toContain('01_PRD.md');
  });

  it.each<ProjectPurpose | null>(['documentation', 'team', null])(
    'keeps the v0.2.2 structure for purpose=%s',
    (purpose) => {
      const names = zipEntryNames(renderZip(bundleWith(purpose)));
      expect(names).not.toContain('AGENT_INSTRUCTIONS.md');
      expect(names).toContain('README.md');
      expect(names).toContain('01_PRD.md');
    },
  );
});

describe('renderJson — purpose gating', () => {
  it('includes agentInstructions only for ai_agent', () => {
    const agent = renderJson(bundleWith('ai_agent')) as Record<string, unknown>;
    expect(typeof agent.agentInstructions).toBe('string');
    expect(agent.agentInstructions as string).toContain('Gerbang sebelum menulis kode');

    for (const purpose of ['documentation', 'team', null] as const) {
      const json = renderJson(bundleWith(purpose)) as Record<string, unknown>;
      expect(json.agentInstructions).toBeUndefined();
    }
  });

  it('carries the purpose in the project block', () => {
    const json = renderJson(bundleWith('team')) as { project: { purpose: string } };
    expect(json.project.purpose).toBe('team');
  });
});

describe('renderCombinedMarkdown — purpose line', () => {
  it('prints the purpose label when one is set', () => {
    expect(renderCombinedMarkdown(bundleWith('ai_agent'))).toContain(
      `- **Tujuan:** ${PROJECT_PURPOSE_LABEL.ai_agent}`,
    );
  });

  it('prints no purpose line for a legacy project', () => {
    expect(renderCombinedMarkdown(bundleWith(null))).not.toContain('**Tujuan:**');
  });
});

describe('AGENT_USAGE_HINT', () => {
  it('tells the user what to do with the bundle', () => {
    expect(AGENT_USAGE_HINT).toContain('Lampirkan bundle');
    expect(AGENT_USAGE_HINT).toContain('pertanyaan terbuka');
  });
});
