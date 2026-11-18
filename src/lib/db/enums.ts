/** Enum values declared once; reused by DDL CHECKs and TS types (03_DATABASE §4). */

export type ProviderId = 'openai' | 'anthropic' | 'google' | 'groq' | 'openrouter' | 'ollama' | 'custom';
export const PROVIDERS: readonly ProviderId[] = ['openai', 'anthropic', 'google', 'groq', 'openrouter', 'ollama', 'custom'];

/**
 * Document type — 04_API short forms (adjudication #1). The client contract and URL
 * params speak these; the DB CHECK matches them.
 */
export type DocumentType = 'prd' | 'architecture' | 'database' | 'api' | 'tasks' | 'memory' | 'wireframe';
export const DOCUMENT_TYPES: readonly DocumentType[] = ['prd', 'architecture', 'database', 'api', 'tasks', 'memory', 'wireframe'];

/** Document status — five values per 03_DATABASE (adjudication #2). `empty` maps to `pending` at the API edge. */
export type DocumentStatus = 'pending' | 'generating' | 'ready' | 'failed' | 'stale';
export const DOCUMENT_STATUSES: readonly DocumentStatus[] = ['pending', 'generating', 'ready', 'failed', 'stale'];

export type ProjectStatus = 'draft' | 'interviewing' | 'generating' | 'ready' | 'archived';
export const PROJECT_STATUSES: readonly ProjectStatus[] = ['draft', 'interviewing', 'generating', 'ready', 'archived'];

export type InterviewStatus = 'active' | 'completed' | 'abandoned';
export type MessageRole = 'assistant' | 'user' | 'system';
export type VersionSource = 'initial' | 'regenerate' | 'manual_edit' | 'restore';
export type ShareScope = 'project' | 'document' | 'wireframe';
export type ShareAccess = 'public' | 'password';
export type Viewport = 'mobile' | 'tablet' | 'desktop';
export type TemplateCategory = 'saas' | 'marketplace' | 'ai' | 'internal' | 'content' | 'other';
export type GenerationKind = 'interview_turn' | 'document_generate' | 'document_regenerate' | 'wireframe_generate';
export type GenerationStatus = 'queued' | 'streaming' | 'succeeded' | 'failed' | 'aborted';

export const DEFAULT_ACCENT_COLOR = '#6366f1';
export const INTERVIEW_MIN_STEPS = 5;
export const INTERVIEW_MAX_STEPS = 8;
