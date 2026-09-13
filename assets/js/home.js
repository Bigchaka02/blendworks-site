/* Home page: featured grid, ingredient marquee, ambient particles, hero choreography and scroll scenes.
   Page-level choreography uses GSAP directly behind the BW.motion guard (see decision D16). */
(function () {
  const { $, $$ } = BW;
  const DOT_GRID = [8, 24];   // rows × columns of the CTA dot grid — must match .cta-band .dots in styles.css

  function particles(canvas) {   // ambient drifting dots behind the hero; runs only while the hero is on screen
    const ctx = canvas.getContext("2d"), dpr = Math.min(devicePixelRatio || 1, 2), dots = [];
    let W, H, raf = 0, visible = true;
    const resize = () => { W = canvas.width = canvas.offsetWidth * dpr; H = canvas.height = canvas.offsetHeight * dpr; };
    resize();
    addEventListener("resize", resize);
    for (let i = 0; i < 70; i++) {
      dots.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.4, vx: (Math.random() - 0.5) * 0.0003, vy: -(Math.random() * 0.0004 + 0.0001),
        c: Math.random() > 0.5 ? "86,180,242" : "177,140,245", a: Math.random() * 0.5 + 0.2 });
    }
    const frame = () => {
      ctx.clearRect(0, 0, W, H);
      dots.forEach((d) => {
        d.x = (d.x + d.vx + 1) % 1;
        d.y += d.vy;
        if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); }
        ctx.beginPath();
        ctx.arc(d.x * W, d.y * H, d.r * dpr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${d.c},${d.a})`;
        ctx.fill();
      });
      raf = requestAnimationFrame(frame);
    };
    const run = () => { cancelAnimationFrame(raf); if (visible && !document.hidden) frame(); };
    new IntersectionObserver((en) => { visible = en[0].isIntersecting; run(); }).observe(canvas);
    document.addEventListener("visibilitychange", run);
  }

  function heroIntro() {
    const h1 = $("[data-hero-title]"), tl = gsap.timeline({ defaults: { ease: "expo.out" } });
    if (h1 && window.SplitText) {
      const split = SplitText.create(h1, { type: "words", mask: "words", wordsClass: "word" });
      $$(".grad-text", h1).forEach((span) => {   // move the gradient from the wrapper to the split words so the mask clips cleanly
        span.classList.remove("grad-text", "shimmer");
        $$(".word", span).forEach((w) => w.classList.add("grad-text", "shimmer"));
      });
      tl.from(split.words, { yPercent: 110, rotation: 5, duration: 1.3, stagger: 0.07 }, 0);
    }
    tl.fromTo(".hero .eyebrow", { x: -24, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.9 }, 0.1)
      .fromTo(".hero .lead", { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1 }, 0.5)
      .fromTo(".hero-cta > *", { y: 24, autoAlpha: 0, scale: 0.92 }, { y: 0, autoAlpha: 1, scale: 1, duration: 0.9, stagger: 0.1, ease: "back.out(1.6)" }, 0.7)
      .fromTo(".trust-strip span", { y: 12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.7, stagger: 0.07 }, 1)
      .fromTo(".capsule-3d", { scale: 0.4, rotation: -40, autoAlpha: 0 }, { scale: 1, rotation: 0, autoAlpha: 1, duration: 1.8, ease: "elastic.out(1, 0.55)" }, 0.25)
      .fromTo(".orbit", { scale: 0.6, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 1.4, stagger: 0.12 }, 0.6)
      .fromTo(".float-card", { x: (i) => (i % 2 ? 70 : -70), autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 1.1, stagger: 0.12 }, 1)
      .fromTo(".scroll-cue", { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.8 }, 1.6);
    gsap.to(".capsule-3d", { y: -16, rotation: 3, duration: 3.6, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 1.8 });
    if (BW.motion.desktop) $$(".float-card").forEach((c, i) => gsap.to(c, { y: i % 2 ? -8 : 8, duration: 3.2 + i * 0.5, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 2 }));
    gsap.to(".scroll-cue .mouse i", { y: 12, autoAlpha: 0, duration: 1.4, repeat: -1, ease: "power2.in", delay: 2 });
  }

  function scenes() {
    heroIntro();
    if (BW.motion.desktop) {
      gsap.timeline({ scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } })
        .to(".hero-copy", { y: -140, autoAlpha: 0.1, ease: "none" }, 0)
        .to(".hero-visual", { y: -80, scale: 0.85, autoAlpha: 0.4, ease: "none" }, 0)
        .to(".mesh span", { y: -180, ease: "none" }, 0)
        .to(".scroll-cue", { autoAlpha: 0, ease: "none", duration: 0.2 }, 0);
    }
    // stats count up
    $$("[data-count]").forEach((el) => ScrollTrigger.create({ trigger: el, start: "top 88%", once: true, onEnter: () => BW.motion.countUp(el, Number(el.dataset.count), el.dataset.suffix) }));
    // marquee: perpetual, speeds up and skews with scroll velocity
    const track = $("[data-marquee]"), tween = gsap.to(track, { xPercent: -50, repeat: -1, duration: 45, ease: "none" });
    const proxy = { skew: 0, speed: 1 }, skew = gsap.quickSetter(track, "skewX", "deg"), clampSkew = gsap.utils.clamp(-12, 12), clampSpeed = gsap.utils.clamp(0.4, 6);
    ScrollTrigger.create({ onUpdate(self) {
      const v = self.getVelocity(), s = clampSkew(v / -280);
      if (Math.abs(s) <= Math.abs(proxy.skew)) return;
      proxy.skew = s;
      proxy.speed = clampSpeed(1 + Math.abs(v) / 350);
      gsap.to(proxy, { skew: 0, speed: 1, duration: 1, ease: "power3", overwrite: true, onUpdate() { skew(proxy.skew); tween.timeScale(v < 0 ? -proxy.speed : proxy.speed); } });
    } });
    // parallax facts card + CTA dot grid
    $$(".split .visual").forEach((v) => gsap.fromTo(v.firstElementChild, { y: 40 }, { y: -40, ease: "none", scrollTrigger: { trigger: v, start: "top bottom", end: "bottom top", scrub: true } }));
    $$(".cta-band .dots").forEach((dots) => {
      dots.innerHTML = "<i></i>".repeat(DOT_GRID[0] * DOT_GRID[1]);
      const els = $$("i", dots), grid = { grid: DOT_GRID, from: "center" };
      ScrollTrigger.create({ trigger: dots, start: "top 80%", once: true, onEnter() {
        gsap.fromTo(els, { scale: 0, opacity: 0 }, { scale: 1, opacity: 0.7, duration: 0.8, ease: "power2.out", stagger: Object.assign({ amount: 1.4 }, grid),
          onComplete: () => gsap.to(els, { opacity: 0.15, duration: 2.2, yoyo: true, repeat: -1, ease: "sine.inOut", stagger: Object.assign({ amount: 2.5 }, grid) }) });
      } });
    });
  }

  document.addEventListener("bw:ready", () => {
    particles($(".hero-canvas"));
    const feat = $("[data-featured]");
    feat.innerHTML = BW.products.filter((p) => p.featured).slice(0, 4).map((p) => BW.productCard(p, { suffix: "-home" })).join("");
    BW.bindAddButtons(feat);
    BW.enhance(feat);
    $("[data-count-products]").dataset.count = BW.products.length;   // "blends in stock" stat follows the catalog
    const names = [];
    BW.products.forEach((p) => p.ingredients.forEach((i) => { if (!names.includes(i[0])) names.push(i[0]); }));
    const html = names.map((n) => `<span>${BW.escapeHtml(n)}</span>`).join("");
    $("[data-marquee]").innerHTML = html + html;   // doubled so the -50% loop is seamless
    if (BW.motion) {
      gsap.set([".hero .eyebrow", ".hero .lead", ".hero-cta > *", ".trust-strip span", ".capsule-3d", ".orbit", ".float-card", ".scroll-cue"], { autoAlpha: 0 });
      document.addEventListener("bw:motion-ready", scenes);
    } else {
      $$("[data-count]").forEach((el) => { el.textContent = Number(el.dataset.count).toLocaleString() + (el.dataset.suffix || ""); });
    }
  });
})();
