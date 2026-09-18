/* Offline smoke test for worker/*.js — run in the browser against the local preview (python serve.py):
     const t = await import("/tools/worker-smoke.js"); await t.run();
   Uses an in-memory stand-in for D1 and fakes the Stripe / PayPal / Resend HTTP endpoints, so the checkout, payment
   confirmation, webhook, pricing, sign-up, e-mail verification, password reset and contact-form code paths run without
   secrets. Browsers strip Cookie/Set-Cookie/Origin from page-created requests, so session-based routes (account,
   admin, re-send verification) are covered live with curl instead. Not deployed
   (tools/ is in .assetsignore). */
export async function run() {
  if (!crypto.subtle.timingSafeEqual) crypto.subtle.timingSafeEqual = (a, b) => { const x = new Uint8Array(a), y = new Uint8Array(b); let d = x.length ^ y.length; for (let i = 0; i < Math.min(x.length, y.length); i++) d |= x[i] ^ y[i]; return d === 0; };
  const mod = await import("/worker/index.js?t=" + Date.now());
  const ORIGIN = "https://blendworks.fit", now = () => Math.floor(Date.now() / 1000);

  /* ---------- in-memory D1 ---------- */
  const db = { users: [], sessions: [], tokens: [], attempts: [], orders: [], events: [], webhooks: [] };
  const stmt = (row, rows) => ({ first: async () => row || null, run: async () => ({}), all: async () => ({ results: rows || (row ? [row] : []) }) });
  function exec(sql, p) {
    sql = sql.replace(/\s+/g, " ").trim();
    if (sql.startsWith("SELECT COUNT(*) AS n FROM auth_attempts")) return stmt({ n: db.attempts.filter((a) => a.key === p[0] && a.at > p[1]).length });
    if (sql.startsWith("INSERT INTO auth_attempts")) { db.attempts.push({ key: p[0], at: p[1] }); return stmt(null); }
    if (sql.startsWith("DELETE FROM auth_attempts")) return stmt(null);
    if (sql.startsWith("SELECT id FROM users WHERE email = ?") || sql.startsWith("SELECT * FROM users WHERE email = ?")) return stmt(db.users.find((u) => u.email === p[0]));
    if (sql.startsWith("INSERT INTO users")) { db.users.push({ id: p[0], email: p[1], name: p[2], password_hash: p[3], created_at: p[4], updated_at: p[5], role: "customer", email_verified_at: null }); return stmt(null); }
    if (sql.startsWith("INSERT INTO sessions")) { db.sessions.push({ id: p[0], user_id: p[1] }); return stmt(null); }
    if (sql.startsWith("DELETE FROM sessions WHERE expires_at")) return stmt(null);
    if (sql.startsWith("DELETE FROM sessions WHERE user_id = ?")) { db.sessions = db.sessions.filter((x) => x.user_id !== p[0]); return stmt(null); }
    if (sql.startsWith("UPDATE users SET password_hash = ?, email_verified_at = COALESCE")) { const u = db.users.find((x) => x.id === p[3]); Object.assign(u, { password_hash: p[0], email_verified_at: u.email_verified_at || p[1], updated_at: p[2] }); return stmt(null); }
    if (sql.startsWith("UPDATE users SET password_hash = ?, updated_at = ?")) { const u = db.users.find((x) => x.id === p[2]); Object.assign(u, { password_hash: p[0], updated_at: p[1] }); return stmt(null); }
    if (sql.startsWith("UPDATE users SET email_verified_at = COALESCE")) { const u = db.users.find((x) => x.id === p[2]); u.email_verified_at = u.email_verified_at || p[0]; u.updated_at = p[1]; return stmt(null); }
    if (sql.startsWith("DELETE FROM email_tokens WHERE user_id = ? AND kind = ?")) { db.tokens = db.tokens.filter((k) => !(k.user_id === p[0] && k.kind === p[1])); return stmt(null); }
    if (sql.startsWith("INSERT INTO email_tokens")) { db.tokens.push({ id: p[0], user_id: p[1], kind: p[2], email: p[3], created_at: p[4], expires_at: p[5], used_at: null }); return stmt(null); }
    if (sql.startsWith("SELECT k.email AS token_email")) { const k = db.tokens.find((x) => x.id === p[0] && x.kind === p[1] && x.used_at === null && x.expires_at > p[2]); const u = k && db.users.find((x) => x.id === k.user_id); return stmt(k && u ? Object.assign({ token_email: k.email, expires_at: k.expires_at }, u) : null); }
    if (sql.startsWith("UPDATE email_tokens SET used_at = ?")) { const k = db.tokens.find((x) => x.id === p[1]); if (k) k.used_at = p[0]; return stmt(null); }
    if (sql.startsWith("INSERT INTO orders")) {
      const number = db.orders.reduce((m, o) => Math.max(m, o.number), 1000) + 1;
      db.orders.push({ id: p[0], number, access_key: p[1], user_id: p[2], email: p[3], status: "pending_payment", provider: p[4], currency: "usd", subtotal: p[5], shipping: p[6], tax: p[7], total: p[8], shipping_method: p[9], address: p[10], items: p[11], created_at: p[12], updated_at: p[13], provider_ref: null, payment_ref: null, tracking: null, note: null, paid_at: null, shipped_at: null, delivered_at: null, payment_info: null });
      return stmt(null);
    }
    if (sql.startsWith("SELECT * FROM orders WHERE id = ?")) return stmt(db.orders.find((o) => o.id === p[0]));
    if (sql.startsWith("UPDATE orders SET provider_ref = 'manual', payment_info")) { Object.assign(db.orders.find((o) => o.id === p[1]), { provider_ref: "manual", payment_info: p[0] }); return stmt(null); }
    if (sql.startsWith("UPDATE orders SET provider_ref")) { db.orders.find((o) => o.id === p[1]).provider_ref = p[0]; return stmt(null); }
    if (sql.startsWith("UPDATE orders SET payment_info")) { db.orders.find((o) => o.id === p[1]).payment_info = p[0]; return stmt(null); }
    if (sql.startsWith("UPDATE orders SET status = 'paid'")) { const o = db.orders.find((o) => o.id === p[3]); if (o.status === "pending_payment") Object.assign(o, { status: "paid", payment_ref: p[0], paid_at: p[1], updated_at: p[2] }); return stmt(null); }
    if (sql.startsWith("UPDATE orders SET status = 'cancelled'")) { const o = db.orders.find((o) => o.id === p[1]); if (o.status === "pending_payment") Object.assign(o, { status: "cancelled", updated_at: p[0] }); return stmt(null); }
    if (sql.startsWith("INSERT INTO order_events")) {
      const lit = sql.match(/VALUES \((.*)\)/)[1].split(",").map((x) => x.trim());   // mix of ? and 'literal'
      let i = 0; const v = lit.map((x) => (x === "?" ? p[i++] : x.replace(/'/g, "")));
      db.events.push({ id: db.events.length + 1, order_id: v[0], at: v[1], actor: v[2], type: v[3], detail: v[4] }); return stmt(null);
    }
    if (sql.startsWith("SELECT * FROM order_events")) return stmt(null, db.events.filter((e) => e.order_id === p[0]));
    if (sql.startsWith("SELECT id FROM webhook_events")) return stmt(db.webhooks.find((w) => w.id === p[0]));
    if (sql.startsWith("INSERT INTO webhook_events")) { db.webhooks.push({ id: p[0] }); return stmt(null); }
    throw new Error("unhandled SQL in smoke stub: " + sql);
  }
  const env = {
    DB: { prepare: (sql) => ({ bind: (...p) => exec(sql, p) }), batch: async (s) => { for (const x of s) await x.run(); return []; } },
    ASSETS: { fetch: (u) => fetch(new URL(u).pathname) },   // the local preview serves the JSON data files
    SITE_URL: ORIGIN, STRIPE_SECRET_KEY: "sk_test_fake", STRIPE_WEBHOOK_SECRET: "whsec_fake", PAYPAL_CLIENT_ID: "pp_id", PAYPAL_CLIENT_SECRET: "pp_secret",
    CASHAPP_CASHTAG: "$blendworks", VENMO_HANDLE: "@blendworks-fit",
    ZELLE_CONTACT: "pay@blendworks.fit", ZELLE_NAME: "BlendWorks LLC",
    RESEND_API_KEY: "re_fake", EMAIL_FROM: "BlendWorks <contact.blendworks@blendworks.fit>", CONTACT_EMAIL: "contact.blendworks@blendworks.fit"
  };
  const pending = [];   // waitUntil work (e-mails) — awaited with settle() before reading the outbox
  const ctx = { waitUntil: (p) => pending.push(p.catch((e) => console.error("waitUntil", e))) };
  const settle = () => Promise.all(pending);

  /* ---------- fake provider endpoints ---------- */
  const calls = [];
  const realFetch = window.fetch;
  const fake = { stripePaid: false, wallet: null, pmType: null, cashappOff: false, paypalStatus: "APPROVED" };
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://api.stripe.com/v1/checkout/sessions/")) {   // expanded like the Worker asks (payment_intent.latest_charge) so the wallet can be read back
      calls.push({ stripeGet: url });
      const pmd = fake.wallet ? { type: "card", card: { wallet: { type: fake.wallet } } } : fake.pmType ? { type: fake.pmType } : null;
      const pi = pmd ? { id: "pi_fake_1", latest_charge: { payment_method_details: pmd } } : "pi_fake_1";
      return new Response(JSON.stringify({ id: url.split("/").pop().split("?")[0], payment_status: fake.stripePaid ? "paid" : "unpaid", status: fake.stripePaid ? "complete" : "open", payment_intent: pi }));
    }
    if (url === "https://api.stripe.com/v1/checkout/sessions") {
      const p = Object.fromEntries(new URLSearchParams(init.body));
      calls.push({ stripe: p, idem: init.headers["Idempotency-Key"] });
      if (fake.cashappOff && p["payment_method_types[0]"] === "cashapp") return new Response(JSON.stringify({ error: { message: "The payment method type provided: cashapp is invalid. Please ensure the provided type is activated in your dashboard." } }), { status: 400 });
      return new Response(JSON.stringify({ id: "cs_test_fake", url: "https://checkout.stripe.com/c/pay/cs_test_fake" }));
    }
    if (url.endsWith("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "tok" }));
    if (url.endsWith("/v2/checkout/orders")) { const body = JSON.parse(init.body); calls.push({ paypal: body }); const venmo = !!(body.payment_source && body.payment_source.venmo); return new Response(JSON.stringify({ id: venmo ? "PP-VENMO-1" : "PP-ORDER-1", status: venmo ? "PAYER_ACTION_REQUIRED" : "CREATED", links: [{ rel: venmo ? "payer-action" : "approve", href: venmo ? "https://www.sandbox.paypal.com/venmo?token=PP-VENMO-1" : "https://www.sandbox.paypal.com/checkoutnow?token=PP-ORDER-1" }] })); }
    if (url.endsWith("/v2/checkout/orders/PP-ORDER-1")) return new Response(JSON.stringify({ id: "PP-ORDER-1", status: fake.paypalStatus }));
    if (url.endsWith("/v2/checkout/orders/PP-ORDER-1/capture")) { calls.push({ capture: true }); return new Response(JSON.stringify({ id: "PP-ORDER-1", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "CAP-1" }] } }] })); }
    if (url.startsWith("https://api.resend.com/")) { const m = JSON.parse(init.body); calls.push({ email: m.subject, to: m.to, from: m.from, html: m.html, replyTo: m.reply_to || null }); return new Response("{}"); }
    return realFetch(input, init);
  };
  const call = async (method, path, body, headers = {}) => {
    const h = Object.assign({ "CF-Connecting-IP": "9.9.9.9" }, headers);
    if (method !== "GET" && !h["Content-Type"]) h["Content-Type"] = "application/json";
    const res = await mod.default.fetch(new Request(ORIGIN + path, { method, headers: h, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) }), env, ctx);
    let data = null; try { data = res.status === 204 ? null : await res.json(); } catch (e) { /* no body */ }
    return { status: res.status, data };
  };

  try {
    const out = {}, address = { name: "QA Buyer", line1: "1 Main St", city: "Louisville", state: "KY", zip: "40202" };
    const cfg = await call("GET", "/api/checkout/config");
    out.config = { status: cfg.status, providers: cfg.data.providers, methods: cfg.data.methods.map((m) => `${m.id}:${m.rate}/${m.freeOver}`), states: cfg.data.states.length, guest: cfg.data.user === null };
    // validation
    const bad = async (label, body) => { const r = await call("POST", "/api/checkout", body); out[label] = `${r.status} ${r.data && r.data.error}`; };
    await bad("emptyCart", { email: "a@b.co", address, shippingMethod: "standard", provider: "stripe", items: [] });
    await bad("badEmail", { email: "nope", address, shippingMethod: "standard", provider: "stripe", items: [{ id: "c-morning-focus", qty: 1 }] });
    await bad("badZip", { email: "a@b.co", address: Object.assign({}, address, { zip: "1" }), shippingMethod: "standard", provider: "stripe", items: [{ id: "c-morning-focus", qty: 1 }] });
    await bad("badState", { email: "a@b.co", address: Object.assign({}, address, { state: "ZZ" }), shippingMethod: "standard", provider: "stripe", items: [{ id: "c-morning-focus", qty: 1 }] });
    await bad("unknownItem", { email: "a@b.co", address, shippingMethod: "standard", provider: "stripe", items: [{ id: "nope", qty: 1 }] });
    await bad("badMethod", { email: "a@b.co", address, shippingMethod: "drone", provider: "stripe", items: [{ id: "c-morning-focus", qty: 1 }] });
    await bad("testAsGuest", { email: "a@b.co", address, shippingMethod: "standard", provider: "test", items: [{ id: "c-morning-focus", qty: 1 }] });
    await bad("customCaffeineCap", { email: "a@b.co", address, shippingMethod: "standard", provider: "stripe", items: [{ id: "custom-x", qty: 1, custom: { name: "Hot", spec: { format: "powder", servingG: 15, servings: 30, ingredients: ["creatine", "caffeine"], pct: { creatine: 90, caffeine: 10 } } } }] });
    await bad("customBadShares", { email: "a@b.co", address, shippingMethod: "standard", provider: "stripe", items: [{ id: "custom-x", qty: 1, custom: { name: "Odd", spec: { format: "capsule", capsuleSize: "00", capsules: 60, ingredients: ["creatine", "theanine"], pct: { creatine: 55, theanine: 45 } } } }] });
    // Stripe order: 2 × Morning Focus + custom capsule blend, express shipping
    const custom = { name: "Morning UI", spec: { format: "capsule", capsuleSize: "00", capsules: 60, ingredients: ["creatine", "theanine", "caffeine"], pct: { creatine: 50, theanine: 30, caffeine: 20 } } };
    const co = await call("POST", "/api/checkout", { email: "Buyer@Example.com", address, shippingMethod: "express", provider: "stripe", items: [{ id: "c-morning-focus", qty: 2 }, { id: "custom-abc", qty: 1, custom }] });
    const order = db.orders[0];
    out.stripeCheckout = { status: co.status, number: co.data && co.data.number, url: co.data && co.data.url, providerRef: order.provider_ref, total: order.total, subtotal: order.subtotal, shipping: order.shipping, email: order.email, items: JSON.parse(order.items).map((l) => `${l.qty}×${l.name}@${l.unit}`) };
    const sp = calls.find((c) => c.stripe).stripe;
    out.stripeParams = { mode: sp.mode, success: sp.success_url.includes(`id=${order.id}&key=${order.access_key}&session_id={CHECKOUT_SESSION_ID}`), cancel: sp.cancel_url, email: sp.customer_email, meta: sp["metadata[order_id]"] === order.id, line0: [sp["line_items[0][price_data][product_data][name]"], sp["line_items[0][price_data][unit_amount]"], sp["line_items[0][quantity]"]], line1: [sp["line_items[1][price_data][product_data][name]"], sp["line_items[1][price_data][unit_amount]"]], line2: [sp["line_items[2][price_data][product_data][name]"], sp["line_items[2][price_data][unit_amount]"]], sum: Number(sp["line_items[0][price_data][unit_amount]"]) * 2 + Number(sp["line_items[1][price_data][unit_amount]"]) + Number(sp["line_items[2][price_data][unit_amount]"]) };
    // customer view before payment (by key), then after the provider says paid
    const v1 = await call("GET", `/api/orders/${order.id}?key=${order.access_key}`);
    out.viewPending = { status: v1.status, orderStatus: v1.data.order.status, hasKeyField: "access_key" in v1.data.order, events: v1.data.order.events.map((e) => e.type) };
    out.viewNoKey = (await call("GET", `/api/orders/${order.id}`)).status;
    out.viewWrongKey = (await call("GET", `/api/orders/${order.id}?key=nope`)).status;
    fake.stripePaid = true;
    const v2 = await call("GET", `/api/orders/${order.id}?key=${order.access_key}`);
    out.viewPaid = { orderStatus: v2.data.order.status, paymentRef: order.payment_ref, events: v2.data.order.events.map((e) => e.type), emails: calls.filter((c) => c.email).map((c) => c.email) };
    // webhook: signed event for a second (pending) order, then duplicate delivery
    const co2 = await call("POST", "/api/checkout", { email: "b@example.com", address, shippingMethod: "standard", provider: "stripe", items: [{ id: "p-ignite", qty: 1 }] });
    const order2 = db.orders[1], payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_test_fake", payment_status: "paid", payment_intent: "pi_wh_2", metadata: { order_id: order2.id } } } });
    const t = now(), key = await crypto.subtle.importKey("raw", new TextEncoder().encode("whsec_fake"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`)))].map((b) => b.toString(16).padStart(2, "0")).join("");
    out.webhookBadSig = (await call("POST", "/api/webhooks/stripe", payload, { "Stripe-Signature": `t=${t},v1=deadbeef`, "Content-Type": "application/json" })).status;
    out.webhookOk = { status: (await call("POST", "/api/webhooks/stripe", payload, { "Stripe-Signature": `t=${t},v1=${sig}`, "Content-Type": "text/plain" })).status, orderStatus: order2.status, paymentRef: order2.payment_ref, shippingFreeOver50: order2.shipping };
    out.webhookDuplicate = (await call("POST", "/api/webhooks/stripe", payload, { "Stripe-Signature": `t=${t},v1=${sig}`, "Content-Type": "text/plain" })).data;
    // PayPal: create, then the return trip captures an APPROVED order
    const co3 = await call("POST", "/api/checkout", { email: "c@example.com", address, shippingMethod: "standard", provider: "paypal", items: [{ id: "p-creatine-core", qty: 1 }] });
    const order3 = db.orders[2], pp = calls.find((c) => c.paypal).paypal;
    out.paypalCreate = { status: co3.status, url: co3.data.url, ref: order3.provider_ref, amount: pp.purchase_units[0].amount, items: pp.purchase_units[0].items.map((i) => `${i.name} ${i.unit_amount.value}`), returnUrl: pp.application_context.return_url.includes(order3.access_key) };
    const v3 = await call("GET", `/api/orders/${order3.id}?key=${order3.access_key}`);
    out.paypalReturn = { orderStatus: v3.data.order.status, captured: calls.some((c) => c.capture), paymentRef: order3.payment_ref };
    // manual methods: cash app by $cashtag when there is no Stripe key (order stays pending, instructions + reported)
    const cfg2 = await call("GET", "/api/checkout/config");
    out.modes = cfg2.data.modes;
    const savedSkCa = env.STRIPE_SECRET_KEY; env.STRIPE_SECRET_KEY = "";
    out.cashappManualMode = (await call("GET", "/api/checkout/config")).data.modes.cashapp;
    const ca = await call("POST", "/api/checkout", { email: "d@example.com", address, shippingMethod: "standard", provider: "cashapp", items: [{ id: "p-hydrate", qty: 2 }] });
    env.STRIPE_SECRET_KEY = savedSkCa;
    const orderCa = db.orders[3], infoCa = JSON.parse(orderCa.payment_info);
    out.cashapp = { status: ca.status, url: ca.data.url.replace(ORIGIN, ""), orderStatus: orderCa.status, ref: orderCa.provider_ref, info: infoCa, events: db.events.filter((e) => e.order_id === orderCa.id).map((e) => e.type) };
    const rep1 = await call("POST", `/api/orders/${orderCa.id}/reported?key=${orderCa.access_key}`, {});
    const rep2 = await call("POST", `/api/orders/${orderCa.id}/reported?key=${orderCa.access_key}`, {});
    out.reported = { first: rep1.status, reportedAt: rep1.data.order.reportedAt, second: rep2.status, events: db.events.filter((e) => e.order_id === orderCa.id && e.type === "reported").length, wrongKey: (await call("POST", `/api/orders/${orderCa.id}/reported?key=nope`, {})).status };
    out.reportedOnPaidOrder = (await call("POST", `/api/orders/${order.id}/reported?key=${order.access_key}`, {})).status;
    // venmo via PayPal keys (payment_source.venmo, payer-action link)
    const ve = await call("POST", "/api/checkout", { email: "e@example.com", address, shippingMethod: "standard", provider: "venmo", items: [{ id: "c-pump", qty: 1 }] });
    const ppVenmo = calls.filter((c) => c.paypal).pop().paypal;
    out.venmoApi = { status: ve.status, url: ve.data.url, ref: db.orders[4].provider_ref, hasVenmoSource: !!(ppVenmo.payment_source && ppVenmo.payment_source.venmo), noAppContext: !ppVenmo.application_context };
    // venmo manual when PayPal keys are absent
    const savedPp = env.PAYPAL_CLIENT_ID; env.PAYPAL_CLIENT_ID = "";
    out.venmoManualMode = (await call("GET", "/api/checkout/config")).data.modes.venmo;
    const vm = await call("POST", "/api/checkout", { email: "f@example.com", address, shippingMethod: "standard", provider: "venmo", items: [{ id: "c-pump", qty: 1 }] });
    out.venmoManual = { status: vm.status, info: JSON.parse(db.orders[5].payment_info) };
    env.PAYPAL_CLIENT_ID = savedPp;
    // zelle: manual only (no link), recipient name shown, reported works
    const ze = await call("POST", "/api/checkout", { email: "k@example.com", address, shippingMethod: "standard", provider: "zelle", items: [{ id: "p-hydrate", qty: 1 }] });
    const orderZe = db.orders[6], infoZe = JSON.parse(orderZe.payment_info);
    out.zelle = { status: ze.status, url: ze.data.url.replace(ORIGIN, ""), orderStatus: orderZe.status, ref: orderZe.provider_ref, info: infoZe, hasLink: "link" in infoZe, reported: (await call("POST", `/api/orders/${orderZe.id}/reported?key=${orderZe.access_key}`, {})).status };
    // apple pay / google pay: same Stripe session with the wallet tagged; the wallet used comes back from the charge
    fake.stripePaid = false; fake.wallet = null;
    const ap = await call("POST", "/api/checkout", { email: "l@example.com", address, shippingMethod: "standard", provider: "applepay", items: [{ id: "p-ignite", qty: 1 }] });
    const orderAp = db.orders[7], apParams = calls.filter((c) => c.stripe).pop().stripe;
    out.applePayCreate = { status: ap.status, url: ap.data.url, ref: orderAp.provider_ref, provider: orderAp.provider, walletMeta: apParams["metadata[wallet]"], piWalletMeta: apParams["payment_intent_data[metadata][wallet]"] };
    fake.stripePaid = true; fake.wallet = "apple_pay";
    const apView = await call("GET", `/api/orders/${orderAp.id}?key=${orderAp.access_key}`);
    out.applePayPaid = { orderStatus: apView.data.order.status, paymentRef: orderAp.payment_ref, info: apView.data.order.paymentInfo, expanded: calls.filter((c) => c.stripeGet).pop().stripeGet.includes("expand[]=payment_intent.latest_charge") };
    const gp = await call("POST", "/api/checkout", { email: "m@example.com", address, shippingMethod: "standard", provider: "googlepay", items: [{ id: "p-ignite", qty: 1 }] });
    out.googlePayCreate = { status: gp.status, provider: db.orders[8].provider, walletMeta: calls.filter((c) => c.stripe).pop().stripe["metadata[wallet]"] };
    const cardParams = calls.find((c) => c.stripe).stripe;
    out.cardHasNoWalletMeta = !("metadata[wallet]" in cardParams) && !("payment_method_types[0]" in cardParams);
    fake.stripePaid = false; fake.wallet = null;
    // cash app pay through Stripe: session restricted to cashapp, paid-with read back; dashboard type off -> falls back to the dynamic page
    const cp = await call("POST", "/api/checkout", { email: "o@example.com", address, shippingMethod: "standard", provider: "cashapp", items: [{ id: "p-hydrate", qty: 1 }] });
    const orderCp = db.orders[9], cpCall = calls.filter((c) => c.stripe).pop();
    out.cashAppPayCreate = { status: cp.status, url: cp.data.url, ref: orderCp.provider_ref, provider: orderCp.provider, types: cpCall.stripe["payment_method_types[0]"], walletMeta: cpCall.stripe["metadata[wallet]"], idem: cpCall.idem };
    fake.stripePaid = true; fake.pmType = "cashapp";
    const cpView = await call("GET", `/api/orders/${orderCp.id}?key=${orderCp.access_key}`);
    out.cashAppPayPaid = { orderStatus: cpView.data.order.status, info: cpView.data.order.paymentInfo, paymentRef: orderCp.payment_ref };
    fake.stripePaid = false; fake.pmType = null; fake.cashappOff = true;
    const before = calls.filter((c) => c.stripe).length;
    const cp2 = await call("POST", "/api/checkout", { email: "p@example.com", address, shippingMethod: "standard", provider: "cashapp", items: [{ id: "p-hydrate", qty: 1 }] });
    const cpCalls = calls.filter((c) => c.stripe).slice(before);
    out.cashAppPayFallback = { status: cp2.status, orderStatus: db.orders[10].status, attempts: cpCalls.length, first: [cpCalls[0].stripe["payment_method_types[0]"], cpCalls[0].idem], second: cpCalls[1] && [cpCalls[1].stripe["payment_method_types[0]"] || "(dynamic)", cpCalls[1].idem] };
    fake.cashappOff = false;
    // wallets and zelle hidden / refused when nothing is configured
    const savedSk = env.STRIPE_SECRET_KEY, savedZe = env.ZELLE_CONTACT; env.STRIPE_SECRET_KEY = ""; env.ZELLE_CONTACT = "";
    const offModes = (await call("GET", "/api/checkout/config")).data.modes;
    out.walletsOff = { applepay: offModes.applepay, googlepay: offModes.googlepay, zelle: offModes.zelle, stripe: offModes.stripe };
    const apOff = await call("POST", "/api/checkout", { email: "n@example.com", address, shippingMethod: "standard", provider: "applepay", items: [{ id: "p-ignite", qty: 1 }] });
    const zeOff = await call("POST", "/api/checkout", { email: "n@example.com", address, shippingMethod: "standard", provider: "zelle", items: [{ id: "p-ignite", qty: 1 }] });
    out.walletsRefused = { applepay: `${apOff.status} ${apOff.data.error}`, zelle: `${zeOff.status} ${zeOff.data.error}` };
    env.STRIPE_SECRET_KEY = savedSk; env.ZELLE_CONTACT = savedZe;
    // accounts + e-mail: sign-up sends a verification link; verify; forgot -> reset -> login with the new password; contact form
    const lastMail = (re) => calls.filter((c) => c.email && re.test(c.email)).pop();
    const su = await call("POST", "/api/auth/signup", { name: "QA", email: "qa@example.com", password: "Password-123" });
    await settle();
    const mailV = lastMail(/Confirm your e-mail/), tokenV = mailV && (mailV.html.match(/verify\?token=([A-Za-z0-9_-]+)/) || [])[1];
    out.signup = { status: su.status, verified: su.data.user.emailVerified, mailTo: mailV && mailV.to, from: mailV && mailV.from, hasToken: !!tokenV, hashIter: db.users[0].password_hash.split("$")[1] };
    out.verifyBad = (await call("POST", "/api/auth/verify", { token: "nope" })).status;
    const vr = await call("POST", "/api/auth/verify", { token: tokenV });
    out.verify = { status: vr.status, email: vr.data.email, verifiedAt: !!db.users[0].email_verified_at, reuse: (await call("POST", "/api/auth/verify", { token: tokenV })).status };
    const fg = await call("POST", "/api/auth/forgot", { email: "qa@example.com" });
    await settle();
    const mailR = lastMail(/Reset your BlendWorks password/), tokenR = mailR && (mailR.html.match(/reset\?token=([A-Za-z0-9_-]+)/) || [])[1];
    const mailsBefore = calls.filter((c) => c.email).length;
    out.forgot = { status: fg.status, mailTo: mailR && mailR.to, hasToken: !!tokenR, unknownEmail: (await call("POST", "/api/auth/forgot", { email: "nobody@example.com" })).status };
    await settle();
    out.forgot.noMailForUnknown = calls.filter((c) => c.email).length === mailsBefore;
    const rs = await call("POST", "/api/auth/reset", { token: tokenR, password: "New-Password-456" });
    out.reset = { status: rs.status, email: rs.data.email, oldLogin: (await call("POST", "/api/auth/login", { email: "qa@example.com", password: "Password-123" })).status,
      newLogin: (await call("POST", "/api/auth/login", { email: "qa@example.com", password: "New-Password-456" })).status, reuse: (await call("POST", "/api/auth/reset", { token: tokenR, password: "Another-789" })).status, weak: (await call("POST", "/api/auth/reset", { token: "x", password: "short" })).status };
    const ct = await call("POST", "/api/contact", { name: "QA Buyer", email: "buyer@example.com", topic: "Order or shipping", message: "Where is my order BW-1001?" });
    const mailC = lastMail(/\[Contact\]/), mailsC = calls.filter((c) => c.email).length;
    out.contact = { status: ct.status, to: mailC && mailC.to, subject: mailC && mailC.email, replyTo: mailC && mailC.replyTo, tooShort: (await call("POST", "/api/contact", { name: "QA", email: "b@example.com", message: "hi" })).status,
      honeypot: (await call("POST", "/api/contact", { name: "Bot", email: "b@example.com", message: "buy stuff now please", website: "http://spam" })).status, noMailForBot: calls.filter((c) => c.email).length === mailsC };
    const savedKey = env.RESEND_API_KEY; env.RESEND_API_KEY = "";
    const mailsOff = calls.filter((c) => c.email).length;
    out.emailOff = { forgot: (await call("POST", "/api/auth/forgot", { email: "qa@example.com" })).status, contact: (await call("POST", "/api/contact", { name: "QA Buyer", email: "buyer@example.com", message: "Hello there, question." })).status,
      signup: (await call("POST", "/api/auth/signup", { name: "QA2", email: "qa2@example.com", password: "Password-123" })).status };
    await settle();
    out.emailOff.noMails = calls.filter((c) => c.email).length === mailsOff;
    env.RESEND_API_KEY = savedKey;
    // price parity with the builder for the custom capsule blend
    const b = (await (await realFetch("/assets/data/ingredients.json")).json()), sp2 = custom.spec, size = b.capsuleSizes.find((s) => s.id === sp2.capsuleSize);
    let ingr = 0; sp2.ingredients.forEach((id) => { const ing = b.ingredients.find((i) => i.id === id); const mg = size.capacityMg * sp2.pct[id] / 100; ingr += (mg * sp2.capsules / 1000) * ing.costPerGram * b.pricing.MARKUP; });
    out.customPriceParity = { builderPrice: Math.ceil(b.pricing.capsuleBase[sp2.capsules] + ingr) - 0.01, orderUnit: JSON.parse(order.items)[1].unit };
    out.db = { orders: db.orders.map((o) => `${o.number}:${o.status}:${o.provider}`), events: db.events.length };
    return out;
  } finally { window.fetch = realFetch; }
}
