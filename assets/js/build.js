/* Build-your-own: three-step builder (Format → Size → Ratios) with a 10%-step ratio slider.
   State lives in `draft` (persisted to localStorage) and the current step is mirrored in ?step=. */
(function () {
  var $ = BW.$, $$ = BW.$$, I = BW.icons, B = BW.builder, STEP = B.STEP, KEY = "bw_build_v1";
  var draft, step = 1, root;
  var sizeOf = function (id) { return B.capsuleSizes.find(function (s) { return s.id === id; }); };

  /* ---------- state ---------- */
  function load() {
    var d = JSON.parse(JSON.stringify(B.defaults));
    try { Object.assign(d, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
    d.ingredients = d.ingredients.filter(B.get).slice(0, B.MAX_INGREDIENTS); if (d.ingredients.length < B.MIN_INGREDIENTS) { d.ingredients = B.defaults.ingredients.slice(); d.pct = Object.assign({}, B.defaults.pct); }
    if (!sizeOf(d.capsuleSize)) d.capsuleSize = B.defaults.capsuleSize;
    if (B.capsuleCounts.indexOf(d.capsules) < 0) d.capsules = B.defaults.capsules;
    if (B.servingSizesG.indexOf(d.servingG) < 0) d.servingG = B.defaults.servingG;
    if (B.boxServings.indexOf(d.servings) < 0) d.servings = B.defaults.servings;
    if (d.format !== "capsule" && d.format !== "powder") d.format = null;
    normalise(d); return d;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(draft)); } catch (e) {} }
  function evenSplit(n) { var base = Math.floor(100 / n / STEP) * STEP, rem = (100 - base * n) / STEP; return Array.apply(null, Array(n)).map(function (_, i) { return base + (i < rem ? STEP : 0); }); }
  function normalise(d) {   // guarantee every ingredient has a pct in 10s and the total is exactly 100
    var sum = d.ingredients.reduce(function (s, id) { return s + (d.pct[id] || 0); }, 0);
    if (sum !== 100 || d.ingredients.some(function (id) { return !d.pct[id] || d.pct[id] % STEP; })) { var e = evenSplit(d.ingredients.length); d.pct = {}; d.ingredients.forEach(function (id, i) { d.pct[id] = e[i]; }); }
  }
  var isCap = function () { return draft.format === "capsule"; };
  var unitMg = function () { return isCap() ? sizeOf(draft.capsuleSize).capacityMg : draft.servingG * 1000; };
  var unitName = function () { return isCap() ? "capsule" : "scoop"; };
  var units = function () { return isCap() ? draft.capsules : draft.servings; };
  var fmt = function (n) { return Math.round(n).toLocaleString(); };
  function lines() { return draft.ingredients.map(function (id) { var ing = B.get(id), mg = unitMg() * draft.pct[id] / 100; return { ing: ing, pct: draft.pct[id], mg: mg, grams: mg * units() / 1000 }; }); }
  function price() {
    var base = isCap() ? B.pricing.capsuleBase[draft.capsules] : B.pricing.powderBase[draft.servings];
    var ingr = lines().reduce(function (s, l) { return s + l.grams * l.ing.costPerGram * B.pricing.MARKUP; }, 0);
    return Math.ceil(base + ingr) - 0.01;
  }
  function issues() { return lines().filter(function (l) { return l.ing.maxMgPerUnit && l.mg > l.ing.maxMgPerUnit; }).map(function (l) { return l.ing.short + " is capped at " + l.ing.maxMgPerUnit + " mg per " + unitName() + " (currently " + fmt(l.mg) + " mg). Lower its share" + (isCap() ? " or pick a smaller capsule." : " or a smaller scoop."); }); }
  function largest() { return draft.ingredients.reduce(function (a, id) { return draft.pct[id] > draft.pct[a] ? id : a; }); }
  function addIng(id) { if (draft.ingredients.indexOf(id) > -1 || draft.ingredients.length >= B.MAX_INGREDIENTS) return; draft.pct[largest()] -= STEP; draft.pct[id] = STEP; draft.ingredients.push(id); }
  function removeIng(id) { if (draft.ingredients.length <= B.MIN_INGREDIENTS) return; draft.ingredients = draft.ingredients.filter(function (x) { return x !== id; }); draft.pct[largest()] += draft.pct[id]; delete draft.pct[id]; }
  function setBoundary(h, b) {   // move the divider between segment h and h+1 to cumulative percent b
    var ids = draft.ingredients, before = 0; for (var i = 0; i < h; i++) before += draft.pct[ids[i]];
    var after = before + draft.pct[ids[h]] + draft.pct[ids[h + 1]];
    b = Math.round(b / STEP) * STEP; b = Math.max(before + STEP, Math.min(after - STEP, b));
    draft.pct[ids[h]] = b - before; draft.pct[ids[h + 1]] = after - b;
  }

  /* ---------- blend artwork (bands update in place so CSS can transition them) ---------- */
  function artSvg() {
    var caps = isCap();
    return caps
      ? '<svg viewBox="0 0 320 210" xmlns="http://www.w3.org/2000/svg" class="blend-art" aria-hidden="true"><defs><clipPath id="bc"><rect x="30" y="65" width="260" height="100" rx="50"/></clipPath><linearGradient id="bs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><g transform="rotate(-24 160 115)"><g clip-path="url(#bc)" data-bands></g><rect x="50" y="76" width="220" height="26" rx="13" fill="url(#bs)"/><rect x="30" y="65" width="260" height="100" rx="50" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/></g></svg>'
      : '<svg viewBox="0 0 220 270" xmlns="http://www.w3.org/2000/svg" class="blend-art" aria-hidden="true"><defs><clipPath id="bt"><rect x="44" y="78" width="132" height="168" rx="16"/></clipPath><linearGradient id="bl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A3556"/><stop offset="1" stop-color="#141C33"/></linearGradient></defs><rect x="28" y="26" width="164" height="44" rx="14" fill="url(#bl)"/><rect x="36" y="66" width="148" height="188" rx="22" fill="#1B2440"/><rect x="36" y="66" width="148" height="188" rx="22" fill="none" stroke="#fff" stroke-opacity=".18"/><g clip-path="url(#bt)" data-bands></g><rect x="48" y="80" width="18" height="156" rx="9" fill="#fff" opacity=".14"/></svg>';
  }
  function paintBands(host) {
    var g = $("[data-bands]", host), ls = lines(), caps = isCap();
    if (g.children.length !== ls.length) g.innerHTML = ls.map(function () { return "<rect/>"; }).join("");
    var pos = 0;
    ls.forEach(function (l, i) {
      var r = g.children[i];
      if (caps) { r.setAttribute("x", 30 + 260 * pos / 100); r.setAttribute("y", 65); r.setAttribute("width", 260 * l.pct / 100 + 0.5); r.setAttribute("height", 100); }
      else { var h = 168 * l.pct / 100; r.setAttribute("x", 44); r.setAttribute("y", 246 - 168 * (pos + l.pct) / 100); r.setAttribute("width", 132); r.setAttribute("height", h + 0.5); }
      r.setAttribute("fill", l.ing.color); pos += l.pct;
    });
  }

  /* ---------- step 1 & 2 markup ---------- */
  function optCard(key, val, title, note, active) { return '<button type="button" class="opt' + (active ? " is-active" : "") + '" data-opt="' + key + '" data-val="' + val + '"><b>' + title + "</b><span>" + note + "</span></button>"; }
  function renderStep1() {
    $("[data-step-view='1']").innerHTML = '<div class="section-head center"><div class="eyebrow">Step 1 of 3</div><h2>Pick a format</h2><p class="lead" style="margin-inline:auto">Capsules for precise, portable dosing. Powder for gram-scale scoops you mix into water.</p></div>' +
      '<div class="fmt-grid">' +
      '<button type="button" class="fmt' + (draft.format === "capsule" ? " is-active" : "") + '" data-format="capsule"><span class="fmt-ico">' + I.capsule + '</span><b>Capsules</b><span>Your blend filled into vegetarian capsules. Choose the capsule size and how many per bottle.</span><em>Best for focus, daily essentials, evening formulas</em></button>' +
      '<button type="button" class="fmt' + (draft.format === "powder" ? " is-active" : "") + '" data-format="powder"><span class="fmt-ico">' + I.powder + '</span><b>Powder</b><span>Your blend as a scoopable powder. Choose the scoop size and how many servings per box.</span><em>Best for creatine, citrulline, beta-alanine — gram-scale doses</em></button></div>' +
      '<div class="step-nav"><span></span><button type="button" class="btn btn-primary btn-lg" data-next' + (draft.format ? "" : " disabled") + '>Continue ' + I.arrow + "</button></div>";
  }
  function renderStep2() {
    var caps = isCap(), html = '<div class="section-head center"><div class="eyebrow">Step 2 of 3</div><h2>' + (caps ? "Capsule size &amp; count" : "Scoop size &amp; box size") + '</h2><p class="lead" style="margin-inline:auto">' + (caps ? "Bigger capsules hold more per capsule; more capsules last longer." : "The scoop sets how much blend you take per serving; the box sets how many servings you get.") + "</p></div>";
    if (caps) {
      html += '<h3 class="opt-title">Capsule size</h3><div class="opt-grid">' + B.capsuleSizes.map(function (s) { return optCard("capsuleSize", s.id, s.label + ' <small>&middot; ~' + fmt(s.capacityMg) + " mg</small>", s.note, draft.capsuleSize === s.id); }).join("") + "</div>" +
        '<h3 class="opt-title">Capsules per bottle</h3><div class="opt-grid four">' + B.capsuleCounts.map(function (n) { return optCard("capsules", n, n + " capsules", n === 30 ? "Trial bottle" : n === 60 ? "Most popular" : n === 90 ? "Three months of 1/day" : "Best value", draft.capsules === n); }).join("") + "</div>";
    } else {
      html += '<h3 class="opt-title">Scoop size</h3><div class="opt-grid">' + B.servingSizesG.map(function (g) { return optCard("servingG", g, g + " g scoop", g === 5 ? "Light serving" : g === 10 ? "Standard serving" : "Heavy serving", draft.servingG === g); }).join("") + "</div>" +
        '<h3 class="opt-title">Servings per box</h3><div class="opt-grid">' + B.boxServings.map(function (n) { return optCard("servings", n, n + " servings", n === 15 ? "Trial box" : n === 30 ? "One month" : "Two months", draft.servings === n); }).join("") + "</div>";
    }
    html += '<div class="size-summary" data-size-summary></div><div class="step-nav"><button type="button" class="btn btn-ghost" data-back>&larr; Back</button><button type="button" class="btn btn-primary btn-lg" data-next>Continue ' + I.arrow + "</button></div>";
    $("[data-step-view='2']").innerHTML = html; sizeSummary();
  }
  function sizeSummary() {
    var el = $("[data-size-summary]"); if (!el) return;
    el.innerHTML = isCap() ? "<b>" + draft.capsules + " &times; " + sizeOf(draft.capsuleSize).label + "</b> &middot; ~" + fmt(unitMg()) + " mg per capsule &middot; " + fmt(unitMg() * draft.capsules / 1000) + " g of blend per bottle"
                           : "<b>" + draft.servings + " &times; " + draft.servingG + " g scoops</b> &middot; " + fmt(draft.servingG * draft.servings) + " g of blend per box";
  }

  /* ---------- step 3: ingredients, ratio slider, legend, summary ---------- */
  function renderStep3() {
    var caps = isCap();
    $("[data-step-view='3']").innerHTML = '<div class="section-head center"><div class="eyebrow">Step 3 of 3</div><h2>Build your blend.</h2><p class="lead" style="margin-inline:auto">Set each ingredient in ' + STEP + '% steps. Every milligram stays visible.</p></div>' +
      '<div class="ratio-card"><div class="row between" style="align-items:flex-start;margin-bottom:1.5rem"><div><div class="eyebrow">Custom blend</div><h3 style="margin:0">Choose your ratios</h3></div><div class="total-badge"><span>Total</span><b class="num" data-total></b></div></div>' +
      '<div class="ing-pick"><div class="muted" style="font-size:.85rem;margin-bottom:.5rem">Ingredients (' + B.MIN_INGREDIENTS + "–" + B.MAX_INGREDIENTS + ')</div><div class="chips" data-chips></div></div>' +
      '<div class="ratio" data-ratio><div class="ratio-track" data-track></div><div class="ratio-handles" data-handles></div><div class="ratio-scale">' + Array.apply(null, Array(11)).map(function (_, i) { return "<span>" + i * STEP + "%</span>"; }).join("") + "</div></div>" +
      '<div class="legend" data-legend></div><div class="issues" data-issues></div>' +
      '<div class="row between" style="margin-top:1.5rem"><button type="button" class="btn btn-secondary" data-even>' + I.arrow.replace("<svg", '<svg style="transform:rotate(180deg)"') + ' Reset to even split</button><div class="row" style="gap:.75rem"><input class="input" data-name placeholder="Name your blend (optional)" maxlength="40" style="width:240px" value="' + BW.escapeHtml(draft.name || "") + '"><button type="button" class="btn btn-primary btn-lg" data-add-custom>Add to cart &middot; <span class="num" data-price></span></button></div></div></div>' +
      '<div class="blend-preview"><div class="blend-stage" data-art>' + artSvg() + '</div><div class="facts" data-facts></div></div>' +
      '<div class="step-nav"><button type="button" class="btn btn-ghost" data-back>&larr; Back</button><span></span></div>';
    renderChips(); buildSlider(); sync();
    $("[data-name]").addEventListener("input", function (e) { draft.name = e.target.value; save(); });
  }
  function renderChips() {
    $("[data-chips]").innerHTML = B.ingredients.map(function (ing) { var on = draft.ingredients.indexOf(ing.id) > -1; return '<button type="button" class="chip' + (on ? " is-active" : "") + '" data-ing="' + ing.id + '" title="' + ing.role + '"><i style="background:' + ing.color + '"></i>' + ing.short + "</button>"; }).join("");
  }

  function buildSlider() {   // segments + draggable dividers; geometry is (re)written by sync()
    var track = $("[data-track]"), handles = $("[data-handles]");
    track.innerHTML = draft.ingredients.map(function (id) { return '<div class="ratio-seg" data-seg="' + id + '"><b></b><span></span></div>'; }).join("");
    handles.innerHTML = draft.ingredients.slice(1).map(function (_, h) { return '<button type="button" class="ratio-handle" data-h="' + h + '" role="slider" tabindex="0"></button>'; }).join("");
    $$(".ratio-handle", handles).forEach(function (hd) {
      var h = Number(hd.dataset.h);
      hd.addEventListener("pointerdown", function (e) {
        e.preventDefault(); try { hd.setPointerCapture(e.pointerId); } catch (err) {} hd.classList.add("is-dragging"); var r = $("[data-track]").getBoundingClientRect();
        var move = function (ev) { setBoundary(h, (ev.clientX - r.left) / r.width * 100); sync(); };
        var up = function () { hd.classList.remove("is-dragging"); hd.removeEventListener("pointermove", move); hd.removeEventListener("pointerup", up); hd.removeEventListener("pointercancel", up); save(); };
        hd.addEventListener("pointermove", move); hd.addEventListener("pointerup", up); hd.addEventListener("pointercancel", up);
      });
      hd.addEventListener("keydown", function (e) {
        var d = e.key === "ArrowLeft" || e.key === "ArrowDown" ? -STEP : e.key === "ArrowRight" || e.key === "ArrowUp" ? STEP : 0; if (!d) return;
        e.preventDefault(); setBoundary(h, Number(hd.dataset.at) + d); sync(); save();
      });
    });
  }
  function sync() {   // push draft -> every step-3 element
    var ls = lines(), pos = 0, unit = unitName();
    ls.forEach(function (l, i) {
      var seg = $("[data-seg='" + l.ing.id + "']"); seg.style.width = l.pct + "%"; seg.style.background = l.ing.color; seg.classList.toggle("narrow", l.pct <= STEP);
      $("b", seg).textContent = l.ing.short; $("span", seg).textContent = fmt(l.mg) + " mg · " + l.pct + "%";
      pos += l.pct;
      var hd = $("[data-h='" + i + "']"); if (hd) { hd.style.left = pos + "%"; hd.dataset.at = pos; hd.setAttribute("aria-valuenow", pos); hd.setAttribute("aria-valuemin", 0); hd.setAttribute("aria-valuemax", 100); hd.setAttribute("aria-valuetext", l.ing.short + " " + l.pct + "% / " + ls[i + 1].ing.short + " " + ls[i + 1].pct + "%"); hd.setAttribute("aria-label", "Divider between " + l.ing.short + " and " + ls[i + 1].ing.short); }
    });
    $("[data-total]").textContent = fmt(unitMg()) + " mg · 100%";
    $("[data-legend]").innerHTML = ls.map(function (l) { return '<div class="legend-row"><i style="background:' + l.ing.color + '"></i><b>' + l.ing.name + '</b><span class="muted">' + l.ing.role + '</span><span class="num">' + fmt(l.mg) + " mg · " + l.pct + '%</span><button type="button" class="btn-icon" data-remove-ing="' + l.ing.id + '" aria-label="Remove ' + l.ing.short + '"' + (draft.ingredients.length <= B.MIN_INGREDIENTS ? " disabled" : "") + ">" + I.close + "</button></div>"; }).join("");
    var probs = issues(); $("[data-issues]").innerHTML = probs.map(function (p) { return '<div class="notice">' + p + "</div>"; }).join("");
    $("[data-add-custom]").disabled = !!probs.length; $("[data-price]").textContent = BW.formatPrice(price());
    $("[data-facts]").innerHTML = '<div class="head"><span>Your blend</span><span style="font-family:var(--font-body);font-weight:500;font-size:.85rem;color:var(--muted)">per ' + unit + "</span></div>" +
      '<div class="sub"><span>' + (isCap() ? draft.capsules + " × " + sizeOf(draft.capsuleSize).label : draft.servings + " × " + draft.servingG + " g scoops") + "</span><span>" + fmt(unitMg() * units() / 1000) + " g total</span></div><table><tbody>" +
      ls.map(function (l) { return "<tr><td><i class='sw' style='background:" + l.ing.color + "'></i>" + BW.escapeHtml(l.ing.name) + "</td><td>" + fmt(l.mg) + " mg</td></tr>"; }).join("") + '</tbody></table><div class="note">Per-' + unit + " amounts. Container total: " + ls.map(function (l) { return l.ing.short + " " + (l.grams >= 1 ? l.grams.toFixed(1) + " g" : fmt(l.grams * 1000) + " mg"); }).join(" · ") + ".</div>";
    paintBands($("[data-art]"));
    $$("[data-ing]").forEach(function (c) { c.classList.toggle("is-active", draft.ingredients.indexOf(c.dataset.ing) > -1); c.disabled = draft.ingredients.indexOf(c.dataset.ing) < 0 && draft.ingredients.length >= B.MAX_INGREDIENTS; });
  }
  function customProduct() {
    var ls = lines(), name = (draft.name || "").trim() || "Custom " + unitName() + " blend";
    var spec = { format: draft.format, capsuleSize: draft.capsuleSize, capsules: draft.capsules, servingG: draft.servingG, servings: draft.servings, ingredients: draft.ingredients.slice(), pct: Object.assign({}, draft.pct) };
    var id = "custom-" + [draft.format, isCap() ? draft.capsuleSize + "x" + draft.capsules : draft.servingG + "gx" + draft.servings].concat(draft.ingredients.map(function (i) { return i + draft.pct[i]; })).join("-");
    return { id: id, custom: spec, name: name, type: draft.format, badges: ["Custom"], goals: [], stimFree: !ls.some(function (l) { return l.ing.stimulant; }), price: price(),
      tagline: ls.map(function (l) { return l.ing.short + " " + l.pct + "%"; }).join(" · "), blurb: "Your custom blend.",
      servingSize: isCap() ? "1 capsule (" + sizeOf(draft.capsuleSize).label + ", ~" + fmt(unitMg()) + " mg)" : "1 scoop (" + draft.servingG + " g)", servings: units(),
      ingredients: ls.map(function (l) { return [l.ing.name, fmt(l.mg) + " mg"]; }), stock: 99, colors: [ls[0].ing.color, (ls[1] || ls[0]).ing.color] };
  }

  /* ---------- navigation ---------- */
  function go(n, push) {
    if (n > 1 && !draft.format) n = 1;
    var from = $("[data-step-view='" + step + "']"), to = $("[data-step-view='" + n + "']");
    if (n === 2) renderStep2(); if (n === 3) { normalise(draft); renderStep3(); }
    $$("[data-stepper] li").forEach(function (li, i) { li.classList.toggle("is-active", i + 1 === n); li.classList.toggle("is-done", i + 1 < n); });
    try { history[push !== false ? "pushState" : "replaceState"]({ step: n }, "", "?step=" + n); } catch (e) {}
    var show = function () { to.hidden = false; BW.fx("stepIn", to); BW.enhance(to); if (push !== false) window.scrollTo({ top: root.offsetTop - 90, behavior: "smooth" }); };
    if (from !== to && !from.hidden) { if (!BW.fx("stepOut", from, function () { from.hidden = true; show(); })) { from.hidden = true; show(); } } else show();
    step = n; save();
  }

  document.addEventListener("bw:ready", function () {
    root = $("[data-builder]"); if (!root) return;
    draft = load();
    $("[data-stepper]").innerHTML = ["Format", "Size", "Ratios"].map(function (t, i) { return "<li><i>" + (i + 1) + "</i>" + t + "</li>"; }).join("");
    renderStep1();
    root.addEventListener("click", function (e) {
      var t = e.target.closest("[data-format],[data-opt],[data-next],[data-back],[data-ing],[data-remove-ing],[data-even],[data-add-custom],[data-stepper] li"); if (!t) return;
      if (t.dataset.format) { draft.format = t.dataset.format; if (!draft.customised) { var pr = B.presets[draft.format]; draft.ingredients = pr.ingredients.slice(); draft.pct = Object.assign({}, pr.pct); } renderStep1(); save(); go(2); }
      else if (t.dataset.opt) { var k = t.dataset.opt; draft[k] = k === "capsuleSize" ? t.dataset.val : Number(t.dataset.val); $$("[data-opt='" + k + "']").forEach(function (b) { b.classList.toggle("is-active", b === t); }); sizeSummary(); save(); }
      else if (t.hasAttribute("data-next")) go(step + 1);
      else if (t.hasAttribute("data-back")) go(step - 1);
      else if (t.dataset.ing) { draft.customised = true; draft.ingredients.indexOf(t.dataset.ing) > -1 ? removeIng(t.dataset.ing) : addIng(t.dataset.ing); buildSlider(); sync(); save(); }
      else if (t.dataset.removeIng) { draft.customised = true; removeIng(t.dataset.removeIng); buildSlider(); sync(); save(); }
      else if (t.hasAttribute("data-even")) { var ev = evenSplit(draft.ingredients.length); draft.ingredients.forEach(function (id, i) { draft.pct[id] = ev[i]; }); sync(); save(); }
      else if (t.hasAttribute("data-add-custom")) { var p = customProduct(); BW.cart.addCustom(p, 1); BW.fx("flyToCart", t, $("[data-art] svg")); BW.toast(BW.escapeHtml(p.name) + " added to your cart.", { link: { href: "cart", label: "View cart" } }); setTimeout(BW.openCart, 600); }
      else if (t.closest("[data-stepper]")) { var n = Array.prototype.indexOf.call(t.parentNode.children, t) + 1; if (n === 1 || draft.format) go(n); }
    });
    window.addEventListener("popstate", function (e) { go((e.state && e.state.step) || Number(new URLSearchParams(location.search).get("step")) || 1, false); });
    go(Math.min(3, Number(new URLSearchParams(location.search).get("step")) || 1), false);
  });
})();
