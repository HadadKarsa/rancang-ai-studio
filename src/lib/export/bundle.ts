import { getProjectById } from '@/lib/db/repositories/projects';
import { listDocuments, listCurrentVersionsForProject } from '@/lib/db/repositories/documents';
import { listScreens } from '@/lib/db/repositories/wireframes';
import { DOCUMENT_META, DOCUMENT_TYPES, type DocumentType } from '@/lib/documents/types';
import type { ProjectPurpose } from '@/lib/db/enums';
import { PROJECT_PURPOSE_LABEL, buildAgentCompanionInstructions, AGENT_USAGE_HINT } from './agentInstructions';
import { NotFoundError, ConflictError } from '@/lib/errors';
import { createZip, type ZipEntry } from './zip';

/**
 * Export bundle (T-410): the generated documents of a project as one markdown
 * file, a zip of one file per document, or JSON.
 *
 * Wireframe is optional by design (generation stops before it), so its absence
 * never blocks an export: the six core documents are what must exist. The 409
 * fires only when a core document is missing, and names which ones. A missing
 * wireframe is recorded as `wireframe: 'absent'` in the JSON and as a line in
 * the zip's README.md.
 */

/** The documents an export requires. Wireframe is not one of them. */
export const CORE_DOCUMENT_TYPES: DocumentType[] = ['prd', 'architecture', 'database', 'api', 'tasks', 'memory'];

export type ExportFormat = 'md' | 'zip' | 'json';

export interface ExportedDocument {
  type: DocumentType;
  title: string;
  order: number;
  status: string;
  versionNumber: number;
  lastGeneratedAt: string | null;
  contentMd: string;
}

export interface ExportBundle {
  project: {
    id: string; name: string; slug: string; description: string | null; status: string;
    /** v0.2.3: null when the user skipped the choice — export stays as v0.2.2. */
    purpose: ProjectPurpose | null;
  };
  documents: ExportedDocument[];
  wireframes: { name: string; slug: string; viewport: string; html: string }[];
  /** Documents scaffolded but never generated, in order — used for the 409 message. */
  missing: DocumentType[];
  /** Core documents that are missing and block the export. Empty when it succeeds. */
  missingCore: DocumentType[];
  /** Whether the optional wireframe document was generated. */
  wireframe: 'present' | 'absent';
  generatedAt: string;
}

/** File name per document inside the zip / used for the combined file. */
const FILE_PREFIX: Record<DocumentType, string> = {
  prd: '01_PRD.md',
  architecture: '02_Architecture.md',
  database: '03_Database.md',
  api: '04_API_Contracts.md',
  tasks: '05_Task_Checklist.md',
  memory: '06_Project_Memory.md',
  wireframe: '07_Wireframes.md',
};

export async function buildExportBundle(userId: string, projectId: string): Promise<ExportBundle> {
  const project = await getProjectById(projectId, userId);
  if (!project) throw new NotFoundError('Project not found');

  const [docs, versions, screens] = await Promise.all([
    listDocuments(projectId),
    listCurrentVersionsForProject(projectId),
    listScreens(projectId),
  ]);

  const documents: ExportedDocument[] = [];
  const missing: DocumentType[] = [];

  for (const type of DOCUMENT_TYPES) {
    const doc = docs.find((d) => d.type === type);
    const version = versions.get(type);
    if (!doc || !version || version.contentMd.trim().length === 0) {
      missing.push(type);
      continue;
    }
    documents.push({
      type,
      title: doc.title || DOCUMENT_META[type].label,
      order: DOCUMENT_META[type].order,
      status: doc.status,
      versionNumber: version.versionNumber,
      lastGeneratedAt: doc.lastGeneratedAt,
      contentMd: version.contentMd,
    });
  }

  // Only the core documents gate the export. A missing wireframe is reported,
  // not fatal: a project with its six documents is a complete spec.
  const missingCore = CORE_DOCUMENT_TYPES.filter((t) => missing.includes(t));
  if (missingCore.length > 0) {
    throw new ConflictError(
      `Dokumen inti belum lengkap: ${missingCore.map((t) => DOCUMENT_META[t].label).join(', ')}. ` +
      'Buat dokumen yang kurang sebelum mengekspor.',
      { missing: missingCore, missingCore, allMissing: missing },
    );
  }

  return {
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      status: project.status,
      purpose: project.purpose,
    },
    documents,
    wireframes: screens.map((s) => ({ name: s.name, slug: s.slug, viewport: s.viewport, html: s.htmlContent })),
    missing,
    missingCore,
    wireframe: missing.includes('wireframe') ? 'absent' : 'present',
    generatedAt: new Date().toISOString(),
  };
}

function isoDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '—';
}

/** One combined markdown file: a front block, a table of contents, then each document. */
export function renderCombinedMarkdown(bundle: ExportBundle): string {
  const { project, documents, wireframes } = bundle;
  const lines: string[] = [];

  lines.push(`# ${project.name}`, '');
  if (project.description) lines.push(`> ${project.description.replace(/\n+/g, ' ')}`, '');
  lines.push(
    `- **Slug:** \`${project.slug}\``,
    `- **Status:** ${project.status}`,
    ...(project.purpose ? [`- **Tujuan:** ${PROJECT_PURPOSE_LABEL[project.purpose]}`] : []),
    `- **Diekspor:** ${bundle.generatedAt}`,
    `- **Dokumen:** ${documents.length} dari ${DOCUMENT_TYPES.length}`,
    `- **Wireframe:** ${bundle.wireframe === 'absent' ? 'belum dibuat (opsional)' : `${wireframes.length} layar`}`,
    '',
  );
  if (bundle.wireframe === 'absent') {
    lines.push(
      '> Wireframe belum dibuat untuk proyek ini. Dokumen inti lengkap; wireframe',
      '> bersifat opsional dan bisa dibuat menyusul dari halaman proyek.',
      '',
    );
  }

  lines.push('## Isi', '');
  for (const doc of documents) {
    const anchor = doc.title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
    lines.push(`${doc.order}. [${doc.title}](#${anchor}) — rev ${doc.versionNumber}, ${isoDate(doc.lastGeneratedAt)}`);
  }
  if (wireframes.length > 0) {
    lines.push(`${DOCUMENT_TYPES.length + 1}. Wireframe screens — ${wireframes.length} layar (lihat ekspor .zip)`);
  }
  lines.push('');

  for (const doc of documents) {
    lines.push('---', '', `# ${doc.title}`, '');
    lines.push(`*rev ${doc.versionNumber} · ${doc.status} · ${isoDate(doc.lastGeneratedAt)}*`, '');
    // Demote headings one level so the document title stays the top of its section.
    lines.push(doc.contentMd.replace(/^(#{1,5})\s/gm, '#$1 ').trim(), '');
  }

  if (wireframes.length > 0) {
    lines.push('---', '', '# Wireframe screens', '');
    for (const screen of wireframes) {
      lines.push(`## ${screen.name}`, '', `- **Slug:** \`${screen.slug}\``, `- **Viewport:** ${screen.viewport}`, '');
      lines.push('HTML lengkap ada di `wireframes/` pada ekspor .zip.', '');
    }
  }

  return lines.join('\n');
}

export function renderZip(bundle: ExportBundle): Buffer {
  const entries: ZipEntry[] = [];
  const { project, documents, wireframes } = bundle;
  const isAgentBundle = project.purpose === 'ai_agent';

  const readme = [
    `# ${project.name}`,
    '',
    project.description ?? '',
    '',
    ...(project.purpose ? [`- **Tujuan:** ${PROJECT_PURPOSE_LABEL[project.purpose]}`] : []),
    `Diekspor ${bundle.generatedAt} dari rancang-ai.`,
    '',
    ...(isAgentBundle
      ? [
          '## Instruksi AI Agent',
          '',
          'Paket ini menyertakan `AGENT_INSTRUCTIONS.md` — instruksi siap tempel untuk AI agent.',
          '',
          AGENT_USAGE_HINT,
          '',
        ]
      : []),
    '## Dokumen',
    '',
    ...documents.map((d) => `- \`${FILE_PREFIX[d.type]}\` — ${d.title} (rev ${d.versionNumber})`),
    ...(wireframes.length > 0
      ? ['', '## Wireframes', '', ...wireframes.map((w) => `- \`wireframes/${w.slug}.html\` — ${w.name} (${w.viewport})`)]
      : ['', '## Wireframes', '', 'Belum dibuat. Wireframe bersifat opsional dan tidak termasuk dalam paket ini.']),
    '',
  ].join('\n');
  entries.push({ name: 'README.md', content: readme });

  // Only an ai_agent bundle carries the companion instructions; every other
  // purpose keeps the v0.2.2 zip structure byte for byte.
  if (isAgentBundle) {
    entries.push({
      name: 'AGENT_INSTRUCTIONS.md',
      content: buildAgentCompanionInstructions(project, { hasWireframes: wireframes.length > 0 }),
    });
  }

  for (const doc of documents) {
    const header = `# ${doc.title}\n\n*rev ${doc.versionNumber} · ${doc.status} · ${isoDate(doc.lastGeneratedAt)}*\n\n`;
    entries.push({ name: FILE_PREFIX[doc.type], content: header + doc.contentMd.trim() + '\n' });
  }

  for (const screen of wireframes) {
    entries.push({ name: `wireframes/${screen.slug}.html`, content: screen.html });
  }

  return createZip(entries);
}

export function renderJson(bundle: ExportBundle): unknown {
  return {
    project: bundle.project,
    generatedAt: bundle.generatedAt,
    ...(bundle.project.purpose === 'ai_agent'
      ? { agentInstructions: buildAgentCompanionInstructions(bundle.project, { hasWireframes: bundle.wireframes.length > 0 }) }
      : {}),
    documents: bundle.documents.map((d) => ({
      type: d.type,
      title: d.title,
      order: d.order,
      status: d.status,
      versionNumber: d.versionNumber,
      lastGeneratedAt: d.lastGeneratedAt,
      contentMd: d.contentMd,
    })),
    wireframes: bundle.wireframes.map((w) => ({ name: w.name, slug: w.slug, viewport: w.viewport, html: w.html })),
    wireframe: bundle.wireframe,
    missing: bundle.missing,
  };
}

/** `Content-Disposition` with an ASCII fallback and the UTF-8 name (RFC 5987). */
export function attachmentHeader(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function exportFilename(bundle: ExportBundle, format: ExportFormat): string {
  const base = bundle.project.slug || 'project';
  if (format === 'zip') return `${base}-spec.zip`;
  if (format === 'json') return `${base}-spec.json`;
  return `${base}-spec.md`;
}

export function isExportFormat(value: string | null): value is ExportFormat {
  return value === 'md' || value === 'zip' || value === 'json';
}