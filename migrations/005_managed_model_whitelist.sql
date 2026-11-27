-- 005 - v0.2.7: Optional admin whitelist of allowed models per managed credential.
-- Additive and reversible: nullable JSON array of model IDs; NULL means all cached models are exposed.
ALTER TABLE provider_credentials ADD COLUMN allowed_models_json TEXT;
