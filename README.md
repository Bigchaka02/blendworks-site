# BlendWorks website (live at https://blendworks.fit)

Static, dependency-free storefront with a GSAP motion layer. This folder is the git working copy of the private repo **Bigchaka02/blendworks-site**; every push to `main` deploys to Cloudflare (see `../06-deployment/README.md`).

## Pages (clean URLs; `.html` is redirected by the host)
`/` home · `/shop` (search, filters, sort, quantity, add to cart) · `/product?id=<slug>` · `/build?step=1|2|3` (Build your own) · `/cart` · `/checkout` (address, shipping, payment) · `/order?id=…&key=…` (confirmation + tracking) · `/signup` · `/login` · `/account` (orders, saved blends, profile, password) · `/admin` (fulfilment console, admins) · `/about` · `/mission` · `/contact` (+FAQ) · `/terms` · `/privacy` · `404.html` (served by the host for any unknown path, at any depth)

## Structure
```
index.html … 404.html            pages: hand-written <body>; the <head> and <script> blocks between the
                                 <!-- bw:head --> / <!-- bw:scripts --> markers are GENERATED (see tools/)
tools/pages.json                 per-page title, description, robots, data files, GSAP plugins, page scripts, ?v= version
tools/sync_pages.py              regenerates the marked blocks, sitemap.xml and the CSP hash; --bump / --check
worker/index.js                  the API router (Cloudflare Worker) behind /api/* — route table at its top
worker/auth.js  worker/orders.js accounts + saved blends / checkout, payments, orders, fulfilment, e-mails
worker/lib.js  worker/schema.sql shared helpers / D1 database "blendworks" schema (already applied)
assets/data/products.json        SOURCE of the catalog (PLACEHOLDER) — the pages and the order API both read it
assets/data/ingredients.json     SOURCE of the builder data (PLACEHOLDER): ingredients, sizes, pricing formula
wrangler.jsonc  .assetsignore    Worker config: main + static assets + D1 binding / upload exclusions (tools/, worker/ are not served)
_headers  robots.txt  sitemap.xml
assets/css/styles.css            design system + all page styles (dark theme); §8 = builder, §9 = keyframes/responsive
assets/img/                      logo + favicon (sources in ../03-brand/logo)
assets/js/
  data/products.js               GENERATED from assets/data/products.json (window.BW.products, BW.goals)
  data/ingredients.js            GENERATED from assets/data/ingredients.json (BW.builder)
  cart.js                        localStorage cart store + BW.getProduct/formatPrice + BW.cart.summary() (shipping maths)
  site.js                        shell: icon sprite, product artwork, header/footer/menu, cart drawer + line items,
                                 product cards + add-to-cart, Ctrl+K search, toasts, BW.fx()
  motion.js                      GSAP 3.13 + Lenis layer (BW.motion): curtain/transitions, reveals, tilt/glare, hooks
  auth.js                        BW.auth API client + signed-in header state + the sign-up / login / account pages
  shop.js product.js build.js home.js cart-page.js contact.js   page scripts
  checkout.js order.js admin.js  checkout form → /api/checkout; order confirmation/tracking (+ shared status helpers); fulfilment console
```
Script order on every page: `data/products.js`, [`data/ingredients.js`], `cart.js`, GSAP core + ScrollTrigger, [SplitText on home/mission], [Flip on shop], Lenis, `site.js`, `motion.js`, `auth.js`, page script. Global namespace `window.BW`. Shared UI motion goes through `BW.fx(name, …)` (a no-op if the CDN fails, so the site degrades to static but fully usable); page-level choreography in `home.js`/`product.js` calls GSAP directly behind an `if (BW.motion)` guard (decision D16).

## Conventions
- **Links and assets are root-absolute** (`/shop`, `/assets/…`) so the 404 page works at any depth. `python tools/sync_pages.py --check` fails on relative links.
- **Icons**: one sprite in `site.js`; use `<svg class="icon"><use href="#i-check"/></svg>` in HTML or `BW.icons.check` in JS.
- **No inline `style=""`** for layout — use the utilities in `styles.css` §2 (`.pt-0`, `.mb-2`, `.center`, `.mx-auto`, …) or a component class. Inline styles are only for data-driven colours (`--c1`, ingredient swatches).
- **Colours** come from tokens; translucent tints use `rgb(var(--sky-rgb) / .15)`.
- `BW.toast(msg)` is plain text; pass `{ html: true }` only for trusted markup.

## Build your own (`/build`)
Step 1 format (capsules/powder) → Step 2 size (capsule 0/00/000 × 30/60/90/120, or 5/10/15 g scoop × 15/30/60 servings) → Step 3 ingredients (2–6 chips) + ratio bar with dividers snapping to 10 % (drag or arrow keys), live capsule/tub artwork, per-unit mg table, price, "Reset to even split", optional name, Add to cart. Draft in `localStorage.bw_build_v1`; steps mirrored in `?step=`. Guard: caffeine ≤ 200 mg per unit. Custom cart items get id `custom-…` encoding the recipe and carry their product object inline.

## Accounts (`/signup`, `/login`, `/account`)
Email + password accounts served by `worker/index.js` on the same Worker, stored in D1 (`worker/schema.sql`). Passwords are PBKDF2-SHA256 (100k iterations, salted); sessions are HttpOnly cookies (30 days) stored hashed; a readable `bw_u=1` cookie tells the front end whether to call `/api/me`. State-changing calls must be same-origin JSON (CSRF), and D1-backed rate limits cover login, sign-up and password changes. The builder's "Save to my account" stores the recipe (`blends` table); the account page lists, reopens and deletes them. **Not yet:** email verification and password reset (need an email provider — Q29). Decision record: D25.

## Purchase & delivery (`/checkout` → provider → `/order`, fulfilment at `/admin`)
Checkout collects contact, a US address, a shipping method (placeholder rates in `worker/orders.js` `SHIPPING_METHODS`) and a payment method, then `POST /api/checkout` recomputes every price from `assets/data/*.json` (catalog items and custom blends — same formula as the builder), writes the order (`orders`, `order_events`) and starts the payment: **Stripe Checkout** (hosted page; confirmed on return and by the signed webhook `/api/webhooks/stripe`), **PayPal** (Orders v2; approved order captured on return), **Apple Pay** / **Google Pay** (their own checkout choices, same Stripe-hosted page; the wallet used is read back from the charge into `payment_info.wallet`; Apple Pay is offered only where `window.ApplePaySession` exists), **Venmo** (through the PayPal keys as `payment_source.venmo`, or manual by handle), **Cash App** (manual by $cashtag), **Zelle** (manual only — `ZELLE_CONTACT` + `ZELLE_NAME`, no pay link because Zelle lives inside each bank's app), **Bitcoin** (Coinbase Commerce hosted charge with return-trip refresh + signed webhook `/api/webhooks/coinbase`, or manual to a wallet address quoted at the live spot rate). Manual methods leave the order in `pending_payment` with a "How to pay" box (deep link, memo = order number, *I've sent the payment* → `POST /api/orders/:id/reported`), and an admin marks it paid. Methods appear only when their secrets/vars exist; admins also get a **test payment** that completes an order without charging. The order page (`/order?id=…&key=…`, or owner/admin without the key) shows the timeline Placed → Paid → Blending → Shipped → Delivered with tracking; `/account` lists a customer's orders. Admins (`users.role = 'admin'`) use `/admin` to move orders through the statuses, add carrier + tracking and notes; e-mails (order confirmed, shipped) go out via Resend once `RESEND_API_KEY`/`EMAIL_FROM` exist. Money and tax notes: totals in cents; tax not applied yet; refunds are issued in the provider dashboard and marked in `/admin`. Setup steps for the founder: `../notes/founder-todo.md`. Decision record: D27.

## Local development
`python serve.py` from the workspace root → http://localhost:8765/ (serves this folder as the site root with clean URLs and the host's 404 behaviour). Port: first argument or `$PORT`. There is no local Worker (no Node/wrangler): `/api/*` returns 404 locally, which the front end treats as "signed out". To smoke-test the Worker before deploying, run `const t = await import("/tools/worker-smoke.js"); await t.run()` in the browser console on the local preview — it imports the Worker with an in-memory D1 and fake Stripe/PayPal endpoints and returns a result object; cookie-dependent paths (accounts, admin) are checked live with curl after the deploy.

## Editing workflow
1. Edit a page's body, CSS or JS. To change a title/description/robots/plugins, edit `tools/pages.json`.
2. `python tools/sync_pages.py --bump` — bumps `?v=`, regenerates the head/script blocks and the JS data files from `assets/data/*.json`, writes the sitemap and CSP hash, and runs the checks (links, versions, data).
3. Test locally, then `git add -A && git commit && git push origin main` (deploy is automatic).

## Placeholders / not built
Live payments need the founder's Stripe / PayPal keys (until then only the admin test payment works); product & builder data and prices; shipping rates and sales tax; contact form and newsletter (simulated); legal copy; email verification / password reset; subscriptions. See `../notes/open-questions-for-founder.md`.
