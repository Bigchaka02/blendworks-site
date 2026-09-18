/* Accounts: password hashing, sessions, rate limiting, and the /api/auth + /api/me + /api/blends handlers.
   Tables: users, sessions, auth_attempts, blends (worker/schema.sql). */
import { HttpError, json, error, noContent, guard, readJson, cookies, cookie, withHeaders, b64, unb64, enc, randomToken, sha256hex, timingEqual, str, normEmail, validEmail, now, ip } from "./lib.js";

const SESSION_DAYS = 30;
// Workers Free allows ~10 ms of CPU per request and PBKDF2 costs ~0.1 ms per 1,000 iterations here, so 25k keeps a login
// (one derivation) or a password change (two) well inside the budget. Hashes record their own count: raise this later (the
// platform caps it at 100k) and each user is re-hashed transparently on their next login (D35).
const PBKDF2_ITERATIONS = 25000;
const MAX_BLENDS_PER_USER = 50;
const RATE = {                          // key -> [max attempts, window seconds]
  "login:ip": [30, 900], "login:email": [10, 900], "signup:ip": [8, 3600], "password:user": [10, 900], "checkout:ip": [30, 3600]
};
const DUMMY_HASH = `pbkdf2$${PBKDF2_ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;
const SESSION_COOKIE = "bw_session";   // HttpOnly session token
const FLAG_COOKIE = "bw_u";            // readable "signed in" flag so the front end can skip /api/me when logged out

/* ---------- cookies ---------- */
const sessionHeaders = (token) => {
  const h = new Headers();
  h.append("Set-Cookie", cookie(SESSION_COOKIE, token, SESSION_DAYS * 86400, true));
  h.append("Set-Cookie", cookie(FLAG_COOKIE, "1", SESSION_DAYS * 86400, false));
  return h;
};
const clearHeaders = () => {
  const h = new Headers();
  h.append("Set-Cookie", cookie(SESSION_COOKIE, "", 0, true));
  h.append("Set-Cookie", cookie(FLAG_COOKIE, "", 0, false));
  return h;
};

/* ---------- passwords ---------- */
async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(bits)}`;
}
async function verifyPassword(password, stored) {
  const [scheme, iter, salt, hash] = String(stored || "").split("$");
  if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
  const bits = await pbkdf2(password, unb64(salt), Number(iter));
  return timingEqual(new Uint8Array(bits), unb64(hash));
}
const needsRehash = (stored) => Number(String(stored || "").split("$")[1]) !== PBKDF2_ITERATIONS;
function checkPassword(pw) {
  if (typeof pw !== "string" || pw.length < 8) throw new HttpError(400, "Use a password of at least 8 characters.");
  if (pw.length > 200) throw new HttpError(400, "That password is too long.");
}
export const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role || "customer", createdAt: u.created_at });

/* ---------- rate limiting (D1 auth_attempts) ---------- */
export async function assertRate(env, kind, id) {
  const [max, window] = RATE[kind], key = `${kind}:${id}`;
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM auth_attempts WHERE key = ? AND at > ?").bind(key, now() - window).first();
  if (row && row.n >= max) throw new HttpError(429, "Too many attempts. Please wait a few minutes and try again.");
}
export async function recordAttempt(env, kind, id) {
  await env.DB.prepare("INSERT INTO auth_attempts (key, at) VALUES (?, ?)").bind(`${kind}:${id}`, now()).run();
  if (Math.random() < 0.05) await env.DB.prepare("DELETE FROM auth_attempts WHERE at < ?").bind(now() - 86400).run();
}

/* ---------- sessions ---------- */
async function createSession(env, request, userId) {
  const token = randomToken(), t = now();
  await env.DB.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(await sha256hex(token), userId, t, t + SESSION_DAYS * 86400, t, str(request.headers.get("User-Agent"), 200)).run();
  if (Math.random() < 0.1) await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(t).run();
  return token;
}
export async function currentSession(env, request) {   // -> { session, user } or null
  const token = cookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const id = await sha256hex(token), t = now();
  const row = await env.DB.prepare(
    "SELECT s.id AS sid, s.last_seen_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?").bind(id, t).first();
  if (!row) return null;
  if (t - row.last_seen_at > 3600) await env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").bind(t, row.sid).run();
  return { session: row.sid, user: row };
}
export async function requireUser(env, request) {
  const s = await currentSession(env, request);
  if (!s) throw new HttpError(401, "Please sign in.");
  return s;
}
export async function requireAdmin(env, request) {
  const s = await requireUser(env, request);
  if (s.user.role !== "admin") throw new HttpError(403, "Admins only.");
  return s;
}

/* ---------- auth handlers ---------- */
export const signup = guard(async (request, env) => {
  const body = await readJson(request);
  const name = str(body.name, 80), email = normEmail(body.email), password = body.password;
  if (!validEmail(email)) throw new HttpError(400, "Enter a valid email address.");
  checkPassword(password);
  await assertRate(env, "signup:ip", ip(request));
  await recordAttempt(env, "signup:ip", ip(request));
  const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (exists) throw new HttpError(409, "An account with this email already exists — try signing in.");
  const id = crypto.randomUUID(), t = now();
  try {
    await env.DB.prepare("INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, email, name, await hashPassword(password), t, t).run();
  } catch (e) {
    if (/UNIQUE/.test(String(e))) throw new HttpError(409, "An account with this email already exists — try signing in.");
    throw e;
  }
  const token = await createSession(env, request, id);
  return withHeaders(json({ ok: true, user: { id, email, name, role: "customer", createdAt: t } }, 201), sessionHeaders(token));
});

export const login = guard(async (request, env) => {
  const body = await readJson(request);
  const email = normEmail(body.email), password = typeof body.password === "string" ? body.password : "";
  if (!validEmail(email) || !password) throw new HttpError(400, "Enter your email and password.");
  await assertRate(env, "login:ip", ip(request));
  await assertRate(env, "login:email", email);
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  const ok = user ? await verifyPassword(password, user.password_hash) : await verifyPassword(password, DUMMY_HASH);   // same cost for unknown emails
  if (!user || !ok) {
    await recordAttempt(env, "login:ip", ip(request));
    await recordAttempt(env, "login:email", email);
    throw new HttpError(401, "Incorrect email or password.");
  }
  if (needsRehash(user.password_hash)) await env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").bind(await hashPassword(password), now(), user.id).run();   // migrate to the current cost
  const token = await createSession(env, request, user.id);
  return withHeaders(json({ ok: true, user: publicUser(user) }), sessionHeaders(token));
});

export const logout = guard(async (request, env) => {
  const token = cookies(request)[SESSION_COOKIE];
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256hex(token)).run();
  return withHeaders(noContent(), clearHeaders());
});

export const logoutAll = guard(async (request, env) => {
  const { user } = await requireUser(env, request);
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();
  return withHeaders(noContent(), clearHeaders());
});

/* ---------- profile handlers ---------- */
export const me = guard(async (request, env) => {
  const s = await currentSession(env, request);
  if (!s) return withHeaders(error(401, "Not signed in."), clearHeaders());
  return json({ ok: true, user: publicUser(s.user) });
});

export const updateMe = guard(async (request, env) => {
  const { user } = await requireUser(env, request);
  const body = await readJson(request), t = now();
  if (body.email !== undefined) {   // email changes need the password
    const email = normEmail(body.email);
    if (!validEmail(email)) throw new HttpError(400, "Enter a valid email address.");
    if (!(await verifyPassword(typeof body.password === "string" ? body.password : "", user.password_hash))) throw new HttpError(403, "That password is incorrect.");
    try {
      await env.DB.prepare("UPDATE users SET email = ?, updated_at = ? WHERE id = ?").bind(email, t, user.id).run();
    } catch (e) {
      if (/UNIQUE/.test(String(e))) throw new HttpError(409, "That email is already used by another account.");
      throw e;
    }
    user.email = email;
  }
  if (body.name !== undefined) {
    const name = str(body.name, 80);
    await env.DB.prepare("UPDATE users SET name = ?, updated_at = ? WHERE id = ?").bind(name, t, user.id).run();
    user.name = name;
  }
  return json({ ok: true, user: publicUser(user) });
});

export const changePassword = guard(async (request, env) => {
  const { user, session } = await requireUser(env, request);
  const body = await readJson(request);
  await assertRate(env, "password:user", user.id);
  checkPassword(body.next);
  if (!(await verifyPassword(typeof body.current === "string" ? body.current : "", user.password_hash))) {
    await recordAttempt(env, "password:user", user.id);
    throw new HttpError(403, "Your current password is incorrect.");
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").bind(await hashPassword(body.next), now(), user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").bind(user.id, session)
  ]);
  return noContent();
});

export const deleteMe = guard(async (request, env) => {
  const { user } = await requireUser(env, request);
  const body = await readJson(request);
  if (!(await verifyPassword(typeof body.password === "string" ? body.password : "", user.password_hash))) throw new HttpError(403, "That password is incorrect.");
  await env.DB.batch([   // orders are kept (detached) for bookkeeping; everything else goes
    env.DB.prepare("UPDATE orders SET user_id = NULL WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM blends WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id)
  ]);
  return withHeaders(noContent(), clearHeaders());
});

/* ---------- saved blends ---------- */
const FORMATS = ["capsule", "powder"];
export function checkSpecShape(spec) {   // structural check; the builder / order pricing validate against the ingredient tables
  if (!spec || typeof spec !== "object") throw new HttpError(400, "Missing blend recipe.");
  if (!FORMATS.includes(spec.format)) throw new HttpError(400, "Unknown blend format.");
  const ings = Array.isArray(spec.ingredients) ? spec.ingredients : [];
  if (ings.length < 2 || ings.length > 6 || !ings.every((i) => typeof i === "string" && /^[a-z0-9-]{1,40}$/.test(i))) throw new HttpError(400, "A blend needs 2–6 ingredients.");
  if (new Set(ings).size !== ings.length) throw new HttpError(400, "Each ingredient can only appear once.");
  const pct = spec.pct && typeof spec.pct === "object" ? spec.pct : {};
  const total = ings.reduce((s, i) => s + (Number(pct[i]) || 0), 0);
  if (total !== 100) throw new HttpError(400, "Ingredient shares must add up to 100%.");
  const clean = { format: spec.format, ingredients: ings, pct: {} };
  ings.forEach((i) => { clean.pct[i] = Number(pct[i]); });
  if (spec.capsuleSize !== undefined) clean.capsuleSize = str(spec.capsuleSize, 8);
  ["capsules", "servingG", "servings"].forEach((k) => { if (spec[k] !== undefined) clean[k] = Number(spec[k]) || 0; });
  return clean;
}
const blendRow = (b) => ({ id: b.id, name: b.name, spec: JSON.parse(b.spec), createdAt: b.created_at });

export const listBlends = guard(async (request, env) => {
  const { user } = await requireUser(env, request);
  const rows = await env.DB.prepare("SELECT * FROM blends WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").bind(user.id, MAX_BLENDS_PER_USER).all();
  return json({ ok: true, blends: rows.results.map(blendRow) });
});

export const saveBlend = guard(async (request, env) => {
  const { user } = await requireUser(env, request);
  const body = await readJson(request);
  const spec = checkSpecShape(body.spec), name = str(body.name, 40) || "My blend", t = now();
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM blends WHERE user_id = ?").bind(user.id).first();
  if (count.n >= MAX_BLENDS_PER_USER) throw new HttpError(409, `You can keep up to ${MAX_BLENDS_PER_USER} saved blends — delete one first.`);
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO blends (id, user_id, name, spec, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, user.id, name, JSON.stringify(spec), t, t).run();
  return json({ ok: true, blend: { id, name, spec, createdAt: t } }, 201);
});

export const deleteBlend = guard(async (request, env, id) => {
  const { user } = await requireUser(env, request);
  await env.DB.prepare("DELETE FROM blends WHERE id = ? AND user_id = ?").bind(id, user.id).run();
  return noContent();
});
