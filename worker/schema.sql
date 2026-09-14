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

-- 2026-09-14: purchase & delivery (applied)
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'customer';   -- 'customer' | 'admin' (admin = fulfilment console + test payments)
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,                 -- uuid
  number INTEGER NOT NULL UNIQUE,      -- shown as BW-<number>, starts at 1001
  access_key TEXT NOT NULL,            -- secret in the order link (guest access, e-mails)
  user_id TEXT,                        -- null for guests / deleted accounts
  email TEXT NOT NULL,
  status TEXT NOT NULL,                -- pending_payment | paid | processing | shipped | delivered | cancelled | refunded
  provider TEXT NOT NULL,              -- stripe | paypal | test
  provider_ref TEXT,                   -- Stripe Checkout Session id / PayPal order id
  payment_ref TEXT,                    -- Stripe PaymentIntent / PayPal capture id
  currency TEXT NOT NULL DEFAULT 'usd',
  subtotal INTEGER NOT NULL,           -- cents
  shipping INTEGER NOT NULL,
  tax INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  shipping_method TEXT NOT NULL,       -- standard | express
  address TEXT NOT NULL,               -- JSON {name, line1, line2, city, state, zip, phone, country}
  items TEXT NOT NULL,                 -- JSON [{id, name, type, qty, unit(cents), servingSize, description, custom|null}]
  tracking TEXT,                       -- JSON {carrier, number, url}
  note TEXT,                           -- admin note
  created_at INTEGER NOT NULL, paid_at INTEGER, shipped_at INTEGER, delivered_at INTEGER, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS orders_provider ON orders(provider_ref);
CREATE TABLE IF NOT EXISTS order_events (   -- timeline: created, paid, processing, shipped, delivered, cancelled, refunded, tracking, note
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, at INTEGER NOT NULL, actor TEXT NOT NULL, type TEXT NOT NULL, detail TEXT
);
CREATE INDEX IF NOT EXISTS order_events_order ON order_events(order_id, at);
CREATE TABLE IF NOT EXISTS webhook_events (id TEXT PRIMARY KEY, provider TEXT NOT NULL, at INTEGER NOT NULL);   -- idempotency

-- 2026-09-14: manual / crypto payment methods (applied)
ALTER TABLE orders ADD COLUMN payment_info TEXT;   -- JSON: manual instructions {mode:'manual', provider, handle|address, memo, amount, btc, rate, uri, link} or api status {mode:'api', provider, status}
