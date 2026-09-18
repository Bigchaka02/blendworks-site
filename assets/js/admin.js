/* Fulfilment console (/admin, accounts with role = admin): list and search orders, open one, add tracking, move it
   through paid → processing → shipped → delivered (or cancelled / refunded), leave notes. Talks to /api/admin/*.
   Reuses BW.orderBadge / orderItems / orderAddress from order.js. */
(function () {
  const { $, $$ } = BW;
  const dollars = (cents) => BW.formatPrice(cents / 100);
  const when = (t) => new Date(t * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const FILTERS = [["", "All"], ["paid", "Paid — to blend"], ["processing", "Blending"], ["shipped", "Shipped"], ["delivered", "Delivered"], ["pending_payment", "Awaiting payment"], ["cancelled", "Cancelled"], ["refunded", "Refunded"]];
  const ACTIONS = { paid: ["processing", "cancelled"], processing: ["shipped", "cancelled"], shipped: ["delivered", "refunded"], delivered: ["refunded"], pending_payment: ["paid", "cancelled"], cancelled: ["paid"], refunded: [] };
  const VERB = { paid: "Mark paid (manual)", processing: "Start blending", shipped: "Mark shipped", delivered: "Mark delivered", cancelled: "Cancel order", refunded: "Mark refunded" };

  document.addEventListener("bw:ready", () => {
    const root = $("[data-admin]");
    if (!root) return;
    const state = { filter: "", q: "", orders: [], counts: {}, selected: null };

    async function load() {
      try {
        const d = await BW.auth.api(`/api/admin/orders?status=${encodeURIComponent(state.filter)}&q=${encodeURIComponent(state.q)}`);
        state.orders = d.orders; state.counts = d.counts;
        root.hidden = false;
        renderFilters(); renderRows();
      } catch (e) {
        if (e.status === 401) location.replace(BW.auth.loginUrl("/admin"));
        else $("[data-admin-denied]").hidden = false;
      }
    }
    function renderFilters() {
      $("[data-admin-filters]").innerHTML = FILTERS.map(([id, label]) => {
        const n = id ? state.counts[id] || 0 : Object.values(state.counts).reduce((a, b) => a + b, 0);
        return `<button class="chip${id === state.filter ? " is-active" : ""}" data-filter="${id}" aria-pressed="${id === state.filter}">${label} <span class="muted">${n}</span></button>`;
      }).join("");
    }
    function renderRows() {
      const rows = $("[data-admin-rows]");
      if (!state.orders.length) { rows.innerHTML = '<tr><td colspan="6" class="muted">No orders here yet.</td></tr>'; return; }
      rows.innerHTML = state.orders.map((o) => `<tr data-id="${o.id}"${o.id === state.selected ? ' class="is-selected"' : ""}><td><b>${o.number}</b><br><span class="muted small">${BW.providerName(o.provider)}${o.manual ? " · manual" : ""}</span>${o.reportedAt && o.status === "pending_payment" ? '<br><span class="badge mint">reported</span>' : ""}</td><td>${when(o.createdAt)}</td><td>${BW.escapeHtml(o.email)}<br><span class="muted small">${BW.escapeHtml(o.city || "")}${o.state ? ", " + o.state : ""}</span></td><td class="small">${o.items.map(BW.escapeHtml).join("<br>")}</td><td class="num">${dollars(o.total)}</td><td>${BW.orderBadge(o.status)}</td></tr>`).join("");
    }
    async function open(id) {
      state.selected = id; renderRows();
      const box = $("[data-admin-detail]");
      box.innerHTML = '<p class="muted m-0">Loading…</p>';
      let o;
      try { o = (await BW.auth.api(`/api/admin/orders/${id}`)).order; } catch (e) { box.innerHTML = `<p class="muted m-0">${BW.escapeHtml(e.message)}</p>`; return; }
      const tr = o.tracking || {};
      box.innerHTML = `
        <div class="row between items-end mb-1"><div><div class="eyebrow">${o.number}</div><h2 class="m-0">${dollars(o.amounts.total)}</h2></div>${BW.orderBadge(o.status)}</div>
        <p class="muted small">${BW.providerName(o.provider)}${o.paymentInfo && o.paymentInfo.wallet ? ` · paid with ${BW.walletName(o.paymentInfo.wallet)}` : ""}${o.paymentRef ? ` · payment ${BW.escapeHtml(o.paymentRef)}` : ""}${o.providerRef ? ` · ref ${BW.escapeHtml(o.providerRef)}` : ""}<br>Placed ${when(o.createdAt)}${o.paidAt ? ` · paid ${when(o.paidAt)}` : ""}</p>
        ${o.paymentInfo && o.paymentInfo.mode === "manual" ? `<div class="notice mb-1">Manual ${BW.providerName(o.paymentInfo.provider)} payment: expect <b>${dollars(o.paymentInfo.amount)}</b> with memo <b>${BW.escapeHtml(o.paymentInfo.memo)}</b> ${o.paymentInfo.handle ? `to ${BW.escapeHtml(o.paymentInfo.handle)}${o.paymentInfo.name ? ` (${BW.escapeHtml(o.paymentInfo.name)})` : ""}` : ""}. ${o.reportedAt ? `Customer reported sending it ${when(o.reportedAt)}.` : "Not reported by the customer yet."} Check your app, then <b>Mark paid</b>.</div>` : ""}
        ${o.paymentInfo && o.paymentInfo.mode === "api" && o.paymentInfo.status ? `<p class="muted small">Provider status: ${BW.escapeHtml(o.paymentInfo.status)}</p>` : ""}
        <div class="row gap-sm mb-1" data-admin-actions>${(ACTIONS[o.status] || []).map((s) => `<button class="btn btn-sm ${s === "cancelled" || s === "refunded" ? "btn-danger" : "btn-primary"}" data-set-status="${s}">${VERB[s]}</button>`).join("")}<a class="btn btn-ghost btn-sm" href="/order?id=${o.id}" target="_blank" rel="noopener">Customer view</a></div>
        <div class="form-error mb-1" data-error hidden></div>
        <h3 class="small-h">Ship to</h3><p class="addr">${BW.orderAddress(o.address)}</p><p class="muted small">${BW.escapeHtml(o.email)} · ${o.shippingMethod.label} (${o.shippingMethod.eta})</p>
        <h3 class="small-h">Items</h3><div class="order-items mb-1">${BW.orderItems(o)}</div>
        ${o.items.some((l) => l.custom) ? `<div class="notice mb-1">Custom blend${o.items.filter((l) => l.custom).length > 1 ? "s" : ""}: ${o.items.filter((l) => l.custom).map((l) => `<b>${BW.escapeHtml(l.name)}</b> — ${l.ingredients.map((i) => `${BW.escapeHtml(i[0])} ${i[1]}`).join(", ")} per ${l.custom.format === "capsule" ? "capsule" : "scoop"}`).join("; ")}</div>` : ""}
        <form class="form-grid" data-tracking-form>
          <div class="field"><label for="ad-carrier">Carrier</label><input class="input" id="ad-carrier" name="carrier" placeholder="USPS" value="${BW.escapeHtml(tr.carrier || "")}"></div>
          <div class="field"><label for="ad-number">Tracking number</label><input class="input" id="ad-number" name="number" value="${BW.escapeHtml(tr.number || "")}"></div>
          <div class="field full"><label for="ad-url">Tracking link <span class="muted">(https://…)</span></label><input class="input" id="ad-url" name="url" type="url" value="${BW.escapeHtml(tr.url || "")}"></div>
          <div class="field full"><label for="ad-note">Internal note</label><textarea class="input" id="ad-note" name="note" rows="2" placeholder="Batch number, substitutions, customer request…">${BW.escapeHtml(o.note || "")}</textarea></div>
          <div class="full row between"><button class="btn btn-secondary btn-sm" type="submit">Save tracking &amp; note</button><label class="check m-0"><input type="checkbox" name="ship" ${o.status === "paid" || o.status === "processing" ? "" : "disabled"}> <span>and mark shipped</span></label></div>
        </form>
        <h3 class="small-h mt-15">History</h3>
        <ul class="events">${o.events.map((e) => `<li><b>${e.type}</b> ${e.detail ? "— " + BW.escapeHtml(e.detail) : ""}<br><span>${when(e.at)} · ${BW.escapeHtml(e.actor || "")}</span></li>`).join("")}</ul>`;
      const err = $("[data-error]", box);
      const update = async (body) => {
        err.hidden = true;
        try {
          await BW.auth.api(`/api/admin/orders/${id}`, { method: "POST", body });
          BW.toast("Order updated.");
          await load(); await open(id);
        } catch (e) { err.textContent = e.message; err.hidden = false; }
      };
      $$("[data-set-status]", box).forEach((b) => b.addEventListener("click", () => {
        const s = b.dataset.setStatus;
        if ((s === "cancelled" || s === "refunded") && !confirm(`${VERB[s]} for ${o.number}?`)) return;
        update({ status: s });
      }));
      $("[data-tracking-form]", box).addEventListener("submit", (e) => {
        e.preventDefault();
        const fd = new FormData(e.target), body = { tracking: { carrier: fd.get("carrier"), number: fd.get("number"), url: fd.get("url") }, note: fd.get("note") };
        if (fd.get("ship")) body.status = "shipped";
        update(body);
      });
    }

    root.addEventListener("click", (e) => {
      const f = e.target.closest("[data-filter]"), row = e.target.closest("tr[data-id]");
      if (f) { state.filter = f.dataset.filter; load(); }
      else if (row) open(row.dataset.id);
      else if (e.target.closest("[data-admin-refresh]")) load();
    });
    let timer;
    $("[data-admin-q]").addEventListener("input", (e) => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value.trim(); load(); }, 250); });
    load();
  });
})();
