"""
Carry each image carousel's slides-per-view per breakpoint and its arrows.

Elementor's image-carousel handler fills a breakpoint the widget does not set
from a default map, not from the desktop value:

    slidesPerView = slides_to_show_<bp> || { mobile: 1, tablet: single ? 1 : 2 }[bp]
                    || slides_to_show

so an unset mobile value means ONE slide. The port wrote 2 for every carousel
that left it unset, and carried no tablet value at all -- the landing pages'
project carousels showed two 144px slivers on a phone where the original shows
one 320px photograph. Five of the site's eight carousels also draw arrows
(`navigation: arrows` or `both`), which the port did not render.

Writes perView, perViewTablet, perViewMobile, arrows and arrowColor onto the
carousel block, read from the widget's data-settings and its own
`.elementor-swiper-button` colour rule.

    python3 scripts/pull-carousel-settings.py --dry-run --cache DIR
"""
import argparse, glob, html as H, importlib.util, json, os, re, urllib.request

PAGES = "src/data/pages"
_spec = importlib.util.spec_from_file_location(
    "layers", os.path.join(os.path.dirname(__file__), "pull-section-layers.py"))
layers = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(layers)


def read(html):
    out = {}
    for m in re.finditer(r'data-id="(\w+)"[^>]*data-settings="([^"]*)"[^>]*data-widget_type="image-carousel', html):
        s = json.loads(H.unescape(m.group(2)))
        show = int(s.get("slides_to_show") or 3)
        t = s.get("slides_to_show_tablet")
        mo = s.get("slides_to_show_mobile")
        nav = s.get("navigation", "both")
        out[m.group(1)] = {
            "perView": show,
            "perViewTablet": int(t) if t else (1 if show == 1 else 2),
            "perViewMobile": int(mo) if mo else 1,
            "arrows": nav in ("arrows", "both"),
        }
    for media, sel, body in layers.rules(html):
        if media:
            continue
        m = re.search(r"elementor-element-(\w+) \.elementor-swiper-button(?:\.elementor-swiper-button-(?:prev|next))?$",
                      sel.split(",")[-1].strip())
        if m and m.group(1) in out:
            c = layers.decl(body, "color")
            if c:
                out[m.group(1)]["arrowColor"] = c
    return out


def carousels(doc):
    for s in doc.get("sections", []):
        stack = list(s.get("blocks", []))
        while stack:
            b = stack.pop(0)
            if b.get("type") == "carousel":
                yield b
            if b.get("type") == "columns":
                for c in b.get("cols", []):
                    stack.extend(c.get("blocks", []))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="*")
    ap.add_argument("--cache")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    files = sorted(glob.glob(f"{PAGES}/*.json"))
    if a.paths:
        want = {p.strip("/").replace("/", "__") or "index" for p in a.paths}
        files = [f for f in files if os.path.basename(f)[:-5] in want]
    total = 0
    for f in files:
        raw = open(f, encoding="utf8").read()
        doc = json.loads(raw)
        if doc.get("kind") in ("post", "story") or not any(carousels(doc)):
            continue
        cached = a.cache and os.path.join(a.cache, os.path.basename(f)[:-5] + ".html")
        if cached and os.path.exists(cached):
            html = open(cached, encoding="utf8", errors="replace").read()
        else:
            req = urllib.request.Request(doc["url"], headers={"User-Agent": "Mozilla/5.0"})
            try:
                html = urllib.request.urlopen(req, timeout=60).read().decode("utf8", "replace")
            except Exception as e:  # noqa: BLE001
                print(f"{doc['url']}: {e}")
                continue
        got = read(html)
        changed = []
        for b in carousels(doc):
            g = got.get(b.get("eid"))
            if not g:
                continue
            for k, v in g.items():
                if b.get(k) != v:
                    changed.append(f"{b['eid']} {k} {b.get(k)!r} -> {v!r}")
                    b[k] = v
        if not changed:
            continue
        total += len(changed)
        print(f"/{doc['slug']}/: {len(changed)}")
        for line in changed:
            print("   ", line)
        if a.dry_run:
            continue
        pretty = raw.lstrip().startswith("{\n")
        out = (json.dumps(doc, ensure_ascii=False, indent=1) if pretty
               else json.dumps(doc, ensure_ascii=False, separators=(", ", ": ")))
        open(f, "w", encoding="utf8").write(out + ("\n" if raw.endswith("\n") else ""))
    print(f"\n{total} {'found' if a.dry_run else 'written'}")


if __name__ == "__main__":
    main()
