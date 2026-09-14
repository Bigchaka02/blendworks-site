"""Regenerates the shared <head> and <script> blocks of every page from tools/pages.json.

Each page keeps its own hand-written body; only the regions between
    <!-- bw:head --> ... <!-- /bw:head -->      and     <!-- bw:scripts --> ... <!-- /bw:scripts -->
are rewritten. The script also generates assets/js/data/*.js from assets/data/*.json (the catalog and builder data — the order API reads
the JSON too), writes sitemap.xml, keeps the CSP hash of the inline curtain script in _headers current, and (with --check)
validates links, versions and the data files.

Usage (from 05-website/):
    python tools/sync_pages.py            regenerate blocks + sitemap + CSP hash
    python tools/sync_pages.py --bump     same, but first bump "version" (the ?v= cache-buster) in pages.json
    python tools/sync_pages.py --check    verify everything is in sync and links resolve; exit 1 if not
"""
import base64, datetime, hashlib, html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG_PATH = os.path.join(ROOT, "tools", "pages.json")
GSAP = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/"
LENIS = "https://cdn.jsdelivr.net/npm/lenis@1.3.11/dist/lenis.min.js"
FONTS = "https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=Inter:wght@400;500;600&display=swap"
# Hides the page until motion.js lifts the curtain (or 3 s pass). Its sha256 is whitelisted in _headers.
CURTAIN_SCRIPT = "document.documentElement.className+=' curtain-pending';setTimeout(function(){document.documentElement.classList.remove('curtain-pending')},3000)"


def load_cfg():
    with open(CFG_PATH, encoding="utf-8") as f:
        return json.load(f)


def save_cfg(cfg):
    with open(CFG_PATH, "w", encoding="utf-8", newline="\n") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
        f.write("\n")


def esc(s):
    return html.escape(s, quote=True)


def head_block(name, page, cfg):
    v, site = cfg["version"], cfg["site"]
    url = site + page["path"] if page.get("canonical", True) else None
    out = [
        "<!-- generated from tools/pages.json by tools/sync_pages.py; edit those, not this block -->",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        "<title>%s</title>" % esc(page["title"]),
        '<meta name="description" content="%s">' % esc(page["description"]),
    ]
    if page.get("noindex"):
        out.append('<meta name="robots" content="noindex">')
    out.append('<meta name="theme-color" content="#0B1020">')
    if url:
        out.append('<link rel="canonical" href="%s">' % url)
    out += [
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="BlendWorks">',
    ]
    if url:
        out.append('<meta property="og:url" content="%s">' % url)
    out += [
        '<meta property="og:title" content="%s">' % esc(page["title"]),
        '<meta property="og:description" content="%s">' % esc(page["description"]),
        '<meta name="twitter:card" content="summary">',
        '<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">',
        '<link rel="preconnect" href="https://fonts.googleapis.com">',
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
        '<link href="%s" rel="stylesheet">' % FONTS,
        "<script>%s</script>" % CURTAIN_SCRIPT,
        '<link rel="stylesheet" href="/assets/css/styles.css?v=%s">' % v,
    ]
    return "\n".join(out)


def scripts_block(name, page, cfg):
    v = cfg["version"]
    local = lambda p: '<script src="/assets/js/%s?v=%s"></script>' % (p, v)
    cdn = lambda u: '<script src="%s"></script>' % u
    out = ["<!-- generated from tools/pages.json by tools/sync_pages.py -->", local("data/products.js")]
    out += [local("data/%s.js" % d) for d in page.get("data", [])]
    out += [local("cart.js"), cdn(GSAP + "gsap.min.js"), cdn(GSAP + "ScrollTrigger.min.js")]
    plugins = page.get("plugins", [])
    if "splittext" in plugins:
        out.append(cdn(GSAP + "SplitText.min.js"))
    if "flip" in plugins:
        out.append(cdn(GSAP + "Flip.min.js"))
    out += [cdn(LENIS), local("site.js"), local("motion.js"), local("auth.js")]
    out += [local("%s.js" % s) for s in page.get("scripts", [])]
    return "\n".join(out)


def replace_region(text, tag, body, fname):
    pattern = re.compile(r"(<!-- bw:%s -->\n).*?(\n<!-- /bw:%s -->)" % (tag, tag), re.S)
    if not pattern.search(text):
        sys.exit("%s: missing <!-- bw:%s --> ... <!-- /bw:%s --> markers" % (fname, tag, tag))
    return pattern.sub(lambda m: m.group(1) + body + m.group(2), text, count=1)


def render_page(name, page, cfg):
    fname = os.path.join(ROOT, name + ".html")
    with open(fname, encoding="utf-8") as f:
        text = f.read()
    text = replace_region(text, "head", head_block(name, page, cfg), fname)
    text = replace_region(text, "scripts", scripts_block(name, page, cfg), fname)
    return fname, text


def sitemap(cfg):
    urls = [cfg["site"] + p["path"] for p in cfg["pages"].values() if p.get("canonical", True) and not p.get("noindex")]
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + "".join("  <url><loc>%s</loc></url>\n" % u for u in urls) + "</urlset>\n")


def csp_hash():
    return "sha256-" + base64.b64encode(hashlib.sha256(CURTAIN_SCRIPT.encode("utf-8")).digest()).decode("ascii")


def headers_text():
    p = os.path.join(ROOT, "_headers")
    with open(p, encoding="utf-8") as f:
        text = f.read()
    h = "'%s'" % csp_hash()
    if "'sha256-" in text:
        new = re.sub(r"'sha256-[A-Za-z0-9+/=]+'", h, text, count=1)
    else:
        new = text.replace("script-src 'self'", "script-src 'self' " + h, 1)
    return p, new


def bump(cfg):
    today = datetime.date.today().strftime("%Y%m%d")
    cur = cfg["version"]
    if cur[:8] == today and len(cur) == 9 and cur[8] != "z":
        cfg["version"] = today + chr(ord(cur[8]) + 1)
    else:
        cfg["version"] = today + "a"
    return cfg["version"]


def write_if_changed(path, text, check, problems):
    with open(path, encoding="utf-8") as f:
        old = f.read()
    if old == text:
        return False
    if check:
        problems.append("%s is out of sync (run tools/sync_pages.py)" % os.path.relpath(path, ROOT))
        return False
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    return True


# ---------- checks: links, versions, data files ----------
def check_links(cfg, problems):
    names = set(cfg["pages"])
    files = [os.path.join(ROOT, n + ".html") for n in names] + [os.path.join(ROOT, "assets", "js", f) for f in os.listdir(os.path.join(ROOT, "assets", "js")) if f.endswith(".js")]
    for fname in files:
        with open(fname, encoding="utf-8") as f:
            text = f.read()
        for m in re.finditer(r"""(?:href|src)=(?:\\?["'])(/[^"'#?\\]*)""", text):
            target = m.group(1)
            if target == "/":
                continue
            rel = target.lstrip("/")
            ok = os.path.isfile(os.path.join(ROOT, rel)) or os.path.isfile(os.path.join(ROOT, rel + ".html"))
            if not ok:
                problems.append("%s links to %s which does not exist" % (os.path.relpath(fname, ROOT), target))
        for m in re.finditer(r"""(?:href|src)=["'](?!https?:|/|#|mailto:|tel:)([^"']+)""", text):
            if fname.endswith(".html"):
                problems.append("%s has a relative link %s (use root-absolute paths)" % (os.path.relpath(fname, ROOT), m.group(1)))
        for m in re.finditer(r"\?v=([0-9a-z]+)", text):
            if m.group(1) != cfg["version"]:
                problems.append("%s uses ?v=%s but pages.json says %s" % (os.path.relpath(fname, ROOT), m.group(1), cfg["version"]))


# ---------- data: assets/data/*.json is the source; the browser files assets/js/data/*.js are generated ----------
def load_data(name):
    with open(os.path.join(ROOT, "assets", "data", name), encoding="utf-8") as f:
        return json.load(f)


def js_rows(items):   # one JSON object per line keeps the generated file diff-friendly
    return "[\n" + ",\n".join("  " + json.dumps(i, ensure_ascii=False) for i in items) + "\n]"


def data_files():
    prod, ing = load_data("products.json"), load_data("ingredients.json")
    head = "/* GENERATED by tools/sync_pages.py from assets/data/%s — edit the JSON, not this file. PLACEHOLDER DATA (Q14). */\n"
    products_js = (head % "products.json" + "window.BW = window.BW || {};\n"
                   + "BW.products = " + js_rows(prod["products"]) + ";\n"
                   + "BW.goals = " + json.dumps(prod["goals"], ensure_ascii=False) + ";\n")
    b = {k: v for k, v in ing.items() if not k.startswith("_")}
    ingredients_js = (head % "ingredients.json" + "window.BW = window.BW || {};\n"
                      + "BW.builder = " + json.dumps(b, ensure_ascii=False, indent=2) + ";\n"
                      + "// a fresh draft starts from the capsule preset until the user picks a format\n"
                      + "BW.builder.defaults.ingredients = BW.builder.presets.capsule.ingredients.slice();\n"
                      + "BW.builder.defaults.pct = Object.assign({}, BW.builder.presets.capsule.pct);\n"
                      + "BW.builder.get = (id) => BW.builder.ingredients.find((i) => i.id === id);\n")
    return {"assets/js/data/products.js": products_js, "assets/js/data/ingredients.js": ingredients_js}


def check_data(problems):
    prod, ing = load_data("products.json"), load_data("ingredients.json")
    ids = [p["id"] for p in prod["products"]]
    slugs = [p["slug"] for p in prod["products"]]
    for label, seq in (("product id", ids), ("product slug", slugs)):
        dup = {x for x in seq if seq.count(x) > 1}
        if dup:
            problems.append("duplicate %s(s): %s" % (label, ", ".join(sorted(dup))))
    for p in prod["products"]:
        for g in p["goals"]:
            if g not in prod["goals"]:
                problems.append("product %s goal %r is missing from goals" % (p["id"], g))
        if p["type"] not in ("capsule", "powder") or not isinstance(p["price"], (int, float)) or p["price"] <= 0:
            problems.append("product %s has an invalid type or price" % p["id"])
    ing_ids = [i["id"] for i in ing["ingredients"]]
    dup = {x for x in ing_ids if ing_ids.count(x) > 1}
    if dup:
        problems.append("duplicate ingredient id(s): %s" % ", ".join(sorted(dup)))
    for name, pr in ing["presets"].items():
        for i in pr["ingredients"]:
            if i not in ing_ids:
                problems.append("preset %s references unknown ingredient %r" % (name, i))
        if sum(pr["pct"].get(i, 0) for i in pr["ingredients"]) != 100:
            problems.append("preset %s shares do not add up to 100" % name)
    for n in ing["capsuleCounts"]:
        if str(n) not in ing["pricing"]["capsuleBase"]:
            problems.append("no capsule base price for %s capsules" % n)
    for n in ing["boxServings"]:
        if str(n) not in ing["pricing"]["powderBase"]:
            problems.append("no powder base price for %s servings" % n)


def main(argv):
    check, do_bump = "--check" in argv, "--bump" in argv
    cfg = load_cfg()
    if do_bump and not check:
        print("version ->", bump(cfg))
        save_cfg(cfg)
    problems, changed = [], []
    for rel, text in data_files().items():
        if write_if_changed(os.path.join(ROOT, rel), text, check, problems):
            changed.append(rel)
    for name, page in cfg["pages"].items():
        path, text = render_page(name, page, cfg)
        if write_if_changed(path, text, check, problems):
            changed.append(os.path.relpath(path, ROOT))
    if write_if_changed(os.path.join(ROOT, "sitemap.xml"), sitemap(cfg), check, problems):
        changed.append("sitemap.xml")
    hp, ht = headers_text()
    if write_if_changed(hp, ht, check, problems):
        changed.append("_headers")
    check_links(cfg, problems)
    check_data(problems)
    if changed:
        print("updated:", ", ".join(changed))
    if problems:
        print("\n".join("PROBLEM: " + p for p in problems))
        sys.exit(1)
    print("ok — version %s, %d pages, CSP %s" % (cfg["version"], len(cfg["pages"]), csp_hash()))


if __name__ == "__main__":
    main(sys.argv[1:])
