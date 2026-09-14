/* Order page (/order?id=…&key=…): confirmation after payment and the customer's tracking view.
   The Worker re-checks the payment provider on each load while an order is still pending, so this page just polls
   a few times after the return from Stripe / PayPal. Shared status labels live in BW.orderStatus (used by the account
   and admin pages too). */
(function () {
  const { $, $$ } = BW;
  const KEY_PENDING = "bw_pending_order";
  const dollars = (cents) => BW.formatPrice(cents / 100);
  const STATUS = {
    pending_payment: { label: "Awaiting payment", cls: "amber" }, paid: { label: "Paid", cls: "mint" }, processing: { label: "Being blended", cls: "" },
    shipped: { label: "Shipped", cls: "lav" }, delivered: { label: "Delivered", cls: "success" }, cancelled: { label: "Cancelled", cls: "danger" }, refunded: { label: "Refunded", cls: "danger" }
  };
  const STEPS = [["created", "Placed"], ["paid", "Paid"], ["processing", "Blending"], ["shipped", "Shipped"], ["delivered", "Delivered"]];
  const RANK = { pending_payment: 0, paid: 1, processing: 2, shipped: 3, delivered: 4 };
  const when = (t) => new Date(t * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const EVENT_TEXT = { created: "Order placed", paid: "Payment received", processing: "We started blending your order", shipped: "Shipped", delivered: "Delivered", cancelled: "Order cancelled", refunded: "Refunded", tracking: "Tracking added", note: "Note", instructions: "Payment instructions shown", reported: "You told us the payment was sent" };
  BW.orderStatus = (s) => STATUS[s] || { label: s, cls: "" };
  BW.orderBadge = (s) => `<span class="badge ${BW.orderStatus(s).cls}">${BW.orderStatus(s).label}</span>`;
  BW.orderTimeline = (order) => {
    const rank = RANK[order.status];
    return STEPS.map(([k, label], i) => {
      const done = rank !== undefined && i <= rank && !(i === 0 && false), current = rank === i;
      const stamp = k === "created" ? order.createdAt : k === "paid" ? order.paidAt : k === "shipped" ? order.shippedAt : k === "delivered" ? order.deliveredAt : null;
      return `<li class="order-step${done ? " is-done" : ""}${current ? " is-current" : ""}"><b>${label}</b>${stamp ? `<span>${new Date(stamp * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>` : ""}</li>`;
    }).join("");
  };
  BW.orderItems = (order) => order.items.map((l) => `<div class="line"><span>${l.qty} × ${BW.escapeHtml(l.name)}<span class="muted small"> · ${BW.escapeHtml(l.description || l.servingSize || "")}</span></span><span class="num">${dollars(l.unit * l.qty)}</span></div>`).join("");
  BW.orderAddress = (a) => [a.name, a.line1, a.line2, `${a.city}, ${a.state} ${a.zip}`, a.phone].filter(Boolean).map(BW.escapeHtml).join("\n");

  document.addEventListener("bw:ready", () => {
    const root = $("[data-order]");
    if (!root) return;
    const q = new URLSearchParams(location.search), id = q.get("id") || "", key = q.get("key") || "";
    let polls = 0;
    const missing = (text) => { $("[data-order-missing]").hidden = false; if (text) $("[data-order-missing-text]").textContent = text; };
    if (!id) return missing();

    async function load() {
      let order;
      try { order = (await BW.auth.api(`/api/orders/${encodeURIComponent(id)}${key ? `?key=${encodeURIComponent(key)}` : ""}`)).order; }
      catch (e) { return missing(e.status === 404 ? "This link doesn't match an order. If the order is yours, sign in to see it in your account." : `Couldn't load the order: ${e.message}`); }
      render(order);
      const manual = order.paymentInfo && order.paymentInfo.mode === "manual";
      if (order.status === "pending_payment" && !manual && polls++ < 8) setTimeout(load, 3000);   // provider confirmation usually lands within seconds
      if (manual || (order.status !== "pending_payment" && order.status !== "cancelled")) {   // the order exists now — don't let the cart create a second one
        try { if (localStorage.getItem(KEY_PENDING) === order.id) { BW.cart.clear(); localStorage.removeItem(KEY_PENDING); } } catch (e) { /* storage blocked */ }
      }
    }
    function render(o) {
      $("[data-order-view]").hidden = false;
      document.title = `Order ${o.number} — BlendWorks`;
      const pending = o.status === "pending_payment", cancelled = o.status === "cancelled" || o.status === "refunded";
      const info = o.paymentInfo || {}, manual = pending && info.mode === "manual", detected = pending && info.mode === "api" && info.status === "PENDING";
      $("[data-order-eyebrow]").textContent = `Order ${o.number}`;
      $("[data-order-title]").innerHTML = manual ? "One more step — <span class=\"grad-text\">send your payment</span>" : pending ? "Confirming your <span class=\"grad-text\">payment</span>…" : cancelled ? `Order <span class="grad-text">${o.status}</span>` : "Thank you — <span class=\"grad-text\">you're all set</span>";
      $("[data-order-sub]").textContent = manual ? `Placed ${when(o.createdAt)} · we'll confirm your payment and e-mail you` : detected ? "Payment detected — waiting for network confirmations (usually 10–30 minutes)." : pending ? "This usually takes a few seconds. Keep this page open." : `Placed ${when(o.createdAt)}${o.paidAt ? ` · paid ${when(o.paidAt)}` : ""}`;
      renderPayBox(o, manual);
      $("[data-order-status]").outerHTML = BW.orderBadge(o.status).replace("<span", '<span data-order-status');
      $("[data-order-steps]").innerHTML = cancelled ? "" : BW.orderTimeline(o);
      const notice = $("[data-order-notice]");
      notice.hidden = !((pending && !manual && !detected) || cancelled);
      if (pending) notice.textContent = "If you closed the payment page, nothing was charged — go back to the cart to try again.";
      if (cancelled) notice.textContent = o.status === "refunded" ? "This order was refunded. Your bank may take a few days to show it." : "This order was cancelled and nothing was charged. Your cart is still saved if you want to try again.";
      const tr = $("[data-order-tracking]");
      tr.hidden = !o.tracking;
      if (o.tracking) tr.innerHTML = `<b>On its way${o.tracking.carrier ? ` with ${BW.escapeHtml(o.tracking.carrier)}` : ""}</b><div class="mt-05">Tracking ${o.tracking.url ? `<a href="${BW.escapeHtml(o.tracking.url)}" rel="noopener" target="_blank">${BW.escapeHtml(o.tracking.number || "link")}</a>` : BW.escapeHtml(o.tracking.number || "")}</div>`;
      $("[data-order-items]").innerHTML = BW.orderItems(o);
      $("[data-order-subtotal]").textContent = dollars(o.amounts.subtotal);
      $("[data-order-method]").textContent = `(${o.shippingMethod.label}, ${o.shippingMethod.eta})`;
      $("[data-order-shipping]").textContent = o.amounts.shipping ? dollars(o.amounts.shipping) : "Free";
      $("[data-order-tax]").textContent = o.amounts.tax ? dollars(o.amounts.tax) : "—";
      $("[data-order-total]").textContent = dollars(o.amounts.total);
      $("[data-order-address]").innerHTML = BW.orderAddress(o.address);
      $("[data-order-email]").textContent = `Updates go to ${o.email}.`;
      $("[data-order-events]").innerHTML = o.events.map((e) => `<li><b>${EVENT_TEXT[e.type] || e.type}</b>${e.detail && e.type !== "created" && e.type !== "paid" ? ` — ${BW.escapeHtml(e.detail)}` : ""}<br><span>${when(e.at)}</span></li>`).join("") || "<li>No updates yet.</li>";
    }
    function renderPayBox(o, manual) {
      let box = $("[data-pay-box]");
      if (!manual) { if (box) box.remove(); return; }
      if (!box) { box = document.createElement("div"); box.className = "pay-box mb-2"; box.setAttribute("data-pay-box", ""); $("[data-order-notice]").before(box); }
      const i = o.paymentInfo, amt = dollars(i.amount), reported = o.reportedAt;
      const how = i.provider === "cashapp"
        ? `<p>Open <b>Cash App</b> and send <b>${amt}</b> to <code>${BW.escapeHtml(i.handle)}</code>. Put <code>${BW.escapeHtml(i.memo)}</code> in the note so we can match it to your order.</p><a class="btn btn-primary" href="${BW.escapeHtml(i.link)}" rel="noopener" target="_blank">Open Cash App</a>`
        : i.provider === "venmo"
        ? `<p>Open <b>Venmo</b> and send <b>${amt}</b> to <code>${BW.escapeHtml(i.handle)}</code>. Put <code>${BW.escapeHtml(i.memo)}</code> in the note so we can match it to your order.</p><a class="btn btn-primary" href="${BW.escapeHtml(i.link)}" rel="noopener" target="_blank">Open Venmo</a>`
        : `<p>Send ${i.btc ? `<b>${i.btc} BTC</b> (${amt} at $${Number(i.rate).toLocaleString()} / BTC, quoted ${when(i.quotedAt)})` : `the equivalent of <b>${amt}</b> in BTC`} to this address:</p><p><code class="addr-code">${BW.escapeHtml(i.address)}</code></p><p class="muted small">Send exactly this amount from your own wallet within about 20 minutes of the quote; network fees are yours. We confirm once the transaction arrives.</p><a class="btn btn-primary" href="${BW.escapeHtml(i.uri)}">Open in wallet</a>`;
      box.innerHTML = `<h2>How to pay</h2>${how}<div class="mt-1">${reported ? `<span class="badge mint">Payment reported ${when(reported)}</span> <span class="muted small">— we'll confirm it and e-mail you.</span>` : `<button class="btn btn-secondary" data-reported>I've sent the payment</button>`}</div>`;
      const btn = $("[data-reported]", box);
      if (btn) btn.addEventListener("click", async () => {
        btn.disabled = true;
        try { const r = await BW.auth.api(`/api/orders/${encodeURIComponent(id)}/reported${key ? `?key=${encodeURIComponent(key)}` : ""}`, { method: "POST", body: {} }); render(r.order); BW.toast("Thanks — we'll confirm your payment shortly."); }
        catch (e) { btn.disabled = false; BW.toast(e.message); }
      });
    }
    load();
  });
})();
