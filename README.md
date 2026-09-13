# BlendWorks website — v1 (static)

A complete, dependency-free storefront: browse in-stock capsule and powder blends, search/filter, choose quantities, add to a persistent cart, preview the cart, and reach a placeholder checkout. Plus About, Mission & goals, Contact (+FAQ), Terms, Privacy and 404 pages.

**Status (2026-09-12):** running locally, ready to deploy as-is. Payments, the Blend Builder, the contact-form backend, the newsletter and real product data are intentionally placeholders (see "What is placeholder").

## Run it
- **Simplest:** double-click `index.html` (everything is relative; only the Google Fonts need internet).
- **Local server (recommended):** from the `QwenFolder` root run `python -m http.server 8765` and open `http://localhost:8765/05-website/` — or use the `static-preview` launch config in `.claude/launch.json`.

## Deploy it (minutes, no build step)
See `../06-deployment/README.md` — domain availability, hosting options with a private/public toggle, and the step-by-step for the recommended path (Cloudflare Pages + Access). `robots.txt` and `_headers` in this folder are pre-configured for the private phase; `../06-deployment/blendworks-site-upload.zip` is the upload-ready package (rebuild it after edits).

## Where to edit things
| Want to change… | Edit |
|---|---|
| Products, prices, stock, ingredients, badges, colours | `assets/js/data/products.js` (one array; every page reads it) |
| Colours, fonts, spacing, animations | `assets/css/styles.css` (tokens at the top) |
| Header/footer links, icons, cart drawer, search overlay, toasts | `assets/js/site.js` |
| Cart behaviour (limits, storage key) | `assets/js/cart.js` |
| Shop filters/sort/search | `assets/js/shop.js` |
| Product page layout | `assets/js/product.js` |
| Checkout placeholder + order maths | `assets/js/checkout.js` → `BW.checkout` |
| Page copy | the `.html` files |
| Logo/favicon | `assets/img/` (sources in `../03-brand/logo/`) |

## Structure
```
05-website/
├─ index.html · shop.html · product.html?id=<slug> · cart.html · checkout.html
├─ about.html · mission.html · contact.html · terms.html · privacy.html · 404.html
└─ assets/
   ├─ css/styles.css              design system + all page styles (dark theme)
   ├─ img/                        logo, icon, favicon (SVG)
   └─ js/
      ├─ data/products.js         PLACEHOLDER catalog (window.BW.products)
      ├─ cart.js                  localStorage cart store (BW.cart) + "bw:cart" events
      ├─ site.js                  shell: header, footer, cart drawer, search (Ctrl+K), toasts, reveal, product artwork
      ├─ shop.js                  grid, search, filters, sort, add-to-cart (also provides BW.productCard)
      ├─ product.js · cart-page.js · checkout.js · contact.js · home.js
```
Global namespace: `window.BW` (`BW.products`, `BW.cart`, `BW.checkout`, `BW.art`, `BW.toast`, …). No frameworks, no build.

## What is placeholder (and where the hook is)
| Feature | State | Hook |
|---|---|---|
| **Build your own** button (shop top-right, hero, footer) | Disconnected — shows a "coming soon" toast | `[data-build]` handler in `site.js` → `initBuildButtons()` |
| **Checkout / payments** | UI + cart validation + summary maths real; no provider | `BW.checkout.createSession()` in `checkout.js`; `checkout.html` |
| **Product catalog** | 12 placeholder blends with placeholder prices/stock | `assets/js/data/products.js` |
| **Contact form** | Simulated submit, nothing sent | `contact.js` (TODO: form/email service) |
| **Newsletter** | Simulated | `site.js` footer form |
| **Legal pages** | Structural placeholders | `terms.html`, `privacy.html` |
| **Team / lab / certification blocks** | Placeholder cards | `about.html` |
| **Shipping regions / rates** | Placeholder flat rate | `BW.checkout` constants |

## Decisions made while building (see `../notes/decisions-log.md` D12–D15)
- Static vanilla site now (no Node on the build machine; deployable instantly); migrate to the Next.js plan in `../04-website-plan/` when payments/accounts arrive.
- Dark, glassy, gradient theme; motion respects `prefers-reduced-motion`.
- Cart lives in the browser (`localStorage`, key `bw_cart_v1`), max 10 per line, capped by stock.
- Product imagery is generated SVG (no photos yet) so every product gets consistent art from its two colours.

## Motion layer (added 2026-09-12, second pass)
Premium interaction layer built on **GSAP 3.13** (core, ScrollTrigger, SplitText, Flip — all free since the Webflow acquisition) and **Lenis** smooth scroll, loaded from CDNs in every page before `site.js`. `assets/js/motion.js` exposes `BW.motion`; if the CDN scripts fail, the site silently falls back to the original CSS/IntersectionObserver animations.

What it does:
- **Global:** first-visit intro (monogram draws itself, curtain lifts), branded curtain page transitions, smooth scroll (desktop), scroll-progress bar, header hides on scroll-down / returns on scroll-up, lightly magnetic buttons, press feedback, split-line heading reveals, staggered scroll reveals, subtle glare + tilt on cards, animated accordions, spring toasts, cart-drawer choreography, Flip-style product fly-to-cart. (Cursor followers and mouse-parallax were removed at the founder's request on 2026-09-12; hover tilt/glare were toned down.)
- **Home:** stacked hero — headline block on top, then the capsule with particles/orbits and **four floating step cards ("How it works", 01–04)** around it (the separate How-it-works section was removed); words unmask, capsule pops in with an elastic ease, cards drift gently; hero fades away on scroll; scroll-velocity-reactive ingredient marquee; count-up stats; parallax facts card; stagger-grid dots in the CTA band.
- **Shop:** filter/search/sort changes animate the grid with Flip layout transitions (cards slide to new positions, enter/exit with scale).
- **Product:** staged entrance, cursor-driven 3D tilt of the art, facts rows stagger, sticky mobile "Add to cart" bar.
- **Cart / content pages:** item entrance/exit animations, timeline line draws on scroll, mission statement unmasks line by line.

Motion is always on (the founder removed the Full/Calm toggle on 2026-09-13; `prefers-reduced-motion` is not consulted). If the CDN scripts fail to load, the site renders fully static — content is never hidden by CSS; GSAP sets the initial hidden states itself.

Where the pieces live: `motion.js` (engine + hooks exposed as `BW.motion.*`, called from other scripts through `BW.fx(name, …)` so every call is a safe no-op without GSAP), `home.js` (home scenes), `shop.js` (cards + shared add-to-cart flow + shop filters), `product.js`, `cart-page.js`, `checkout.js`, `contact.js`. `styles.css` holds only static states and cheap decorative loops (orbits, mesh, glow, shimmer) — one motion implementation, no CSS/JS double-driving. A one-line inline script in each `<head>` shows a dark cover until the curtain takes over, so there is no flash between pages.

**Code hygiene pass (2026-09-13):** CSS 54 KB → 44 KB (fix sections folded into base rules, dead rules and duplicate media queries removed), site.js 28 KB → 20 KB (unused icons, baseline IntersectionObserver/tilt/keyframe fallbacks removed), motion.js 18 KB → 15 KB (preference machinery and cursor code removed). Asset links carry `?v=` cache-busting — bump it when you change CSS/JS.
