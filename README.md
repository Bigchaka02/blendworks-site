# BlendWorks website (live at https://blendworks.fit)

Static, dependency-free storefront with a GSAP motion layer. This folder is the git working copy of the private repo **Bigchaka02/blendworks-site**; every push to `main` deploys to Cloudflare (see `../06-deployment/README.md`).

## Pages (clean URLs; `.html` is redirected by the host)
`/` home · `/shop` (search, filters, sort, quantity, add to cart) · `/product?id=<slug>` · `/build?step=1|2|3` (Build your own) · `/cart` · `/checkout` (placeholder) · `/about` · `/mission` · `/contact` (+FAQ) · `/terms` · `/privacy` · `404.html`

## Structure
```
index.html … 404.html            pages (each loads the same script set at the bottom)
wrangler.jsonc  .assetsignore    Cloudflare Worker static-assets config / upload exclusions
_headers  robots.txt  sitemap.xml
assets/css/styles.css            design system + all page styles (dark theme); §9 = builder
assets/img/                      logo, icon, favicon (sources in ../03-brand/logo)
assets/js/
  data/products.js               PLACEHOLDER in-stock catalog (window.BW.products)
  data/ingredients.js            PLACEHOLDER builder ingredients, capsule/scoop sizes, pricing formula (BW.builder)
  cart.js                        localStorage cart (BW.cart; custom items carry their product inline)
  site.js                        shell: header/footer/nav, product artwork, cart drawer, Ctrl+K search, toasts, BW.fx()
  motion.js                      GSAP 3.13 + Lenis layer (BW.motion); intro curtain, transitions, reveals, Flip grid, hooks
  shop.js  product.js  build.js  home.js  cart-page.js  checkout.js  contact.js   page scripts
```
Global namespace `window.BW`. Motion is always on; every animation call goes through `BW.fx(name, …)`, a no-op if the CDN scripts fail, so the site degrades to static but fully usable.

## Build your own (`/build`)
Step 1 format (capsules/powder) → Step 2 size (capsule 0/00/000 × 30/60/90/120, or 5/10/15 g scoop × 15/30/60 servings) → Step 3 ingredients (2–6 chips) + ratio bar with dividers snapping to 10 % (drag or arrow keys), live capsule/tub artwork, per-unit mg table, price, "Reset to even split", optional name, Add to cart. Draft in `localStorage.bw_build_v1`; steps mirrored in `?step=`. Guard: caffeine ≤ 200 mg per unit. Custom cart items get id `custom-…` encoding the recipe.

## Local development
`python serve.py` from the workspace root → http://localhost:8765/05-website/ (clean URLs resolve like production). Bump `?v=` on asset links after CSS/JS edits. Commit + push to deploy.

## Placeholders / not built
Payments (`checkout.js` → `BW.checkout.createSession()` stub), product & builder data and prices, contact form and newsletter (simulated), legal copy, accounts/subscriptions, admin. See `../notes/open-questions-for-founder.md`.
