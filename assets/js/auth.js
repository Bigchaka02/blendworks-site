/* Accounts: BW.auth (API client + signed-in header state) and the sign-up, login, forgot/reset-password, e-mail
   verification and account pages. Loaded on every page after motion.js. The server side is worker/index.js
   (Cloudflare Worker + D1); sessions are HttpOnly cookies, plus a readable "bw_u" flag so logged-out visitors never
   hit the API. E-mails (verification, reset) go out through Resend once the founder adds the key. */
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
    forgot: (email) => api("/api/auth/forgot", { method: "POST", body: { email } }),
    resetPassword: (token, password) => api("/api/auth/reset", { method: "POST", body: { token, password } }),
    verifyEmail: (token) => api("/api/auth/verify", { method: "POST", body: { token } }),
    resendVerification: () => api("/api/me/verify", { method: "POST", body: {} }),
    contact: (body) => api("/api/contact", { method: "POST", body }),
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
  const authPageSetup = async () => {   // already signed in (verified, not just the flag cookie)? go where the user was headed
    if (signedIn() && await BW.auth.me()) { location.replace(BW.auth.nextUrl()); return false; }
    const sw = $("[data-switch-link]");
    if (sw) sw.href += location.search;
    return true;
  };
  async function signupPage(form) {
    if (!(await authPageSetup())) return;
    bindForm(form, async (fd) => {
      if (fd.get("password") !== fd.get("confirm")) throw new Error("The two passwords don't match.");
      await BW.auth.signup({ name: fd.get("name"), email: fd.get("email"), password: fd.get("password") });
      location.href = BW.auth.nextUrl();
    }, "Creating your account…");
  }
  async function loginPage(form) {
    if (!(await authPageSetup())) return;
    bindForm(form, async (fd) => {
      await BW.auth.login({ email: fd.get("email"), password: fd.get("password") });
      location.href = BW.auth.nextUrl();
    }, "Signing in…");
    const forgot = $("[data-forgot-form]");
    const show = (on) => { form.hidden = on; forgot.hidden = !on; if (on) { $("#f-email").value = $("#f-email").value || $("#l-email").value; $("#f-email").focus(); } };
    $("[data-forgot]").addEventListener("click", (e) => { e.preventDefault(); show(true); });
    $("[data-forgot-back]").addEventListener("click", (e) => { e.preventDefault(); show(false); });
    if (new URLSearchParams(location.search).get("forgot")) show(true);
    bindForm(forgot, async (fd) => {
      await BW.auth.forgot(fd.get("email"));
      forgot.innerHTML = `<div class="notice">If <b>${BW.escapeHtml(String(fd.get("email")))}</b> has an account, a reset link is on its way — check your inbox (and spam) in the next couple of minutes. The link works for one hour.</div><p class="auth-foot m-0 mt-1"><a href="/login">Back to sign in</a></p>`;
    }, "Sending…");
  }
  function resetPage(form) {
    const token = new URLSearchParams(location.search).get("token") || "";
    if (!token) { form.hidden = true; $("[data-reset-missing]").hidden = false; return; }
    bindForm(form, async (fd) => {
      if (fd.get("password") !== fd.get("confirm")) throw new Error("The two passwords don't match.");
      const r = await BW.auth.resetPassword(token, fd.get("password"));
      form.hidden = true;
      $("[data-reset-intro]").innerHTML = `Done — your password is saved and other devices were signed out. Sign in with <b>${BW.escapeHtml(r.email || "your e-mail")}</b> and the new password.`;
      setTimeout(() => { location.href = "/login"; }, 2500);
    }, "Saving…");
  }
  async function verifyPage() {
    const token = new URLSearchParams(location.search).get("token") || "", title = $("[data-verify-title]"), text = $("[data-verify-text]"), actions = $("[data-verify-actions]");
    const finish = (ok, msg) => {
      title.textContent = ok ? "E-mail confirmed" : "That link didn't work";
      text.textContent = msg;
      actions.innerHTML = ok
        ? `<a class="btn btn-primary" href="${signedIn() ? "/account" : "/login"}">${signedIn() ? "Go to your account" : "Sign in"}</a><a class="btn btn-secondary" href="/shop">Shop blends</a>`
        : `<a class="btn btn-primary" href="${signedIn() ? "/account" : "/login"}">${signedIn() ? "Request a new link" : "Sign in"}</a>`;
      actions.hidden = false;
    };
    if (!token) return finish(false, "This page needs the link from your confirmation e-mail.");
    try { const r = await BW.auth.verifyEmail(token); finish(true, `${r.email || "Your address"} is confirmed. Thanks!`); if (user) user.emailVerified = true; }
    catch (e) { finish(false, e.message); }
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
    // e-mail verification nudge (only while unverified)
    const nudge = $("[data-verify-notice]");
    const paintNudge = () => { nudge.hidden = !!u.emailVerified; };
    paintNudge();
    $("[data-resend-verify]").addEventListener("click", async (e) => {
      e.target.disabled = true;
      try { const r = await BW.auth.resendVerification(); if (r.already) { u.emailVerified = true; paintNudge(); } BW.toast(r.already ? "Your e-mail is already confirmed." : `Confirmation e-mail sent to ${u.email}.`); }
      catch (err) { BW.toast(err.message); }
      setTimeout(() => { e.target.disabled = false; }, 15000);
    });
    // profile
    bindForm($("[data-profile-form]"), async (fd) => {
      const form = $("[data-profile-form]"), name = fd.get("name"), email = String(fd.get("email")).trim().toLowerCase();
      const body = { name };
      if (email !== u.email) { body.email = email; body.password = fd.get("password"); if (!body.password) throw new Error("Enter your password to change the email address."); }
      const next = await BW.auth.update(body);
      Object.assign(u, next); fill(u); paintNudge(); $("#a-pw-confirm").value = "";
      busy(form, false); BW.toast(body.email && !u.emailVerified ? "Profile saved — check your inbox to confirm the new address." : "Profile saved.");
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
    // orders + saved blends
    await renderOrders();
    await renderBlends();
  }
  async function renderOrders() {
    const host = $("[data-orders]");
    let orders = [];
    try { orders = await BW.auth.api("/api/orders").then((d) => d.orders); } catch (e) { host.innerHTML = `<p class="muted">Couldn't load your orders: ${BW.escapeHtml(e.message)}</p>`; return; }
    if (!orders.length) { host.innerHTML = `<div class="empty-state plain">${BW.icons.bag}<p><b>No orders yet.</b></p><p>Your orders will appear here with their status and tracking.</p><a class="btn btn-primary" href="/shop">Shop blends</a></div>`; return; }
    const when = (t) => new Date(t * 1000).toLocaleDateString(undefined, { dateStyle: "medium" });
    host.innerHTML = orders.map((o) => `<a class="blend-row order-row" href="/order?id=${o.id}">${BW.orderBadge(o.status)}<div><b>${o.number}</b> <span class="muted small">· ${when(o.createdAt)}</span><div class="muted small">${o.items.map(BW.escapeHtml).join(" · ")}</div></div><b class="num">${BW.formatPrice(o.total / 100)}</b></a>`).join("");
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
    else if (page === "reset") resetPage($("[data-reset-form]"));
    else if (page === "verify") verifyPage();
    else if (page === "account") accountPage($("[data-account]"));
  });
})();
