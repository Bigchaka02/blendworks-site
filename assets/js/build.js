/* Build-your-own: three-step builder (Format → Size → Ratios) with a 10%-step ratio slider.
   State lives in `draft` (persisted to localStorage) and the current step is mirrored in ?step=.
   Data (ingredients, sizes, pricing, presets) comes from data/ingredients.js as BW.builder. */
(function () {
  const { $, $$ } = BW, I = BW.icons, B = BW.builder, STEP = B.STEP, KEY = "bw_build_v1";
  let draft, step = 1, root;
  const sizeOf = (id) => B.capsuleSizes.find((s) => s.id === id);

  /* ---------- state ---------- */
  function load() {
    const d = JSON.parse(JSON.stringify(B.defaults));
    try { Object.assign(d, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { /* corrupt draft: start fresh */ }
    d.ingredients = d.ingredients.filter(B.get).slice(0, B.MAX_INGREDIENTS);
    if (d.ingredients.length < B.MIN_INGREDIENTS) { d.ingredients = B.defaults.ingredients.slice(); d.pct = Object.assign({}, B.defaults.pct); }
    if (!sizeOf(d.capsuleSize)) d.capsuleSize = B.defaults.capsuleSize;
    if (!B.capsuleCounts.includes(d.capsules)) d.capsules = B.defaults.capsules;
    if (!B.servingSizesG.includes(d.servingG)) d.servingG = B.defaults.servingG;
    if (!B.boxServings.includes(d.servings)) d.servings = B.defaults.servings;
    if (d.format !== "capsule" && d.format !== "powder") d.format = null;
    normalise(d);
    return d;
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(draft)); } catch (e) { /* storage blocked */ } };
  function evenSplit(n) {
    const base = Math.floor(100 / n / STEP) * STEP, rem = (100 - base * n) / STEP;
    return Array.from({ length: n }, (_, i) => base + (i < rem ? STEP : 0));
  }
  function normalise(d) {   // guarantee every ingredient has a pct in 10s and the total is exactly 100
    const sum = d.ingredients.reduce((s, id) => s + (d.pct[id] || 0), 0);
    if (sum !== 100 || d.ingredients.some((id) => !d.pct[id] || d.pct[id] % STEP)) {
      const e = evenSplit(d.ingredients.length);
      d.pct = {};
      d.ingredients.forEach((id, i) => { d.pct[id] = e[i]; });
    }
  }
  const isCap = () => draft.format === "capsule";
  const unitMg = () => (isCap() ? sizeOf(draft.capsuleSize).capacityMg : draft.servingG * 1000);
  const unitName = () => (isCap() ? "capsule" : "scoop");
  const units = () => (isCap() ? draft.capsules : draft.servings);
  const fmt = (n) => Math.round(n).toLocaleString();
  const lines = () => draft.ingredients.map((id) => {
    const ing = B.get(id), mg = unitMg() * draft.pct[id] / 100;
    return { ing, pct: draft.pct[id], mg, grams: mg * units() / 1000 };
  });
  function price() {   // PLACEHOLDER formula: base by size + grams × wholesale cost × markup, rounded up to .99
    const base = isCap() ? B.pricing.capsuleBase[draft.capsules] : B.pricing.powderBase[draft.servings];
    const ingr = lines().reduce((s, l) => s + l.grams * l.ing.costPerGram * B.pricing.MARKUP, 0);
    return Math.ceil(base + ingr) - 0.01;
  }
  const issues = () => lines()
    .filter((l) => l.ing.maxMgPerUnit && l.mg > l.ing.maxMgPerUnit)
    .map((l) => `${l.ing.short} is capped at ${l.ing.maxMgPerUnit} mg per ${unitName()} (currently ${fmt(l.mg)} mg). Lower its share${isCap() ? " or pick a smaller capsule." : " or a smaller scoop."}`);
  const largest = () => draft.ingredients.reduce((a, id) => (draft.pct[id] > draft.pct[a] ? id : a));
  function addIng(id) {
    if (draft.ingredients.includes(id) || draft.ingredients.length >= B.MAX_INGREDIENTS) return;
    draft.pct[largest()] -= STEP;
    draft.pct[id] = STEP;
    draft.ingredients.push(id);
  }
  function removeIng(id) {
    if (draft.ingredients.length <= B.MIN_INGREDIENTS) return;
    draft.ingredients = draft.ingredients.filter((x) => x !== id);
    draft.pct[largest()] += draft.pct[id];
    delete draft.pct[id];
  }
  function setBoundary(h, b) {   // move the divider between segment h and h+1 to cumulative percent b
    const ids = draft.ingredients;
    let before = 0;
    for (let i = 0; i < h; i++) before += draft.pct[ids[i]];
    const after = before + draft.pct[ids[h]] + draft.pct[ids[h + 1]];
    b = Math.round(b / STEP) * STEP;
    b = Math.max(before + STEP, Math.min(after - STEP, b));
    draft.pct[ids[h]] = b - before;
    draft.pct[ids[h + 1]] = after - b;
  }

  /* ---------- blend artwork (bands update in place so CSS can transition them) ---------- */
  const artSvg = () => (isCap()
    ? `<svg viewBox="0 0 320 210" xmlns="http://www.w3.org/2000/svg" class="blend-art" aria-hidden="true">
        <defs><clipPath id="bc"><rect x="30" y="65" width="260" height="100" rx="50"/></clipPath><linearGradient id="bs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
        <g transform="rotate(-24 160 115)"><g clip-path="url(#bc)" data-bands></g><rect x="50" y="76" width="220" height="26" rx="13" fill="url(#bs)"/><rect x="30" y="65" width="260" height="100" rx="50" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/></g>
      </svg>`
    : `<svg viewBox="0 0 220 270" xmlns="http://www.w3.org/2000/svg" class="blend-art" aria-hidden="true">
        <defs><clipPath id="bt"><rect x="44" y="78" width="132" height="168" rx="16"/></clipPath><linearGradient id="bl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A3556"/><stop offset="1" stop-color="#141C33"/></linearGradient></defs>
        <rect x="28" y="26" width="164" height="44" rx="14" fill="url(#bl)"/><rect x="36" y="66" width="148" height="188" rx="22" fill="#1B2440"/><rect x="36" y="66" width="148" height="188" rx="22" fill="none" stroke="#fff" stroke-opacity=".18"/>
        <g clip-path="url(#bt)" data-bands></g><rect x="48" y="80" width="18" height="156" rx="9" fill="#fff" opacity=".14"/>
      </svg>`);
  function paintBands(host) {
    const g = $("[data-bands]", host), ls = lines(), caps = isCap();
    if (g.children.length !== ls.length) g.innerHTML = ls.map(() => "<rect/>").join("");
    let pos = 0;
    ls.forEach((l, i) => {
      const r = g.children[i];
      if (caps) { r.setAttribute("x", 30 + 260 * pos / 100); r.setAttribute("y", 65); r.setAttribute("width", 260 * l.pct / 100 + 0.5); r.setAttribute("height", 100); }
      else { const h = 168 * l.pct / 100; r.setAttribute("x", 44); r.setAttribute("y", 246 - 168 * (pos + l.pct) / 100); r.setAttribute("width", 132); r.setAttribute("height", h + 0.5); }
      r.setAttribute("fill", l.ing.color);
      pos += l.pct;
    });
  }

  /* ---------- step 1 & 2 markup ---------- */
  const stepHead = (n, title, lead) => `<div class="section-head center"><div class="eyebrow">Step ${n} of 3</div><h2>${title}</h2><p class="lead mx-auto">${lead}</p></div>`;
  const optCard = (key, val, title, note, active) =>
    `<button type="button" class="opt${active ? " is-active" : ""}" data-opt="${key}" data-val="${val}" aria-pressed="${active}"><b>${title}</b><span>${note}</span></button>`;
  function renderStep1() {
    const fmtCard = (id, title, text, best) =>
      `<button type="button" class="fmt${draft.format === id ? " is-active" : ""}" data-format="${id}" aria-pressed="${draft.format === id}"><span class="fmt-ico">${I[id]}</span><b>${title}</b><span>${text}</span><em>${best}</em></button>`;
    $("[data-step-view='1']").innerHTML = stepHead(1, "Pick a format", "Capsules for precise, portable dosing. Powder for gram-scale scoops you mix into water.") +
      `<div class="fmt-grid">
        ${fmtCard("capsule", "Capsules", "Your blend filled into vegetarian capsules. Choose the capsule size and how many per bottle.", "Best for focus, daily essentials, evening formulas")}
        ${fmtCard("powder", "Powder", "Your blend as a scoopable powder. Choose the scoop size and how many servings per box.", "Best for creatine, citrulline, beta-alanine — gram-scale doses")}
      </div>
      <div class="step-nav"><span></span><button type="button" class="btn btn-primary btn-lg" data-next${draft.format ? "" : " disabled"}>Continue ${I.arrow}</button></div>`;
  }
  const COUNT_NOTE = { 30: "Trial bottle", 60: "Most popular", 90: "Three months of 1/day", 120: "Best value" };
  const SCOOP_NOTE = { 5: "Light serving", 10: "Standard serving", 15: "Heavy serving" };
  const BOX_NOTE = { 15: "Trial box", 30: "One month", 60: "Two months" };
  function renderStep2() {
    const caps = isCap();
    let html = stepHead(2, caps ? "Capsule size &amp; count" : "Scoop size &amp; box size",
      caps ? "Bigger capsules hold more per capsule; more capsules last longer." : "The scoop sets how much blend you take per serving; the box sets how many servings you get.");
    if (caps) {
      html += `<h3 class="opt-title">Capsule size</h3><div class="opt-grid">${B.capsuleSizes.map((s) => optCard("capsuleSize", s.id, `${s.label} <small>&middot; ~${fmt(s.capacityMg)} mg</small>`, s.note, draft.capsuleSize === s.id)).join("")}</div>
        <h3 class="opt-title">Capsules per bottle</h3><div class="opt-grid four">${B.capsuleCounts.map((n) => optCard("capsules", n, `${n} capsules`, COUNT_NOTE[n] || "", draft.capsules === n)).join("")}</div>`;
    } else {
      html += `<h3 class="opt-title">Scoop size</h3><div class="opt-grid">${B.servingSizesG.map((g) => optCard("servingG", g, `${g} g scoop`, SCOOP_NOTE[g] || "", draft.servingG === g)).join("")}</div>
        <h3 class="opt-title">Servings per box</h3><div class="opt-grid">${B.boxServings.map((n) => optCard("servings", n, `${n} servings`, BOX_NOTE[n] || "", draft.servings === n)).join("")}</div>`;
    }
    html += `<div class="size-summary" data-size-summary></div>
      <div class="step-nav"><button type="button" class="btn btn-ghost" data-back>${I.arrowLeft} Back</button><button type="button" class="btn btn-primary btn-lg" data-next>Continue ${I.arrow}</button></div>`;
    $("[data-step-view='2']").innerHTML = html;
    sizeSummary();
  }
  function sizeSummary() {
    const el = $("[data-size-summary]");
    if (!el) return;
    el.innerHTML = isCap()
      ? `<b>${draft.capsules} &times; ${sizeOf(draft.capsuleSize).label}</b> &middot; ~${fmt(unitMg())} mg per capsule &middot; ${fmt(unitMg() * draft.capsules / 1000)} g of blend per bottle`
      : `<b>${draft.servings} &times; ${draft.servingG} g scoops</b> &middot; ${fmt(draft.servingG * draft.servings)} g of blend per box`;
  }

  /* ---------- step 3: ingredients, ratio slider, legend, summary ---------- */
  function renderStep3() {
    $("[data-step-view='3']").innerHTML = stepHead(3, "Build your blend.", `Set each ingredient in ${STEP}% steps. Every milligram stays visible.`) +
      `<div class="ratio-card">
        <div class="row between ratio-head"><div><div class="eyebrow">Custom blend</div><h3 class="m-0">Choose your ratios</h3></div><div class="total-badge"><span>Total</span><b class="num" data-total></b></div></div>
        <div class="ing-pick"><div class="label">Ingredients (${B.MIN_INGREDIENTS}–${B.MAX_INGREDIENTS})</div><div class="chips" data-chips></div></div>
        <div class="ratio" data-ratio>
          <div class="ratio-track" data-track></div>
          <div class="ratio-handles" data-handles></div>
          <div class="ratio-scale">${Array.from({ length: 11 }, (_, i) => `<span>${i * STEP}%</span>`).join("")}</div>
        </div>
        <div class="legend" data-legend></div>
        <div class="issues" data-issues></div>
        <div class="row between ratio-actions">
          <div class="row gap-sm"><button type="button" class="btn btn-secondary" data-even>${I.arrowLeft} Reset to even split</button><button type="button" class="btn btn-secondary" data-save-blend>${I.save} Save to my account</button></div>
          <div class="row"><input class="input name-input" data-name placeholder="Name your blend (optional)" maxlength="40" value="${BW.escapeHtml(draft.name || "")}"><button type="button" class="btn btn-primary btn-lg" data-add-custom>Add to cart &middot; <span class="num" data-price></span></button></div>
        </div>
      </div>
      <div class="blend-preview"><div class="blend-stage" data-art>${artSvg()}</div><div class="facts" data-facts></div></div>
      <div class="step-nav"><button type="button" class="btn btn-ghost" data-back>${I.arrowLeft} Back</button><span></span></div>`;
    renderChips();
    buildSlider();
    sync();
    $("[data-name]").addEventListener("input", (e) => { draft.name = e.target.value; save(); });
  }
  function renderChips() {
    $("[data-chips]").innerHTML = B.ingredients.map((ing) => {
      const on = draft.ingredients.includes(ing.id);
      return `<button type="button" class="chip${on ? " is-active" : ""}" data-ing="${ing.id}" aria-pressed="${on}" title="${ing.role}"><i style="background:${ing.color}"></i>${ing.short}</button>`;
    }).join("");
  }

  function buildSlider() {   // segments + draggable dividers; geometry is (re)written by sync()
    const track = $("[data-track]"), handles = $("[data-handles]");
    track.innerHTML = draft.ingredients.map((id) => `<div class="ratio-seg" data-seg="${id}"><b></b><span></span></div>`).join("");
    handles.innerHTML = draft.ingredients.slice(1).map((_, h) =>
      `<button type="button" class="ratio-handle" data-h="${h}" role="slider" aria-orientation="horizontal" aria-valuemin="0" aria-valuemax="100" tabindex="0"></button>`).join("");
    $$(".ratio-handle", handles).forEach((hd) => {
      const h = Number(hd.dataset.h);
      hd.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        try { hd.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
        hd.classList.add("is-dragging");
        const r = track.getBoundingClientRect();
        const move = (ev) => { setBoundary(h, (ev.clientX - r.left) / r.width * 100); sync(); };
        const up = () => {
          hd.classList.remove("is-dragging");
          hd.removeEventListener("pointermove", move); hd.removeEventListener("pointerup", up); hd.removeEventListener("pointercancel", up);
          save();
        };
        hd.addEventListener("pointermove", move); hd.addEventListener("pointerup", up); hd.addEventListener("pointercancel", up);
      });
      hd.addEventListener("keydown", (e) => {
        const d = e.key === "ArrowLeft" || e.key === "ArrowDown" ? -STEP : e.key === "ArrowRight" || e.key === "ArrowUp" ? STEP : 0;
        if (!d) return;
        e.preventDefault();
        setBoundary(h, Number(hd.dataset.at) + d);
        sync();
        save();
      });
    });
  }
  function sync() {   // push draft -> every step-3 element
    const ls = lines(), unit = unitName();
    let pos = 0;
    ls.forEach((l, i) => {
      const seg = $(`[data-seg='${l.ing.id}']`);
      seg.style.width = `${l.pct}%`;
      seg.style.background = l.ing.color;
      seg.classList.toggle("narrow", l.pct <= STEP);
      $("b", seg).textContent = l.ing.short;
      $("span", seg).textContent = `${fmt(l.mg)} mg · ${l.pct}%`;
      pos += l.pct;
      const hd = $(`[data-h='${i}']`);
      if (hd) {
        const next = ls[i + 1];
        hd.style.left = `${pos}%`;
        hd.dataset.at = pos;
        hd.setAttribute("aria-valuenow", pos);
        hd.setAttribute("aria-valuetext", `${l.ing.short} ${l.pct}% / ${next.ing.short} ${next.pct}%`);
        hd.setAttribute("aria-label", `Divider between ${l.ing.short} and ${next.ing.short}`);
      }
    });
    $("[data-total]").textContent = `${fmt(unitMg())} mg · 100%`;
    $("[data-legend]").innerHTML = ls.map((l) =>
      `<div class="legend-row"><i style="background:${l.ing.color}"></i><b>${l.ing.name}</b><span class="muted">${l.ing.role}</span><span class="num">${fmt(l.mg)} mg · ${l.pct}%</span><button type="button" class="btn-icon" data-remove-ing="${l.ing.id}" aria-label="Remove ${l.ing.short}"${draft.ingredients.length <= B.MIN_INGREDIENTS ? " disabled" : ""}>${I.close}</button></div>`).join("");
    const probs = issues();
    $("[data-issues]").innerHTML = probs.map((p) => `<div class="notice">${p}</div>`).join("");
    $("[data-add-custom]").disabled = !!probs.length;
    $("[data-price]").textContent = BW.formatPrice(price());
    $("[data-facts]").innerHTML = `<div class="head"><span>Your blend</span><small>per ${unit}</small></div>
      <div class="sub"><span>${isCap() ? `${draft.capsules} × ${sizeOf(draft.capsuleSize).label}` : `${draft.servings} × ${draft.servingG} g scoops`}</span><span>${fmt(unitMg() * units() / 1000)} g total</span></div>
      <table><tbody>${ls.map((l) => `<tr><td><i class="sw" style="background:${l.ing.color}"></i>${BW.escapeHtml(l.ing.name)}</td><td>${fmt(l.mg)} mg</td></tr>`).join("")}</tbody></table>
      <div class="note">Per-${unit} amounts. Container total: ${ls.map((l) => `${l.ing.short} ${l.grams >= 1 ? `${l.grams.toFixed(1)} g` : `${fmt(l.grams * 1000)} mg`}`).join(" · ")}.</div>`;
    paintBands($("[data-art]"));
    $$("[data-ing]").forEach((c) => {
      const on = draft.ingredients.includes(c.dataset.ing);
      c.classList.toggle("is-active", on);
      c.setAttribute("aria-pressed", String(on));
      c.disabled = !on && draft.ingredients.length >= B.MAX_INGREDIENTS;
    });
  }
  function customProduct() {   // a cart-ready product object; the id encodes the recipe so identical blends merge
    const ls = lines(), name = (draft.name || "").trim() || `Custom ${unitName()} blend`;
    const spec = { format: draft.format, capsuleSize: draft.capsuleSize, capsules: draft.capsules, servingG: draft.servingG, servings: draft.servings, ingredients: draft.ingredients.slice(), pct: Object.assign({}, draft.pct) };
    const id = ["custom", draft.format, isCap() ? `${draft.capsuleSize}x${draft.capsules}` : `${draft.servingG}gx${draft.servings}`].concat(draft.ingredients.map((i) => i + draft.pct[i])).join("-");
    return { id, custom: spec, name, type: draft.format, badges: ["Custom"], goals: [], stimFree: !ls.some((l) => l.ing.stimulant), price: price(),
      tagline: ls.map((l) => `${l.ing.short} ${l.pct}%`).join(" · "), blurb: "Your custom blend.",
      servingSize: isCap() ? `1 capsule (${sizeOf(draft.capsuleSize).label}, ~${fmt(unitMg())} mg)` : `1 scoop (${draft.servingG} g)`, servings: units(),
      ingredients: ls.map((l) => [l.ing.name, `${fmt(l.mg)} mg`]), stock: 99, colors: [ls[0].ing.color, (ls[1] || ls[0]).ing.color] };
  }

  async function saveToAccount(btn) {   // POST the recipe to the account API (auth.js); signed-out users go to /login and come back
    if (!BW.auth || !BW.auth.signedIn()) return BW.toast("Sign in to keep your blends in your account.", { link: { href: BW.auth ? BW.auth.loginUrl("/build?step=3") : "/login", label: "Sign in" } });
    if (issues().length) return BW.toast("Fix the highlighted dose issue before saving.");
    const p = customProduct();
    btn.disabled = true;
    try {
      await BW.auth.saveBlend(p.name, p.custom);
      BW.toast(`${p.name} saved to your account.`, { link: { href: "/account", label: "View" } });
    } catch (err) { BW.toast(err.message); }
    btn.disabled = false;
  }

  /* ---------- navigation ---------- */
  function go(n, push) {
    if (n > 1 && !draft.format) n = 1;
    const from = $(`[data-step-view='${step}']`), to = $(`[data-step-view='${n}']`);
    if (n === 2) renderStep2();
    if (n === 3) { normalise(draft); renderStep3(); }
    $$("[data-stepper] li").forEach((li, i) => { li.classList.toggle("is-active", i + 1 === n); li.classList.toggle("is-done", i + 1 < n); li.setAttribute("aria-current", i + 1 === n ? "step" : "false"); });
    try { history[push !== false ? "pushState" : "replaceState"]({ step: n }, "", `?step=${n}`); } catch (e) { /* file:// */ }
    const show = () => {
      to.hidden = false;
      BW.fx("stepIn", to);
      BW.enhance(to);
      if (push !== false && !BW.fx("scrollTo", root, -BW.headerOffset())) window.scrollTo({ top: root.offsetTop - BW.headerOffset(), behavior: "smooth" });
    };
    if (from !== to && !from.hidden) {
      if (!BW.fx("stepOut", from, () => { from.hidden = true; show(); })) { from.hidden = true; show(); }
    } else show();
    step = n;
    save();
  }

  document.addEventListener("bw:ready", () => {
    root = $("[data-builder]");
    if (!root) return;
    draft = load();
    $("[data-stepper]").innerHTML = ["Format", "Size", "Ratios"].map((t, i) => `<li><i>${i + 1}</i>${t}</li>`).join("");
    renderStep1();
    root.addEventListener("click", (e) => {
      const t = e.target.closest("[data-format],[data-opt],[data-next],[data-back],[data-ing],[data-remove-ing],[data-even],[data-add-custom],[data-save-blend],[data-stepper] li");
      if (!t) return;
      if (t.dataset.format) {
        draft.format = t.dataset.format;
        if (!draft.customised) { const pr = B.presets[draft.format]; draft.ingredients = pr.ingredients.slice(); draft.pct = Object.assign({}, pr.pct); }
        renderStep1(); save(); go(2);
      } else if (t.dataset.opt) {
        const k = t.dataset.opt;
        draft[k] = k === "capsuleSize" ? t.dataset.val : Number(t.dataset.val);
        $$(`[data-opt='${k}']`).forEach((b) => { b.classList.toggle("is-active", b === t); b.setAttribute("aria-pressed", String(b === t)); });
        sizeSummary(); save();
      } else if (t.hasAttribute("data-next")) go(step + 1);
      else if (t.hasAttribute("data-back")) go(step - 1);
      else if (t.dataset.ing) {
        draft.customised = true;
        if (draft.ingredients.includes(t.dataset.ing)) removeIng(t.dataset.ing); else addIng(t.dataset.ing);
        buildSlider(); sync(); save();
      } else if (t.dataset.removeIng) { draft.customised = true; removeIng(t.dataset.removeIng); buildSlider(); sync(); save(); }
      else if (t.hasAttribute("data-even")) { const ev = evenSplit(draft.ingredients.length); draft.ingredients.forEach((id, i) => { draft.pct[id] = ev[i]; }); sync(); save(); }
      else if (t.hasAttribute("data-save-blend")) saveToAccount(t);
      else if (t.hasAttribute("data-add-custom")) {
        const p = customProduct();
        BW.cart.addCustom(p, 1);
        BW.fx("flyToCart", t, $("[data-art] svg"));
        BW.toast(`${p.name} added to your cart.`, { link: { href: "/cart", label: "View cart", onClick: (ev) => { ev.preventDefault(); BW.openCart(); } } });
        setTimeout(BW.openCart, 600);
      } else if (t.closest("[data-stepper]")) {
        const n = Array.prototype.indexOf.call(t.parentNode.children, t) + 1;
        if (n === 1 || draft.format) go(n);
      }
    });
    window.addEventListener("popstate", (e) => go((e.state && e.state.step) || Number(new URLSearchParams(location.search).get("step")) || 1, false));
    go(Math.min(3, Number(new URLSearchParams(location.search).get("step")) || 1), false);
  });
})();
