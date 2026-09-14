/* Checkout page: contact, US shipping address, shipping method and payment method, then POST /api/checkout and
   follow the provider's redirect (Stripe Checkout, PayPal, or the admin-only test payment). Prices shown here are a
   preview — the Worker recomputes everything from the catalog and the builder tables (worker/orders.js).
   Keeps the last address in localStorage (bw_address_v1) and the order being paid in bw_pending_order. */
(function () {
  const { $, $$ } = BW;
  const KEY_ADDR = "bw_address_v1", KEY_PENDING = "bw_pending_order";
  const dollars = (cents) => BW.formatPrice(cents / 100);
  const PROVIDER_COPY = {
    stripe: { title: "Card", text: "Visa, Mastercard, Amex, Apple Pay, Google Pay — secure checkout by Stripe", off: "Card payments open soon" },
    paypal: { title: "PayPal", text: "Pay with your PayPal balance, bank or card", off: "PayPal opens soon" },
    test: { title: "Test payment (admin)", text: "Completes the order without charging anything — for checking fulfilment", off: "" }
  };

  document.addEventListener("bw:ready", async () => {
    const form = $("[data-checkout]");
    if (!form) return;
    if (new URLSearchParams(location.search).get("cancelled")) BW.toast("Payment cancelled — your cart is still here.");
    const lines = BW.cart.lines();
    if (!lines.length) { $("[data-co-empty]").hidden = false; return; }
    let cfg;
    try { cfg = await BW.auth.api("/api/checkout/config"); } catch (e) {
      const box = $("[data-co-error]");
      box.textContent = `Checkout is temporarily unavailable (${e.message}). Your cart is saved in this browser.`;
      box.hidden = false;
      return;
    }
    form.hidden = false;

    // contact + address
    if (cfg.user) { $("#co-email").value = cfg.user.email; $("#co-email").readOnly = true; $("[data-co-signin]").hidden = true; if (cfg.user.name) $("#co-name").value = cfg.user.name; }
    $("#co-state").innerHTML = '<option value="">Choose…</option>' + cfg.states.map((s) => `<option value="${s}">${s}</option>`).join("");
    try {
      const saved = JSON.parse(localStorage.getItem(KEY_ADDR) || "null");
      if (saved) ["name", "line1", "line2", "city", "state", "zip", "phone"].forEach((k) => { if (saved[k] && !$(`#co-${k}`).value) $(`#co-${k}`).value = saved[k]; });
      if (saved && saved.email && !$("#co-email").value) $("#co-email").value = saved.email;
    } catch (e) { /* storage blocked */ }

    // shipping methods + providers
    const subtotal = lines.reduce((s, l) => s + Math.round(l.product.price * 100) * l.qty, 0);
    const state = { method: cfg.methods[0].id, provider: Object.keys(cfg.providers).find((p) => cfg.providers[p]) || "" };
    const methodCost = (m) => (m.freeOver && subtotal >= m.freeOver ? 0 : m.rate);
    $("[data-co-methods]").innerHTML = cfg.methods.map((m) =>
      `<label class="choice${m.id === state.method ? " is-active" : ""}"><input type="radio" name="method" value="${m.id}"${m.id === state.method ? " checked" : ""}><span><b>${m.label}</b><span>${m.eta}${m.freeOver ? ` · free over ${dollars(m.freeOver)}` : ""}</span></span><span class="price num">${methodCost(m) ? dollars(methodCost(m)) : "Free"}</span></label>`).join("");
    const providerRow = (id) => {
      const c = PROVIDER_COPY[id], on = cfg.providers[id];
      return `<label class="choice${on ? "" : " is-disabled"}${id === state.provider ? " is-active" : ""}"><input type="radio" name="provider" value="${id}"${on ? "" : " disabled"}${id === state.provider ? " checked" : ""}><span><b>${c.title}</b><span>${on ? c.text : c.off}</span></span></label>`;
    };
    $("[data-co-providers]").innerHTML = ["stripe", "paypal"].concat(cfg.providers.test ? ["test"] : []).map(providerRow).join("");
    if (!state.provider) {
      $("[data-co-providers]").insertAdjacentHTML("beforeend", '<div class="notice">Online payment opens soon. Your cart and address stay saved in this browser, so you can come back and finish in one click.</div>');
      $("[data-co-submit]").disabled = true;
    }
    const setActive = (name) => $$(`input[name=${name}]`, form).forEach((i) => i.closest(".choice").classList.toggle("is-active", i.checked));
    form.addEventListener("change", (e) => {
      if (e.target.name === "method") { state.method = e.target.value; setActive("method"); renderSummary(); }
      if (e.target.name === "provider") { state.provider = e.target.value; setActive("provider"); renderSummary(); }
    });

    function renderSummary() {
      const m = cfg.methods.find((x) => x.id === state.method), ship = methodCost(m);
      $("[data-co-items]").innerHTML = lines.map((l) => `<div class="line"><span>${l.qty} × ${BW.escapeHtml(l.product.name)}</span><span class="num">${BW.formatPrice(l.lineTotal)}</span></div>`).join("");
      $("[data-co-subtotal]").textContent = dollars(subtotal);
      $("[data-co-shipping]").textContent = ship ? dollars(ship) : "Free";
      $("[data-co-total]").textContent = dollars(subtotal + ship);
      $("[data-co-submit]").textContent = { stripe: "Continue to Stripe", paypal: "Continue to PayPal", test: "Place test order" }[state.provider] || "Continue to payment";
    }
    renderSummary();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) return form.reportValidity();
      const err = $("[data-error]", form), btn = $("[data-co-submit]");
      err.hidden = true;
      const fd = new FormData(form);
      const address = Object.fromEntries(["name", "line1", "line2", "city", "state", "zip", "phone"].map((k) => [k, String(fd.get(k) || "").trim()]));
      try { localStorage.setItem(KEY_ADDR, JSON.stringify(Object.assign({ email: fd.get("email") }, address))); } catch (x) { /* storage blocked */ }
      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = "Starting secure payment…";
      try {
        const payload = { email: fd.get("email"), address, shippingMethod: state.method, provider: state.provider,
          items: lines.map((l) => ({ id: l.id, qty: l.qty, custom: l.product.custom ? { name: l.product.name, spec: l.product.custom } : undefined })) };
        const r = await BW.auth.api("/api/checkout", { method: "POST", body: payload });
        try { localStorage.setItem(KEY_PENDING, r.orderId); } catch (x) { /* storage blocked */ }
        location.href = r.url;
      } catch (x) {
        err.textContent = x.message;
        err.hidden = false;
        btn.disabled = false;
        btn.textContent = label;
      }
    });
  });
})();
