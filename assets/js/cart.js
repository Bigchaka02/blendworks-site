/* Cart store — localStorage-backed. Loaded right after the data files, before site.js.
   API: BW.cart.items() add(id, qty) addCustom(product, qty) setQty(id, qty) remove(id) clear()
        count() subtotal() lines() summary(lines) on(fn)
   Dispatches "bw:cart" on window after every change. Custom blends carry their product object inline
   (id "custom-…"); catalog lines resolve through BW.getProduct at read time, so a line whose product
   disappeared from the catalog is dropped instead of being counted. */
(function () {
  window.BW = window.BW || {};
  const KEY = "bw_cart_v1", MAX_QTY = 10;
  const SHIPPING_FLAT = 5.95, FREE_SHIPPING_OVER = 50;   // TODO(payments): real rates; tax comes from the provider

  BW.formatPrice = (n) => "$" + n.toFixed(2);
  BW.getProduct = (id) => BW.products.find((p) => p.id === id || p.slug === id);

  const productOf = (line) => line.product || BW.getProduct(line.id);
  const read = () => {
    try { return (JSON.parse(localStorage.getItem(KEY)) || []).filter(productOf); } catch (e) { return []; }
  };
  const clamp = (qty, product) => {
    const stockCap = product && product.stock > 0 ? product.stock : MAX_QTY;
    return Math.min(Math.max(1, Math.floor(Number(qty) || 1)), MAX_QTY, stockCap);
  };
  let items = read();
  const write = (next) => {
    items = next;
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* storage blocked: cart lives in memory */ }
    window.dispatchEvent(new CustomEvent("bw:cart"));
  };
  const upsert = (product, qty, extra) => {
    const next = items.slice(), line = next.find((l) => l.id === product.id);
    if (line) line.qty = clamp(line.qty + (qty || 1), product);
    else next.push(Object.assign({ id: product.id, qty: clamp(qty || 1, product), addedAt: Date.now() }, extra));
    write(next);
    return true;
  };

  BW.cart = {
    maxQty: MAX_QTY,
    items: () => items.slice(),
    add(id, qty) {
      const p = BW.getProduct(id);
      return p && p.stock ? upsert(p, qty) : false;
    },
    addCustom: (product, qty) => upsert(product, qty, { product }),   // product = object synthesized by the builder
    setQty(id, qty) {
      if (Number(qty) <= 0) return BW.cart.remove(id);
      const next = items.slice(), line = next.find((l) => l.id === id);
      if (line) { line.qty = clamp(qty, productOf(line)); write(next); }
    },
    remove: (id) => write(items.filter((l) => l.id !== id)),
    clear: () => write([]),
    lines: () => items.map((l) => {
      const p = productOf(l);
      return p && { id: l.id, qty: l.qty, product: p, lineTotal: p.price * l.qty };
    }).filter(Boolean),
    count: () => BW.cart.lines().reduce((n, l) => n + l.qty, 0),
    subtotal: () => BW.cart.lines().reduce((s, l) => s + l.lineTotal, 0),
    summary(lines) {   // order maths shared by the cart page, drawer and checkout
      const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
      const shipping = !subtotal || subtotal >= FREE_SHIPPING_OVER ? 0 : SHIPPING_FLAT;
      return { subtotal, shipping, tax: null, total: subtotal + shipping, freeShippingOver: FREE_SHIPPING_OVER };
    },
    on: (fn) => window.addEventListener("bw:cart", () => fn(items))
  };
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) { items = read(); window.dispatchEvent(new CustomEvent("bw:cart")); }
  });
})();
