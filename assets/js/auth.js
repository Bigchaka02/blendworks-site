/* Accounts: BW.auth (API client + signed-in header state) and the sign-up, login and account pages.
   Loaded on every page after motion.js. The server side is worker/index.js (Cloudflare Worker + D1); sessions are
   HttpOnly cookies, plus a readable "bw_u" flag so logged-out visitors never hit the API. */
(function () {
  const { $, $$ } = BW;
  const signedIn = () => /(^|;\s*)bw_u=1(;|$)/.test(document.cookie);
  let user = null;

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || "GET", credentials: "same-origin",
      headers: opts.method && opts.method !== "GET" ? { "Content-Type": "application/json" } : {},
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    });
    let data = null;
    if (res.status !== 204) { try { data = await res.json(); } catch (e) { data = null; } }
    if (!res.ok) throw Object.assign(new Error((data && data.error) || `Request failed (${res.status}).`), { status: res.status });
    return data;
  }

  BW.auth = {
    api, signedIn,
    user: () => user,
    async me(force) {   // cached per page; null when logged out
      if (!signedIn()) { user = null; return null; }
      if (user && !force) return user;
      try { user = (await api("/api/me")).user; } catch (e) { user = null; }
      return user;
    },
    signup: (body) => api("/api/auth/signup", { method: "POST", body }).then((d) => (user = d.user)),
    login: (body) => api("/api/auth/login", { method: "POST", body }).then((d) => (user = d.user)),
    logout: () => api("/api/auth/logout", { method: "POST", body: {} }).then(() => { user = null; }),
    logoutAll: () => api("/api/auth/logout-all", { method: "POST", body: {} }).then(() => { user = null; }),
    update: (body) => api("/api/me", { method: "PATCH", body }).then((d) => (user = d.user)),
    changePassword: (current, next) => api("/api/me/password", { method: "POST", body: { current, next } }),
    deleteAccount: (password) => api("/api/me", { method: "DELETE", body: { password } }).then(() => { user = null; }),
    blends: () => api("/api/blends").then((d) => d.blends),
    saveBlend: (name, spec) => api("/api/blends", { method: "POST", body: { name, spec } }).then((d) => d.blend),
    deleteBlend: (id) => api(`/api/blends/${id}`, { method: "DELETE", body: {} }),
    // where to send the user after login: a same-site path from ?next=, else the account page
    nextUrl() {
      const n = new URLSearchParams(location.search).get("next") || "";
      return /^\/[^/\\]/.test(n) ? n : "/account";
    },
    loginUrl: (next) => `/login?next=${encodeURIComponent(next || location.pathname + location.search)}`
  };

  /* ---------- header: account icon points to /login or /account ---------- */
  async function paintHeader() {
    const links = $$("[data-account-link]"), on = signedIn();
    links.forEach((a) => {
      a.href = on ? "/account" : "/login";
      if (a.matches(".btn-icon")) a.setAttribute("aria-label", on ? "Your account" : "Sign in");
      else a.textContent = on ? "Account" : "Sign in";
    });
    if (!on) return;
    const u = await BW.auth.me();
    if (u) links.forEach((a) => { if (a.matches(".btn-icon")) { a.title = u.name ? `Signed in as ${u.name}` : u.email; a.classList.add("is-user"); } });
  }

  /* ---------- shared form plumbing ---------- */
  const showError = (form, msg) => {
    const box = $("[data-error]", form);
    box.textContent = msg;
    box.hidden = !msg;
  };
  const busy = (form, on, label) => {
    const btn = $("button[type=submit]", form);
    btn.disabled = on;
    if (on) { btn.dataset.label = btn.innerHTML; btn.textContent = label || "Working…"; } else if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  };
  function bindForm(form, handler, label) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) return form.reportValidity();
      showError(form, "");
      busy(form, true, label);
      try { await handler(new FormData(form)); } catch (err) { showError(form, err.message); busy(form, false); }
    });
  }
  $$("[data-toggle-password]").forEach((btn) => btn.addEventListener("click", () => {
    const input = $("#" + btn.dataset.togglePassword), show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.textContent = show ? "Hide" : "Show";
  }));

  /* ---------- pages ---------- */
  const authPageSetup = () => {   // already signed in? go where the user was headed; keep ?next= on the switch link
    if (signedIn()) { location.replace(BW.auth.nextUrl()); return false; }
    const sw = $("[data-switch-link]");
    if (sw) sw.href += location.search;
    return true;
  };
  function signupPage(form) {
    if (!authPageSetup()) return;
    bindForm(form, async (fd) => {
      if (fd.get("password") !== fd.get("confirm")) throw new Error("The two passwords don't match.");
      await BW.auth.signup({ name: fd.get("name"), email: fd.get("email"), password: fd.get("password") });
      location.href = BW.auth.nextUrl();
    }, "Creating your account…");
  }
  function loginPage(form) {
    if (!authPageSetup()) return;
    bindForm(form, async (fd) => {
      await BW.auth.login({ email: fd.get("email"), password: fd.get("password") });
      location.href = BW.auth.nextUrl();
    }, "Signing in…");
    $("[data-forgot]").addEventListener("click", (e) => {
      e.preventDefault();
      BW.toast("Password reset arrives with our email service. Until then, contact us and we'll help.", { link: { href: "/contact", label: "Contact" }, duration: 6000 });
    });
  }
  async function accountPage(root) {
    const u = await BW.auth.me(true);
    if (!u) { location.replace(BW.auth.loginUrl("/account")); return; }
    root.hidden = false;
    const fill = (usr) => {
      $$("[data-user-name]").forEach((el) => { el.textContent = usr.name || usr.email.split("@")[0]; });
      $("[data-user-email]").textContent = usr.email;
      $("#a-name").value = usr.name;
      $("#a-email").value = usr.email;
      $("[data-member-since]").textContent = new Date(usr.createdAt * 1000).toLocaleDateString(undefined, { year: "numeric", month: "long" });
    };
    fill(u);
    // profile
    bindForm($("[data-profile-form]"), async (fd) => {
      const form = $("[data-profile-form]"), name = fd.get("name"), email = String(fd.get("email")).trim().toLowerCase();
      const body = { name };
      if (email !== u.email) { body.email = email; body.password = fd.get("password"); if (!body.password) throw new Error("Enter your password to change the email address."); }
      const next = await BW.auth.update(body);
      Object.assign(u, next); fill(u); $("#a-pw-confirm").value = "";
      busy(form, false); BW.toast("Profile saved.");
    }, "Saving…");
    // password
    bindForm($("[data-password-form]"), async (fd) => {
      const form = $("[data-password-form]");
      if (fd.get("next") !== fd.get("confirm")) throw new Error("The two new passwords don't match.");
      await BW.auth.changePassword(fd.get("current"), fd.get("next"));
      form.reset(); busy(form, false); BW.toast("Password changed. Other devices were signed out.");
    }, "Changing…");
    // sign out
    $("[data-logout]").addEventListener("click", async () => { await BW.auth.logout(); location.href = "/"; });
    $("[data-logout-all]").addEventListener("click", async () => { await BW.auth.logoutAll(); location.href = "/login"; });
    // delete
    bindForm($("[data-delete-form]"), async (fd) => {
      if (!confirm("Delete your account and saved blends? This cannot be undone.")) { busy($("[data-delete-form]"), false); return; }
      await BW.auth.deleteAccount(fd.get("password"));
      location.href = "/";
    }, "Deleting…");
    // saved blends
    await renderBlends();
  }
  async function renderBlends() {
    const host = $("[data-blends]");
    let blends = [];
    try { blends = await BW.auth.blends(); } catch (e) { host.innerHTML = `<p class="muted">Couldn't load your blends: ${BW.escapeHtml(e.message)}</p>`; return; }
    if (!blends.length) { host.innerHTML = `<div class="empty-state plain">${BW.icons.sparkle}<p><b>No saved blends yet.</b></p><p>Design one in the builder and choose "Save to my account".</p><a class="btn btn-primary" href="/build">Build your own</a></div>`; return; }
    host.innerHTML = blends.map((b) => {
      const s = b.spec, names = s.ingredients.map((id) => { const ing = BW.builder && BW.builder.get(id); return `${ing ? ing.short : id} ${s.pct[id]}%`; }).join(" · ");
      const size = s.format === "capsule" ? `${s.capsules} × size ${s.capsuleSize} capsules` : `${s.servings} × ${s.servingG} g scoops`;
      return `<div class="blend-row" data-blend="${b.id}"><span class="badge ${s.format === "capsule" ? "" : "lav"}">${s.format}</span><div><b>${BW.escapeHtml(b.name)}</b><div class="muted small">${BW.escapeHtml(names)} · ${size}</div></div><div class="row gap-sm"><button class="btn btn-secondary btn-sm" data-load>Open in builder</button><button class="btn-icon" data-delete aria-label="Delete ${BW.escapeHtml(b.name)}">${BW.icons.close}</button></div></div>`;
    }).join("");
    host.onclick = async (e) => {
      const row = e.target.closest("[data-blend]");
      if (!row) return;
      const blend = blends.find((b) => b.id === row.dataset.blend);
      if (e.target.closest("[data-load]")) {
        try { localStorage.setItem("bw_build_v1", JSON.stringify(Object.assign({}, blend.spec, { name: blend.name, customised: true }))); } catch (err) { /* storage blocked */ }
        location.href = "/build?step=3";
      } else if (e.target.closest("[data-delete]")) {
        if (!confirm(`Delete "${blend.name}"?`)) return;
        await BW.auth.deleteBlend(blend.id);
        await renderBlends();
        BW.toast("Blend deleted.");
      }
    };
  }

  document.addEventListener("bw:ready", () => {
    paintHeader();
    const page = document.body.dataset.page;
    if (page === "signup") signupPage($("[data-signup-form]"));
    else if (page === "login") loginPage($("[data-login-form]"));
    else if (page === "account") accountPage($("[data-account]"));
  });
})();
