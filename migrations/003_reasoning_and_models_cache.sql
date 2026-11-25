-- 003 — v0.2.2 Slice A: reasoning effort per preset, cached model list per credential.
-- Additive and reversible: both columns are nullable, no backfill, no index.
-- SQLite has no ADD COLUMN IF NOT EXISTS; the runner's _migrations table is what
-- makes a second `pnpm db:migrate` a no-op.
ALTER TABLE llm_presets ADD COLUMN reasoning_effort TEXT
  CHECK (reasoning_effort IN ('none','low','medium','high'));

ALTER TABLE provider_credentials ADD COLUMN cached_models_json TEXT;
