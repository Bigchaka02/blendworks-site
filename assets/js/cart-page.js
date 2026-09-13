/* Cart page: line items, order summary, clear cart. Shared line markup + maths live in site.js / cart.js. */
(function () {
  const { $, $$ } = BW;
  document.addEventListener("bw:ready", () => {
    const table = $("[data-cart-table]");
    if (!table) return;
    const summary = $("[data-cart-summary]"), empty = $("[data-cart-empty]");
    function render() {
      const lines = BW.cart.lines(), first = !table.children.length;
      summary.hidden = !lines.length;
      empty.hidden = !!lines.length;
      table.innerHTML = lines.map((l) => BW.cartLineHtml(l, true)).join("");
      if (!lines.length) return;
      BW.bindCartLines(table);
      if (first) BW.fx("itemsIn", $$(".cart-item", table));
      const sum = BW.cart.summary(lines), n = BW.cart.count();
      $("[data-sum-items]").textContent = `${n} ${n === 1 ? "item" : "items"}`;
      $("[data-sum-subtotal]").textContent = BW.formatPrice(sum.subtotal);
      $("[data-sum-shipping]").textContent = sum.shipping ? BW.formatPrice(sum.shipping) : "Free";
      $("[data-sum-total]").textContent = BW.formatPrice(sum.total);
    }
    render();
    BW.cart.on(render);
    $("[data-clear-cart]").addEventListener("click", () => {
      if (BW.cart.count() && confirm("Remove everything from your cart?")) BW.cart.clear();
    });
  });
})();
