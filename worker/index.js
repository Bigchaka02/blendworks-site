/* BlendWorks API — Cloudflare Worker module deployed with the static site (wrangler.jsonc: main + assets + D1).
   Routing only; the handlers live in worker/auth.js (accounts, saved blends) and worker/orders.js (checkout, orders,
   payments, fulfilment). All routes are JSON, same-origin only (state changes need an Origin header matching the
   site and a JSON content type), except the Stripe webhook which is verified by signature instead.

     POST   /api/auth/signup | login | logout | logout-all          GET/PATCH/DELETE /api/me    POST /api/me/password
     GET/POST /api/blends           DELETE /api/blends/:id
     GET    /api/checkout/config    POST /api/checkout               (starts payment; returns the redirect URL)
     GET    /api/orders             GET  /api/orders/:id?key=…      (owner, admin, or the access key from the order link)
     POST   /api/orders/:id/reported?key=…                            ("I've sent the payment" on manual methods)
     POST   /api/webhooks/stripe
     GET    /api/admin/orders?status=&q=   GET/POST /api/admin/orders/:id      (role = admin)
   Everything else under /api is 404 JSON; other paths fall through to the static assets (404.html for unknown). */
import { error } from "./lib.js";
import * as auth from "./auth.js";
import * as orders from "./orders.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await route(request, env, ctx, url);
    } catch (err) {
      console.error("api error", url.pathname, err && err.stack || err);
      return error(500, "Something went wrong on our side. Please try again.");
    }
  }
};

function sameOrigin(request, url) {   // state-changing calls must come from our own pages
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return false;
  return (request.headers.get("Content-Type") || "").startsWith("application/json");   // HTML forms cannot send JSON cross-site without a CORS preflight we never grant
}

async function route(request, env, ctx, url) {
  const path = url.pathname, method = request.method;
  if (method === "POST" && path === "/api/webhooks/stripe") return orders.stripeWebhook(request, env, ctx, url);
  if (method !== "GET" && !sameOrigin(request, url)) return error(403, "Cross-site request blocked.");
  const m = (verb, p) => method === verb && path === p;
  if (m("POST", "/api/auth/signup")) return auth.signup(request, env);
  if (m("POST", "/api/auth/login")) return auth.login(request, env);
  if (m("POST", "/api/auth/logout")) return auth.logout(request, env);
  if (m("POST", "/api/auth/logout-all")) return auth.logoutAll(request, env);
  if (m("GET", "/api/me")) return auth.me(request, env);
  if (m("PATCH", "/api/me")) return auth.updateMe(request, env);
  if (m("POST", "/api/me/password")) return auth.changePassword(request, env);
  if (m("DELETE", "/api/me")) return auth.deleteMe(request, env);
  if (m("GET", "/api/blends")) return auth.listBlends(request, env);
  if (m("POST", "/api/blends")) return auth.saveBlend(request, env);
  if (m("GET", "/api/checkout/config")) return orders.checkoutConfig(request, env);
  if (m("POST", "/api/checkout")) return orders.checkout(request, env, ctx, url);
  if (m("GET", "/api/orders")) return orders.listOrders(request, env);
  if (m("GET", "/api/admin/orders")) return orders.adminOrders(request, env, ctx, url);
  const id = (re) => { const x = path.match(re); return x && x[1]; };
  let x;
  if ((x = id(/^\/api\/blends\/([A-Za-z0-9-]{1,64})$/)) && method === "DELETE") return auth.deleteBlend(request, env, x);
  if ((x = id(/^\/api\/orders\/([A-Za-z0-9-]{1,64})$/)) && method === "GET") return orders.getOrder(request, env, ctx, x, url);
  if ((x = id(/^\/api\/orders\/([A-Za-z0-9-]{1,64})\/reported$/)) && method === "POST") return orders.reportPaid(request, env, ctx, x, url);
  if ((x = id(/^\/api\/admin\/orders\/([A-Za-z0-9-]{1,64})$/))) {
    if (method === "GET") return orders.adminOrder(request, env, ctx, x);
    if (method === "POST") return orders.adminUpdateOrder(request, env, ctx, x, url);
  }
  return error(404, "No such endpoint.");
}
