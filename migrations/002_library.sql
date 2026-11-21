-- 002 — v0.1.2: first-party accounts and the artifact library.
-- Auth: a local password hash on the user row (scrypt, src/lib/crypto/password.ts).
ALTER TABLE users ADD COLUMN password_hash TEXT;

-- Artifact library: saved results per user, independent of a project.
CREATE TABLE library_items (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('document','export','wireframe')),
  title       TEXT NOT NULL,
  project_id  TEXT,
  document_id TEXT,
  payload     TEXT NOT NULL,
  bytes       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_library_user_created ON library_items (user_id, created_at DESC);
CREATE INDEX idx_library_user_kind ON library_items (user_id, kind);
