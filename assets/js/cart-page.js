/* Cart page: line items, order summary, clear cart. */
(function () {
  var $ = BW.$, $$ = BW.$$;
  document.addEventListener("bw:ready", function () {
    var table = $("[data-cart-table]"), summary = $("[data-cart-summary]"), empty = $("[data-cart-empty]");
    function render() {
      var lines = BW.cart.lines(), first = !table.children.length;
      summary.hidden = !lines.length; empty.hidden = !!lines.length;
      table.innerHTML = lines.map(function (l) { return BW.cartLineHtml(l, true); }).join("");
      if (!lines.length) return;
      BW.bindCartLines(table); if (first) BW.fx("itemsIn", $$(".cart-item", table));
      var sum = BW.checkout.summary(lines), n = BW.cart.count();
      $("[data-sum-items]").textContent = n + (n === 1 ? " item" : " items");
      $("[data-sum-subtotal]").textContent = BW.formatPrice(sum.subtotal);
      $("[data-sum-shipping]").textContent = sum.shipping ? BW.formatPrice(sum.shipping) : "Free";
      $("[data-sum-total]").textContent = BW.formatPrice(sum.total);
    }
    render(); BW.cart.on(render);
    $("[data-clear-cart]").addEventListener("click", function () { if (BW.cart.count() && confirm("Remove everything from your cart?")) BW.cart.clear(); });
  });
})();
