/* BlendWorks API — Cloudflare Worker module deployed with the static site (wrangler.jsonc: main + assets + D1).
   Accounts v1: email + password sign-up, login, sessions, profile, saved custom blends.
   Storage: D1 database "blendworks" (tables users, sessions, auth_attempts, blends — schema in worker/schema.sql).

   Routes (JSON in/out, same-origin only, cookies HttpOnly):
     POST   /api/auth/signup      {name, email, password}      201 {user}  + session cookie
     POST   /api/auth/login       {email, password}            200 {user}  + session cookie
     POST   /api/auth/logout                                    204         current session
     POST   /api/auth/logout-all                                204         every session of the user
     GET    /api/me                                             200 {user} | 401
     PATCH  /api/me               {name} or {email, password}   200 {user}
     POST   /api/me/password      {current, next}               204         other sessions revoked
     DELETE /api/me               {password}                    204         account + data removed
     GET    /api/blends                                         200 {blends}
     POST   /api/blends           {name, spec}                  201 {blend}
     DELETE /api/blends/:id                                     204
   Everything else under /api is 404 JSON; other paths fall through to the static assets (404.html for unknown).

   Not yet: email verification and password reset (need an email provider — see notes/open-questions Q29). */

const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100000;      // Workers cap PBKDF2 at 100k; hashes record their own count so it can be raised later
const MAX_BODY_BYTES = 16 * 1024;
const MAX_BLENDS_PER_USER = 50;
const RATE = {                          // key -> [max attempts, window seconds]
  "login:ip": [30, 900], "login:email": [10, 900], "signup:ip": [8, 3600], "password:user": [10, 900]
};
const DUMMY_HASH = `pbkdf2$${PBKDF2_ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;
const SESSION_COOKIE = "bw_session";   // HttpOnly session token
const FLAG_COOKIE = "bw_u";            // readable "signed in" flag so the front end can skip /api/me when logged out

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await route(request, env, url);
    } catch (err) {
      console.error("api error", url.pathname, err && err.stack || err);
      return error(500, "Something went wrong on our side. Please try again.");
    }
  }
};

/* ---------- routing ---------- */
async function route(request, env, url) {
  const path = url.pathname, method = request.method;
  if (method !== "GET" && !sameOrigin(request, url)) return error(403, "Cross-site request blocked.");
  const m = (verb, p) => method === verb && path === p;
  if (m("POST", "/api/auth/signup")) return signup(request, env);
  if (m("POST", "/api/auth/login")) return login(request, env);
  if (m("POST", "/api/auth/logout")) return logout(request, env);
  if (m("POST", "/api/auth/logout-all")) return logoutAll(request, env);
  if (m("GET", "/api/me")) return me(request, env);
  if (m("PATCH", "/api/me")) return updateMe(request, env);
  if (m("POST", "/api/me/password")) return changePassword(request, env);
  if (m("DELETE", "/api/me")) return deleteMe(request, env);
  if (m("GET", "/api/blends")) return listBlends(request, env);
  if (m("POST", "/api/blends")) return saveBlend(request, env);
  const del = path.match(/^\/api\/blends\/([A-Za-z0-9-]{1,64})$/);
  if (method === "DELETE" && del) return deleteBlend(request, env, del[1]);
  return error(404, "No such endpoint.");
}

/* ---------- helpers: responses, bodies, cookies ---------- */
const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, extra) });
const error = (status, message) => json({ ok: false, error: message }, status);
const noContent = (extra = {}) => new Response(null, { status: 204, headers: Object.assign({ "Cache-Control": "no-store" }, extra) });

function sameOrigin(request, url) {   // state-changing calls must come from our own pages
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return false;
  const ct = request.headers.get("Content-Type") || "";
  return ct.startsWith("application/json");   // HTML forms cannot send JSON cross-site without a CORS preflight we never grant
}
async function readJson(request) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > MAX_BODY_BYTES) throw new HttpError(413, "Request too large.");
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "Request too large.");
  try { return text ? JSON.parse(text) : {}; } catch (e) { throw new HttpError(400, "Malformed JSON."); }
}
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const guard = (fn) => async (...args) => { try { return await fn(...args); } catch (e) { if (e instanceof HttpError) return error(e.status, e.message); throw e; } };

function cookies(request) {
  const out = {};
  (request.headers.get("Cookie") || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}
const cookie = (name, value, maxAge, httpOnly) =>
  `${name}=${value}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax${httpOnly ? "; HttpOnly" : ""}`;
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
const withCookies = (response, headers) => {
  const res = new Response(response.body, response);
  headers.forEach((v, k) => res.headers.append(k, v));
  return res;
};

/* ---------- helpers: crypto ---------- */
const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const randomToken = () => b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function sha256hex(text) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
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
  const expected = unb64(hash), actual = new Uint8Array(bits);
  return expected.byteLength === actual.byteLength && crypto.subtle.timingSafeEqual(actual, expected);
}

/* ---------- helpers: validation ---------- */
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const normEmail = (v) => str(v, 254).toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
function checkPassword(pw) {
  if (typeof pw !== "string" || pw.length < 8) throw new HttpError(400, "Use a password of at least 8 characters.");
  if (pw.length > 200) throw new HttpError(400, "That password is too long.");
}
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, createdAt: u.created_at });
const now = () => Math.floor(Date.now() / 1000);
const ip = (request) => request.headers.get("CF-Connecting-IP") || "0.0.0.0";

/* ---------- rate limiting (D1 auth_attempts) ---------- */
async function assertRate(env, kind, id) {
  const [max, window] = RATE[kind], key = `${kind}:${id}`;
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM auth_attempts WHERE key = ? AND at > ?").bind(key, now() - window).first();
  if (row && row.n >= max) throw new HttpError(429, "Too many attempts. Please wait a few minutes and try again.");
}
async function recordAttempt(env, kind, id) {
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
async function currentSession(env, request) {   // -> { session, user } or null
  const token = cookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const id = await sha256hex(token), t = now();
  const row = await env.DB.prepare(
    "SELECT s.id AS sid, s.last_seen_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?").bind(id, t).first();
  if (!row) return null;
  if (t - row.last_seen_at > 3600) await env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").bind(t, row.sid).run();
  return { session: row.sid, user: row };
}
async function requireUser(env, request) {
  const s = await currentSession(env, request);
  if (!s) throw new HttpError(401, "Please sign in.");
  return s;
}

/* ---------- auth handlers ---------- */
const signup = guard(async (request, env) => {
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
  return withCookies(json({ ok: true, user: { id, email, name, createdAt: t } }, 201), sessionHeaders(token));
});

const login = guard(async (request, env) => {
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
  const token = await createSession(env, request, user.id);
  return withCookies(json({ ok: true, user: publicUser(user) }), sessionHeaders(token));
});

const logout = guard(async (request, env) => {
  const token = cookies(request)[SESSION_COOKIE];
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256hex(token)).run();
  return withCookies(noContent(), clearHeaders());
});

const logoutAll = guard(async (request, env) => {
  const { user } = await requireUser(env, request);
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();
  return withCookies(noContent(), clearHeaders());
});

/* ---------- profile handlers ---------- */
const me = guard(async (request, env) => {
  const s = await currentSession(env, request);
  if (!s) return withCookies(error(401, "Not signed in."), clearHeaders());
  return json({ ok: true, user: publicUser(s.user) });
});

const updateMe = guard(async (request, env) => {
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

const changePassword = guard(async (request, env) => {
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

const deleteMe = guard(async (request, env) => {
  const { user } = await requireUser(env, request);
  const body = await readJson(request);
  if (!(await verifyPassword(typeof body.password === "string" ? body.password : "", user.password_hash))) throw new HttpError(403, "That password is incorrect.");
  await env.DB.batch([   // explicit deletes in case foreign-key cascades are ever disabled
    env.DB.prepare("DELETE FROM blends WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id)
  ]);
  return withCookies(noContent(), clearHeaders());
});

/* ---------- saved blends ---------- */
const FORMATS = ["capsule", "powder"];
function checkSpec(spec) {   // the builder's recipe object; the builder re-validates against its own tables when loading
  if (!spec || typeof spec !== "object") throw new HttpError(400, "Missing blend recipe.");
  if (!FORMATS.includes(spec.format)) throw new HttpError(400, "Unknown blend format.");
  const ings = Array.isArray(spec.ingredients) ? spec.ingredients : [];
  if (ings.length < 2 || ings.length > 6 || !ings.every((i) => typeof i === "string" && /^[a-z0-9-]{1,40}$/.test(i))) throw new HttpError(400, "A blend needs 2–6 ingredients.");
  const pct = spec.pct && typeof spec.pct === "object" ? spec.pct : {};
  const total = ings.reduce((s, i) => s + (Number(pct[i]) || 0), 0);
  if (total !== 100) throw new HttpError(400, "Ingredient shares must add up to 100%.");
  const clean = { format: spec.format, ingredients: ings, pct: {} };
  ings.forEach((i) => { clean.pct[i] = Number(pct[i]); });
  ["capsuleSize"].forEach((k) => { if (spec[k] !== undefined) clean[k] = str(spec[k], 8); });
  ["capsules", "servingG", "servings"].forEach((k) => { if (spec[k] !== undefined) clean[k] = Number(spec[k]) || 0; });
  return clean;
}
const blendRow = (b) => ({ id: b.id, name: b.name, spec: JSON.parse(b.spec), createdAt: b.created_at });

const listBlends = guard(async (request, env) => {
  const { user } = await requireUser(env, request);
  const rows = await env.DB.prepare("SELECT * FROM blends WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").bind(user.id, MAX_BLENDS_PER_USER).all();
  return json({ ok: true, blends: rows.results.map(blendRow) });
});

const saveBlend = guard(async (request, env) => {
  const { user } = await requireUser(env, request);
  const body = await readJson(request);
  const spec = checkSpec(body.spec), name = str(body.name, 40) || "My blend", t = now();
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM blends WHERE user_id = ?").bind(user.id).first();
  if (count.n >= MAX_BLENDS_PER_USER) throw new HttpError(409, `You can keep up to ${MAX_BLENDS_PER_USER} saved blends — delete one first.`);
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO blends (id, user_id, name, spec, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, user.id, name, JSON.stringify(spec), t, t).run();
  return json({ ok: true, blend: { id, name, spec, createdAt: t } }, 201);
});

const deleteBlend = guard(async (request, env, id) => {
  const { user } = await requireUser(env, request);
  await env.DB.prepare("DELETE FROM blends WHERE id = ? AND user_id = ?").bind(id, user.id).run();
  return noContent();
});
