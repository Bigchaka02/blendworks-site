/* Shared helpers for the API: JSON responses, request bodies, cookies, crypto, validation. */

export const MAX_BODY_BYTES = 16 * 1024;

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, extra) });
export const error = (status, message) => json({ ok: false, error: message }, status);
export const noContent = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
// Wrap a handler so thrown HttpErrors become JSON error responses (anything else bubbles to the 500 handler).
export const guard = (fn) => async (...args) => { try { return await fn(...args); } catch (e) { if (e instanceof HttpError) return error(e.status, e.message); throw e; } };

export async function readJson(request) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > MAX_BODY_BYTES) throw new HttpError(413, "Request too large.");
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "Request too large.");
  try { return text ? JSON.parse(text) : {}; } catch (e) { throw new HttpError(400, "Malformed JSON."); }
}

export function cookies(request) {
  const out = {};
  (request.headers.get("Cookie") || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}
export const cookie = (name, value, maxAge, httpOnly) =>
  `${name}=${value}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax${httpOnly ? "; HttpOnly" : ""}`;
export const withHeaders = (response, headers) => {
  const res = new Response(response.body, response);
  headers.forEach((v, k) => res.headers.append(k, v));
  return res;
};

/* ---------- crypto ---------- */
export const enc = new TextEncoder();
export const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const randomToken = () => b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export async function sha256hex(text) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}
export async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
}
export const timingEqual = (a, b) => {   // constant-time compare of two Uint8Arrays
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
};

/* ---------- validation ---------- */
export const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const normEmail = (v) => str(v, 254).toLowerCase();
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
export const now = () => Math.floor(Date.now() / 1000);
export const ip = (request) => request.headers.get("CF-Connecting-IP") || "0.0.0.0";
export const money = (cents) => (cents / 100).toFixed(2);   // "12.34" for provider APIs and emails
