/* Packing slip (/packing-slip?id=…&key=…[&print=1]) — the sheet that goes in the box, and the addresses the founder
   copies onto the label. Deliberately standalone: no site shell, no motion, no auth client, so it renders instantly and
   prints plainly (see "bare" in tools/pages.json). The link is in the "you have an order to pack" e-mail; the same
   owner/admin/access-key check as the order page guards the API. */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (cents) => "$" + (cents / 100).toFixed(2);
  const day = (t) => new Date(t * 1000).toLocaleDateString(undefined, { dateStyle: "medium" });

  async function load() {
    const q = new URLSearchParams(location.search), id = q.get("id") || "", key = q.get("key") || "";
    const host = $("[data-slip]");
    if (!id) { $("[data-slip-loading]").textContent = "This page needs an order link from the order e-mail or the fulfilment console."; return; }
    let o;
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}${key ? `?key=${encodeURIComponent(key)}` : ""}`, { credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) throw new Error(data && data.error || `Request failed (${res.status})`);
      o = data.order;
    } catch (e) {
      $("[data-slip-loading]").textContent = `Couldn't load the order: ${e.message}`;
      return;
    }
    const a = o.address || {}, items = o.items || [];
    const lines = items.map((l) => `<tr><td class="qty">${l.qty} ×</td><td><b>${esc(l.name)}</b>${l.description ? `<span>${esc(l.description)}</span>` : ""}${l.custom ? `<span class="formula">${(l.ingredients || []).map((i) => `${esc(i[0])} ${esc(i[1])}`).join(" · ")} per ${l.custom.format === "capsule" ? "capsule" : "scoop"}</span>` : ""}</td><td class="num">${money(l.unit * l.qty)}</td></tr>`).join("");
    document.title = `Packing slip ${o.number} — BlendWorks`;
    host.innerHTML = `
      <header class="slip-head">
        <div><b class="slip-brand">BlendWorks</b><span>Custom supplement capsules &amp; powders</span></div>
        <div class="slip-meta"><b>${esc(o.number)}</b><span>Placed ${day(o.createdAt)}</span>${o.paidAt ? `<span>Paid ${day(o.paidAt)}</span>` : ""}</div>
      </header>
      <section class="slip-cols">
        <div><h2>Ship to</h2><p class="slip-addr">${[a.name, a.line1, a.line2, `${a.city || ""}, ${a.state || ""} ${a.zip || ""}`, a.phone].filter(Boolean).map(esc).join("<br>")}</p></div>
        <div><h2>Shipping</h2><p>${esc(o.shippingMethod.label)} — ${esc(o.shippingMethod.carrier || "")}<br><span class="muted">${esc(o.shippingMethod.eta)}${o.weightOz ? ` · about ${o.weightOz} oz packed` : ""}</span></p>
        ${o.tracking && o.tracking.number ? `<p class="muted">Tracking ${esc(o.tracking.carrier || "")} ${esc(o.tracking.number)}</p>` : ""}</div>
      </section>
      <table class="slip-items"><tbody>${lines}</tbody></table>
      <table class="slip-totals"><tbody>
        <tr><td>Subtotal</td><td class="num">${money(o.amounts.subtotal)}</td></tr>
        <tr><td>Shipping</td><td class="num">${o.amounts.shipping ? money(o.amounts.shipping) : "Free"}</td></tr>
        ${o.amounts.tax ? `<tr><td>Sales tax</td><td class="num">${money(o.amounts.tax)}</td></tr>` : ""}
        <tr class="total"><td>Total paid</td><td class="num">${money(o.amounts.total)}</td></tr>
      </tbody></table>
      <footer class="slip-foot">
        <p><b>Thank you.</b> Every ingredient in this parcel was weighed and blended to order.</p>
        <p>Questions, or something not right? Reply to your order e-mail or go to blendworks.fit/contact and quote <b>${esc(o.number)}</b>.</p>
        <p class="muted">Unopened, sealed items can be returned for a full refund — start the return from your order page within 7 days of delivery.</p>
      </footer>`;
    $("[data-slip-actions]").hidden = false;
    $("[data-print]").addEventListener("click", () => window.print());
    if (q.get("print")) setTimeout(() => window.print(), 250);
  }
  document.addEventListener("DOMContentLoaded", load);
})();
