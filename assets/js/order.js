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
  const EVENT_TEXT = { created: "Order placed", paid: "Payment received", processing: "We started blending your order", shipped: "Shipped", delivered: "Delivered", cancelled: "Order cancelled", refunded: "Refunded", tracking: "Tracking added", note: "Note" };
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
      if (order.status === "pending_payment" && polls++ < 8) setTimeout(load, 3000);   // provider confirmation usually lands within seconds
      if (order.status !== "pending_payment" && order.status !== "cancelled") {
        try { if (localStorage.getItem(KEY_PENDING) === order.id) { BW.cart.clear(); localStorage.removeItem(KEY_PENDING); } } catch (e) { /* storage blocked */ }
      }
    }
    function render(o) {
      $("[data-order-view]").hidden = false;
      document.title = `Order ${o.number} — BlendWorks`;
      const pending = o.status === "pending_payment", cancelled = o.status === "cancelled" || o.status === "refunded";
      $("[data-order-eyebrow]").textContent = `Order ${o.number}`;
      $("[data-order-title]").innerHTML = pending ? "Confirming your <span class=\"grad-text\">payment</span>…" : cancelled ? `Order <span class="grad-text">${o.status}</span>` : "Thank you — <span class=\"grad-text\">you're all set</span>";
      $("[data-order-sub]").textContent = pending ? "This usually takes a few seconds. Keep this page open." : `Placed ${when(o.createdAt)}${o.paidAt ? ` · paid ${when(o.paidAt)}` : ""}`;
      $("[data-order-status]").outerHTML = BW.orderBadge(o.status).replace("<span", '<span data-order-status');
      $("[data-order-steps]").innerHTML = cancelled ? "" : BW.orderTimeline(o);
      const notice = $("[data-order-notice]");
      notice.hidden = !(pending || cancelled);
      if (pending) notice.textContent = "If you closed the payment page, your card was not charged — go back to the cart to try again.";
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
    load();
  });
})();
