/**
 * Document type registry (T-304) — 04_API short forms (adjudication #1).
 */
export const DOCUMENT_TYPES = ['prd', 'architecture', 'database', 'api', 'tasks', 'memory', 'wireframe'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_META: Record<DocumentType, { label: string; icon: string; description: string; order: number }> = {
  prd: { label: 'Product Requirements', icon: 'FileText', description: 'Vision, personas, features, success metrics', order: 1 },
  architecture: { label: 'System Architecture', icon: 'Network', description: 'Components, flows, Mermaid diagrams', order: 2 },
  database: { label: 'Database Schema', icon: 'Database', description: 'Tables, relations, ERD', order: 3 },
  api: { label: 'API Contracts', icon: 'Plug', description: 'Endpoints, payloads, auth', order: 4 },
  tasks: { label: 'Task Checklist', icon: 'ListChecks', description: 'Phased build roadmap', order: 5 },
  memory: { label: 'Project Memory', icon: 'Brain', description: 'Context pack for AI agents', order: 6 },
  wireframe: { label: 'Wireframe Sandbox', icon: 'Layout', description: 'Interactive HTML screens', order: 7 },
};

export function isDocumentType(value: string): value is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value);
}
