import type { ProjectPurpose } from '@/lib/db/enums';

export type { ProjectPurpose };
export { PROJECT_PURPOSE_LABEL } from '@/lib/export/agentInstructions';

export type DocumentType =
  | 'prd'
  | 'architecture'
  | 'database'
  | 'api'
  | 'tasks'
  | 'memory'
  | 'wireframe';

export type DocStatus = 'pending' | 'generating' | 'ready' | 'failed' | 'stale';

export type WorkspaceMode = 'interview' | 'documents';


export interface WorkspaceProject {
  id: string;
  name: string;
  slug: string;
  status: string;
  accentColor: string;
  description: string | null;
  templateId?: string | null;
  purpose: ProjectPurpose | null;
  updatedAt: string;
}

export interface WorkspaceDoc {
  id: string;
  type: DocumentType;
  title: string;
  status: DocStatus;
  orderIndex: number;
  isLocked?: boolean;
  lastGeneratedAt: string | null;
  currentVersionId: string | null;
}

export const CORE_DOC_ORDER: DocumentType[] = [
  'prd',
  'architecture',
  'database',
  'api',
  'tasks',
  'memory',
];

export const DOC_LABEL: Record<DocumentType, string> = {
  prd: 'PRD',
  architecture: 'Arsitektur',
  database: 'Database',
  api: 'API',
  tasks: 'Tugas',
  memory: 'Memori',
  wireframe: 'Wireframe',
};

export const DOC_SUBTITLE: Record<DocumentType, string> = {
  prd: 'Visi, pengguna, dan lingkup',
  architecture: 'Komponen dan diagram alur',
  database: 'Tabel, relasi, dan ERD',
  api: 'Endpoint, payload, autentikasi',
  tasks: 'Peta jalan pengerjaan',
  memory: 'Konteks untuk agen AI',
  wireframe: 'Layar HTML interaktif',
};

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  pending: 'Belum dibuat',
  generating: 'Sedang ditulis',
  ready: 'Siap',
  failed: 'Gagal',
  stale: 'Perlu diperbarui',
};

export function isValidDocType(value: string | null | undefined): value is DocumentType {
  return Boolean(value && (CORE_DOC_ORDER as readonly string[]).includes(value));
}

export function formatTimeAgo(iso: string | null): string {
  if (!iso) return 'Belum ada';
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}
