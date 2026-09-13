/* Cart store — localStorage-backed. API: BW.cart.items() add(id, qty) setQty(id, qty) remove(id) clear()
   count() subtotal() lines() on(fn). Dispatches "bw:cart" on window after every change. */
(function () {
  window.BW = window.BW || {};
  var KEY = "bw_cart_v1", MAX = 10, items;
  var read = function () { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  var write = function (next) { items = next; try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {} window.dispatchEvent(new CustomEvent("bw:cart")); };
  var clamp = function (q, p) { return Math.min(Math.max(1, Math.floor(Number(q) || 1)), MAX, p && p.stock > 0 ? p.stock : MAX); };
  var productOf = function (l) { return l.product || BW.getProduct(l.id); };   // custom blends carry their product inline
  items = read();
  BW.cart = {
    maxQty: MAX,
    items: function () { return items.slice(); },
    add: function (id, qty) {
      var p = BW.getProduct(id); if (!p || !p.stock) return false;
      var next = items.slice(), line = next.find(function (l) { return l.id === p.id; });
      if (line) line.qty = clamp(line.qty + (qty || 1), p); else next.push({ id: p.id, qty: clamp(qty || 1, p), addedAt: Date.now() });
      write(next); return true;
    },
    addCustom: function (product, qty) {   // product = full synthesized object from the builder (id "custom-…")
      var next = items.slice(), line = next.find(function (l) { return l.id === product.id; });
      if (line) line.qty = clamp(line.qty + (qty || 1), product); else next.push({ id: product.id, qty: clamp(qty || 1, product), product: product, addedAt: Date.now() });
      write(next); return true;
    },
    setQty: function (id, qty) {
      if (Number(qty) <= 0) return BW.cart.remove(id);
      var next = items.slice(), line = next.find(function (l) { return l.id === id; });
      if (line) { line.qty = clamp(qty, productOf(line)); write(next); }
    },
    remove: function (id) { write(items.filter(function (l) { return l.id !== id; })); },
    clear: function () { write([]); },
    count: function () { return items.reduce(function (n, l) { return n + l.qty; }, 0); },
    lines: function () { return items.map(function (l) { var p = productOf(l); return p && { id: l.id, qty: l.qty, product: p, lineTotal: p.price * l.qty }; }).filter(Boolean); },
    subtotal: function () { return BW.cart.lines().reduce(function (s, l) { return s + l.lineTotal; }, 0); },
    on: function (fn) { window.addEventListener("bw:cart", function () { fn(items); }); }
  };
  window.addEventListener("storage", function (e) { if (e.key === KEY) { items = read(); window.dispatchEvent(new CustomEvent("bw:cart")); } });
})();
