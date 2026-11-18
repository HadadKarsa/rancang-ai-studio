-- rancang-ai — initial schema (v1.0 MVP)
-- Canonical source: 03_DATABASE.md (DDL authority), with the 12 adjudicated edits from
-- the 2026-11-18 backend readiness review applied:
--   #1  document type enum uses the 04_API short forms (prd, architecture, database, api, tasks, memory, wireframe)
--   #2  document status enum keeps the five 03_DATABASE values (pending/generating/ready/failed/stale)
--   #3  credentials table is provider_credentials (AES-GCM iv/tag split columns)
--   #4  generation tracking table is generation_runs (kind/provider/model/tokens/latency/cost)
--   #5  tags belong to users; project_tags is the join table
--   #6  share slug is nanoid(16)
--   #7  idempotency_keys table added (04_API §2.7)
--   #8  spec_documents.is_locked added (04_API lock endpoints)
--   #9  interview routes are project-scoped per 04_API §3.6 (no schema impact; noted here for traceability)
--   #10 API versioning is /api/v1 (no schema impact)
--   #11 project_snapshots dropped from v1 (no API endpoints reference it)
--   #12 spec_documents carries no content_md — content lives only in document_versions (pointer-only)
--
-- Portability rules (03_DATABASE §1.4): no AUTOINCREMENT, no WITHOUT ROWID, no STRICT.
-- All IDs are app-generated nanoid(21) TEXT PKs; timestamps are ISO-8601 UTC TEXT.

PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────────────────────────────
-- Auth & users
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  email_verified_at TEXT,
  name              TEXT,
  avatar_url        TEXT,
  role              TEXT NOT NULL DEFAULT 'owner'
                    CHECK (role IN ('owner','member')),
  auth_provider     TEXT NOT NULL DEFAULT 'local'
                    CHECK (auth_provider IN ('local','github','google','email')),
  last_seen_at      TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX idx_users_last_seen ON users (last_seen_at DESC);

CREATE TABLE accounts (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                TEXT NOT NULL,
  provider            TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token       TEXT,
  access_token        TEXT,
  expires_at          INTEGER,
  token_type          TEXT,
  scope               TEXT,
  id_token            TEXT,
  session_state       TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE UNIQUE INDEX uq_accounts_provider_account ON accounts (provider, provider_account_id);
CREATE INDEX idx_accounts_user ON accounts (user_id);

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  session_token TEXT NOT NULL UNIQUE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at    TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

CREATE TABLE verification_tokens (
  identifier TEXT NOT NULL,
  token      TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (identifier, token)
);
CREATE INDEX idx_verification_identifier ON verification_tokens (identifier);

CREATE TABLE user_settings (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  theme                TEXT NOT NULL DEFAULT 'system'
                       CHECK (theme IN ('light','dark','system')),
  default_preset_id    TEXT REFERENCES llm_presets(id) ON DELETE SET NULL,
  save_keys_to_disk    INTEGER NOT NULL DEFAULT 1 CHECK (save_keys_to_disk IN (0,1)),
  editor_font_size     INTEGER NOT NULL DEFAULT 14,
  sidebar_collapsed    INTEGER NOT NULL DEFAULT 0 CHECK (sidebar_collapsed IN (0,1)),
  onboarding_completed INTEGER NOT NULL DEFAULT 0 CHECK (onboarding_completed IN (0,1)),
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Providers & presets (BYOK)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE provider_credentials (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL
                    CHECK (provider IN ('openai','anthropic','google','groq','openrouter','ollama','custom')),
  label             TEXT NOT NULL,
  encrypted_key_b64 TEXT NOT NULL,
  key_iv_b64        TEXT NOT NULL,
  key_tag_b64       TEXT NOT NULL,
  key_last4         TEXT NOT NULL,
  base_url          TEXT,
  is_active         INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  is_valid          INTEGER CHECK (is_valid IN (0,1)),
  last_validated_at TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE UNIQUE INDEX uq_provider_credentials_user_provider_label
  ON provider_credentials (user_id, provider, label);
CREATE INDEX idx_provider_credentials_user_active
  ON provider_credentials (user_id, is_active);

CREATE TABLE llm_presets (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  provider       TEXT NOT NULL
                 CHECK (provider IN ('openai','anthropic','google','groq','openrouter','ollama','custom')),
  credential_id  TEXT REFERENCES provider_credentials(id) ON DELETE SET NULL,
  model_id       TEXT NOT NULL,
  base_url       TEXT,
  temperature    REAL NOT NULL DEFAULT 0.7 CHECK (temperature BETWEEN 0 AND 2),
  max_tokens     INTEGER NOT NULL DEFAULT 8192,
  top_p          REAL NOT NULL DEFAULT 1.0 CHECK (top_p BETWEEN 0 AND 1),
  system_persona TEXT,
  is_default     INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_llm_presets_user ON llm_presets (user_id);
CREATE UNIQUE INDEX uq_llm_presets_user_default ON llm_presets (user_id) WHERE is_default = 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- Templates, tags, projects
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE project_templates (
  id                       TEXT PRIMARY KEY,
  slug                     TEXT NOT NULL UNIQUE,
  name                     TEXT NOT NULL,
  description              TEXT NOT NULL,
  category                 TEXT NOT NULL
                           CHECK (category IN ('saas','marketplace','ai','internal','content','other')),
  icon                     TEXT NOT NULL,
  accent_color             TEXT NOT NULL DEFAULT '#6366f1',
  baseline_assumptions_json TEXT NOT NULL CHECK (json_valid(baseline_assumptions_json)),
  default_questions_json   TEXT NOT NULL CHECK (json_valid(default_questions_json)),
  document_hints_json      TEXT CHECK (document_hints_json IS NULL OR json_valid(document_hints_json)),
  is_system                INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)),
  owner_user_id            TEXT REFERENCES users(id) ON DELETE CASCADE,
  usage_count              INTEGER NOT NULL DEFAULT 0,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);
CREATE INDEX idx_project_templates_category ON project_templates (category, is_system);
CREATE INDEX idx_project_templates_owner ON project_templates (owner_user_id);

CREATE TABLE tags (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#94a3b8',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX uq_tags_user_slug ON tags (user_id, slug);
CREATE INDEX idx_tags_user ON tags (user_id);

CREATE TABLE projects (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id       TEXT REFERENCES project_templates(id) ON DELETE SET NULL,
  default_preset_id TEXT REFERENCES llm_presets(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL,
  description       TEXT,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','interviewing','generating','ready','archived')),
  icon              TEXT,
  accent_color      TEXT NOT NULL DEFAULT '#6366f1',
  archived_at       TEXT,
  last_opened_at    TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE UNIQUE INDEX uq_projects_user_slug ON projects (user_id, slug);
CREATE INDEX idx_projects_user_status ON projects (user_id, status);
CREATE INDEX idx_projects_user_last_opened ON projects (user_id, last_opened_at DESC);
CREATE INDEX idx_projects_template ON projects (template_id);

CREATE TABLE project_tags (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, tag_id)
);
CREATE INDEX idx_project_tags_tag ON project_tags (tag_id);

CREATE TABLE project_assets (
  id                     TEXT PRIMARY KEY,
  project_id             TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind                   TEXT NOT NULL CHECK (kind IN ('file','snippet','url')),
  name                   TEXT NOT NULL,
  mime_type              TEXT,
  size_bytes             INTEGER,
  storage_path           TEXT,
  content_text           TEXT,
  source_url             TEXT,
  inject_into_generation INTEGER NOT NULL DEFAULT 1 CHECK (inject_into_generation IN (0,1)),
  created_at             TEXT NOT NULL
);
CREATE INDEX idx_project_assets_project ON project_assets (project_id, kind);

-- ─────────────────────────────────────────────────────────────────────────────
-- Interview
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE interview_sessions (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_id  TEXT REFERENCES project_templates(id) ON DELETE SET NULL,
  preset_id    TEXT REFERENCES llm_presets(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','completed','abandoned')),
  current_step INTEGER NOT NULL DEFAULT 1,
  total_steps  INTEGER NOT NULL DEFAULT 8,
  summary      TEXT,
  completed_at TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_interview_sessions_project ON interview_sessions (project_id, status);
CREATE INDEX idx_interview_sessions_active ON interview_sessions (status, updated_at DESC);

CREATE TABLE interview_messages (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  role           TEXT NOT NULL CHECK (role IN ('assistant','user','system')),
  content        TEXT NOT NULL,
  question_index INTEGER,
  metadata_json  TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
  token_count    INTEGER,
  created_at     TEXT NOT NULL
);
CREATE INDEX idx_interview_messages_session ON interview_messages (session_id, created_at);
CREATE INDEX idx_interview_messages_question ON interview_messages (session_id, question_index);

-- ─────────────────────────────────────────────────────────────────────────────
-- Spec documents & versions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE spec_documents (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type               TEXT NOT NULL
                     CHECK (type IN ('prd','architecture','database','api','tasks','memory','wireframe')),
  title              TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','generating','ready','failed','stale')),
  current_version_id TEXT,
  order_index        INTEGER NOT NULL,
  is_locked          INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0,1)),
  last_generated_at  TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE UNIQUE INDEX uq_spec_documents_project_type ON spec_documents (project_id, type);
CREATE INDEX idx_spec_documents_project ON spec_documents (project_id, order_index);
CREATE INDEX idx_spec_documents_status ON spec_documents (status);

CREATE TABLE document_versions (
  id                 TEXT PRIMARY KEY,
  document_id        TEXT NOT NULL REFERENCES spec_documents(id) ON DELETE CASCADE,
  version_number     INTEGER NOT NULL CHECK (version_number > 0),
  content_md         TEXT NOT NULL,
  content_hash       TEXT NOT NULL,
  source             TEXT NOT NULL CHECK (source IN ('initial','regenerate','manual_edit','restore')),
  change_summary     TEXT,
  model_used         TEXT,
  provider           TEXT,
  preset_id          TEXT REFERENCES llm_presets(id) ON DELETE SET NULL,
  prompt_tokens      INTEGER,
  completion_tokens  INTEGER,
  generation_ms      INTEGER,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL
);
CREATE UNIQUE INDEX uq_document_versions_doc_number ON document_versions (document_id, version_number);
CREATE INDEX idx_document_versions_doc_created ON document_versions (document_id, created_at DESC);
CREATE INDEX idx_document_versions_hash ON document_versions (document_id, content_hash);

-- Circular FK: spec_documents.current_version_id → document_versions.
-- Added here, after both tables exist (03_DATABASE §3.15 note).
-- (SQLite supports ADD COLUMN with REFERENCES for a new nullable FK column;
-- ADD CONSTRAINT is not supported. Column already exists above as plain TEXT.)
ALTER TABLE spec_documents
  ADD COLUMN current_version_fk TEXT REFERENCES document_versions(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Wireframes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE wireframe_screens (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT,
  html_content    TEXT NOT NULL,
  tailwind_config TEXT,
  viewport        TEXT NOT NULL DEFAULT 'desktop'
                  CHECK (viewport IN ('mobile','tablet','desktop')),
  order_index     INTEGER NOT NULL,
  is_entry        INTEGER NOT NULL DEFAULT 0 CHECK (is_entry IN (0,1)),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX uq_wireframe_screens_project_slug ON wireframe_screens (project_id, slug);
CREATE INDEX idx_wireframe_screens_project_order ON wireframe_screens (project_id, order_index);

CREATE TABLE wireframe_flows (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_screen_id TEXT NOT NULL REFERENCES wireframe_screens(id) ON DELETE CASCADE,
  to_screen_id   TEXT NOT NULL REFERENCES wireframe_screens(id) ON DELETE CASCADE,
  label         TEXT,
  trigger       TEXT CHECK (trigger IS NULL OR trigger IN ('click','submit','auto')),
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_wireframe_flows_project ON wireframe_flows (project_id);
CREATE INDEX idx_wireframe_flows_from ON wireframe_flows (from_screen_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Sharing
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE share_links (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_id        TEXT REFERENCES spec_documents(id) ON DELETE CASCADE,
  slug               TEXT NOT NULL UNIQUE,
  scope              TEXT NOT NULL CHECK (scope IN ('project','document','wireframe')),
  access             TEXT NOT NULL DEFAULT 'public' CHECK (access IN ('public','password')),
  password_hash      TEXT,
  expires_at         TEXT,
  max_views          INTEGER,
  view_count         INTEGER NOT NULL DEFAULT 0,
  last_viewed_at     TEXT,
  revoked_at         TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL
);
CREATE INDEX idx_share_links_project ON share_links (project_id, created_at DESC);
CREATE INDEX idx_share_links_document ON share_links (document_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Generation runs & activity
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE generation_runs (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_id       TEXT REFERENCES spec_documents(id) ON DELETE SET NULL,
  session_id        TEXT REFERENCES interview_sessions(id) ON DELETE SET NULL,
  kind              TEXT NOT NULL
                    CHECK (kind IN ('interview_turn','document_generate','document_regenerate','wireframe_generate')),
  status            TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','streaming','succeeded','failed','aborted')),
  provider          TEXT NOT NULL,
  model_id          TEXT NOT NULL,
  preset_id         TEXT REFERENCES llm_presets(id) ON DELETE SET NULL,
  credential_id     TEXT REFERENCES provider_credentials(id) ON DELETE SET NULL,
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  latency_ms        INTEGER,
  cost_usd          REAL,
  error_code        TEXT,
  error_message     TEXT,
  created_at        TEXT NOT NULL,
  completed_at      TEXT
);
CREATE INDEX idx_generation_runs_project_created ON generation_runs (project_id, created_at DESC);
CREATE INDEX idx_generation_runs_document ON generation_runs (document_id, created_at DESC);
CREATE INDEX idx_generation_runs_status ON generation_runs (status);

CREATE TABLE activity_log (
  id            TEXT PRIMARY KEY,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  project_id    TEXT REFERENCES projects(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,
  target_type   TEXT,
  target_id     TEXT,
  metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_activity_log_project_created ON activity_log (project_id, created_at DESC);
CREATE INDEX idx_activity_log_user_created ON activity_log (user_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Idempotency (04_API §2.7 — 24h replay window)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE idempotency_keys (
  key           TEXT NOT NULL,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  request_hash  TEXT NOT NULL,
  response_code INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  PRIMARY KEY (key, user_id)
);
CREATE INDEX idx_idempotency_keys_expires ON idempotency_keys (expires_at);
