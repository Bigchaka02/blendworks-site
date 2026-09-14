/* Offline smoke test for worker/*.js — run in the browser against the local preview (python serve.py):
     const t = await import("/tools/worker-smoke.js"); await t.run();
   Uses an in-memory stand-in for D1 and fakes the Stripe / PayPal / Resend HTTP endpoints, so the checkout, payment
   confirmation, webhook and pricing code paths run without secrets. Browsers strip Cookie/Set-Cookie/Origin from
   page-created requests, so session-based routes (account, admin) are covered live with curl instead. Not deployed
   (tools/ is in .assetsignore). */
export async function run() {
  if (!crypto.subtle.timingSafeEqual) crypto.subtle.timingSafeEqual = (a, b) => { const x = new Uint8Array(a), y = new Uint8Array(b); let d = x.length ^ y.length; for (let i = 0; i < Math.min(x.length, y.length); i++) d |= x[i] ^ y[i]; return d === 0; };
  const mod = await import("/worker/index.js?t=" + Date.now());
  const ORIGIN = "https://blendworks.fit", now = () => Math.floor(Date.now() / 1000);

  /* ---------- in-memory D1 ---------- */
  const db = { users: [], sessions: [], attempts: [], orders: [], events: [], webhooks: [] };
  const stmt = (row, rows) => ({ first: async () => row || null, run: async () => ({}), all: async () => ({ results: rows || (row ? [row] : []) }) });
  function exec(sql, p) {
    sql = sql.replace(/\s+/g, " ").trim();
    if (sql.startsWith("SELECT COUNT(*) AS n FROM auth_attempts")) return stmt({ n: db.attempts.filter((a) => a.key === p[0] && a.at > p[1]).length });
    if (sql.startsWith("INSERT INTO auth_attempts")) { db.attempts.push({ key: p[0], at: p[1] }); return stmt(null); }
    if (sql.startsWith("DELETE FROM auth_attempts")) return stmt(null);
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
    CASHAPP_CASHTAG: "$blendworks", VENMO_HANDLE: "@blendworks-fit", BTC_ADDRESS: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", COINBASE_COMMERCE_API_KEY: "cc_fake", COINBASE_COMMERCE_WEBHOOK_SECRET: "cc_whsec_fake"
  };
  const ctx = { waitUntil: (p) => p.catch((e) => console.error("waitUntil", e)) };

  /* ---------- fake provider endpoints ---------- */
  const calls = [];
  const realFetch = window.fetch;
  const fake = { stripePaid: false, paypalStatus: "APPROVED", ccStatus: "PENDING" };
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://api.stripe.com/v1/checkout/sessions/")) return new Response(JSON.stringify({ id: url.split("/").pop(), payment_status: fake.stripePaid ? "paid" : "unpaid", status: fake.stripePaid ? "complete" : "open", payment_intent: "pi_fake_1" }));
    if (url === "https://api.stripe.com/v1/checkout/sessions") { calls.push({ stripe: Object.fromEntries(new URLSearchParams(init.body)) }); return new Response(JSON.stringify({ id: "cs_test_fake", url: "https://checkout.stripe.com/c/pay/cs_test_fake" })); }
    if (url.endsWith("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "tok" }));
    if (url.endsWith("/v2/checkout/orders")) { const body = JSON.parse(init.body); calls.push({ paypal: body }); const venmo = !!(body.payment_source && body.payment_source.venmo); return new Response(JSON.stringify({ id: venmo ? "PP-VENMO-1" : "PP-ORDER-1", status: venmo ? "PAYER_ACTION_REQUIRED" : "CREATED", links: [{ rel: venmo ? "payer-action" : "approve", href: venmo ? "https://www.sandbox.paypal.com/venmo?token=PP-VENMO-1" : "https://www.sandbox.paypal.com/checkoutnow?token=PP-ORDER-1" }] })); }
    if (url === "https://api.commerce.coinbase.com/charges") { calls.push({ coinbase: JSON.parse(init.body) }); return new Response(JSON.stringify({ data: { id: "cc-id-1", code: "CCCODE1", hosted_url: "https://commerce.coinbase.com/charges/CCCODE1" } })); }
    if (url.startsWith("https://api.commerce.coinbase.com/charges/")) return new Response(JSON.stringify({ data: { code: "CCCODE1", timeline: [{ status: "NEW" }, { status: fake.ccStatus }], payments: fake.ccStatus === "COMPLETED" ? [{ transaction_id: "btc-tx-1" }] : [] } }));
    if (url.startsWith("https://api.coinbase.com/v2/prices/")) return new Response(JSON.stringify({ data: { amount: "80000.00", currency: "USD" } }));
    if (url.endsWith("/v2/checkout/orders/PP-ORDER-1")) return new Response(JSON.stringify({ id: "PP-ORDER-1", status: fake.paypalStatus }));
    if (url.endsWith("/v2/checkout/orders/PP-ORDER-1/capture")) { calls.push({ capture: true }); return new Response(JSON.stringify({ id: "PP-ORDER-1", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "CAP-1" }] } }] })); }
    if (url.startsWith("https://api.resend.com/")) { calls.push({ email: JSON.parse(init.body).subject }); return new Response("{}"); }
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
    // manual methods: cash app (order stays pending, instructions + reported)
    const cfg2 = await call("GET", "/api/checkout/config");
    out.modes = cfg2.data.modes;
    const ca = await call("POST", "/api/checkout", { email: "d@example.com", address, shippingMethod: "standard", provider: "cashapp", items: [{ id: "p-hydrate", qty: 2 }] });
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
    // bitcoin via Coinbase Commerce: create, pending, then confirmed; webhook good/bad/duplicate; failed -> cancelled
    const bc = await call("POST", "/api/checkout", { email: "g@example.com", address, shippingMethod: "standard", provider: "bitcoin", items: [{ id: "p-night-recovery", qty: 1 }] });
    const orderBc = db.orders[6], ccBody = calls.find((c) => c.coinbase).coinbase;
    out.bitcoinApi = { status: bc.status, url: bc.data.url, ref: orderBc.provider_ref, charge: { amount: ccBody.local_price, meta: ccBody.metadata.order_id === orderBc.id, redirect: ccBody.redirect_url.includes(orderBc.access_key) } };
    const bv1 = await call("GET", `/api/orders/${orderBc.id}?key=${orderBc.access_key}`);
    out.bitcoinPending = { orderStatus: bv1.data.order.status, info: bv1.data.order.paymentInfo };
    fake.ccStatus = "COMPLETED";
    const bv2 = await call("GET", `/api/orders/${orderBc.id}?key=${orderBc.access_key}`);
    out.bitcoinPaid = { orderStatus: bv2.data.order.status, paymentRef: orderBc.payment_ref };
    const bc2 = await call("POST", "/api/checkout", { email: "h@example.com", address, shippingMethod: "standard", provider: "bitcoin", items: [{ id: "p-night-recovery", qty: 1 }] });
    const orderBc2 = db.orders[7], ccPayload = JSON.stringify({ event: { id: "cc-evt-1", type: "charge:confirmed", data: { code: "CCCODE1", metadata: { order_id: orderBc2.id }, payments: [{ transaction_id: "btc-tx-2" }] } } });
    const ccKey = await crypto.subtle.importKey("raw", new TextEncoder().encode("cc_whsec_fake"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const ccSig = [...new Uint8Array(await crypto.subtle.sign("HMAC", ccKey, new TextEncoder().encode(ccPayload)))].map((b) => b.toString(16).padStart(2, "0")).join("");
    out.coinbaseWebhook = { bad: (await call("POST", "/api/webhooks/coinbase", ccPayload, { "X-CC-Webhook-Signature": "00", "Content-Type": "application/json" })).status, ok: (await call("POST", "/api/webhooks/coinbase", ccPayload, { "X-CC-Webhook-Signature": ccSig, "Content-Type": "application/json" })).status, orderStatus: orderBc2.status, paymentRef: orderBc2.payment_ref, dup: (await call("POST", "/api/webhooks/coinbase", ccPayload, { "X-CC-Webhook-Signature": ccSig, "Content-Type": "application/json" })).data };
    const bc3 = await call("POST", "/api/checkout", { email: "i@example.com", address, shippingMethod: "standard", provider: "bitcoin", items: [{ id: "p-night-recovery", qty: 1 }] });
    const orderBc3 = db.orders[8], failPayload = JSON.stringify({ event: { id: "cc-evt-2", type: "charge:failed", data: { code: "CCCODE1", metadata: { order_id: orderBc3.id } } } });
    const failSig = [...new Uint8Array(await crypto.subtle.sign("HMAC", ccKey, new TextEncoder().encode(failPayload)))].map((b) => b.toString(16).padStart(2, "0")).join("");
    out.coinbaseFailed = { status: (await call("POST", "/api/webhooks/coinbase", failPayload, { "X-CC-Webhook-Signature": failSig, "Content-Type": "application/json" })).status, orderStatus: orderBc3.status };
    // bitcoin manual when the Commerce key is absent (spot-rate quote)
    const savedCc = env.COINBASE_COMMERCE_API_KEY; env.COINBASE_COMMERCE_API_KEY = "";
    out.bitcoinManualMode = (await call("GET", "/api/checkout/config")).data.modes.bitcoin;
    const bm = await call("POST", "/api/checkout", { email: "j@example.com", address, shippingMethod: "standard", provider: "bitcoin", items: [{ id: "p-night-recovery", qty: 1 }] });
    const bmInfo = JSON.parse(db.orders[9].payment_info);
    out.bitcoinManual = { status: bm.status, btc: bmInfo.btc, rate: bmInfo.rate, expectedBtc: (db.orders[9].total / 100 / 80000).toFixed(8), uri: bmInfo.uri, address: bmInfo.address };
    env.COINBASE_COMMERCE_API_KEY = savedCc;
    env.BTC_ADDRESS = "not-an-address"; out.badBtcAddressHidden = (await call("GET", "/api/checkout/config")).data.modes.bitcoin === "api" ? "api (key present)" : "hidden"; env.BTC_ADDRESS = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
    // price parity with the builder for the custom capsule blend
    const b = (await (await realFetch("/assets/data/ingredients.json")).json()), sp2 = custom.spec, size = b.capsuleSizes.find((s) => s.id === sp2.capsuleSize);
    let ingr = 0; sp2.ingredients.forEach((id) => { const ing = b.ingredients.find((i) => i.id === id); const mg = size.capacityMg * sp2.pct[id] / 100; ingr += (mg * sp2.capsules / 1000) * ing.costPerGram * b.pricing.MARKUP; });
    out.customPriceParity = { builderPrice: Math.ceil(b.pricing.capsuleBase[sp2.capsules] + ingr) - 0.01, orderUnit: JSON.parse(order.items)[1].unit };
    out.db = { orders: db.orders.map((o) => `${o.number}:${o.status}:${o.provider}`), events: db.events.length };
    return out;
  } finally { window.fetch = realFetch; }
}
