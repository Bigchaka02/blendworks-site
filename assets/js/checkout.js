/* Checkout page: contact, US shipping address, shipping method and payment method, then POST /api/checkout and
   follow the provider's redirect (Stripe Checkout — also for Apple Pay / Google Pay / Cash App Pay —, PayPal, Venmo,
   Coinbase, the admin-only test payment) or land on the order page with pay-in-your-app instructions (Zelle, manual
   Cash App / Venmo / Bitcoin). Prices shown here are a preview — the Worker recomputes everything from the catalog and the
   builder tables (worker/orders.js). Keeps the last address in localStorage (bw_address_v1) and the order being
   paid in bw_pending_order. */
(function () {
  const { $, $$ } = BW;
  const KEY_ADDR = "bw_address_v1", KEY_PENDING = "bw_pending_order";
  const dollars = (cents) => BW.formatPrice(cents / 100);
  const PROVIDER_COPY = {   // text by mode: api = hosted provider page, manual = pay in your app, we confirm; off = not switched on
    stripe: { title: "Card", api: "Visa, Mastercard, Amex, Discover — secure checkout by Stripe", off: "Card payments open soon" },
    applepay: { title: "Apple Pay", api: "Face ID or Touch ID on the secure Stripe page", unsupported: "Available in Safari on iPhone, iPad and Mac", off: "Apple Pay opens soon" },
    googlepay: { title: "Google Pay", api: "A card saved to your Google account, on the secure Stripe page", off: "Google Pay opens soon" },
    paypal: { title: "PayPal", api: "Pay with your PayPal balance, bank or card", off: "PayPal opens soon" },
    venmo: { title: "Venmo", api: "Approve in the Venmo app — US only", manual: "Send the total to our Venmo with your order number as the note; we confirm within one business day", off: "Venmo opens soon" },
    cashapp: { title: "Cash App", api: "Cash App Pay — approve in the app, paid from your balance or linked card", manual: "Send the total to our $Cashtag with your order number as the note; we confirm within one business day", off: "Cash App opens soon" },
    zelle: { title: "Zelle", manual: "Send the total from your bank's app with your order number as the memo; we confirm within one business day", off: "Zelle opens soon" },
    bitcoin: { title: "Bitcoin", api: "Pay from any wallet on a Coinbase Commerce page — confirmed on-chain", manual: "We show you the BTC amount and address; confirmed when it arrives", off: "Bitcoin opens soon" },
    test: { title: "Test payment (admin)", api: "Completes the order without charging anything — for checking fulfilment", off: "" }
  };
  const PROVIDER_ORDER = ["stripe", "applepay", "googlepay", "cashapp", "paypal", "venmo", "zelle", "bitcoin"];   // Stripe group, PayPal group, Zelle, crypto
  const SUBMIT = { stripe: "Continue to Stripe", applepay: "Continue to Apple Pay", googlepay: "Continue to Google Pay", paypal: "Continue to PayPal", "venmo:api": "Continue to Venmo", "venmo:manual": "Place order, then pay by Venmo", "cashapp:api": "Continue to Cash App", "cashapp:manual": "Place order, then pay by Cash App", "zelle:manual": "Place order, then pay by Zelle", "bitcoin:api": "Continue to Coinbase", "bitcoin:manual": "Place order, then pay in Bitcoin", test: "Place test order" };
  // Apple Pay only exists in Safari (window.ApplePaySession); the Stripe page would show no button anywhere else.
  const usable = (modes, id) => !!modes[id] && !(id === "applepay" && !window.ApplePaySession);

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
    const modes = cfg.modes || {};
    const state = { method: cfg.methods[0].id, provider: PROVIDER_ORDER.concat(["test"]).find((p) => usable(modes, p)) || "" };
    const methodCost = (m) => (m.freeOver && subtotal >= m.freeOver ? 0 : m.rate);
    $("[data-co-methods]").innerHTML = cfg.methods.map((m) =>
      `<label class="choice${m.id === state.method ? " is-active" : ""}"><input type="radio" name="method" value="${m.id}"${m.id === state.method ? " checked" : ""}><span><b>${m.label}</b><span>${m.eta}${m.freeOver ? ` · free over ${dollars(m.freeOver)}` : ""}</span></span><span class="price num">${methodCost(m) ? dollars(methodCost(m)) : "Free"}</span></label>`).join("");
    const providerRow = (id) => {
      const c = PROVIDER_COPY[id], mode = modes[id], on = usable(modes, id), why = on ? c[mode] || c.api : mode ? c.unsupported : c.off;
      return `<label class="choice${on ? "" : " is-disabled"}${id === state.provider ? " is-active" : ""}"><input type="radio" name="provider" value="${id}"${on ? "" : " disabled"}${id === state.provider ? " checked" : ""}><span><b>${c.title}</b><span>${why}</span></span></label>`;
    };
    $("[data-co-providers]").innerHTML = PROVIDER_ORDER.concat(cfg.providers.test ? ["test"] : []).map(providerRow).join("");
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
      $("[data-co-submit]").textContent = SUBMIT[`${state.provider}:${modes[state.provider]}`] || SUBMIT[state.provider] || "Continue to payment";
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
