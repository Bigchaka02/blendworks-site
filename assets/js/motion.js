/* BlendWorks motion layer — GSAP 3.13 (ScrollTrigger, SplitText, Flip) + Lenis.
   Exposes BW.motion; site.js/page scripts call it through BW.fx(). If the CDN scripts
   are missing this file does nothing and the site renders static. */
(function () {
  if (!window.gsap || !window.ScrollTrigger) return;
  window.BW = window.BW || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  gsap.registerPlugin(ScrollTrigger); if (window.SplitText) gsap.registerPlugin(SplitText); if (window.Flip) gsap.registerPlugin(Flip);
  gsap.defaults({ ease: "expo.out", duration: 1 }); gsap.config({ nullTargetWarn: false });
  var fine = matchMedia("(pointer: fine)").matches, desktop = matchMedia("(min-width: 769px)").matches;
  var M = BW.motion = { fine: fine, desktop: desktop, lenis: null, ready: false };
  document.documentElement.classList.add("has-motion");

  /* ---------- smooth scroll (desktop, fine pointer) + scroll chrome ---------- */
  function initLenis() {
    if (!window.Lenis || !fine || !desktop) return;
    var lenis = M.lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); }); gsap.ticker.lagSmoothing(0);
    document.addEventListener("click", function (e) {
      var a = e.target.closest('a[href^="#"]'), target = a && a.getAttribute("href").length > 1 && $(a.getAttribute("href"));
      if (target) { e.preventDefault(); lenis.scrollTo(target, { offset: -80, duration: 1.2 }); }
    });
  }
  function initChrome() {
    gsap.to(document.body.appendChild(Object.assign(document.createElement("div"), { className: "scroll-progress" })), { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } });
    var header = $(".site-header"), lastY = 0; if (!header) return;
    ScrollTrigger.create({ start: 0, end: "max", onUpdate: function (self) {
      var y = self.scroll();
      header.classList.toggle("is-scrolled", y > 12);
      if (y > 140 && y > lastY + 4 && !document.body.classList.contains("drawer-open")) header.classList.add("is-hidden");
      else if (y < lastY - 4 || y < 140) header.classList.remove("is-hidden");
      lastY = y;
    } });
  }

  /* ---------- gestures: light magnetic pull + press feedback; subtle card tilt + glare ---------- */
  var once = function (el, key) { if (el.dataset[key]) return false; el.dataset[key] = "1"; return true; };
  M.magnetic = function (root) {
    if (!fine) return;
    $$(".btn-primary, .btn-secondary, .build-btn, .type-tabs button, .chip", root).forEach(function (el) {
      if (!once(el, "magnet")) return;
      var k = el.classList.contains("chip") || el.closest(".type-tabs") ? 2 : 5;
      var qx = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3" }), qy = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3" });
      el.addEventListener("mousemove", function (e) { var r = el.getBoundingClientRect(); qx(((e.clientX - r.left) / r.width - 0.5) * k); qy(((e.clientY - r.top) / r.height - 0.5) * k); });
      el.addEventListener("mouseleave", function () { gsap.to(el, { x: 0, y: 0, duration: 0.8, ease: "elastic.out(1, 0.4)" }); });
    });
    $$(".btn, .chip, .type-tabs button, .qty button", root).forEach(function (el) {
      if (!once(el, "press")) return;
      var up = function () { gsap.to(el, { scale: 1, duration: 0.5, ease: "elastic.out(1, 0.45)" }); };
      el.addEventListener("pointerdown", function () { gsap.to(el, { scale: 0.95, duration: 0.12 }); });
      el.addEventListener("pointerup", up); el.addEventListener("pointerleave", up);
    });
  };
  M.cards = function (root) {
    if (!fine) return;
    $$(".product-card, .card.feature, .card.persona, .value", root).forEach(function (card) {
      if (!once(card, "tilt")) return;
      card.classList.add("has-glare");
      var rx = gsap.quickTo(card, "rotationX", { duration: 0.6, ease: "power3" }), ry = gsap.quickTo(card, "rotationY", { duration: 0.6, ease: "power3" });
      gsap.set(card, { transformPerspective: 900, transformOrigin: "50% 50%" });
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        rx(-(py - 0.5) * 2.5); ry((px - 0.5) * 3);
        card.style.setProperty("--mx", px * 100 + "%"); card.style.setProperty("--my", py * 100 + "%");
      });
      card.addEventListener("mouseenter", function () { gsap.to(card, { y: -3, duration: 0.5 }); });
      card.addEventListener("mouseleave", function () { rx(0); ry(0); gsap.to(card, { y: 0, duration: 0.7, ease: "elastic.out(1, 0.5)" }); });
    });
  };

  /* ---------- scroll reveals, split headings, timeline draw, counters ---------- */
  M.revealAll = function (root) {
    root = root || document;
    $$(".reveal", root).forEach(function (el) { if (once(el, "gs")) gsap.from(el, { autoAlpha: 0, y: 48, duration: 1.1, scrollTrigger: { trigger: el, start: "top 88%", once: true } }); });
    $$(".reveal-stagger", root).forEach(function (el) {
      if (!once(el, "gs") || !el.children.length) return;
      gsap.from(el.children, { autoAlpha: 0, y: 40, rotationX: 6, transformOrigin: "50% 100%", duration: 1, stagger: 0.08, scrollTrigger: { trigger: el, start: "top 85%", once: true } });
    });
    if (window.SplitText) $$("[data-split-lines], .split-lines", root).forEach(function (el) {
      if (!once(el, "gs")) return;
      var s = SplitText.create(el, { type: "lines", mask: "lines", linesClass: "sl" });
      gsap.from(s.lines, { yPercent: 110, rotation: 2, duration: 1.2, stagger: 0.09, scrollTrigger: { trigger: el, start: "top 88%", once: true } });
    });
    $$(".timeline", root).forEach(function (el) { if (once(el, "tl")) gsap.fromTo(el, { "--tl": 0 }, { "--tl": 1, ease: "none", scrollTrigger: { trigger: el, start: "top 80%", end: "bottom 65%", scrub: true } }); });
    M.magnetic(root);
  };
  M.countUp = function (el, target, suffix) {
    var o = { v: 0 };
    gsap.to(o, { v: target, duration: 1.6, ease: "power3.out", onUpdate: function () { el.textContent = Math.round(o.v).toLocaleString() + (suffix || ""); } });
  };

  /* ---------- curtain: page transitions + first-visit intro ---------- */
  function curtain() {
    var c = $(".curtain"); if (c) return c;
    c = document.body.appendChild(Object.assign(document.createElement("div"), { className: "curtain" })); c.setAttribute("aria-hidden", "true");
    c.innerHTML = '<div class="curtain-panel"></div><div class="curtain-mark"><svg viewBox="0 0 100 100" width="72" height="72"><path d="M22,14 H52 A16,16 0 0 1 52,46 H22 Z" fill="none" stroke="#56B4F2" stroke-width="3"/><path d="M22,50 H62 A18,18 0 0 1 62,86 H22 Z" fill="none" stroke="#B18CF5" stroke-width="3"/></svg></div>';
    return c;
  }
  var hideCurtain = function (c) { gsap.set(c, { autoAlpha: 0, pointerEvents: "none" }); };
  M.transitionOut = function (href) {
    var c = curtain(); gsap.set(c, { autoAlpha: 1, pointerEvents: "auto" });
    gsap.timeline({ onComplete: function () { location.href = href; } })
      .fromTo($(".curtain-panel", c), { yPercent: 100 }, { yPercent: 0, duration: 0.55, ease: "expo.inOut" })
      .fromTo($(".curtain-mark", c), { autoAlpha: 0, scale: 0.8 }, { autoAlpha: 1, scale: 1, duration: 0.35 }, "-=0.2");
  };
  function initTransitions() {
    document.addEventListener("click", function (e) {
      var a = e.target.closest("a[href]"); if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === "_blank" || a.hasAttribute("download") || a.hasAttribute("data-build")) return;
      var href = a.getAttribute("href"); if (!href || href.charAt(0) === "#" || /^(mailto:|tel:|javascript:)/.test(href)) return;
      var url = new URL(a.href, location.href); if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search && url.hash)) return;
      e.preventDefault(); try { sessionStorage.setItem("bw_transition", "1"); } catch (err) {}
      M.transitionOut(a.href);
    });
    window.addEventListener("pageshow", function (ev) { if (ev.persisted) { var c = $(".curtain"); if (c) hideCurtain(c); } });
  }
  function intro(cb) {
    var fired = false, done = function () { if (!fired) { fired = true; cb(); } };
    setTimeout(done, 3000);   // safety: never leave the page hidden
    var c = curtain(), panel = $(".curtain-panel", c), mark = $(".curtain-mark", c), paths = $$("path", mark), fromLink = false, seen = false;
    document.documentElement.classList.remove("curtain-pending");
    try { fromLink = sessionStorage.getItem("bw_transition") === "1"; sessionStorage.removeItem("bw_transition"); seen = sessionStorage.getItem("bw_intro") === "1"; sessionStorage.setItem("bw_intro", "1"); } catch (e) {}
    gsap.set(c, { autoAlpha: 1, pointerEvents: "auto" }); gsap.set(panel, { yPercent: 0 });
    var tl = gsap.timeline({ onComplete: function () { hideCurtain(c); } }), pos = 0.05;
    if (!seen && !fromLink) {
      paths.forEach(function (p) { var L = p.getTotalLength(); gsap.set(p, { strokeDasharray: L, strokeDashoffset: L }); });
      tl.set(mark, { autoAlpha: 1, scale: 1 })
        .to(paths, { strokeDashoffset: 0, duration: 0.9, ease: "power2.inOut", stagger: 0.15 })
        .to(paths, { fill: function (i) { return i ? "#B18CF5" : "#56B4F2"; }, duration: 0.35 }, "-=0.2")
        .to(mark, { scale: 0.85, autoAlpha: 0, duration: 0.35, ease: "power2.in" }, "+=0.15");
      pos = ">-0.05";
    } else gsap.set(mark, { autoAlpha: 0 });
    tl.call(done, null, pos).to(panel, { yPercent: -100, duration: 0.7, ease: "expo.inOut" }, pos);
  }

  /* ---------- UI hooks used by site.js and page scripts ---------- */
  M.toastIn = function (t) { gsap.from(t, { y: 24, autoAlpha: 0, scale: 0.94, duration: 0.6, ease: "back.out(1.7)" }); };
  M.toastOut = function (t, done) { return gsap.to(t, { y: 10, autoAlpha: 0, scale: 0.95, duration: 0.3, ease: "power2.in", onComplete: done }); };
  M.badgeBump = function (b) { gsap.fromTo(b, { scale: 1 }, { scale: 1.6, duration: 0.18, yoyo: true, repeat: 1, ease: "power2.out" }); };
  M.drawerOpen = function (backdrop, panel, items) {
    document.body.classList.add("drawer-open"); if (M.lenis) M.lenis.stop();
    gsap.timeline().fromTo(backdrop, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, ease: "power2.out" }, 0)
      .fromTo(panel, { xPercent: 100 }, { xPercent: 0, duration: 0.75 }, 0)
      .from(items, { x: 40, autoAlpha: 0, duration: 0.6, stagger: 0.06, ease: "power3.out" }, 0.2);
  };
  M.drawerClose = function (backdrop, panel, done) {
    document.body.classList.remove("drawer-open"); if (M.lenis) M.lenis.start();
    return gsap.timeline({ onComplete: done }).to(panel, { xPercent: 100, duration: 0.5, ease: "expo.in" }, 0).to(backdrop, { autoAlpha: 0, duration: 0.4 }, 0.1);
  };
  M.itemsIn = function (items) { if (items.length) gsap.from(items, { x: 30, autoAlpha: 0, duration: 0.5, stagger: 0.05, ease: "power3.out", clearProps: "transform" }); };
  M.itemOut = function (item, done) { return gsap.to(item, { x: 40, autoAlpha: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, duration: 0.35, ease: "power2.in", onComplete: done }); };
  M.overlayOpen = function (panel) { gsap.fromTo(panel, { y: -18, scale: 0.97, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: 0.45 }); };
  M.resultsIn = function (root) { gsap.from($$("a", root), { y: 10, autoAlpha: 0, duration: 0.35, stagger: 0.04, ease: "power2.out" }); };
  M.pop = function (el) { gsap.from(el, { y: 16, autoAlpha: 0, duration: 0.5 }); };
  M.stepOut = function (el, done) { return gsap.to(el, { x: -28, autoAlpha: 0, duration: 0.28, ease: "power2.in", onComplete: function () { gsap.set(el, { clearProps: "all" }); done(); } }); };
  M.stepIn = function (el) { gsap.from(el, { x: 28, autoAlpha: 0, duration: 0.55, clearProps: "all" }); gsap.from($$(".fmt, .opt, .ratio-card, .blend-preview", el), { y: 24, autoAlpha: 0, duration: 0.7, stagger: 0.07, clearProps: "all" }); };
  M.flyToCart = function (btn, art) {
    var target = $("[data-open-cart]"); if (!target) return;
    var src = art || btn, a = src.getBoundingClientRect(), b = target.getBoundingClientRect();
    var ghost = document.body.appendChild(Object.assign(document.createElement("div"), { className: "fly-ghost", innerHTML: art ? art.outerHTML : "" }));
    ghost.style.cssText = "position:fixed;z-index:100;pointer-events:none;left:" + a.left + "px;top:" + a.top + "px;width:" + a.width + "px;height:" + a.height + "px";
    var dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    gsap.timeline({ onComplete: function () { ghost.remove(); } })
      .to(ghost, { x: dx, duration: 0.8, ease: "power2.inOut" }, 0)
      .to(ghost, { y: dy - 140, duration: 0.35, ease: "power2.out" }, 0).to(ghost, { y: dy, duration: 0.45, ease: "power2.in" }, 0.35)
      .to(ghost, { scale: 0.12, rotation: 25, duration: 0.8, ease: "power2.in" }, 0).to(ghost, { autoAlpha: 0, duration: 0.15 }, 0.7)
      .to(target, { scale: 1.25, duration: 0.15, yoyo: true, repeat: 1, ease: "power2.out" }, 0.75);
  };
  M.flipGrid = function (grid, rerender) {
    if (!window.Flip) return rerender();
    var state = Flip.getState($$(".product-card", grid), { props: "opacity" });
    rerender();
    Flip.from(state, { duration: 0.7, ease: "power3.inOut", stagger: 0.015, absolute: true, scale: true,
      onEnter: function (els) { return gsap.fromTo(els, { autoAlpha: 0, scale: 0.9, y: 30 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.6, stagger: 0.04 }); },
      onLeave: function (els) { return gsap.to(els, { autoAlpha: 0, scale: 0.9, duration: 0.3, ease: "power2.in" }); } });
  };
  function initAccordions() {
    $$(".accordion details").forEach(function (d) {
      var content = $(".content", d);
      $("summary", d).addEventListener("click", function (e) {
        e.preventDefault();
        if (d.open) gsap.to(content, { height: 0, autoAlpha: 0, duration: 0.35, ease: "power2.inOut", onComplete: function () { d.open = false; gsap.set(content, { clearProps: "all" }); } });
        else { d.open = true; gsap.from(content, { height: 0, autoAlpha: 0, duration: 0.45, ease: "power3.out", clearProps: "all" }); }
      });
    });
  }

  document.addEventListener("bw:ready", function () {
    initLenis(); initChrome(); initTransitions(); initAccordions();
    intro(function () { M.ready = true; M.revealAll(document); M.cards(document); document.dispatchEvent(new CustomEvent("bw:motion-ready")); ScrollTrigger.refresh(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
    window.addEventListener("load", function () { ScrollTrigger.refresh(); });
  });
})();
