/* Checkout — PLACEHOLDER STRUCTURE. Payments are intentionally not wired: once a provider is chosen,
   implement BW.checkout.createSession() against its API and replace the placeholder UI in checkout.html. */
(function () {
  var $ = BW.$;
  BW.checkout = {
    provider: null,                                            // TODO: "stripe" | "paypal" | hosted checkout — undecided
    shippingFlat: 5.95, freeShippingOver: 50,                  // TODO: real rates; tax is calculated by the provider
    validateCart: function (lines) {
      var issues = lines.length ? [] : ["Your cart is empty."];
      lines.forEach(function (l) { if (l.product.stock === 0) issues.push(l.product.name + " is sold out."); else if (l.qty > l.product.stock) issues.push("Only " + l.product.stock + " of " + l.product.name + " available."); });
      return { ok: !issues.length, issues: issues };
    },
    summary: function (lines) {
      var subtotal = lines.reduce(function (s, l) { return s + l.lineTotal; }, 0), shipping = !subtotal || subtotal >= this.freeShippingOver ? 0 : this.shippingFlat;
      return { subtotal: subtotal, shipping: shipping, tax: null, total: subtotal + shipping };
    },
    createSession: function () {
      // TODO(payments): create a hosted checkout session / payment intent with the provider and redirect; re-validate prices server-side.
      return Promise.reject(new Error("Checkout is not connected yet."));
    }
  };
  document.addEventListener("bw:ready", function () {
    var list = $("[data-co-items]"); if (!list) return;   // checkout page only
    function render() {
      var lines = BW.cart.lines(), sum = BW.checkout.summary(lines), v = BW.checkout.validateCart(lines);
      list.innerHTML = lines.length ? lines.map(function (l) { return '<div class="line"><span>' + l.qty + " × " + BW.escapeHtml(l.product.name) + '</span><span class="num">' + BW.formatPrice(l.lineTotal) + "</span></div>"; }).join("") : '<p class="muted">Your cart is empty.</p>';
      $("[data-co-subtotal]").textContent = BW.formatPrice(sum.subtotal);
      $("[data-co-shipping]").textContent = !sum.subtotal ? "—" : sum.shipping ? BW.formatPrice(sum.shipping) : "Free";
      $("[data-co-total]").textContent = BW.formatPrice(sum.total);
      $("[data-co-issues]").innerHTML = v.issues.map(function (i) { return '<div class="notice">' + BW.escapeHtml(i) + "</div>"; }).join("");
    }
    render(); BW.cart.on(render);
    $("[data-place-order]").addEventListener("click", function () { BW.checkout.createSession(BW.cart.lines()).catch(function (err) { BW.toast(err.message + " Payments are the next feature on the list."); }); });
  });
})();
