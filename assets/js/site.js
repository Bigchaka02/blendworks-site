/* BlendWorks site shell — icon sprite, product artwork, header/footer, cart UI (badge, drawer, line items),
   catalog cards + add-to-cart, Ctrl+K search, toasts. Loaded on every page after data/*.js and cart.js and
   before motion.js and auth.js (which fills the [data-account-link] hooks rendered here).
   All animation is delegated to BW.motion through BW.fx(); without it the UI is static. */
(function () {
  window.BW = window.BW || {};
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const fx = (name, ...args) => { const m = BW.motion; return m && m[name] ? m[name](...args) : undefined; };
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  Object.assign(BW, { $, $$, fx, escapeHtml });
  BW.typeLabel = (p) => (p.type === "capsule" ? "Capsule blend" : "Powder blend");
  BW.headerOffset = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue("--header-h"), 10) + 18;

  /* ---------- icons: one sprite injected at boot; used as <svg class="icon"><use href="#i-name"/></svg> ---------- */
  const SPRITE = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    capsule: '<rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-35 12 12)"/><path d="m9.5 7.5 5 9"/>',
    powder: '<rect x="3" y="3" width="18" height="4" rx="1.5"/><path d="M5 7h14l-1 13H6z"/><path d="M8 12h8"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    "arrow-left": '<path d="M19 12H5m6-6-6 6 6 6"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
    sparkle: '<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle cx="12" cy="12" r="3"/>',
    "no-results": '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 7L2 7"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    user: '<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="8" r="4"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>'
  };
  BW.icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const I = BW.icons = {};
  Object.keys(SPRITE).forEach((k) => { I[k.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = BW.icon(k); });
  function injectSprite() {
    const symbols = Object.keys(SPRITE).map((k) => `<symbol id="i-${k}" viewBox="0 0 24 24">${SPRITE[k]}</symbol>`).join("");
    document.body.insertAdjacentHTML("afterbegin", `<svg class="sprite" aria-hidden="true" focusable="false">${symbols}</svg>`);
  }

  /* ---------- product artwork: SVG bottle (capsules) or tub (powders), coloured per product ---------- */
  const ART = {
    capsule: { vb: "0 0 200 270", cx: 100, lid: [58, 14, 84, 46, 12], lidHi: [66, 20, 14, 30, 7], neck: [70, 56, 60, 18], body: [34, 70, 132, 186, 30], shine: [46, 84, 16, 150, 8], label: [52, 122, 96, 86], bar: [80, 182, 40], kind: "CAPSULE BLEND", subY: 200 },
    powder: { vb: "0 0 220 270", cx: 110, lid: [28, 26, 164, 44, 14], lidHi: [40, 32, 18, 30, 9], body: [36, 66, 148, 188, 22], shine: [48, 80, 18, 156, 9], label: [54, 120, 112, 92], bar: [88, 182, 44], kind: "POWDER BLEND", subY: 201 }
  };
  const rect = (a, fill, extra = "") => `<rect x="${a[0]}" y="${a[1]}" width="${a[2]}" height="${a[3]}"${a[4] ? ` rx="${a[4]}"` : ""} fill="${fill}"${extra}/>`;
  BW.art = {
    product(p, opts = {}) {
      const a = ART[p.type], id = `g-${p.id}${opts.suffix || ""}`, g = `url(#${id})`, name = escapeHtml(p.name);
      const text = (y, size, fill, t, font) =>
        `<text x="${a.cx}" y="${y}" text-anchor="middle" font-family="${font || "Inter, Segoe UI, sans-serif"}" font-size="${size}"${font ? ' font-weight="700"' : ""} fill="${fill}">${t}</text>`;
      return `<svg viewBox="${a.vb}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${name}">
        <defs>
          <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.colors[0]}"/><stop offset="1" stop-color="${p.colors[1]}"/></linearGradient>
          <linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A3556"/><stop offset="1" stop-color="#141C33"/></linearGradient>
        </defs>
        ${rect(a.lid, `url(#${id}c)`)}${rect(a.lidHi, "#fff", ' opacity=".12"')}${a.neck ? rect(a.neck, "#1B2440") : ""}
        ${rect(a.body, g)}${rect(a.shine, "#fff", ' opacity=".16"')}${rect(a.body, "none", ' stroke="#fff" stroke-opacity=".18"')}
        ${rect(a.label.concat(14), "#0B1020", ' opacity=".62"')}
        ${text(152, p.type === "capsule" ? 12 : 13, "#fff", name, "Sora, Segoe UI, sans-serif")}
        ${text(170, 8, "#A7B0C8", `<tspan letter-spacing="1.5">${a.kind}</tspan>`)}
        ${rect(a.bar.concat(4, 2), g)}
        ${text(a.subY, 7, "#7C869F", escapeHtml(p.type === "capsule" ? p.servingSize : p.flavor || ""))}
      </svg>`;
    },
    capsuleHero: () => `<svg viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="hc-a" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8ED0F9"/><stop offset=".45" stop-color="#56B4F2"/><stop offset=".55" stop-color="#B18CF5"/><stop offset="1" stop-color="#8B62E8"/></linearGradient>
        <linearGradient id="hc-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      </defs>
      <g transform="rotate(-35 160 160)">
        <rect x="40" y="105" width="240" height="110" rx="55" fill="url(#hc-a)"/>
        <rect x="60" y="118" width="200" height="26" rx="13" fill="url(#hc-s)"/>
        <rect x="158" y="105" width="4" height="110" fill="#fff" opacity=".35"/>
        <rect x="40" y="105" width="240" height="110" rx="55" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/>
      </g>
    </svg>`
  };

  /* ---------- toasts (message is plain text unless opts.html) ---------- */
  BW.toast = (msg, opts = {}) => {
    const host = $(".toasts") || document.body.appendChild(el("div", "toasts"));
    const t = el("div", "toast", '<span class="dot"></span><span class="msg"></span>');
    $(".msg", t)[opts.html ? "innerHTML" : "textContent"] = msg;
    if (opts.link) {
      const a = el("a", "", escapeHtml(opts.link.label));
      a.href = opts.link.href;
      if (opts.link.onClick) a.addEventListener("click", opts.link.onClick);
      t.appendChild(a);
    }
    host.appendChild(t);
    fx("toastIn", t);
    const remove = () => t.remove();
    setTimeout(() => { if (!fx("toastOut", t, remove)) remove(); }, opts.duration || 3200);
    return t;
  };

  /* ---------- header, mobile menu, footer ---------- */
  const NAV = [["/", "Home", "home"], ["/shop", "Shop", "shop"], ["/build", "Build", "build"], ["/about", "About", "about"], ["/mission", "Mission", "mission"], ["/contact", "Contact", "contact"]];
  const LOGO = '<img src="/assets/img/blendworks-logo-horizontal-dark.svg" alt="BlendWorks">';
  const navLinks = () => {
    const page = document.body.dataset.page;
    return NAV.map(([href, label, key]) => `<a href="${href}"${page === key ? ' class="is-active"' : ""}>${label}</a>`).join("");
  };
  const menu = { el: null, isOpen: false, open() {}, close() {} };
  function renderHeader() {
    const host = $("#site-header");
    if (!host) return;
    host.className = "site-header";
    host.innerHTML = `<div class="container">
      <a class="logo" href="/" aria-label="BlendWorks home">${LOGO}</a>
      <nav class="nav" aria-label="Primary">${navLinks()}</nav>
      <div class="header-actions">
        <button class="btn-icon" data-open-search aria-label="Search products" title="Search (Ctrl+K)">${I.search}</button>
        <a class="btn-icon" data-account-link href="/login" aria-label="Sign in">${I.user}</a>
        <button class="btn-icon cart-btn" data-open-cart aria-label="Open cart">${I.cart}<span class="cart-count" data-cart-count>0</span></button>
        <a class="btn btn-primary btn-sm" href="/shop">Shop blends</a>
        <button class="btn-icon menu-btn" data-open-menu aria-label="Open menu" aria-expanded="false">${I.menu}</button>
      </div>
    </div>`;
    const mm = menu.el = document.body.appendChild(el("div", "mobile-menu",
      `<div class="close-row">${LOGO}<button class="btn-icon" data-close-menu aria-label="Close menu">${I.close}</button></div>
       <nav aria-label="Mobile">${navLinks()}<a href="/cart">Cart</a><a href="/login" data-account-link>Sign in</a></nav>
       <a class="btn btn-primary btn-lg" href="/shop">Shop blends</a>`));
    const toggleBtn = $("[data-open-menu]", host);
    const set = (open) => {
      menu.isOpen = open;
      mm.classList.toggle("is-open", open);
      mm.setAttribute("aria-hidden", String(!open));
      toggleBtn.setAttribute("aria-expanded", String(open));
      (open ? $("[data-close-menu]", mm) : toggleBtn).focus();
    };
    menu.open = () => set(true);
    menu.close = () => { if (menu.isOpen) set(false); };
    mm.setAttribute("aria-hidden", "true");
    if (!BW.motion) {   // motion.js drives the scrolled/hidden states when present
      const onScroll = () => host.classList.toggle("is-scrolled", window.scrollY > 12);
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }
  }
  function renderFooter() {
    const host = $("#site-footer");
    if (!host) return;
    host.className = "site-footer";
    host.innerHTML = `<div class="container">
      <div class="footer-grid">
        <div class="footer-brand">${LOGO}
          <p>Custom supplement capsules and powders, made to order. Every milligram on the label — nothing hidden.</p>
        </div>
        <div><h4>Shop</h4><ul><li><a href="/shop?type=capsule">Capsule blends</a></li><li><a href="/shop?type=powder">Powder blends</a></li><li><a href="/shop">All products</a></li><li><a href="/build">Build your own</a></li></ul></div>
        <div><h4>Company</h4><ul><li><a href="/about">About</a></li><li><a href="/mission">Mission &amp; goals</a></li><li><a href="/contact">Contact</a></li><li><a href="/contact#faq">FAQ</a></li></ul></div>
        <div><h4>Legal</h4><ul><li><a href="/terms">Terms of service</a></li><li><a href="/privacy">Privacy policy</a></li><li><a href="/contact#report">Report a problem</a></li></ul></div>
      </div>
      <div class="footer-bottom"><span>&copy; ${new Date().getFullYear()} BlendWorks. All rights reserved.</span><span>Made to order &middot; Shipping details announced at launch</span></div>
      <p class="disclaimer">These statements have not been evaluated by the Food and Drug Administration. These products are not intended to diagnose, treat, cure, or prevent any disease. For adults 18+. Consult a physician before use if you are pregnant, nursing, taking medication, or have a medical condition.</p>
    </div>`;
  }

  /* ---------- cart UI: badge, quantity control, line items, drawer ---------- */
  function updateBadge(bump) {
    const n = BW.cart.count();
    $$("[data-cart-count]").forEach((b) => {
      b.textContent = n;
      b.classList.toggle("is-visible", n > 0);
      if (bump && n) fx("badgeBump", b);
    });
    const c = $("[data-drawer-count]");
    if (c) c.textContent = n ? `(${n})` : "";
  }
  BW.flyToCart = (btn) => {
    const host = btn.closest("[data-id]") || btn.closest(".product-layout");
    fx("flyToCart", btn, host && host.querySelector(".art svg, .product-stage svg"));
  };
  BW.qtyControl = (id, qty, small) =>
    `<div class="qty${small ? " sm" : ""}" data-qty="${id}"><button type="button" data-dec aria-label="Decrease">&minus;</button><input type="number" min="1" max="${BW.cart.maxQty}" value="${qty}" aria-label="Quantity"><button type="button" data-inc aria-label="Increase">+</button></div>`;
  BW.bindQty = (root, onChange) => {
    $$("[data-qty]", root).forEach((q) => {
      const input = $("input", q);
      const set = (v) => {
        v = Math.max(1, Math.min(BW.cart.maxQty, Number(v) || 1));
        input.value = v;
        if (onChange) onChange(q.dataset.qty, v);
      };
      $("[data-dec]", q).addEventListener("click", () => set(Number(input.value) - 1));
      $("[data-inc]", q).addEventListener("click", () => set(Number(input.value) + 1));
      input.addEventListener("change", () => set(input.value));
    });
  };
  BW.cartLineHtml = (l, big) => {
    const p = l.product, href = p.custom ? "/build" : `/product?id=${p.slug}`;
    const kind = p.custom ? `Custom ${BW.typeLabel(p).toLowerCase()}` : BW.typeLabel(p);
    return `<div class="cart-item" data-line="${p.id}">
      <a class="thumb" href="${href}" tabindex="-1" aria-hidden="true">${BW.art.product(p, { suffix: big ? "-pg" : "-dr" })}</a>
      <div>
        <a class="name" href="${href}">${escapeHtml(p.name)}</a>
        <div class="sub">${kind} &middot; ${BW.formatPrice(p.price)} each</div>
        ${p.custom ? `<div class="sub">${escapeHtml(p.tagline)} &middot; ${escapeHtml(p.servingSize)}</div>` : ""}
        <div class="qty-row">${BW.qtyControl(p.id, l.qty, !big)}</div>
      </div>
      <div class="controls"><div class="line-price num">${BW.formatPrice(l.lineTotal)}</div><button class="remove" data-remove="${p.id}">Remove</button></div>
    </div>`;
  };
  BW.bindCartLines = (root) => {
    BW.bindQty(root, BW.cart.setQty);
    $$("[data-remove]", root).forEach((b) => b.addEventListener("click", () => {
      const rm = () => BW.cart.remove(b.dataset.remove);
      if (!fx("itemOut", b.closest(".cart-item"), rm)) rm();
    }));
  };
  const drawer = { isOpen: false, lastFocus: null };
  function buildDrawer() {
    const bd = document.body.appendChild(el("div", "drawer-backdrop"));
    bd.setAttribute("data-close-cart", "");
    const d = document.body.appendChild(el("aside", "cart-drawer", `<header><h3>Your cart <span class="muted count" data-drawer-count></span></h3><button class="btn-icon" data-close-cart aria-label="Close cart">${I.close}</button></header>
      <div class="cart-items" data-drawer-items></div>
      <div class="cart-footer" data-drawer-footer hidden>
        <div class="line"><span>Subtotal</span><span class="num" data-drawer-subtotal></span></div>
        <div class="line"><span>Shipping &amp; tax</span><span>Calculated at checkout</span></div>
        <a class="btn btn-secondary btn-block" href="/cart">View cart</a><a class="btn btn-primary btn-block" href="/checkout">Checkout ${I.arrow}</a>
      </div>`));
    d.setAttribute("aria-label", "Shopping cart");
    d.setAttribute("aria-hidden", "true");
    const items = $("[data-drawer-items]", d), foot = $("[data-drawer-footer]", d);
    function render() {
      const lines = BW.cart.lines();
      foot.hidden = !lines.length;
      if (!lines.length) {
        items.innerHTML = `<div class="empty-state plain">${I.bag}<p><b>Your cart is empty.</b></p><p>Browse the in-stock capsule and powder blends.</p><a class="btn btn-primary" href="/shop">Shop blends</a></div>`;
        return;
      }
      items.innerHTML = lines.map((l) => BW.cartLineHtml(l, false)).join("");
      $("[data-drawer-subtotal]", d).textContent = BW.formatPrice(BW.cart.subtotal());
      BW.bindCartLines(items);
    }
    BW.openCart = () => {
      if (drawer.isOpen) return;
      drawer.isOpen = true;
      drawer.lastFocus = document.activeElement;
      render();
      bd.classList.add("is-open"); d.classList.add("is-open");
      d.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      fx("drawerOpen", bd, d, $$(".cart-item, .empty-state", d));
      $("[data-close-cart]", d).focus();
    };
    BW.closeCart = () => {
      if (!drawer.isOpen) return;
      drawer.isOpen = false;
      d.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      const done = () => { bd.classList.remove("is-open"); d.classList.remove("is-open"); };
      if (!fx("drawerClose", bd, d, done)) done();
      if (drawer.lastFocus && drawer.lastFocus.focus) drawer.lastFocus.focus();
    };
    BW.cart.on(() => { render(); updateBadge(true); });
  }

  /* ---------- catalog UI: badges, stock, product cards, add-to-cart flow ---------- */
  const LOW_STOCK = 20;
  const badgeCls = (b) => (/stim/i.test(b) ? "mint" : /new/i.test(b) ? "lav" : /best/i.test(b) ? "" : "amber");
  BW.badges = (p) => p.badges.map((b) => `<span class="badge ${badgeCls(b)}">${escapeHtml(b)}</span>`).join("");
  BW.stock = (p, long) => {
    const cls = p.stock === 0 ? "out" : p.stock <= LOW_STOCK ? "low" : "";
    const txt = p.stock === 0 ? "Sold out" : p.stock <= LOW_STOCK ? (long ? `Low stock — ${p.stock} left` : "Low stock") : "In stock";
    return `<span class="stock-dot ${cls}">${txt}</span>`;
  };
  BW.productCard = (p, opts = {}) => {
    const href = `/product?id=${p.slug}`;
    return `<article class="product-card" data-id="${p.id}" data-flip-id="${p.id}" style="--c1:${p.colors[0]}">
      <a class="art" href="${href}" tabindex="-1" aria-hidden="true">
        <div class="badges">${BW.badges(p)}</div>
        <span class="type-tag">${p.type === "capsule" ? `${I.capsule} Capsules` : `${I.powder} Powder`}</span>
        ${BW.art.product(p, { suffix: opts.suffix || "-card" })}
      </a>
      <div class="body">
        <h3><a href="${href}">${opts.q ? BW.highlight(p.name, opts.q) : escapeHtml(p.name)}</a></h3>
        <p class="tagline">${escapeHtml(p.tagline)}</p>
        <div class="meta"><span>${escapeHtml(p.servingSize)}</span><span>&middot;</span><span>${p.servings} servings</span>${p.flavor ? `<span>&middot;</span><span>${escapeHtml(p.flavor)}</span>` : ""}</div>
        <div class="bottom"><div class="price num">${BW.formatPrice(p.price)}<small>/ ${p.type === "capsule" ? "bottle" : "tub"}</small></div>${BW.stock(p)}</div>
        <div class="bottom">${BW.qtyControl(p.id, 1, true)}<button class="btn btn-primary btn-sm add-btn" data-add="${p.id}"${p.stock === 0 ? " disabled" : ""}>${I.cart} Add to cart</button></div>
      </div>
    </article>`;
  };
  BW.addToCart = (btn, id, qty) => {   // shared add flow: cart + fly + button state + toast
    const p = BW.getProduct(id);
    if (!p) return BW.toast("That blend is no longer available.");
    if (!BW.cart.add(id, qty)) return BW.toast("Sorry, this blend is sold out.");
    BW.flyToCart(btn);
    const label = btn.innerHTML;
    btn.classList.add("is-added");
    btn.innerHTML = `${I.check} Added`;
    setTimeout(() => { btn.classList.remove("is-added"); btn.innerHTML = label; }, 1400);
    BW.toast(`${qty} × ${p.name} added to your cart.`, { link: { href: "/cart", label: "View cart", onClick: (e) => { e.preventDefault(); BW.openCart(); } } });
  };
  BW.bindAddButtons = (root) => {
    BW.bindQty(root);
    $$("[data-add]", root).forEach((btn) => btn.addEventListener("click", () => {
      const card = btn.closest("[data-id]"), q = card && $("[data-qty] input", card);
      BW.addToCart(btn, btn.dataset.add, q ? Number(q.value) || 1 : 1);
    }));
  };

  /* ---------- search: shared matcher + Ctrl+K overlay ---------- */
  BW.searchProducts = (q) => {
    const terms = (q || "").trim().toLowerCase().split(" ").filter(Boolean);
    if (!terms.length) return [];
    return BW.products.map((p) => {
      const name = p.name.toLowerCase();
      const hay = [name, p.tagline, p.blurb, p.type, p.flavor || "", p.goals.join(" "), p.badges.join(" "), p.ingredients.map((i) => i[0]).join(" ")].join(" ").toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return null;
      const score = terms.reduce((s, t) => s + (name.indexOf(t) === 0 ? 6 : name.includes(t) ? 4 : 1), 0);
      return { p, score };
    }).filter(Boolean).sort((a, b) => b.score - a.score).map((r) => r.p);
  };
  BW.highlight = (text, q) => {
    const t = String(text), needle = (q || "").trim().toLowerCase(), i = needle ? t.toLowerCase().indexOf(needle) : -1;
    if (i < 0) return escapeHtml(t);
    return `${escapeHtml(t.slice(0, i))}<mark>${escapeHtml(t.slice(i, i + needle.length))}</mark>${escapeHtml(t.slice(i + needle.length))}`;
  };
  const search = { el: null, input: null, results: null, focused: -1, isOpen: false, lastFocus: null };
  function buildSearch() {
    const ov = search.el = document.body.appendChild(el("div", "search-overlay",
      `<div class="search-panel" role="dialog" aria-modal="true" aria-label="Search products"><div class="search-input">${I.search}<input type="search" placeholder="Search blends, ingredients, goals…" aria-label="Search"><kbd>Esc</kbd></div><div class="search-results"></div></div>`));
    ov.setAttribute("aria-hidden", "true");
    const input = search.input = $("input", ov), results = search.results = $(".search-results", ov);
    function render() {
      const q = input.value, list = BW.searchProducts(q).slice(0, 7);
      search.focused = -1;
      if (!q.trim()) { results.innerHTML = '<div class="empty">Try "focus", "creatine", "stim-free" or "powder".</div>'; return; }
      if (!list.length) { results.innerHTML = `<div class="empty">No blends match "${escapeHtml(q)}".</div>`; return; }
      results.innerHTML = list.map((p) =>
        `<a href="/product?id=${p.slug}"><span class="thumb" style="background:linear-gradient(135deg,${p.colors[0]},${p.colors[1]})"></span><span><div>${BW.highlight(p.name, q)}</div><div class="meta">${BW.typeLabel(p)} &middot; ${p.goals.join(", ")}</div></span><span class="price num">${BW.formatPrice(p.price)}</span></a>`
      ).join("") + `<a class="more" href="/shop?q=${encodeURIComponent(q)}">See all results in the shop ${I.arrow}</a>`;
      fx("resultsIn", results);
    }
    BW.openSearch = () => {
      if (search.isOpen) return;
      search.isOpen = true;
      search.lastFocus = document.activeElement;
      ov.classList.add("is-open"); ov.setAttribute("aria-hidden", "false");
      render();
      fx("overlayOpen", $(".search-panel", ov));
      setTimeout(() => input.focus(), 50);
    };
    BW.closeSearch = () => {
      if (!search.isOpen) return;
      search.isOpen = false;
      ov.classList.remove("is-open"); ov.setAttribute("aria-hidden", "true");
      if (search.lastFocus && search.lastFocus.focus) search.lastFocus.focus();
    };
    search.nav = (e) => {   // arrow keys move the focus ring, Enter follows it (or opens the shop with the query)
      const links = $$("a", results);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!links.length) return;
        search.focused = (search.focused + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
        links.forEach((l, i) => l.classList.toggle("is-focused", i === search.focused));
      } else if (e.key === "Enter") {
        const target = links[search.focused];
        if (target) location.href = target.href;
        else if (input.value.trim()) location.href = `/shop?q=${encodeURIComponent(input.value.trim())}`;
      }
    };
    input.addEventListener("input", render);
  }

  /* ---------- global events (one click handler, one keydown handler) ---------- */
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-open-cart]")) { e.preventDefault(); BW.openCart(); }
    else if (t.closest("[data-close-cart]")) BW.closeCart();
    else if (t.closest("[data-open-search]")) { e.preventDefault(); BW.openSearch(); }
    else if (t.closest("[data-open-menu]")) menu.open();
    else if (t.closest("[data-close-menu]")) menu.close();
    else if (t === search.el) BW.closeSearch();
  });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); return search.isOpen ? BW.closeSearch() : BW.openSearch(); }
    if (e.key === "Escape") { BW.closeSearch(); BW.closeCart(); menu.close(); return; }
    if (search.isOpen) search.nav(e);
  });

  /* ---------- boot ---------- */
  BW.enhance = (root) => { fx("cards", root); fx("magnetic", root); };
  document.addEventListener("DOMContentLoaded", () => {
    injectSprite();
    if (!BW.motion) document.documentElement.classList.remove("curtain-pending");
    renderHeader(); renderFooter(); buildDrawer(); buildSearch(); updateBadge(false);
    $$("[data-hero-capsule]").forEach((c) => { c.innerHTML = BW.art.capsuleHero(); });
    BW.enhance(document);
    document.dispatchEvent(new CustomEvent("bw:ready"));
  });
})();
