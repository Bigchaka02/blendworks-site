-- D1 database "blendworks" (id 2a9b5d69-1610-481b-bc04-e37a2f7fdbb5, primary region ENAM). Applied 2026-09-14.
-- Re-apply with the Cloudflare dashboard console or the Cloudflare MCP connector (d1_database_query); idempotent.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                 -- uuid
  email TEXT NOT NULL UNIQUE,          -- lower-cased
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,         -- pbkdf2$<iterations>$<salt b64>$<hash b64>
  created_at INTEGER NOT NULL,         -- unix seconds
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                 -- sha256(cookie token), hex
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  user_agent TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS auth_attempts (  -- rate limiting: one row per failed/limited attempt
  key TEXT NOT NULL,                   -- e.g. login:email:x@y.z, login:ip:1.2.3.4, signup:ip:…
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_attempts_key ON auth_attempts(key, at);
CREATE TABLE IF NOT EXISTS blends (    -- custom blends saved from /build
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  spec TEXT NOT NULL,                  -- JSON: {format, capsuleSize, capsules, servingG, servings, ingredients[], pct{}}
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS blends_user ON blends(user_id, created_at);
