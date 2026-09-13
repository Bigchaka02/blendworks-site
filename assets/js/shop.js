/* Product cards + add-to-cart (shared), and the shop page: search, filters, sort, animated grid. URL params: q, type, goal, stim, sort. */
(function () {
  var $ = BW.$, $$ = BW.$$, I = BW.icons;
  var badgeCls = function (b) { return /stim/i.test(b) ? "mint" : /new/i.test(b) ? "lav" : /best/i.test(b) ? "" : "amber"; };
  BW.badges = function (p) { return p.badges.map(function (b) { return '<span class="badge ' + badgeCls(b) + '">' + BW.escapeHtml(b) + "</span>"; }).join(""); };
  BW.stock = function (p, long) {
    var cls = p.stock === 0 ? "out" : p.stock <= 20 ? "low" : "", txt = p.stock === 0 ? "Sold out" : p.stock <= 20 ? (long ? "Low stock — " + p.stock + " left" : "Low stock") : "In stock";
    return '<span class="stock-dot ' + cls + '">' + txt + "</span>";
  };
  BW.productCard = function (p, opts) {
    opts = opts || {};
    var href = "product.html?id=" + p.slug;
    return '<article class="product-card" data-id="' + p.id + '" data-flip-id="' + p.id + '" style="--c1:' + p.colors[0] + '">' +
      '<a class="art" href="' + href + '" aria-label="' + BW.escapeHtml(p.name) + '"><div class="badges">' + BW.badges(p) + '</div><span class="type-tag">' + (p.type === "capsule" ? I.capsule + " Capsules" : I.powder + " Powder") + "</span>" + BW.art.product(p, { suffix: opts.suffix || "-card" }) + "</a>" +
      '<div class="body"><h3><a href="' + href + '">' + (opts.q ? BW.highlight(p.name, opts.q) : BW.escapeHtml(p.name)) + '</a></h3><p class="tagline">' + BW.escapeHtml(p.tagline) + "</p>" +
      '<div class="meta"><span>' + BW.escapeHtml(p.servingSize) + "</span><span>&middot;</span><span>" + p.servings + " servings</span>" + (p.flavor ? "<span>&middot;</span><span>" + BW.escapeHtml(p.flavor) + "</span>" : "") + "</div>" +
      '<div class="bottom"><div class="price num">' + BW.formatPrice(p.price) + "<small>/ " + (p.type === "capsule" ? "bottle" : "tub") + "</small></div>" + BW.stock(p) + "</div>" +
      '<div class="bottom">' + BW.qtyControl(p.id, 1, true) + '<button class="btn btn-primary btn-sm add-btn" data-add="' + p.id + '"' + (p.stock === 0 ? " disabled" : "") + ">" + I.cart + " Add to cart</button></div></div></article>";
  };
  BW.addToCart = function (btn, id, qty) {   // shared add flow: cart + fly + button state + toast
    var p = BW.getProduct(id);
    if (!BW.cart.add(id, qty)) return BW.toast("Sorry, this blend is sold out.");
    BW.flyToCart(btn);
    var label = btn.innerHTML; btn.classList.add("is-added"); btn.innerHTML = I.check + " Added";
    setTimeout(function () { btn.classList.remove("is-added"); btn.innerHTML = label; }, 1400);
    var t = BW.toast(qty + " × " + p.name + " added to your cart.", { link: { href: "cart.html", label: "View cart" } });
    $("a", t).addEventListener("click", function (e) { e.preventDefault(); BW.openCart(); });
  };
  BW.bindAddButtons = function (root) {
    BW.bindQty(root);
    $$("[data-add]", root).forEach(function (btn) {
      btn.addEventListener("click", function () { var card = btn.closest("[data-id]"), q = card && $("[data-qty] input", card); BW.addToCart(btn, btn.dataset.add, q ? Number(q.value) || 1 : 1); });
    });
  };

  document.addEventListener("bw:ready", function () {
    var grid = $("[data-grid]"); if (!grid) return;   // shop page only
    var state = { q: "", type: "all", goals: [], stimFree: false, sort: "featured" };
    var sorters = {
      featured: function (a, b) { return (b.featured - a.featured) || a.name.localeCompare(b.name); },
      "price-asc": function (a, b) { return a.price - b.price; }, "price-desc": function (a, b) { return b.price - a.price; },
      name: function (a, b) { return a.name.localeCompare(b.name); }
    };
    var u = new URLSearchParams(location.search);
    state.q = u.get("q") || ""; state.type = u.get("type") || "all"; state.goals = (u.get("goal") || "").split(",").filter(Boolean); state.stimFree = u.get("stim") === "free"; state.sort = u.get("sort") || "featured";

    function filtered() {
      var list = (state.q ? BW.searchProducts(state.q) : BW.products.slice()).filter(function (p) {
        return (state.type === "all" || p.type === state.type) && (!state.stimFree || p.stimFree) && state.goals.every(function (g) { return p.goals.indexOf(g) > -1; });
      });
      if (!state.q || state.sort !== "featured") list.sort(sorters[state.sort] || sorters.featured);
      return list;
    }
    function update() {
      var p = new URLSearchParams();
      if (state.q) p.set("q", state.q); if (state.type !== "all") p.set("type", state.type); if (state.goals.length) p.set("goal", state.goals.join(",")); if (state.stimFree) p.set("stim", "free"); if (state.sort !== "featured") p.set("sort", state.sort);
      try { history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p : "")); } catch (e) { /* file:// blocks replaceState */ }
      $("[data-search]").value = state.q; $("[data-clear-search]").hidden = !state.q; $("[data-sort]").value = state.sort;
      $$("[data-type]").forEach(function (b) { b.classList.toggle("is-active", b.dataset.type === state.type); });
      $$("[data-goal]").forEach(function (b) { b.classList.toggle("is-active", state.goals.indexOf(b.dataset.goal) > -1); });
      $("[data-stim]").classList.toggle("is-active", state.stimFree);
      var list = filtered(), empty = $("[data-empty]");
      $("[data-count]").textContent = list.length + (list.length === 1 ? " blend" : " blends") + (state.q ? ' for "' + state.q + '"' : "");
      empty.hidden = !!list.length;
      var draw = function () { grid.innerHTML = list.map(function (p) { return BW.productCard(p, { q: state.q }); }).join(""); BW.bindAddButtons(grid); BW.enhance(grid); };
      if (grid.children.length && BW.motion) BW.motion.flipGrid(grid, draw); else draw();
    }
    $("[data-goals]").innerHTML = BW.goals.map(function (g) { return '<button class="chip" data-goal="' + g + '">' + g + "</button>"; }).join("");
    var search = $("[data-search]"), t;
    search.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { state.q = search.value; update(); }, 120); });
    search.addEventListener("keydown", function (e) { if (e.key === "Escape") { state.q = ""; update(); } });
    $("[data-clear-search]").addEventListener("click", function () { state.q = ""; update(); search.focus(); });
    $$("[data-type]").forEach(function (b) { b.addEventListener("click", function () { state.type = b.dataset.type; update(); }); });
    $$("[data-goal]").forEach(function (b) { b.addEventListener("click", function () { var i = state.goals.indexOf(b.dataset.goal); i > -1 ? state.goals.splice(i, 1) : state.goals.push(b.dataset.goal); update(); }); });
    $("[data-stim]").addEventListener("click", function () { state.stimFree = !state.stimFree; update(); });
    $("[data-sort]").addEventListener("change", function (e) { state.sort = e.target.value; update(); });
    $$("[data-reset]").forEach(function (b) { b.addEventListener("click", function () { state = { q: "", type: "all", goals: [], stimFree: false, sort: "featured" }; update(); }); });
    update();
  });
})();
