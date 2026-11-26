-- 004 — v0.2.3: optional project purpose (audience/usage mode).
-- Additive and reversible: nullable column, no backfill, no index.
-- NULL means "not chosen" and keeps the v0.2.2 behaviour for every reader.
ALTER TABLE projects ADD COLUMN purpose TEXT
  CHECK (purpose IN ('documentation','team','ai_agent'));
