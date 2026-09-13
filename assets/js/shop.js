/* Shop page: search, filters, sort, animated grid. URL params: q, type, goal, stim, sort.
   Product cards and the add-to-cart flow are shared helpers in site.js (BW.productCard, BW.bindAddButtons). */
(function () {
  const { $, $$ } = BW;
  const DEFAULT = { q: "", type: "all", goals: [], stimFree: false, sort: "featured" };
  const sorters = {
    featured: (a, b) => (b.featured - a.featured) || a.name.localeCompare(b.name),
    "price-asc": (a, b) => a.price - b.price,
    "price-desc": (a, b) => b.price - a.price,
    name: (a, b) => a.name.localeCompare(b.name)
  };

  document.addEventListener("bw:ready", () => {
    const grid = $("[data-grid]");
    if (!grid) return;
    let state = Object.assign({}, DEFAULT);
    const u = new URLSearchParams(location.search);
    state.q = u.get("q") || "";
    state.type = u.get("type") || "all";
    state.goals = (u.get("goal") || "").split(",").filter((g) => BW.goals.includes(g));
    state.stimFree = u.get("stim") === "free";
    state.sort = sorters[u.get("sort")] ? u.get("sort") : "featured";

    const filtered = () => {
      const list = (state.q ? BW.searchProducts(state.q) : BW.products.slice()).filter((p) =>
        (state.type === "all" || p.type === state.type) && (!state.stimFree || p.stimFree) && state.goals.every((g) => p.goals.includes(g)));
      if (!state.q || state.sort !== "featured") list.sort(sorters[state.sort]);   // a search is already ranked by relevance
      return list;
    };
    const setPressed = (btn, on) => { btn.classList.toggle("is-active", on); btn.setAttribute("aria-pressed", String(on)); };
    function update() {
      const p = new URLSearchParams();
      if (state.q) p.set("q", state.q);
      if (state.type !== "all") p.set("type", state.type);
      if (state.goals.length) p.set("goal", state.goals.join(","));
      if (state.stimFree) p.set("stim", "free");
      if (state.sort !== "featured") p.set("sort", state.sort);
      try { history.replaceState(null, "", location.pathname + (p.toString() ? `?${p}` : "")); } catch (e) { /* file:// blocks replaceState */ }
      $("[data-search]").value = state.q;
      $("[data-clear-search]").hidden = !state.q;
      $("[data-sort]").value = state.sort;
      $$("[data-type]").forEach((b) => setPressed(b, b.dataset.type === state.type));
      $$("[data-goal]").forEach((b) => setPressed(b, state.goals.includes(b.dataset.goal)));
      setPressed($("[data-stim]"), state.stimFree);
      const list = filtered();
      $("[data-count]").textContent = `${list.length} ${list.length === 1 ? "blend" : "blends"}${state.q ? ` for "${state.q}"` : ""}`;
      $("[data-empty]").hidden = !!list.length;
      const draw = () => {
        grid.innerHTML = list.map((p) => BW.productCard(p, { q: state.q })).join("");
        BW.bindAddButtons(grid);
        BW.enhance(grid);
      };
      if (!grid.children.length || !BW.fx("flipGrid", grid, draw)) draw();
    }

    $("[data-goals]").innerHTML = BW.goals.map((g) => `<button class="chip" data-goal="${g}" aria-pressed="false">${g}</button>`).join("");
    const search = $("[data-search]");
    let timer;
    search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { state.q = search.value; update(); }, 120); });
    search.addEventListener("keydown", (e) => { if (e.key === "Escape") { state.q = ""; update(); } });
    $("[data-clear-search]").addEventListener("click", () => { state.q = ""; update(); search.focus(); });
    $$("[data-type]").forEach((b) => b.addEventListener("click", () => { state.type = b.dataset.type; update(); }));
    $$("[data-goal]").forEach((b) => b.addEventListener("click", () => {
      const i = state.goals.indexOf(b.dataset.goal);
      if (i > -1) state.goals.splice(i, 1); else state.goals.push(b.dataset.goal);
      update();
    }));
    $("[data-stim]").addEventListener("click", () => { state.stimFree = !state.stimFree; update(); });
    $("[data-sort]").addEventListener("change", (e) => { state.sort = e.target.value; update(); });
    $$("[data-reset]").forEach((b) => b.addEventListener("click", () => { state = Object.assign({}, DEFAULT, { goals: [] }); update(); }));
    update();
  });
})();
