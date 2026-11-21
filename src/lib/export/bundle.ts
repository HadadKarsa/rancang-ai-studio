import { getProjectById } from '@/lib/db/repositories/projects';
import { listDocuments, listCurrentVersionsForProject } from '@/lib/db/repositories/documents';
import { listScreens } from '@/lib/db/repositories/wireframes';
import { DOCUMENT_META, DOCUMENT_TYPES, type DocumentType } from '@/lib/documents/types';
import { NotFoundError, ConflictError } from '@/lib/errors';
import { createZip, type ZipEntry } from './zip';

/**
 * Export bundle (T-410): the seven generated documents of a project as one
 * markdown file, a zip of one file per document, or JSON.
 *
 * Only documents that have a current version are exported. A project whose
 * documents are all still `pending` is a 409 — there is nothing to download yet,
 * and an empty archive would look like a bug rather than an unfinished project.
 */

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
  project: { id: string; name: string; slug: string; description: string | null; status: string };
  documents: ExportedDocument[];
  wireframes: { name: string; slug: string; viewport: string; html: string }[];
  /** Documents scaffolded but never generated, in order — used for the 409 message. */
  missing: DocumentType[];
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

  if (documents.length === 0) {
    throw new ConflictError(
      'Dokumen belum dibuat. Jalankan wawancara lalu buat dokumen sebelum mengekspor.',
      { missing },
    );
  }

  return {
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      status: project.status,
    },
    documents,
    wireframes: screens.map((s) => ({ name: s.name, slug: s.slug, viewport: s.viewport, html: s.htmlContent })),
    missing,
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
    `- **Diekspor:** ${bundle.generatedAt}`,
    `- **Dokumen:** ${documents.length} dari ${DOCUMENT_TYPES.length}`,
    '',
  );

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

  const readme = [
    `# ${project.name}`,
    '',
    project.description ?? '',
    '',
    `Diekspor ${bundle.generatedAt} dari rancang-ai.`,
    '',
    '## Dokumen',
    '',
    ...documents.map((d) => `- \`${FILE_PREFIX[d.type]}\` — ${d.title} (rev ${d.versionNumber})`),
    ...(wireframes.length > 0 ? ['', `## Wireframes`, '', ...wireframes.map((w) => `- \`wireframes/${w.slug}.html\` — ${w.name} (${w.viewport})`)] : []),
    '',
  ].join('\n');
  entries.push({ name: 'README.md', content: readme });

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