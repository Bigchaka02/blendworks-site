/* Product page: renders ?id=<slug|id>, quantity, add to cart, facts, related blends, sticky mobile buy bar.
   Page-level choreography uses GSAP directly behind the BW.motion guard (see decision D16). */
(function () {
  const { $, $$ } = BW, I = BW.icons;
  document.addEventListener("bw:ready", () => {
    const root = $("[data-product]");
    if (!root) return;
    const p = BW.getProduct(new URLSearchParams(location.search).get("id") || "");
    if (!p) {
      document.title = "Blend not found — BlendWorks";
      $(".related").hidden = true;
      root.innerHTML = `<div class="empty-state">${I.bag}<h1>Blend not found</h1><p>That product may have been renamed or removed.</p><a class="btn btn-primary" href="/shop">Back to the shop</a></div>`;
      return;
    }
    document.title = `${p.name} — BlendWorks`;
    const isCap = p.type === "capsule", unit = isCap ? "bottle" : "tub";
    const how = isCap
      ? `Take ${BW.escapeHtml(p.servingSize)} with water${p.stimFree ? ", any time of day." : " in the morning or before training. Contains caffeine — avoid within 6 hours of sleep."}`
      : `Mix ${BW.escapeHtml(p.servingSize)} into 300–500 ml of water${p.stimFree ? ". Stimulant-free — suitable for evening sessions." : " 20 minutes before training. Contains caffeine."}`;
    root.innerHTML = `<div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/shop">Shop</a><span>/</span><a href="/shop?type=${p.type}">${BW.typeLabel(p)}s</a><span>/</span><span>${BW.escapeHtml(p.name)}</span></div>
      <div class="product-layout">
        <div class="product-stage" style="--c1:${p.colors[0]}" data-stage>${BW.art.product(p, { suffix: "-detail" })}</div>
        <div class="product-info">
          <div class="row badge-row">${BW.badges(p)}<span class="badge neutral">${isCap ? I.capsule : I.powder} ${BW.typeLabel(p)}</span></div>
          <h1>${BW.escapeHtml(p.name)}</h1>
          <p class="lead">${BW.escapeHtml(p.tagline)}</p>
          <div class="price-row"><span class="price num">${BW.formatPrice(p.price)}</span><span class="muted">per ${unit} &middot; ${p.servings} servings</span></div>
          <div class="row stock-row">${BW.stock(p, true)}<span class="muted small">Serving: ${BW.escapeHtml(p.servingSize)}${p.flavor ? ` &middot; ${BW.escapeHtml(p.flavor)}` : ""}</span></div>
          <div class="buy-row">${BW.qtyControl(p.id, 1)}<button class="btn btn-primary btn-lg add-btn" data-add="${p.id}"${p.stock === 0 ? " disabled" : ""}>${I.cart} Add to cart</button></div>
          <p class="muted">${BW.escapeHtml(p.blurb)}</p>
          <div class="facts">
            <div class="head"><span>Supplement Facts</span><small>preliminary</small></div>
            <div class="sub"><span>Serving size ${BW.escapeHtml(p.servingSize)}</span><span>${p.servings} servings per container</span></div>
            <table><tbody>${p.ingredients.map((i) => `<tr><td>${BW.escapeHtml(i[0])}</td><td>${BW.escapeHtml(i[1])}</td></tr>`).join("")}</tbody></table>
            <div class="note">Amounts per serving. Final label content, %DV and "other ingredients" will be confirmed when formulas are locked.</div>
          </div>
          <div class="accordion">
            <details open><summary>How to take it</summary><div class="content">${how}</div></details>
            <details><summary>Quality &amp; testing</summary><div class="content">Made in small batches. Every ingredient lot is identity-tested and every bottle carries a lot number linked to its certificates of analysis. Details will be published with the first production lots.</div></details>
            <details><summary>Shipping &amp; returns</summary><div class="content">Shipping rates, delivery windows and the return policy will be confirmed before launch.</div></details>
          </div>
          <p class="disclaimer">These statements have not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease. Adults 18+.</p>
        </div>
      </div>`;
    BW.bindQty(root);
    const btn = $("[data-add]", root), stage = $("[data-stage]", root), svg = $("svg", stage);
    btn.addEventListener("click", () => {
      BW.addToCart(btn, p.id, Number($("[data-qty] input", root).value) || 1);
      setTimeout(BW.openCart, 500);
    });

    // sticky buy bar (mobile) mirrors the main button
    const bar = document.body.appendChild(Object.assign(document.createElement("div"), { className: "buy-bar",
      innerHTML: `<div><b class="num">${BW.formatPrice(p.price)}</b><div class="muted">${BW.escapeHtml(p.name)}</div></div><button class="btn btn-primary">${I.cart} Add to cart</button>` }));
    $("button", bar).addEventListener("click", () => btn.click());
    let shown = false;
    new IntersectionObserver((en) => {
      const v = !en[0].isIntersecting && en[0].boundingClientRect.top < 0;
      if (v === shown) return;
      shown = v;
      if (BW.motion) gsap.to(bar, { y: v ? 0 : "110%", duration: 0.5, ease: v ? "expo.out" : "expo.in" });
      else bar.style.transform = v ? "none" : "";
    }).observe($(".buy-row", root));

    // related blends: same format or a shared goal
    const rel = $("[data-related]");
    rel.innerHTML = BW.products
      .filter((o) => o.id !== p.id && (o.type === p.type || o.goals.some((g) => p.goals.includes(g))))
      .slice(0, 3).map((o) => BW.productCard(o, { suffix: "-rel" })).join("");
    BW.bindAddButtons(rel);
    BW.enhance(rel);

    if (!BW.motion) return;
    BW.fx("tilt", stage, svg);   // same subtle tilt + glare as the cards (D14)
    gsap.set([stage, ".product-info > *"], { autoAlpha: 0 });
    document.addEventListener("bw:motion-ready", () => {   // entrance choreography once the curtain lifts
      gsap.timeline().to(stage, { autoAlpha: 1, duration: 0.6 }, 0)
        .from(svg, { scale: 0.55, rotation: -14, y: 60, duration: 1.5, clearProps: "transform" }, 0)
        .to(".product-info > *", { autoAlpha: 1, duration: 0.9, stagger: 0.07 }, 0.2)
        .from(".product-info > *", { y: 26, duration: 0.9, stagger: 0.07, clearProps: "transform" }, 0.2);
      gsap.from(".facts tr", { x: -14, autoAlpha: 0, duration: 0.6, stagger: 0.06, scrollTrigger: { trigger: ".facts", start: "top 85%", once: true } });
      gsap.to(svg, { y: -10, duration: 3.2, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 1.6 });
    });
  });
})();
