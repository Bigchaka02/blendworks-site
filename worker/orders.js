/* Purchase & delivery: checkout config, order creation with server-side pricing, Stripe Checkout and PayPal redirect
   flows, manual pay-in-your-app methods, payment confirmation (return trip + Stripe webhook), order access for customers, fulfilment for admins,
   e-mail notifications (Resend, once configured). Tables: orders, order_events, webhook_events (worker/schema.sql).

   Payment methods and what switches them on (secrets = Worker dashboard settings, vars = wrangler.jsonc):
     stripe   Card  secrets STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (webhook -> /api/webhooks/stripe)
     applepay, googlepay  ride on the Stripe key: same hosted Checkout page, where the wallet button appears when the
              customer's device supports it (Safari/iPhone/Mac for Apple Pay, Chrome/Android for Google Pay); the wallet
              actually used is read back from the charge and kept in payment_info.wallet
     paypal   PayPal (Orders v2, approve + capture)   secrets PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV (sandbox|live)
     venmo    via the PayPal keys (payment_source.venmo, US buyers) — or MANUAL with var VENMO_HANDLE
     cashapp  via the Stripe key as Cash App Pay (the session is restricted to payment_method_types[]=cashapp; if that type is
              still off in the Stripe dashboard the create call fails and we fall back to the dynamic page) — or MANUAL with var
              CASHAPP_CASHTAG (the customer pays in the app with the order number as the memo)
     zelle    MANUAL with var ZELLE_CONTACT (the e-mail or US phone enrolled with Zelle) + optional ZELLE_NAME (the
              recipient name the customer's bank will show); Zelle has no merchant API, so it is manual only
     test     admin accounts only: completes an order without charging, to rehearse fulfilment
     RESEND_API_KEY (secret) + EMAIL_FROM (var)  order e-mails through worker/email.js (skipped when absent)
   "Manual" methods leave the order in pending_payment with instructions on the order page; the customer taps
   "I've sent it" (event) and an admin marks it paid in /admin. Methods with nothing configured are hidden. */
import { HttpError, json, error, noContent, guard, readJson, str, normEmail, validEmail, now, ip, randomToken, hmacHex, timingEqual, enc, money } from "./lib.js";
import { currentSession, requireUser, requireAdmin, checkSpecShape, assertRate, recordAttempt } from "./auth.js";
import { sendEmail, esc, layout } from "./email.js";

export const SHIPPING_METHODS = {   // PLACEHOLDER rates (founder to-do); cents
  standard: { label: "Standard", eta: "3–5 business days", rate: 595, freeOver: 5000 },
  express: { label: "Express", eta: "1–2 business days", rate: 1495 }
};
const US_STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
const STATUSES = ["pending_payment", "paid", "processing", "shipped", "delivered", "cancelled", "refunded"];
const ADMIN_TARGETS = ["paid", "processing", "shipped", "delivered", "cancelled", "refunded"];
const MAX_QTY = 10, MAX_LINES = 30, TAX_CENTS = 0;   // TODO(tax): sales tax once the founder decides how to handle it
const siteUrl = (env, url) => (env.SITE_URL || url.origin).replace(/\/$/, "");
const orderNumber = (o) => `BW-${o.number}`;

/* ---------- catalog (assets/data/*.json, the same files the pages use) ---------- */
let catalogCache = null;
async function catalog(env) {
  if (catalogCache) return catalogCache;
  const [p, i] = await Promise.all([env.ASSETS.fetch("https://assets.local/assets/data/products.json"), env.ASSETS.fetch("https://assets.local/assets/data/ingredients.json")]);
  if (!p.ok || !i.ok) throw new Error("catalog unavailable");
  catalogCache = { products: (await p.json()).products, builder: await i.json() };
  return catalogCache;
}

/* ---------- pricing (mirrors assets/js/build.js so the customer sees the price they pay) ---------- */
function customBlend(b, rawSpec, rawName) {
  const spec = checkSpecShape(rawSpec), caps = spec.format === "capsule";
  const size = caps ? b.capsuleSizes.find((s) => s.id === spec.capsuleSize) : null;
  if (caps && !size) throw new HttpError(400, "Unknown capsule size.");
  if (caps && !b.capsuleCounts.includes(spec.capsules)) throw new HttpError(400, "Unknown capsule count.");
  if (!caps && !b.servingSizesG.includes(spec.servingG)) throw new HttpError(400, "Unknown scoop size.");
  if (!caps && !b.boxServings.includes(spec.servings)) throw new HttpError(400, "Unknown box size.");
  const ings = spec.ingredients.map((id) => {
    const ing = b.ingredients.find((i) => i.id === id);
    if (!ing) throw new HttpError(400, `Unknown ingredient "${id}".`);
    if (spec.pct[id] <= 0 || spec.pct[id] % b.STEP) throw new HttpError(400, `Shares must be multiples of ${b.STEP}%.`);
    return ing;
  });
  if (ings.length < b.MIN_INGREDIENTS || ings.length > b.MAX_INGREDIENTS) throw new HttpError(400, `A blend needs ${b.MIN_INGREDIENTS}–${b.MAX_INGREDIENTS} ingredients.`);
  const unitMg = caps ? size.capacityMg : spec.servingG * 1000, units = caps ? spec.capsules : spec.servings;
  const base = caps ? b.pricing.capsuleBase[spec.capsules] : b.pricing.powderBase[spec.servings];
  let ingr = 0;
  const lines = ings.map((ing) => {
    const mg = unitMg * spec.pct[ing.id] / 100;
    if (ing.maxMgPerUnit && mg > ing.maxMgPerUnit) throw new HttpError(400, `${ing.short} is capped at ${ing.maxMgPerUnit} mg per ${caps ? "capsule" : "scoop"}.`);
    ingr += (mg * units / 1000) * ing.costPerGram * b.pricing.MARKUP;
    return [ing.name, `${Math.round(mg).toLocaleString("en-US")} mg`];
  });
  const price = Math.ceil(base + ingr) - 0.01;
  const clean = { format: spec.format, ingredients: spec.ingredients, pct: spec.pct };
  if (caps) { clean.capsuleSize = spec.capsuleSize; clean.capsules = spec.capsules; } else { clean.servingG = spec.servingG; clean.servings = spec.servings; }
  return {
    name: str(rawName, 40) || `Custom ${caps ? "capsule" : "scoop"} blend`,
    type: spec.format, unit: Math.round(price * 100),
    servingSize: caps ? `1 capsule (${size.label}, ~${unitMg.toLocaleString("en-US")} mg)` : `1 scoop (${spec.servingG} g)`,
    description: `${units} × ${caps ? size.label + " capsules" : spec.servingG + " g scoops"} · ` + ings.map((ing) => `${ing.short} ${spec.pct[ing.id]}%`).join(" · "),
    ingredients: lines, custom: clean
  };
}
async function priceLines(env, items) {   // client cart -> trusted line snapshot [{id, name, type, qty, unit, ...}]
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, "Your cart is empty.");
  if (items.length > MAX_LINES) throw new HttpError(400, "Too many lines in one order.");
  const cat = await catalog(env), lines = [];
  for (const it of items) {
    const qty = Math.min(MAX_QTY, Math.max(1, Math.floor(Number(it && it.qty) || 1)));
    const id = str(it && it.id, 200);
    if (id.startsWith("custom-")) {
      const c = customBlend(cat.builder, it.custom && it.custom.spec, it.custom && it.custom.name);
      lines.push(Object.assign({ id, qty }, c));
    } else {
      const p = cat.products.find((x) => x.id === id || x.slug === id);
      if (!p) throw new HttpError(400, "One of the items is no longer available.");
      if (!p.stock) throw new HttpError(400, `${p.name} is sold out.`);
      lines.push({ id: p.id, name: p.name, type: p.type, qty: Math.min(qty, p.stock), unit: Math.round(p.price * 100), servingSize: p.servingSize,
        description: `${p.servings} servings · ${p.servingSize}${p.flavor ? " · " + p.flavor : ""}`, custom: null });
    }
  }
  return lines;
}
const shippingFor = (methodId, subtotal) => {
  const m = SHIPPING_METHODS[methodId];
  if (!m) throw new HttpError(400, "Choose a shipping method.");
  return { id: methodId, cents: m.freeOver && subtotal >= m.freeOver ? 0 : m.rate };
};

/* ---------- address ---------- */
function checkAddress(a) {
  a = a && typeof a === "object" ? a : {};
  const out = { name: str(a.name, 80), line1: str(a.line1, 120), line2: str(a.line2, 120), city: str(a.city, 80), state: str(a.state, 2).toUpperCase(), zip: str(a.zip, 10), phone: str(a.phone, 30), country: "US" };
  if (out.name.length < 2) throw new HttpError(400, "Enter the recipient's name.");
  if (out.line1.length < 3) throw new HttpError(400, "Enter a street address.");
  if (out.city.length < 2) throw new HttpError(400, "Enter a city.");
  if (!US_STATES.includes(out.state)) throw new HttpError(400, "Choose a US state (we ship within the US to start).");
  if (!/^\d{5}(-\d{4})?$/.test(out.zip)) throw new HttpError(400, "Enter a valid ZIP code.");
  return out;
}

/* ---------- providers ---------- */
const STRIPE_FAMILY = ["stripe", "applepay", "googlepay", "cashapp"];   // all pay on the Stripe-hosted Checkout page (cashapp only in api mode)
const STRIPE_ONLY = { cashapp: "cashapp" };   // providers that map to one Stripe payment_method_type (wallets don't: they live inside "card")
function providerModes(env, user) {   // provider -> "api" | "manual" | null (hidden)
  const stripe = env.STRIPE_SECRET_KEY ? "api" : null, paypal = !!(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
  return {
    stripe, applepay: stripe, googlepay: stripe,
    paypal: paypal ? "api" : null,
    venmo: paypal ? "api" : env.VENMO_HANDLE ? "manual" : null,
    cashapp: stripe ? "api" : env.CASHAPP_CASHTAG ? "manual" : null,
    zelle: env.ZELLE_CONTACT ? "manual" : null,
    test: user && user.role === "admin" ? "api" : null
  };
}
const providers = (env, user) => Object.fromEntries(Object.entries(providerModes(env, user)).map(([k, v]) => [k, !!v]));
const PROVIDER_OFF = { stripe: "Card payments are not switched on yet.", applepay: "Apple Pay is not switched on yet.", googlepay: "Google Pay is not switched on yet.", paypal: "PayPal is not switched on yet.", venmo: "Venmo is not switched on yet.", cashapp: "Cash App is not switched on yet.", zelle: "Zelle is not switched on yet.", test: "Test payments are for admins only." };
async function providerJson(res, label) {
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { /* not JSON */ }
  if (!res.ok) { console.error(`${label} error`, res.status, text.slice(0, 500)); throw new HttpError(502, "The payment provider did not accept the request. Please try again in a moment."); }
  return data;
}
// Stripe: form-encoded params (nested keys written out), hosted Checkout Session, verified on return and by webhook.
function stripeForm(params) {
  const f = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => f.set(k, String(v)));
  return f;
}
async function stripeCreateSession(env, order, lines, base, restrict = true) {
  const only = restrict && STRIPE_ONLY[order.provider];
  const params = {
    mode: "payment", success_url: `${base}/order?id=${order.id}&key=${order.access_key}&session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${base}/checkout?cancelled=1`,
    customer_email: order.email, client_reference_id: order.id, "metadata[order_id]": order.id,
    "payment_intent_data[metadata][order_id]": order.id, "payment_intent_data[description]": `BlendWorks order ${orderNumber(order)}`
  };
  if (order.provider !== "stripe") { params["metadata[wallet]"] = order.provider; params["payment_intent_data[metadata][wallet]"] = order.provider; }   // the wallet the customer picked
  if (only) params["payment_method_types[0]"] = only;   // e.g. Cash App: the hosted page shows just that method
  let i = 0;
  const add = (name, description, unit, qty) => {
    params[`line_items[${i}][quantity]`] = qty;
    params[`line_items[${i}][price_data][currency]`] = "usd";
    params[`line_items[${i}][price_data][unit_amount]`] = unit;
    params[`line_items[${i}][price_data][product_data][name]`] = name.slice(0, 250);
    if (description) params[`line_items[${i}][price_data][product_data][description]`] = description.slice(0, 250);
    i++;
  };
  lines.forEach((l) => add(l.name, l.description, l.unit, l.qty));
  if (order.shipping > 0) add(`Shipping — ${SHIPPING_METHODS[order.shipping_method].label}`, SHIPPING_METHODS[order.shipping_method].eta, order.shipping, 1);
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", body: stripeForm(params),
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `order-${order.id}${only ? `-${only}` : ""}` } });
  if (!res.ok && only) {   // that payment method isn't switched on in the Stripe dashboard yet: fall back to the dynamic page rather than fail the order
    console.error(`stripe create restricted to ${only}`, res.status, (await res.text()).slice(0, 300));
    return stripeCreateSession(env, order, lines, base, false);
  }
  const s = await providerJson(res, "stripe create");
  return { ref: s.id, url: s.url };
}
async function stripeSession(env, id) {   // expands the charge so the method actually used (apple_pay / google_pay / link / cashapp …) can be recorded
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}?expand[]=payment_intent.latest_charge`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
  return providerJson(res, "stripe get");
}
const stripeIntentId = (s) => (s.payment_intent && typeof s.payment_intent === "object" ? s.payment_intent.id : s.payment_intent) || null;
const stripePaidWith = (s) => {   // "apple_pay" | "google_pay" | "link" for card wallets, otherwise the Stripe payment method type ("cashapp", "affirm", …)
  try { const d = s.payment_intent.latest_charge.payment_method_details; return (d.type === "card" ? d.card.wallet && d.card.wallet.type : d.type) || null; } catch (e) { return null; }
};
async function stripeVerify(env, request, raw) {   // Stripe-Signature: t=…,v1=…[,v1=…]
  const header = request.headers.get("Stripe-Signature") || "", parts = { t: "", v1: [] };
  header.split(",").forEach((p) => { const [k, v] = p.trim().split("="); if (k === "t") parts.t = v; else if (k === "v1") parts.v1.push(v); });
  if (!parts.t || !parts.v1.length || Math.abs(now() - Number(parts.t)) > 300) return false;
  const expected = enc.encode(await hmacHex(env.STRIPE_WEBHOOK_SECRET, `${parts.t}.${raw}`));
  return parts.v1.some((sig) => timingEqual(enc.encode(sig), expected));
}
// PayPal: Orders API v2 — create (approve redirect) then capture on return.
const paypalBase = (env) => (env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");
async function paypalToken(env) {
  const res = await fetch(`${paypalBase(env)}/v1/oauth2/token`, { method: "POST", body: "grant_type=client_credentials",
    headers: { Authorization: "Basic " + btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`), "Content-Type": "application/x-www-form-urlencoded" } });
  return (await providerJson(res, "paypal token")).access_token;
}
async function paypalCall(env, method, path, body, requestId) {
  const headers = { Authorization: `Bearer ${await paypalToken(env)}`, "Content-Type": "application/json", Prefer: "return=representation" };
  if (requestId) headers["PayPal-Request-Id"] = requestId;
  const res = await fetch(`${paypalBase(env)}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return providerJson(res, `paypal ${method} ${path}`);
}
async function paypalCreate(env, order, lines, base, source = "paypal") {   // source: "paypal" (approve link) or "venmo" (payer-action link)
  const usd = (cents) => ({ currency_code: "USD", value: money(cents) });
  const urls = { return_url: `${base}/order?id=${order.id}&key=${order.access_key}&paypal=return`, cancel_url: `${base}/checkout?cancelled=1` };
  const body = {
    intent: "CAPTURE",
    purchase_units: [{ reference_id: order.id, custom_id: order.id, invoice_id: orderNumber(order), description: `BlendWorks order ${orderNumber(order)}`,
      amount: Object.assign(usd(order.total), { breakdown: { item_total: usd(order.subtotal), shipping: usd(order.shipping), tax_total: usd(order.tax) } }),
      items: lines.map((l) => ({ name: l.name.slice(0, 127), description: (l.description || "").slice(0, 127), quantity: String(l.qty), unit_amount: usd(l.unit), category: "PHYSICAL_GOODS" })) }]
  };
  if (source === "venmo") body.payment_source = { venmo: { experience_context: Object.assign({ brand_name: "BlendWorks", shipping_preference: "NO_SHIPPING" }, urls) } };
  else body.application_context = Object.assign({ brand_name: "BlendWorks", user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING" }, urls);
  const o = await paypalCall(env, "POST", "/v2/checkout/orders", body, `order-${order.id}`);
  const next = (o.links || []).find((l) => l.rel === (source === "venmo" ? "payer-action" : "approve")) || (o.links || []).find((l) => l.rel === "approve" || l.rel === "payer-action");
  if (!next) throw new HttpError(502, "PayPal did not return an approval link.");
  return { ref: o.id, url: next.href };
}
// Manual methods: instructions the customer follows in their own app; an admin confirms receipt.
async function manualInstructions(env, order, provider) {
  const memo = orderNumber(order), amount = money(order.total);
  if (provider === "cashapp") { const tag = "$" + env.CASHAPP_CASHTAG.replace(/[^A-Za-z0-9_-]/g, ""); return { mode: "manual", provider, handle: tag, memo, amount: order.total, link: `https://cash.app/${tag}/${amount}` }; }
  if (provider === "venmo") { const u = env.VENMO_HANDLE.replace(/^@/, ""); return { mode: "manual", provider, handle: `@${u}`, memo, amount: order.total, link: `https://venmo.com/?txn=pay&audience=private&recipients=${encodeURIComponent(u)}&amount=${amount}&note=${encodeURIComponent(memo)}` }; }
  if (provider === "zelle") return { mode: "manual", provider, handle: env.ZELLE_CONTACT.trim(), name: (env.ZELLE_NAME || "BlendWorks").trim(), memo, amount: order.total };   // no deep link: Zelle lives inside each bank's app
  throw new HttpError(400, "Unknown payment method.");
}
const paypalCaptureId = (o) => { try { return o.purchase_units[0].payments.captures[0].id; } catch (e) { return null; } };

/* ---------- order records ---------- */
const parse = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; } };
async function loadOrder(env, id) {
  return env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
}
async function addEvent(env, orderId, actor, type, detail) {
  await env.DB.prepare("INSERT INTO order_events (order_id, at, actor, type, detail) VALUES (?, ?, ?, ?, ?)").bind(orderId, now(), actor, type, detail || null).run();
}
async function markPaid(env, ctx, order, paymentRef, actor, base) {
  if (order.status !== "pending_payment") return order;
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE orders SET status = 'paid', payment_ref = ?, paid_at = ?, updated_at = ? WHERE id = ? AND status = 'pending_payment'").bind(paymentRef || null, t, t, order.id),
    env.DB.prepare("INSERT INTO order_events (order_id, at, actor, type, detail) VALUES (?, ?, ?, 'paid', ?)").bind(order.id, t, actor, paymentRef ? `Payment ${paymentRef}` : null)
  ]);
  Object.assign(order, { status: "paid", payment_ref: paymentRef, paid_at: t, updated_at: t });
  ctx.waitUntil(notify(env, order, "paid", base));
  return order;
}
async function cancelPending(env, order, detail) {
  if (order.status !== "pending_payment") return;
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'pending_payment'").bind(t, order.id),
    env.DB.prepare("INSERT INTO order_events (order_id, at, actor, type, detail) VALUES (?, ?, 'system', 'cancelled', ?)").bind(order.id, t, detail)
  ]);
  order.status = "cancelled";
}
async function refreshPayment(env, ctx, order, base) {   // pending order: ask the provider whether it was paid
  if (order.status !== "pending_payment" || !order.provider_ref) return order;
  try {
    if (STRIPE_FAMILY.includes(order.provider) && env.STRIPE_SECRET_KEY && order.provider_ref !== "manual") {
      const s = await stripeSession(env, order.provider_ref);
      if (s.payment_status === "paid") {
        const wallet = stripePaidWith(s);
        if (wallet) await setPaymentInfo(env, order, { mode: "api", provider: order.provider, wallet });
        return markPaid(env, ctx, order, stripeIntentId(s), "stripe", base);
      }
      if (s.status === "expired") await cancelPending(env, order, "Payment session expired");
    } else if ((order.provider === "paypal" || order.provider === "venmo") && env.PAYPAL_CLIENT_ID && order.provider_ref !== "manual") {
      let o = await paypalCall(env, "GET", `/v2/checkout/orders/${order.provider_ref}`);
      if (o.status === "APPROVED") o = await paypalCall(env, "POST", `/v2/checkout/orders/${order.provider_ref}/capture`, {}, `capture-${order.id}`);
      if (o.status === "COMPLETED") return markPaid(env, ctx, order, paypalCaptureId(o), order.provider, base);
    }
  } catch (e) { console.error("refreshPayment", order.id, e && e.message); }
  return order;
}
async function setPaymentInfo(env, order, info) {
  const current = parse(order.payment_info, null);
  if (JSON.stringify(current) === JSON.stringify(info)) return;
  await env.DB.prepare("UPDATE orders SET payment_info = ? WHERE id = ?").bind(JSON.stringify(info), order.id).run();
  order.payment_info = JSON.stringify(info);
}
function orderView(o, events, admin) {
  const m = SHIPPING_METHODS[o.shipping_method] || {};
  const reported = (events || []).filter((e) => e.type === "reported").pop();
  return {
    id: o.id, number: orderNumber(o), status: o.status, provider: o.provider, email: o.email,
    items: parse(o.items, []), amounts: { subtotal: o.subtotal, shipping: o.shipping, tax: o.tax, total: o.total, currency: o.currency },
    shippingMethod: { id: o.shipping_method, label: m.label || o.shipping_method, eta: m.eta || "" },
    address: parse(o.address, {}), tracking: parse(o.tracking, null), note: admin ? o.note : undefined,
    paymentInfo: parse(o.payment_info, null), reportedAt: reported ? reported.at : null,
    createdAt: o.created_at, paidAt: o.paid_at, shippedAt: o.shipped_at, deliveredAt: o.delivered_at, updatedAt: o.updated_at,
    paymentRef: admin ? o.payment_ref : undefined, providerRef: admin ? o.provider_ref : undefined, userId: admin ? o.user_id : undefined,
    events: (events || []).filter((e) => admin || e.type !== "note").map((e) => ({ at: e.at, type: e.type, actor: admin ? e.actor : undefined, detail: admin || e.type !== "note" ? e.detail : undefined }))
  };
}
const eventsFor = async (env, id) => (await env.DB.prepare("SELECT * FROM order_events WHERE order_id = ? ORDER BY at, id").bind(id).all()).results;

/* ---------- customer handlers ---------- */
export const checkoutConfig = guard(async (request, env) => {
  const s = await currentSession(env, request), user = s && s.user;
  return json({ ok: true, providers: providers(env, user), modes: providerModes(env, user), states: US_STATES, taxNote: "Sales tax is not applied yet.",
    methods: Object.entries(SHIPPING_METHODS).map(([id, m]) => ({ id, label: m.label, eta: m.eta, rate: m.rate, freeOver: m.freeOver || 0 })),
    user: user ? { email: user.email, name: user.name } : null });
});

export const checkout = guard(async (request, env, ctx, url) => {
  const s = await currentSession(env, request), user = s && s.user, body = await readJson(request), base = siteUrl(env, url);
  await assertRate(env, "checkout:ip", ip(request));
  await recordAttempt(env, "checkout:ip", ip(request));
  const email = user ? user.email : normEmail(body.email);
  if (!validEmail(email)) throw new HttpError(400, "Enter a valid email address for your receipt.");
  const address = checkAddress(body.address);
  const lines = await priceLines(env, body.items);
  const subtotal = lines.reduce((sum, l) => sum + l.unit * l.qty, 0);
  const ship = shippingFor(str(body.shippingMethod, 20), subtotal);
  const total = subtotal + ship.cents + TAX_CENTS;
  const provider = str(body.provider, 10), modes = providerModes(env, user), mode = modes[provider];
  if (!mode) throw new HttpError(provider === "test" ? 403 : provider in modes ? 503 : 400, PROVIDER_OFF[provider] || "Choose a payment method.");
  const id = crypto.randomUUID(), key = randomToken(), t = now();
  await env.DB.prepare(`INSERT INTO orders (id, number, access_key, user_id, email, status, provider, currency, subtotal, shipping, tax, total, shipping_method, address, items, created_at, updated_at)
    VALUES (?, (SELECT COALESCE(MAX(number), 1000) + 1 FROM orders), ?, ?, ?, 'pending_payment', ?, 'usd', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, key, user ? user.id : null, email, provider, subtotal, ship.cents, TAX_CENTS, total, ship.id, JSON.stringify(address), JSON.stringify(lines), t, t).run();
  const order = await loadOrder(env, id);
  await addEvent(env, id, user ? "customer" : "guest", "created", `${lines.length} line(s), ${provider}`);
  try {
    let url_ = `${base}/order?id=${id}&key=${key}`, r = null;
    if (STRIPE_FAMILY.includes(provider) && mode === "api") r = await stripeCreateSession(env, order, lines, base);
    else if (provider === "paypal" || (provider === "venmo" && mode === "api")) r = await paypalCreate(env, order, lines, base, provider);
    else if (mode === "manual") {
      const info = await manualInstructions(env, order, provider);
      await env.DB.prepare("UPDATE orders SET provider_ref = 'manual', payment_info = ? WHERE id = ?").bind(JSON.stringify(info), id).run();
      await addEvent(env, id, "system", "instructions", `${provider} instructions shown`);
    } else await markPaid(env, ctx, order, `test-${t}`, "test", base);
    if (r) { await env.DB.prepare("UPDATE orders SET provider_ref = ? WHERE id = ?").bind(r.ref, id).run(); url_ = r.url; }
    return json({ ok: true, orderId: id, number: orderNumber(order), url: url_ }, 201);
  } catch (e) {
    await cancelPending(env, order, "Payment could not be started: " + (e && e.message ? e.message.slice(0, 200) : "provider error"));
    throw e;
  }
});

async function authorizedOrder(env, request, id, url) {   // owner, admin, or the access key from the order link
  const order = await loadOrder(env, id);
  const s = await currentSession(env, request), key = url.searchParams.get("key") || "";
  const owner = !!(s && order && order.user_id && s.user.id === order.user_id), admin = !!(s && s.user.role === "admin");
  const keyOk = !!(order && key && timingEqual(enc.encode(key), enc.encode(order.access_key)));
  if (!order || !(owner || admin || keyOk)) throw new HttpError(404, "We couldn't find that order.");
  return { order, admin };
}
export const getOrder = guard(async (request, env, ctx, id, url) => {
  const { order, admin } = await authorizedOrder(env, request, id, url);
  await refreshPayment(env, ctx, order, siteUrl(env, url));
  return json({ ok: true, order: orderView(order, await eventsFor(env, id), admin) });
});

export const reportPaid = guard(async (request, env, ctx, id, url) => {   // "I've sent the payment" on a manual-method order
  const { order } = await authorizedOrder(env, request, id, url);
  const info = parse(order.payment_info, null);
  if (order.status !== "pending_payment" || !info || info.mode !== "manual") throw new HttpError(409, "This order isn't waiting for a manual payment.");
  const events = await eventsFor(env, id), last = events.filter((e) => e.type === "reported").pop();
  if (!last || now() - last.at > 600) await addEvent(env, id, "customer", "reported", `Customer says the ${order.provider} payment was sent`);
  return json({ ok: true, order: orderView(order, await eventsFor(env, id), false) });
});

export const listOrders = guard(async (request, env) => {
  const { user } = await requireUser(env, request);
  const rows = await env.DB.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").bind(user.id).all();
  return json({ ok: true, orders: rows.results.map((o) => ({ id: o.id, number: orderNumber(o), status: o.status, total: o.total, createdAt: o.created_at, items: parse(o.items, []).map((l) => `${l.qty} × ${l.name}`) })) });
});

/* ---------- Stripe webhook (signature instead of the same-origin check) ---------- */
export const stripeWebhook = guard(async (request, env, ctx, url) => {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new HttpError(503, "Webhook secret not configured.");
  const raw = await request.text();
  if (!(await stripeVerify(env, request, raw))) throw new HttpError(400, "Bad signature.");
  const event = JSON.parse(raw);
  const seen = await env.DB.prepare("SELECT id FROM webhook_events WHERE id = ?").bind(event.id).first();
  if (seen) return json({ received: true, duplicate: true });
  await env.DB.prepare("INSERT INTO webhook_events (id, provider, at) VALUES (?, 'stripe', ?)").bind(event.id, now()).run();
  const obj = event.data && event.data.object || {}, orderId = (obj.metadata && obj.metadata.order_id) || obj.client_reference_id;
  const order = orderId ? await loadOrder(env, orderId) : null;
  if (order) {
    if ((event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") && obj.payment_status === "paid") await markPaid(env, ctx, order, obj.payment_intent, "stripe-webhook", siteUrl(env, url));
    else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") await cancelPending(env, order, event.type);
  }
  return json({ received: true });
});

/* ---------- admin: fulfilment ---------- */
export const adminOrders = guard(async (request, env, ctx, url) => {
  await requireAdmin(env, request);
  const status = str(url.searchParams.get("status"), 20), q = str(url.searchParams.get("q"), 80).toLowerCase();
  const rows = await env.DB.prepare("SELECT *, (SELECT MAX(at) FROM order_events e WHERE e.order_id = orders.id AND e.type = 'reported') AS reported_at FROM orders WHERE (? = '' OR status = ?) AND (? = '' OR email LIKE ? OR CAST(number AS TEXT) = ?) ORDER BY created_at DESC LIMIT 200")
    .bind(status, status, q, `%${q}%`, q.replace(/^bw-/, "")).all();
  const counts = (await env.DB.prepare("SELECT status, COUNT(*) AS n FROM orders GROUP BY status").all()).results;
  return json({ ok: true, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
    orders: rows.results.map((o) => ({ id: o.id, number: orderNumber(o), email: o.email, status: o.status, provider: o.provider, manual: o.provider_ref === "manual", reportedAt: o.reported_at || null, total: o.total, createdAt: o.created_at, city: parse(o.address, {}).city, state: parse(o.address, {}).state, items: parse(o.items, []).map((l) => `${l.qty} × ${l.name}`) })) });
});

export const adminOrder = guard(async (request, env, ctx, id) => {
  await requireAdmin(env, request);
  const order = await loadOrder(env, id);
  if (!order) throw new HttpError(404, "No such order.");
  return json({ ok: true, order: orderView(order, await eventsFor(env, id), true) });
});

export const adminUpdateOrder = guard(async (request, env, ctx, id, url) => {
  const { user } = await requireAdmin(env, request);
  const order = await loadOrder(env, id);
  if (!order) throw new HttpError(404, "No such order.");
  const body = await readJson(request), t = now(), actor = `admin:${user.email}`, sets = ["updated_at = ?"], vals = [t];
  let notifyKind = null;
  if (body.tracking !== undefined) {
    const tr = body.tracking && typeof body.tracking === "object" ? { carrier: str(body.tracking.carrier, 40), number: str(body.tracking.number, 60), url: str(body.tracking.url, 300) } : null;
    if (tr && tr.url && !/^https:\/\//.test(tr.url)) throw new HttpError(400, "Tracking links must start with https://");
    sets.push("tracking = ?"); vals.push(tr && (tr.carrier || tr.number || tr.url) ? JSON.stringify(tr) : null);
    if (tr && tr.number) await addEvent(env, id, actor, "tracking", `${tr.carrier || "Carrier"} ${tr.number}`);
  }
  if (body.note !== undefined) { sets.push("note = ?"); vals.push(str(body.note, 500) || null); await addEvent(env, id, actor, "note", str(body.note, 500)); }
  if (body.status !== undefined) {
    const status = str(body.status, 20);
    if (!ADMIN_TARGETS.includes(status)) throw new HttpError(400, "Unknown status.");
    if (status !== order.status) {
      sets.push("status = ?"); vals.push(status);
      if (status === "paid" && !order.paid_at) { sets.push("paid_at = ?"); vals.push(t); }
      if (status === "shipped") { sets.push("shipped_at = ?"); vals.push(t); notifyKind = "shipped"; }
      if (status === "delivered") { sets.push("delivered_at = ?"); vals.push(t); }
      await addEvent(env, id, actor, status, str(body.reason, 200) || null);
    }
  }
  vals.push(id);
  await env.DB.prepare(`UPDATE orders SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  const updated = await loadOrder(env, id);
  if (notifyKind) ctx.waitUntil(notify(env, updated, notifyKind, siteUrl(env, url)));
  return json({ ok: true, order: orderView(updated, await eventsFor(env, id), true) });
});

/* ---------- order e-mails (worker/email.js; skipped until RESEND_API_KEY exists) ---------- */
async function notify(env, order, kind, base) {
  const link = `${base}/order?id=${order.id}&key=${order.access_key}`, items = parse(order.items, []), tr = parse(order.tracking, null);
  const rows = items.map((l) => `<tr><td style="padding:4px 12px 4px 0">${l.qty} × ${esc(l.name)}</td><td style="text-align:right">$${money(l.unit * l.qty)}</td></tr>`).join("");
  const table = `<table style="border-collapse:collapse;font-size:14px">${rows}<tr><td style="padding:8px 12px 0 0">Shipping</td><td style="text-align:right;padding-top:8px">$${money(order.shipping)}</td></tr><tr><td style="padding:4px 12px 0 0"><b>Total</b></td><td style="text-align:right"><b>$${money(order.total)}</b></td></tr></table>`;
  const wrap = (title, body) => layout(title, `${body}<p style="margin-top:20px"><a href="${link}">View your order</a></p>`, `order ${orderNumber(order)}`);
  if (kind === "paid") return sendEmail(env, order.email, `Order ${orderNumber(order)} confirmed`, wrap("Thanks — your order is confirmed.", `<p>We'll start blending shortly and e-mail you when it ships.</p>${table}`));
  if (kind === "shipped") return sendEmail(env, order.email, `Order ${orderNumber(order)} is on its way`, wrap("Your order has shipped.", `<p>${tr && tr.number ? `${esc(tr.carrier || "Carrier")} tracking ${tr.url ? `<a href="${esc(tr.url)}">${esc(tr.number)}</a>` : esc(tr.number)}.` : "It left our lab today."}</p>${table}`));
  return false;
}
