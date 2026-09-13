/* BlendWorks site shell — header/footer, product artwork, cart drawer, search, toasts.
   Loaded on every page after data/products.js, cart.js and (optionally) the GSAP libs.
   Motion is delegated to BW.motion (motion.js) through BW.fx(); without it the UI is static. */
(function () {
  window.BW = window.BW || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var fx = function (name) { var m = BW.motion; return m && m[name] ? m[name].apply(m, Array.prototype.slice.call(arguments, 1)) : undefined; };
  BW.$ = $; BW.$$ = $$; BW.fx = fx;
  BW.escapeHtml = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var el = function (tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

  /* ---------- icons ---------- */
  var SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
  var I = BW.icons = {
    search: SVG + '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    cart: SVG + '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>',
    menu: SVG + '<path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    close: SVG + '<path d="M18 6 6 18M6 6l12 12"/></svg>',
    check: SVG + '<path d="M20 6 9 17l-5-5"/></svg>',
    capsule: SVG + '<rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-35 12 12)"/><path d="m9.5 7.5 5 9"/></svg>',
    powder: SVG + '<rect x="3" y="3" width="18" height="4" rx="1.5"/><path d="M5 7h14l-1 13H6z"/><path d="M8 12h8"/></svg>',
    arrow: SVG + '<path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
    bag: SVG + '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>'
  };
  BW.typeLabel = function (p) { return p.type === "capsule" ? "Capsule blend" : "Powder blend"; };

  /* ---------- product artwork: SVG bottle (capsules) or tub (powders), coloured per product ---------- */
  var ART = {
    capsule: { vb: "0 0 200 270", cx: 100, lid: [58, 14, 84, 46, 12], lidHi: [66, 20, 14, 30, 7], neck: [70, 56, 60, 18], body: [34, 70, 132, 186, 30], shine: [46, 84, 16, 150, 8], label: [52, 122, 96, 86], bar: [80, 182, 40], kind: "CAPSULE BLEND", subY: 200 },
    powder: { vb: "0 0 220 270", cx: 110, lid: [28, 26, 164, 44, 14], lidHi: [40, 32, 18, 30, 9], body: [36, 66, 148, 188, 22], shine: [48, 80, 18, 156, 9], label: [54, 120, 112, 92], bar: [88, 182, 44], kind: "POWDER BLEND", subY: 201 }
  };
  var rect = function (a, fill, extra) { return '<rect x="' + a[0] + '" y="' + a[1] + '" width="' + a[2] + '" height="' + a[3] + '"' + (a[4] ? ' rx="' + a[4] + '"' : "") + ' fill="' + fill + '"' + (extra || "") + '/>'; };
  BW.art = {
    product: function (p, opts) {
      var a = ART[p.type], id = "g-" + p.id + ((opts && opts.suffix) || ""), g = "url(#" + id + ")", name = BW.escapeHtml(p.name);
      var text = function (y, size, fill, t, font) { return '<text x="' + a.cx + '" y="' + y + '" text-anchor="middle" font-family="' + (font || "Inter, Segoe UI, sans-serif") + '" font-size="' + size + '"' + (font ? ' font-weight="700"' : "") + ' fill="' + fill + '">' + t + "</text>"; };
      return '<svg viewBox="' + a.vb + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + name + '">' +
        '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + p.colors[0] + '"/><stop offset="1" stop-color="' + p.colors[1] + '"/></linearGradient>' +
        '<linearGradient id="' + id + 'c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A3556"/><stop offset="1" stop-color="#141C33"/></linearGradient></defs>' +
        rect(a.lid, "url(#" + id + "c)") + rect(a.lidHi, "#fff", ' opacity=".12"') + (a.neck ? rect(a.neck, "#1B2440") : "") +
        rect(a.body, g) + rect(a.shine, "#fff", ' opacity=".16"') + rect(a.body, "none", ' stroke="#fff" stroke-opacity=".18"') +
        rect(a.label.concat(14), "#0B1020", ' opacity=".62"') +
        text(152, p.type === "capsule" ? 12 : 13, "#fff", name, "Sora, Segoe UI, sans-serif") +
        text(170, 8, "#A7B0C8", '<tspan letter-spacing="1.5">' + a.kind + "</tspan>") +
        rect(a.bar.concat(4, 2), g) +
        text(a.subY, 7, "#7C869F", BW.escapeHtml(p.type === "capsule" ? p.servingSize : p.flavor || "")) + "</svg>";
    },
    capsuleHero: function () {
      return '<svg viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>' +
        '<linearGradient id="hc-a" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8ED0F9"/><stop offset=".45" stop-color="#56B4F2"/><stop offset=".55" stop-color="#B18CF5"/><stop offset="1" stop-color="#8B62E8"/></linearGradient>' +
        '<linearGradient id="hc-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
        '<g transform="rotate(-35 160 160)"><rect x="40" y="105" width="240" height="110" rx="55" fill="url(#hc-a)"/><rect x="60" y="118" width="200" height="26" rx="13" fill="url(#hc-s)"/>' +
        '<rect x="158" y="105" width="4" height="110" fill="#fff" opacity=".35"/><rect x="40" y="105" width="240" height="110" rx="55" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/></g></svg>';
    }
  };

  /* ---------- toasts ---------- */
  BW.toast = function (msg, opts) {
    opts = opts || {};
    var host = $(".toasts") || document.body.appendChild(el("div", "toasts"));
    var t = el("div", "toast", '<span class="dot"></span><span>' + msg + "</span>" + (opts.link ? ' <a href="' + opts.link.href + '">' + opts.link.label + "</a>" : ""));
    host.appendChild(t); fx("toastIn", t);
    var remove = function () { t.remove(); };
    setTimeout(function () { if (!fx("toastOut", t, remove)) remove(); }, opts.duration || 3200);
    return t;
  };

  /* ---------- header & footer ---------- */
  var NAV = [["./", "Home", "home"], ["shop", "Shop", "shop"], ["build", "Build", "build"], ["about", "About", "about"], ["mission", "Mission", "mission"], ["contact", "Contact", "contact"]];
  var LOGO = '<img src="assets/img/blendworks-logo-horizontal-dark.svg" alt="BlendWorks">';
  function navLinks() {
    var page = document.body.dataset.page;
    return NAV.map(function (n) { return '<a href="' + n[0] + '"' + (page === n[2] ? ' class="is-active"' : "") + ">" + n[1] + "</a>"; }).join("");
  }
  function renderHeader() {
    var host = $("#site-header"); if (!host) return;
    host.className = "site-header";
    host.innerHTML = '<div class="container"><a class="logo" href="./" aria-label="BlendWorks home">' + LOGO + '</a><nav class="nav" aria-label="Primary">' + navLinks() + '</nav>' +
      '<div class="header-actions"><button class="btn-icon" data-open-search aria-label="Search products" title="Search (Ctrl+K)">' + I.search + '</button>' +
      '<button class="btn-icon cart-btn" data-open-cart aria-label="Open cart">' + I.cart + '<span class="cart-count" data-cart-count>0</span></button>' +
      '<a class="btn btn-primary btn-sm" href="shop" style="margin-left:.4rem">Shop blends</a><button class="btn-icon menu-btn" data-open-menu aria-label="Open menu">' + I.menu + "</button></div></div>";
    var mm = document.body.appendChild(el("div", "mobile-menu", '<div class="close-row">' + LOGO + '<button class="btn-icon" data-close-menu aria-label="Close menu">' + I.close + "</button></div><nav>" + navLinks() + '<a href="cart">Cart</a></nav><a class="btn btn-primary btn-lg" href="shop">Shop blends</a>'));
    var toggle = function (open) { mm.classList.toggle("is-open", open); mm.setAttribute("aria-hidden", String(!open)); };
    toggle(false);
    $("[data-open-menu]", host).addEventListener("click", function () { toggle(true); });
    $("[data-close-menu]", mm).addEventListener("click", function () { toggle(false); });
    if (!BW.motion) { var onScroll = function () { host.classList.toggle("is-scrolled", window.scrollY > 12); }; window.addEventListener("scroll", onScroll, { passive: true }); onScroll(); }
  }
  function renderFooter() {
    var host = $("#site-footer"); if (!host) return;
    host.className = "site-footer";
    host.innerHTML = '<div class="container"><div class="footer-grid"><div class="footer-brand">' + LOGO +
      "<p>Custom supplement capsules and powders, made to order. Every milligram on the label — nothing hidden.</p>" +
      '<form class="newsletter" data-newsletter><input class="input" type="email" placeholder="Email for launch updates" aria-label="Email" required><button class="btn btn-secondary btn-sm" type="submit">Join</button></form></div>' +
      '<div><h4>Shop</h4><ul><li><a href="shop?type=capsule">Capsule blends</a></li><li><a href="shop?type=powder">Powder blends</a></li><li><a href="shop">All products</a></li><li><a href="build">Build your own</a></li></ul></div>' +
      '<div><h4>Company</h4><ul><li><a href="about">About</a></li><li><a href="mission">Mission &amp; goals</a></li><li><a href="contact">Contact</a></li><li><a href="contact#faq">FAQ</a></li></ul></div>' +
      '<div><h4>Legal</h4><ul><li><a href="terms">Terms of service</a></li><li><a href="privacy">Privacy policy</a></li><li><a href="contact#report">Report a problem</a></li></ul></div></div>' +
      '<div class="footer-bottom"><span>&copy; ' + new Date().getFullYear() + " BlendWorks. All rights reserved.</span><span>Made to order &middot; Ships within the US (placeholder)</span></div>" +
      '<p class="disclaimer">These statements have not been evaluated by the Food and Drug Administration. These products are not intended to diagnose, treat, cure, or prevent any disease. For adults 18+. Consult a physician before use if you are pregnant, nursing, taking medication, or have a medical condition.</p></div>';
    var nl = $("[data-newsletter]", host);
    nl.addEventListener("submit", function (e) { e.preventDefault(); nl.reset(); BW.toast("Thanks — we'll keep you posted. (Placeholder: newsletter not connected yet.)"); });
  }

  /* ---------- cart UI: badge, quantity control, line items, drawer ---------- */
  function updateBadge(bump) {
    var n = BW.cart.count();
    $$("[data-cart-count]").forEach(function (b) { b.textContent = n; b.classList.toggle("is-visible", n > 0); if (bump && n) fx("badgeBump", b); });
    var c = $("[data-drawer-count]"); if (c) c.textContent = n ? "(" + n + ")" : "";
  }
  BW.flyToCart = function (btn) {
    var host = btn.closest("[data-id]") || btn.closest(".product-layout");
    fx("flyToCart", btn, host && host.querySelector(".art svg, .product-stage svg"));
  };
  BW.qtyControl = function (id, qty, small) {
    return '<div class="qty' + (small ? " sm" : "") + '" data-qty="' + id + '"><button type="button" data-dec aria-label="Decrease">&minus;</button><input type="number" min="1" max="' + BW.cart.maxQty + '" value="' + qty + '" aria-label="Quantity"><button type="button" data-inc aria-label="Increase">+</button></div>';
  };
  BW.bindQty = function (root, onChange) {
    $$("[data-qty]", root).forEach(function (q) {
      var input = $("input", q), set = function (v) { v = Math.max(1, Math.min(BW.cart.maxQty, Number(v) || 1)); input.value = v; if (onChange) onChange(q.dataset.qty, v); };
      $("[data-dec]", q).addEventListener("click", function () { set(Number(input.value) - 1); });
      $("[data-inc]", q).addEventListener("click", function () { set(Number(input.value) + 1); });
      input.addEventListener("change", function () { set(input.value); });
    });
  };
  BW.cartLineHtml = function (l, big) {
    var p = l.product, href = p.custom ? "build" : "product?id=" + p.slug;
    return '<div class="cart-item" data-line="' + p.id + '"><a class="thumb" href="' + href + '">' + BW.art.product(p, { suffix: big ? "-pg" : "-dr" }) + "</a>" +
      '<div><a class="name" href="' + href + '">' + BW.escapeHtml(p.name) + '</a><div class="sub">' + (p.custom ? "Custom " + BW.typeLabel(p).toLowerCase() : BW.typeLabel(p)) + " &middot; " + BW.formatPrice(p.price) + " each</div>" + (p.custom ? '<div class="sub">' + BW.escapeHtml(p.tagline) + " &middot; " + BW.escapeHtml(p.servingSize) + "</div>" : "") + '<div style="margin-top:.5rem">' + BW.qtyControl(p.id, l.qty, !big) + "</div></div>" +
      '<div class="controls"><div class="line-price num">' + BW.formatPrice(l.lineTotal) + '</div><button class="remove" data-remove="' + p.id + '">Remove</button></div></div>';
  };
  BW.bindCartLines = function (root) {
    BW.bindQty(root, BW.cart.setQty);
    $$("[data-remove]", root).forEach(function (b) { b.addEventListener("click", function () { var rm = function () { BW.cart.remove(b.dataset.remove); }; if (!fx("itemOut", b.closest(".cart-item"), rm)) rm(); }); });
  };
  function buildDrawer() {
    var bd = document.body.appendChild(el("div", "drawer-backdrop")); bd.setAttribute("data-close-cart", "");
    var d = document.body.appendChild(el("aside", "cart-drawer", '<header><h3>Your cart <span class="muted" style="font-size:.9rem;font-weight:500" data-drawer-count></span></h3><button class="btn-icon" data-close-cart aria-label="Close cart">' + I.close + "</button></header>" +
      '<div class="cart-items" data-drawer-items></div><div class="cart-footer" data-drawer-footer hidden><div class="line"><span>Subtotal</span><span class="num" data-drawer-subtotal></span></div><div class="line"><span>Shipping &amp; tax</span><span>Calculated at checkout</span></div>' +
      '<a class="btn btn-secondary btn-block" href="cart">View cart</a><a class="btn btn-primary btn-block" href="checkout">Checkout ' + I.arrow + "</a></div>"));
    d.setAttribute("aria-label", "Shopping cart"); d.setAttribute("aria-hidden", "true");
    var items = $("[data-drawer-items]", d), foot = $("[data-drawer-footer]", d), isOpen = false;
    function render() {
      var lines = BW.cart.lines();
      foot.hidden = !lines.length;
      if (!lines.length) { items.innerHTML = '<div class="cart-empty">' + I.bag + '<p><b>Your cart is empty.</b></p><p>Browse the in-stock capsule and powder blends.</p><a class="btn btn-primary" href="shop">Shop blends</a></div>'; return; }
      items.innerHTML = lines.map(function (l) { return BW.cartLineHtml(l, false); }).join("");
      $("[data-drawer-subtotal]", d).textContent = BW.formatPrice(BW.cart.subtotal());
      BW.bindCartLines(items);
    }
    BW.openCart = function () {
      if (isOpen) return; isOpen = true; render();
      bd.classList.add("is-open"); d.classList.add("is-open"); d.setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden";
      fx("drawerOpen", bd, d, $$(".cart-item, .cart-empty", d));
    };
    BW.closeCart = function () {
      if (!isOpen) return; isOpen = false; d.setAttribute("aria-hidden", "true"); document.body.style.overflow = "";
      var done = function () { bd.classList.remove("is-open"); d.classList.remove("is-open"); };
      if (!fx("drawerClose", bd, d, done)) done();
    };
    document.addEventListener("click", function (e) { if (e.target.closest("[data-open-cart]")) { e.preventDefault(); BW.openCart(); } else if (e.target.closest("[data-close-cart]")) BW.closeCart(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") BW.closeCart(); });
    BW.cart.on(function () { render(); updateBadge(true); });
  }

  /* ---------- search: shared matcher + Ctrl+K overlay ---------- */
  BW.searchProducts = function (q) {
    var terms = (q || "").trim().toLowerCase().split(" ").filter(Boolean); if (!terms.length) return [];
    return BW.products.map(function (p) {
      var name = p.name.toLowerCase(), hay = [name, p.tagline, p.blurb, p.type, p.flavor || "", p.goals.join(" "), p.badges.join(" "), p.ingredients.map(function (i) { return i[0]; }).join(" ")].join(" ").toLowerCase();
      if (!terms.every(function (t) { return hay.indexOf(t) > -1; })) return null;
      var score = terms.reduce(function (s, t) { return s + (name.indexOf(t) === 0 ? 6 : name.indexOf(t) > -1 ? 4 : 1); }, 0);
      return { p: p, score: score };
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score; }).map(function (r) { return r.p; });
  };
  BW.highlight = function (text, q) {
    var t = String(text), needle = (q || "").trim().toLowerCase(), i = needle ? t.toLowerCase().indexOf(needle) : -1;
    return i < 0 ? BW.escapeHtml(t) : BW.escapeHtml(t.slice(0, i)) + "<mark>" + BW.escapeHtml(t.slice(i, i + needle.length)) + "</mark>" + BW.escapeHtml(t.slice(i + needle.length));
  };
  function buildSearch() {
    var ov = document.body.appendChild(el("div", "search-overlay", '<div class="search-panel" role="dialog" aria-label="Search products"><div class="search-input">' + I.search + '<input type="search" placeholder="Search blends, ingredients, goals…" aria-label="Search"><kbd>Esc</kbd></div><div class="search-results"></div></div>'));
    ov.setAttribute("aria-hidden", "true");
    var input = $("input", ov), results = $(".search-results", ov), focused = -1;
    function render() {
      var q = input.value, list = BW.searchProducts(q).slice(0, 7); focused = -1;
      if (!q.trim()) { results.innerHTML = '<div class="empty">Try "focus", "creatine", "stim-free" or "powder".</div>'; return; }
      if (!list.length) { results.innerHTML = '<div class="empty">No blends match "' + BW.escapeHtml(q) + '".</div>'; return; }
      results.innerHTML = list.map(function (p) {
        return '<a href="product?id=' + p.slug + '"><span class="thumb" style="background:linear-gradient(135deg,' + p.colors[0] + "," + p.colors[1] + ')"></span><span><div>' + BW.highlight(p.name, q) + '</div><div class="meta">' + BW.typeLabel(p) + " &middot; " + p.goals.join(", ") + '</div></span><span class="price num">' + BW.formatPrice(p.price) + "</span></a>";
      }).join("") + '<a href="shop?q=' + encodeURIComponent(q) + '" style="justify-content:center;color:var(--sky-light);font-weight:600">See all results in the shop ' + I.arrow + "</a>";
      fx("resultsIn", results);
    }
    var open = function () { ov.classList.add("is-open"); ov.setAttribute("aria-hidden", "false"); render(); fx("overlayOpen", $(".search-panel", ov)); setTimeout(function () { input.focus(); }, 50); };
    var close = function () { ov.classList.remove("is-open"); ov.setAttribute("aria-hidden", "true"); };
    document.addEventListener("click", function (e) { if (e.target.closest("[data-open-search]")) { e.preventDefault(); open(); } else if (e.target === ov) close(); });
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); return ov.classList.contains("is-open") ? close() : open(); }
      if (!ov.classList.contains("is-open")) return;
      var links = $$("a", results);
      if (e.key === "Escape") close();
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); focused = (focused + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length; links.forEach(function (l, i) { l.classList.toggle("is-focused", i === focused); }); }
      else if (e.key === "Enter" && links[focused]) location.href = links[focused].href;
    });
    input.addEventListener("input", render);
  }

  /* ---------- misc: hover enhancements, disconnected builder button, boot ---------- */
  BW.enhance = function (root) { fx("cards", root); fx("magnetic", root); };
  document.addEventListener("DOMContentLoaded", function () {
    if (!BW.motion) document.documentElement.classList.remove("curtain-pending");
    renderHeader(); renderFooter(); buildDrawer(); buildSearch(); updateBadge(false); BW.enhance(document);
    document.dispatchEvent(new CustomEvent("bw:ready"));
  });
})();
