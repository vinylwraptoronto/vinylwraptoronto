"""
Carry each posts widget's own per-element rules, at every breakpoint, as CSS.

The port reads a posts widget's DESKTOP title, meta, read-more and badge type
into inline styles and drops the rest: its text padding (15px on the archive
template, where the port draws 10), the 5px under the title and the read-more,
and everything the widget changes at 1024 and 767 -- the archive cards' 16px
title on tablet and phone, and the 2:1 crop it puts on every thumbnail on a
phone. Those are the template's rules, so one widget id carries them for every
page built from it: 7536db10 for 577 category archives, 100f1ef for the related
posts under 402 blog posts.

Writes src/data/widget-css.json:

    { "<widget id>": [["d"|"t"|"m", "<part>", "<declarations>"], ...] }

keyed by widget id rather than written into each page, because the same rules
apply to every page that carries the widget -- including the posts, which render
from D1 and whose page JSON is never read. Blocks.astro turns the parts into
selectors on the port's own card markup.

    python3 scripts/pull-card-css.py --cache DIR
"""
import argparse, glob, importlib.util, json, os, re, urllib.request

PAGES = "src/data/pages"
OUT = "src/data/widget-css.json"
_spec = importlib.util.spec_from_file_location(
    "layers", os.path.join(os.path.dirname(__file__), "pull-section-layers.py"))
layers = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(layers)

# Elementor's posts-widget selector tail -> the port's part name.
PARTS = [
    (r"^\.elementor-post__title(?: a)?$", "title"),
    (r"^\.elementor-post__text$", "text"),
    (r"^a?\.elementor-post__read-more$", "more"),
    (r"^\.elementor-post__meta-data$", "meta"),
    (r"^(?:\.elementor-post__card )?\.elementor-post__badge$", "badge"),
    (r"^\.elementor-post__card$", "card"),
    (r"^\.elementor-post__excerpt p$", "desc"),
    (r"^\.elementor-posts-container \.elementor-post__thumbnail$", "thumb"),
    (r"^\.elementor-post__thumbnail__link$", "thumblink"),
    (r"^$", "grid"),
]
# Only what changes the card's box or type. Colours and families already arrive
# inline from the extractor and are left to it.
KEEP = {
    "title": ("font-size", "line-height", "margin-bottom", "letter-spacing"),
    "text": ("padding", "margin-top", "margin-bottom"),
    "more": ("font-size", "line-height", "margin-bottom", "letter-spacing"),
    "meta": ("padding", "font-size", "line-height"),
    "badge": ("font-size", "margin", "padding", "border-radius", "left", "right"),
    "card": ("padding", "border-radius"),
    "desc": ("font-size", "line-height", "margin-bottom"),
    "thumb": ("padding-bottom",),
    "thumblink": ("width",),
    "grid": ("--grid-row-gap", "--grid-column-gap"),
}


def decls(body, part):
    out = []
    for prop in KEEP[part]:
        v = layers.decl(body, prop)
        if v:
            out.append(f"{prop}:{v}")
    return ";".join(out)


def read(html, eids):
    got = {}
    for media, sel, body in layers.rules(html):
        bp = layers.bp(media)
        if bp not in ("d", "t", "m"):
            continue
        for one in sel.split(","):
            m = re.search(r"\.elementor-element-(\w+)(.*)$", one.strip())
            if not m or m.group(1) not in eids:
                continue
            tail = m.group(2).strip()
            for pat, part in PARTS:
                if re.match(pat, tail):
                    d = decls(body, part)
                    if d:
                        row = [bp, part, d]
                        lst = got.setdefault(m.group(1), [])
                        if row not in lst:
                            lst.append(row)
                    break
    return got


def card_eids(blocks):
    for b in blocks:
        if b.get("type") == "cards" and not b.get("stacked") and b.get("eid"):
            yield b["eid"]
        if b.get("type") == "columns":
            for c in b.get("cols", []):
                yield from card_eids(c.get("blocks", []))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    # One page per widget id is enough: the rules are the template's.
    first = {}
    for f in sorted(glob.glob(f"{PAGES}/*.json")):
        d = json.load(open(f, encoding="utf8"))
        for s in d.get("sections", []):
            for e in card_eids(s.get("blocks", [])):
                first.setdefault(e, (f, d["url"]))
    out = {}
    for eid, (f, url) in sorted(first.items()):
        cached = a.cache and os.path.join(a.cache, os.path.basename(f)[:-5] + ".html")
        if cached and os.path.exists(cached):
            html = open(cached, encoding="utf8", errors="replace").read()
        else:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            try:
                html = urllib.request.urlopen(req, timeout=60).read().decode("utf8", "replace")
            except Exception as e:  # noqa: BLE001
                print(f"{url}: {e}")
                continue
        got = read(html, {eid})
        if got.get(eid):
            out[eid] = got[eid]
            print(eid, url)
            for row in got[eid]:
                print("   ", *row)
    if not a.dry_run:
        with open(OUT, "w", encoding="utf8") as fh:
            json.dump(out, fh, indent=1, ensure_ascii=False)
            fh.write("\n")
    print(f"\n{len(out)} widgets {'found' if a.dry_run else 'written'}")


if __name__ == "__main__":
    main()
