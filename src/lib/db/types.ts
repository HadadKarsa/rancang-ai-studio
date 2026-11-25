/**
 * DB row types (snake_case, as returned by libSQL) and domain objects (camelCase).
 * One mapper per entity. 03_DATABASE §1.2 / T-103.
 */
import type { DocumentType, DocumentStatus, ProjectStatus, InterviewStatus, MessageRole, ProviderId, GenerationKind, GenerationStatus, VersionSource, ShareScope, ShareAccess, Viewport, TemplateCategory, ReasoningEffort } from './enums';

export interface UserRow {
  id: string; email: string; email_verified_at: string | null; name: string | null;
  avatar_url: string | null; role: 'owner' | 'member'; auth_provider: 'local' | 'github' | 'google' | 'email';
  last_seen_at: string | null; created_at: string; updated_at: string;
}
export interface User {
  id: string; email: string; emailVerifiedAt: string | null; name: string | null; avatarUrl: string | null;
  role: 'owner' | 'member'; authProvider: 'local' | 'github' | 'google' | 'email';
  lastSeenAt: string | null; createdAt: string; updatedAt: string;
}
export function mapUser(r: UserRow): User {
  return { id: r.id, email: r.email, emailVerifiedAt: r.email_verified_at, name: r.name, avatarUrl: r.avatar_url, role: r.role, authProvider: r.auth_provider, lastSeenAt: r.last_seen_at, createdAt: r.created_at, updatedAt: r.updated_at };
}

export interface ProjectRow {
  id: string; user_id: string; template_id: string | null; default_preset_id: string | null;
  name: string; slug: string; description: string | null; status: ProjectStatus;
  icon: string | null; accent_color: string; archived_at: string | null; last_opened_at: string | null;
  created_at: string; updated_at: string;
}
export interface Project {
  id: string; userId: string; templateId: string | null; defaultPresetId: string | null;
  name: string; slug: string; description: string | null; status: ProjectStatus;
  icon: string | null; accentColor: string; archivedAt: string | null; lastOpenedAt: string | null;
  createdAt: string; updatedAt: string;
}
export function mapProject(r: ProjectRow): Project {
  return { id: r.id, userId: r.user_id, templateId: r.template_id, defaultPresetId: r.default_preset_id, name: r.name, slug: r.slug, description: r.description, status: r.status, icon: r.icon, accentColor: r.accent_color, archivedAt: r.archived_at, lastOpenedAt: r.last_opened_at, createdAt: r.created_at, updatedAt: r.updated_at };
}

export interface SpecDocumentRow {
  id: string; project_id: string; type: DocumentType; title: string; status: DocumentStatus;
  current_version_id: string | null; order_index: number; is_locked: 0 | 1;
  last_generated_at: string | null; created_at: string; updated_at: string;
}
export interface SpecDocument {
  id: string; projectId: string; type: DocumentType; title: string; status: DocumentStatus;
  currentVersionId: string | null; orderIndex: number; isLocked: boolean;
  lastGeneratedAt: string | null; createdAt: string; updatedAt: string;
}
export function mapSpecDocument(r: SpecDocumentRow): SpecDocument {
  return { id: r.id, projectId: r.project_id, type: r.type, title: r.title, status: r.status, currentVersionId: r.current_version_id, orderIndex: r.order_index, isLocked: r.is_locked === 1, lastGeneratedAt: r.last_generated_at, createdAt: r.created_at, updatedAt: r.updated_at };
}

export interface DocumentVersionRow {
  id: string; document_id: string; version_number: number; content_md: string; content_hash: string;
  source: VersionSource; change_summary: string | null; model_used: string | null; provider: ProviderId | null;
  preset_id: string | null; prompt_tokens: number | null; completion_tokens: number | null;
  generation_ms: number | null; created_by_user_id: string | null; created_at: string;
}
export interface DocumentVersion {
  id: string; documentId: string; versionNumber: number; contentMd: string; contentHash: string;
  source: VersionSource; changeSummary: string | null; modelUsed: string | null; provider: ProviderId | null;
  presetId: string | null; promptTokens: number | null; completionTokens: number | null;
  generationMs: number | null; createdByUserId: string | null; createdAt: string;
}
export function mapDocumentVersion(r: DocumentVersionRow): DocumentVersion {
  return { id: r.id, documentId: r.document_id, versionNumber: r.version_number, contentMd: r.content_md, contentHash: r.content_hash, source: r.source, changeSummary: r.change_summary, modelUsed: r.model_used, provider: r.provider, presetId: r.preset_id, promptTokens: r.prompt_tokens, completionTokens: r.completion_tokens, generationMs: r.generation_ms, createdByUserId: r.created_by_user_id, createdAt: r.created_at };
}

export interface InterviewSessionRow {
  id: string; project_id: string; template_id: string | null; preset_id: string | null;
  status: InterviewStatus; current_step: number; total_steps: number; summary: string | null;
  completed_at: string | null; created_at: string; updated_at: string;
}
export interface InterviewSession {
  id: string; projectId: string; templateId: string | null; presetId: string | null;
  status: InterviewStatus; currentStep: number; totalSteps: number; summary: string | null;
  completedAt: string | null; createdAt: string; updatedAt: string;
}
export function mapInterviewSession(r: InterviewSessionRow): InterviewSession {
  return { id: r.id, projectId: r.project_id, templateId: r.template_id, presetId: r.preset_id, status: r.status, currentStep: r.current_step, totalSteps: r.total_steps, summary: r.summary, completedAt: r.completed_at, createdAt: r.created_at, updatedAt: r.updated_at };
}

export interface InterviewMessageRow {
  id: string; session_id: string; role: MessageRole; content: string;
  question_index: number | null; metadata_json: string | null; token_count: number | null; created_at: string;
}
export interface InterviewMessage {
  id: string; sessionId: string; role: MessageRole; content: string;
  questionIndex: number | null; metadata: Record<string, unknown> | null; tokenCount: number | null; createdAt: string;
}
export function mapInterviewMessage(r: InterviewMessageRow): InterviewMessage {
  return { id: r.id, sessionId: r.session_id, role: r.role, content: r.content, questionIndex: r.question_index, metadata: r.metadata_json ? (JSON.parse(r.metadata_json) as Record<string, unknown>) : null, tokenCount: r.token_count, createdAt: r.created_at };
}

export interface ProviderCredentialRow {
  id: string; user_id: string; provider: ProviderId; label: string;
  encrypted_key_b64: string; key_iv_b64: string; key_tag_b64: string; key_last4: string;
  base_url: string | null; is_active: 0 | 1; is_valid: 0 | 1 | null;
  last_validated_at: string | null; cached_models_json: string | null; created_at: string; updated_at: string;
}
/** Serialized to clients — never contains key material. */
export interface ProviderCredentialPublic {
  id: string; provider: ProviderId; label: string; keyLast4: string;
  baseUrl: string | null; isActive: boolean; isValid: boolean | null;
  lastValidatedAt: string | null; cachedModels: string[]; createdAt: string;
}
export function mapCredentialPublic(r: ProviderCredentialRow): ProviderCredentialPublic {
  return { id: r.id, provider: r.provider, label: r.label, keyLast4: r.key_last4, baseUrl: r.base_url, isActive: r.is_active === 1, isValid: r.is_valid === null ? null : r.is_valid === 1, lastValidatedAt: r.last_validated_at, cachedModels: parseCachedModels(r.cached_models_json), createdAt: r.created_at };
}

/** A malformed or absent cache is an empty list, never a throw — the column is advisory. */
export function parseCachedModels(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((m): m is string => typeof m === 'string') : [];
  } catch {
    return [];
  }
}

export interface LlmPresetRow {
  id: string; user_id: string; name: string; description: string | null; provider: ProviderId;
  credential_id: string | null; model_id: string; base_url: string | null;
  temperature: number; max_tokens: number; top_p: number; system_persona: string | null;
  reasoning_effort: ReasoningEffort | null;
  is_default: 0 | 1; created_at: string; updated_at: string;
}
export interface LlmPreset {
  id: string; userId: string; name: string; description: string | null; provider: ProviderId;
  credentialId: string | null; modelId: string; baseUrl: string | null;
  temperature: number; maxTokens: number; topP: number; systemPersona: string | null;
  reasoningEffort: ReasoningEffort | null;
  isDefault: boolean; createdAt: string; updatedAt: string;
}
export function mapLlmPreset(r: LlmPresetRow): LlmPreset {
  return { id: r.id, userId: r.user_id, name: r.name, description: r.description, provider: r.provider, credentialId: r.credential_id, modelId: r.model_id, baseUrl: r.base_url, temperature: r.temperature, maxTokens: r.max_tokens, topP: r.top_p, systemPersona: r.system_persona, reasoningEffort: r.reasoning_effort ?? null, isDefault: r.is_default === 1, createdAt: r.created_at, updatedAt: r.updated_at };
}

export interface ProjectTemplateRow {
  id: string; slug: string; name: string; description: string; category: TemplateCategory;
  icon: string; accent_color: string; baseline_assumptions_json: string; default_questions_json: string;
  document_hints_json: string | null; is_system: 0 | 1; owner_user_id: string | null;
  usage_count: number; created_at: string; updated_at: string;
}
export interface ProjectTemplate {
  id: string; slug: string; name: string; description: string; category: TemplateCategory;
  icon: string; accentColor: string; baselineAssumptions: string[]; defaultQuestions: string[];
  documentHints: Record<string, string> | null; isSystem: boolean; ownerUserId: string | null;
  usageCount: number; createdAt: string; updatedAt: string;
}
export function mapProjectTemplate(r: ProjectTemplateRow): ProjectTemplate {
  return { id: r.id, slug: r.slug, name: r.name, description: r.description, category: r.category, icon: r.icon, accentColor: r.accent_color, baselineAssumptions: JSON.parse(r.baseline_assumptions_json) as string[], defaultQuestions: JSON.parse(r.default_questions_json) as string[], documentHints: r.document_hints_json ? (JSON.parse(r.document_hints_json) as Record<string, string>) : null, isSystem: r.is_system === 1, ownerUserId: r.owner_user_id, usageCount: r.usage_count, createdAt: r.created_at, updatedAt: r.updated_at };
}

export interface TagRow {
  id: string; user_id: string; name: string; slug: string; color: string; created_at: string;
}
export interface Tag {
  id: string; userId: string; name: string; slug: string; color: string; createdAt: string;
  projectCount?: number;
}
export function mapTag(r: TagRow): Tag {
  return { id: r.id, userId: r.user_id, name: r.name, slug: r.slug, color: r.color, createdAt: r.created_at };
}

export interface ProjectAssetRow {
  id: string; project_id: string; kind: 'file' | 'snippet' | 'url'; name: string;
  mime_type: string | null; size_bytes: number | null; storage_path: string | null;
  content_text: string | null; source_url: string | null;
  inject_into_generation: 0 | 1; created_at: string;
}
export interface ProjectAsset {
  id: string; projectId: string; kind: 'file' | 'snippet' | 'url'; name: string;
  mimeType: string | null; sizeBytes: number | null; storagePath: string | null;
  contentText: string | null; sourceUrl: string | null;
  injectIntoGeneration: boolean; createdAt: string;
}
export function mapProjectAsset(r: ProjectAssetRow): ProjectAsset {
  return { id: r.id, projectId: r.project_id, kind: r.kind, name: r.name, mimeType: r.mime_type, sizeBytes: r.size_bytes, storagePath: r.storage_path, contentText: r.content_text, sourceUrl: r.source_url, injectIntoGeneration: r.inject_into_generation === 1, createdAt: r.created_at };
}

export interface WireframeScreenRow {
  id: string; project_id: string; name: string; slug: string; description: string | null;
  html_content: string; tailwind_config: string | null; viewport: Viewport;
  order_index: number; is_entry: 0 | 1; created_at: string; updated_at: string;
}
export interface WireframeScreen {
  id: string; projectId: string; name: string; slug: string; description: string | null;
  htmlContent: string; tailwindConfig: string | null; viewport: Viewport;
  orderIndex: number; isEntry: boolean; createdAt: string; updatedAt: string;
}
export function mapWireframeScreen(r: WireframeScreenRow): WireframeScreen {
  return { id: r.id, projectId: r.project_id, name: r.name, slug: r.slug, description: r.description, htmlContent: r.html_content, tailwindConfig: r.tailwind_config, viewport: r.viewport, orderIndex: r.order_index, isEntry: r.is_entry === 1, createdAt: r.created_at, updatedAt: r.updated_at };
}

export interface ShareLinkRow {
  id: string; project_id: string; document_id: string | null; slug: string;
  scope: ShareScope; access: ShareAccess; password_hash: string | null; expires_at: string | null;
  max_views: number | null; view_count: number; last_viewed_at: string | null;
  revoked_at: string | null; created_by_user_id: string | null; created_at: string;
}
export interface ShareLink {
  id: string; projectId: string; documentId: string | null; slug: string;
  scope: ShareScope; access: ShareAccess; passwordHash: string | null; expiresAt: string | null;
  maxViews: number | null; viewCount: number; lastViewedAt: string | null;
  revokedAt: string | null; createdByUserId: string | null; createdAt: string;
}
export function mapShareLink(r: ShareLinkRow): ShareLink {
  return { id: r.id, projectId: r.project_id, documentId: r.document_id, slug: r.slug, scope: r.scope, access: r.access, passwordHash: r.password_hash, expiresAt: r.expires_at, maxViews: r.max_views, viewCount: r.view_count, lastViewedAt: r.last_viewed_at, revokedAt: r.revoked_at, createdByUserId: r.created_by_user_id, createdAt: r.created_at };
}

export interface GenerationRunRow {
  id: string; project_id: string; document_id: string | null; session_id: string | null;
  kind: GenerationKind; status: GenerationStatus; provider: string; model_id: string;
  preset_id: string | null; credential_id: string | null; prompt_tokens: number | null;
  completion_tokens: number | null; latency_ms: number | null; cost_usd: number | null;
  error_code: string | null; error_message: string | null; created_at: string; completed_at: string | null;
}
export interface GenerationRun {
  id: string; projectId: string; documentId: string | null; sessionId: string | null;
  kind: GenerationKind; status: GenerationStatus; provider: string; modelId: string;
  presetId: string | null; credentialId: string | null; promptTokens: number | null;
  completionTokens: number | null; latencyMs: number | null; costUsd: number | null;
  errorCode: string | null; errorMessage: string | null; createdAt: string; completedAt: string | null;
}
export function mapGenerationRun(r: GenerationRunRow): GenerationRun {
  return { id: r.id, projectId: r.project_id, documentId: r.document_id, sessionId: r.session_id, kind: r.kind, status: r.status, provider: r.provider, modelId: r.model_id, presetId: r.preset_id, credentialId: r.credential_id, promptTokens: r.prompt_tokens, completionTokens: r.completion_tokens, latencyMs: r.latency_ms, costUsd: r.cost_usd, errorCode: r.error_code, errorMessage: r.error_message, createdAt: r.created_at, completedAt: r.completed_at };
}

export interface IdempotencyKeyRow {
  key: string; user_id: string; endpoint: string; request_hash: string;
  response_code: number; response_body: string; created_at: string; expires_at: string;
}
