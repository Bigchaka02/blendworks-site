/* Checkout — PLACEHOLDER. Payments are intentionally not wired: once a provider is chosen (Q13), implement
   BW.checkout.createSession() against its API and replace the placeholder copy in checkout.html.
   Order maths (subtotal, shipping) lives in cart.js as BW.cart.summary(). */
(function () {
  const { $ } = BW;
  BW.checkout = {
    provider: null,   // TODO(payments): "stripe" | "paypal" | hosted checkout — undecided
    validateCart(lines) {
      const issues = lines.length ? [] : ["Your cart is empty."];
      lines.forEach((l) => {
        if (l.product.stock === 0) issues.push(`${l.product.name} is sold out.`);
        else if (l.qty > l.product.stock) issues.push(`Only ${l.product.stock} of ${l.product.name} available.`);
      });
      return { ok: !issues.length, issues };
    },
    createSession() {
      // TODO(payments): create a hosted checkout session / payment intent with the provider and redirect; re-validate prices server-side.
      return Promise.reject(new Error("Online checkout isn't open yet — we're finishing our payment setup."));
    }
  };

  document.addEventListener("bw:ready", () => {
    const list = $("[data-co-items]");
    if (!list) return;   // checkout page only
    function render() {
      const lines = BW.cart.lines(), sum = BW.cart.summary(lines), v = BW.checkout.validateCart(lines);
      list.innerHTML = lines.length
        ? lines.map((l) => `<div class="line"><span>${l.qty} × ${BW.escapeHtml(l.product.name)}</span><span class="num">${BW.formatPrice(l.lineTotal)}</span></div>`).join("")
        : '<p class="muted">Your cart is empty.</p>';
      $("[data-co-subtotal]").textContent = BW.formatPrice(sum.subtotal);
      $("[data-co-shipping]").textContent = !sum.subtotal ? "—" : sum.shipping ? BW.formatPrice(sum.shipping) : "Free";
      $("[data-co-total]").textContent = BW.formatPrice(sum.total);
      $("[data-co-issues]").innerHTML = v.issues.map((i) => `<div class="notice">${BW.escapeHtml(i)}</div>`).join("");
    }
    render();
    BW.cart.on(render);
    $("[data-place-order]").addEventListener("click", () => {
      BW.checkout.createSession(BW.cart.lines()).catch((err) => BW.toast(err.message));
    });
  });
})();
