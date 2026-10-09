"""
Carry Elementor's testimonial carousel as what it is: a carousel.

Both landing pages carry one (/lp/ 183566e, /lp-truck-wraps/ 34c2eb18): five
Google reviews in navy speech bubbles, one at a time, with arrows, bullets and
a five-second autoplay. The extractor read it as a text widget and flattened
all five reviews into one paragraph, so the section stacked every review --
1,238px on a phone where the original's carousel is 596.

Reads each review's text, name and title from the original's markup, and the
carousel's own settings (arrows, bullets, autoplay, speed, loop, pause on
hover, spacing) from its data-settings, and replaces the text block with a
`testimonials` block in place. The bubble skin's look is the widget's own
per-element rules, reproduced in Blocks.astro.

    python3 scripts/pull-testimonials.py --dry-run --cache DIR /lp/ /lp-truck-wraps/
"""
import argparse, glob, html as H, json, os, re, urllib.request

from lxml import html as lhtml

PAGES = "src/data/pages"


def read(html):
    tree = lhtml.fromstring(html)
    out = {}
    for w in tree.xpath('//*[@data-widget_type="testimonial-carousel.default"]'):
        s = json.loads(H.unescape(w.get("data-settings") or "{}"))
        items = []
        for slide in w.xpath('.//*[contains(concat(" ", normalize-space(@class), " "), " swiper-slide ")]'):
            if "swiper-slide-duplicate" in (slide.get("class") or ""):
                continue
            t = slide.xpath('.//*[contains(@class,"elementor-testimonial__text")]')
            n = slide.xpath('.//*[contains(@class,"elementor-testimonial__name")]')
            ti = slide.xpath('.//*[contains(@class,"elementor-testimonial__title")]')
            items.append({
                "text": " ".join(t[0].text_content().split()) if t else "",
                "name": " ".join(n[0].text_content().split()) if n else "",
                "title": " ".join(ti[0].text_content().split()) if ti else "",
            })
        gap = (s.get("space_between") or {}).get("size")
        out[w.get("data-id")] = {
            "type": "testimonials",
            "items": items,
            "arrows": s.get("show_arrows") == "yes",
            "dots": s.get("pagination", "bullets") == "bullets",
            "autoplay": s.get("autoplay") == "yes",
            "delay": int(s.get("autoplay_speed") or 5000),
            "speed": int(s.get("speed") or 500),
            "infinite": s.get("loop") == "yes",
            "pauseOnHover": s.get("pause_on_hover") == "yes",
            "gap": int(gap) if gap not in (None, "") else 10,
        }
    return out


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
    for f in files:
        raw = open(f, encoding="utf8").read()
        doc = json.loads(raw)
        if doc.get("kind") in ("post", "story"):
            continue
        cached = a.cache and os.path.join(a.cache, os.path.basename(f)[:-5] + ".html")
        if cached and os.path.exists(cached):
            html = open(cached, encoding="utf8", errors="replace").read()
        else:
            req = urllib.request.Request(doc["url"], headers={"User-Agent": "Mozilla/5.0"})
            html = urllib.request.urlopen(req, timeout=60).read().decode("utf8", "replace")
        if "testimonial-carousel" not in html:
            continue
        got = read(html)
        changed = []

        def walk(blocks):
            for i, b in enumerate(blocks):
                g = got.get(b.get("eid"))
                if g and b.get("type") != "testimonials":
                    blocks[i] = {**g, "eid": b["eid"], **({"box": b["box"]} if b.get("box") else {})}
                    changed.append(f"{b['eid']}: {b.get('type')} -> testimonials ({len(g['items'])} reviews)")
                if b.get("type") == "columns":
                    for c in b.get("cols", []):
                        walk(c.get("blocks", []))

        for s in doc.get("sections", []):
            walk(s.get("blocks", []))
        if not changed:
            continue
        print(f"/{doc['slug']}/:", *changed, sep="\n    ")
        if a.dry_run:
            continue
        pretty = raw.lstrip().startswith("{\n")
        out = (json.dumps(doc, ensure_ascii=False, indent=1) if pretty
               else json.dumps(doc, ensure_ascii=False, separators=(", ", ": ")))
        open(f, "w", encoding="utf8").write(out + ("\n" if raw.endswith("\n") else ""))


if __name__ == "__main__":
    main()
