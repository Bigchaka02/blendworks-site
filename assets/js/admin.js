/* Fulfilment console (/admin, accounts with role = admin): list and search orders, open one, print its packing slip,
   copy the address, export the visible orders as a shipping spreadsheet (Pirate Ship), add tracking, and move the order
   through paid → processing → shipped → delivered (or cancelled / refunded), leaving notes. Talks to /api/admin/*.
   Reuses BW.orderBadge / orderItems / orderAddress from order.js. */
(function () {
  const { $, $$ } = BW;
  const dollars = (cents) => BW.formatPrice(cents / 100);
  const when = (t) => new Date(t * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const FILTERS = [["", "All"], ["paid", "Paid — to blend"], ["processing", "Blending"], ["shipped", "Shipped"], ["delivered", "Delivered"], ["pending_payment", "Awaiting payment"], ["returns", "Returns"], ["cancelled", "Cancelled"], ["refunded", "Refunded"]];
  const ACTIONS = { paid: ["processing", "cancelled"], processing: ["shipped", "cancelled"], shipped: ["delivered", "refunded"], delivered: ["refunded"], pending_payment: ["paid", "cancelled"], cancelled: ["paid"], refunded: [] };
  const VERB = { paid: "Mark paid (manual)", processing: "Start blending", shipped: "Mark shipped", delivered: "Mark delivered", cancelled: "Cancel order", refunded: "Mark refunded" };
  const RETURN_ACTIONS = {   // what an admin can do next, in order
    requested: [["approve", "Approve return", "btn-primary"], ["decline", "Decline", "btn-danger"]],
    approved: [["received", "Parcel arrived", "btn-primary"], ["refund", "Refund now", "btn-primary"], ["cancel", "Cancel return", "btn-ghost"]],
    received: [["refund", "Refund", "btn-primary"], ["cancel", "Cancel return", "btn-ghost"]],
    refunded: [], declined: [], cancelled: []
  };
  const RETURN_LABEL = { requested: "Requested", approved: "Approved — waiting for the parcel", received: "Parcel received", refunded: "Refunded", declined: "Declined", cancelled: "Cancelled" };
  const addressText = (a) => [a.name, a.line1, a.line2, `${a.city}, ${a.state} ${a.zip}`].filter(Boolean).join("\n");
  // Pirate Ship (and every other label tool) imports a spreadsheet and asks you to map the columns once — plain headers.
  const CSV_COLS = [["Order", (o) => o.number], ["Name", (o) => o.address.name], ["Address Line 1", (o) => o.address.line1], ["Address Line 2", (o) => o.address.line2 || ""],
    ["City", (o) => o.address.city], ["State", (o) => o.address.state], ["Zip", (o) => o.address.zip], ["Country", (o) => o.address.country || "US"],
    ["Email", (o) => o.email], ["Phone", (o) => o.address.phone || ""], ["Weight (oz)", (o) => o.weightOz], ["Contents", (o) => o.items.join("; ")]];
  const csvCell = (v) => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function exportCsv(orders) {
    if (!orders.length) { BW.toast("Nothing to export in this view."); return; }
    const rows = [CSV_COLS.map((c) => c[0]).join(",")].concat(orders.map((o) => CSV_COLS.map((c) => csvCell(c[1](o))).join(",")));
    const url = URL.createObjectURL(new Blob(["\ufeff" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `blendworks-labels-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    BW.toast(`${orders.length} order${orders.length > 1 ? "s" : ""} exported — upload the file to Pirate Ship.`);
  }

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
      rows.innerHTML = state.orders.map((o) => `<tr data-id="${o.id}"${o.id === state.selected ? ' class="is-selected"' : ""}><td><b>${o.number}</b><br><span class="muted small">${BW.providerName(o.provider)}${o.manual ? " · manual" : ""}</span>${o.reportedAt && o.status === "pending_payment" ? '<br><span class="badge mint">reported</span>' : ""}${o.openReturns ? '<br><span class="badge amber">return</span>' : ""}${o.refunded ? `<br><span class="muted small">−${dollars(o.refunded)} refunded</span>` : ""}</td><td>${when(o.createdAt)}</td><td>${BW.escapeHtml(o.email)}<br><span class="muted small">${BW.escapeHtml(o.city || "")}${o.state ? ", " + o.state : ""}</span></td><td class="small">${o.items.map(BW.escapeHtml).join("<br>")}</td><td class="num">${dollars(o.total)}</td><td>${BW.orderBadge(o.status)}</td></tr>`).join("");
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
        <div class="row gap-sm mb-1" data-admin-actions>${(ACTIONS[o.status] || []).map((s) => `<button class="btn btn-sm ${s === "cancelled" || s === "refunded" ? "btn-danger" : "btn-primary"}" data-set-status="${s}">${VERB[s]}</button>`).join("")}</div>
        <div class="row gap-sm mb-1"><a class="btn btn-secondary btn-sm" href="/packing-slip?id=${o.id}&amp;print=1" target="_blank" rel="noopener">Print packing slip</a><button class="btn btn-secondary btn-sm" data-copy-address>Copy address</button><a class="btn btn-ghost btn-sm" href="/order?id=${o.id}" target="_blank" rel="noopener">Customer view</a></div>
        <div class="form-error mb-1" data-error hidden></div>
        ${(o.returns || []).length ? `<h3 class="small-h">Returns</h3><div class="stack gap-sm mb-1">${o.returns.map((r) => `
          <div class="notice" data-return="${r.id}">
            <b>${RETURN_LABEL[r.status] || r.status}</b> · ${r.items.map((i) => `${i.qty} × ${BW.escapeHtml(i.name)}`).join(", ")} · ${BW.escapeHtml(r.reasonText || "")}
            ${r.note ? `<br><span class="muted small">“${BW.escapeHtml(r.note)}”</span>` : ""}
            <br><span class="muted small">${r.status === "refunded" ? `${dollars(r.amount)} refunded ${r.refundedAt ? when(r.refundedAt) : ""}${r.automatic ? "" : " — send this one by hand"}` : `about ${dollars(r.amount)} (items + tax)`} · asked ${when(r.createdAt)}</span>
            ${(RETURN_ACTIONS[r.status] || []).length ? `<div class="row gap-sm mt-05">${(RETURN_ACTIONS[r.status] || []).map(([a, label, cls]) => `<button class="btn btn-sm ${cls}" data-return-action="${a}" data-return-id="${r.id}">${label}</button>`).join("")}${r.status !== "requested" ? `<label class="check m-0"><input type="checkbox" data-return-ship="${r.id}"> <span class="small">also refund shipping</span></label>` : ""}</div>` : ""}
          </div>`).join("")}</div>` : ""}
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
      $$("[data-return-action]", box).forEach((b) => b.addEventListener("click", async () => {
        const action = b.dataset.returnAction, rid = b.dataset.returnId;
        const ship = $(`[data-return-ship="${rid}"]`, box);
        let note = "";
        if (action === "decline") { note = window.prompt("Why are you declining this return? (the customer sees this)") || ""; if (!note) return; }
        if (action === "refund" && !confirm(`Refund this return${ship && ship.checked ? " including the original shipping" : ""}?`)) return;
        err.hidden = true;
        b.disabled = true;
        try {
          await BW.auth.api(`/api/admin/returns/${rid}`, { method: "POST", body: { action, note, includeShipping: !!(ship && ship.checked) } });
          BW.toast(action === "refund" ? "Refund sent." : "Return updated.");
          await load(); await open(id);
        } catch (e2) { err.textContent = e2.message; err.hidden = false; b.disabled = false; }
      }));
      $("[data-copy-address]", box).addEventListener("click", async (e) => {
        const text = addressText(o.address);
        try { await navigator.clipboard.writeText(text); BW.toast("Address copied — paste it into the label."); }
        catch (err) { window.prompt("Copy the address:", text.replace(/\n/g, ", ")); }
      });
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
      else if (e.target.closest("[data-admin-export]")) exportCsv(state.orders);
    });
    let timer;
    $("[data-admin-q]").addEventListener("input", (e) => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value.trim(); load(); }, 250); });
    load();
  });
})();
