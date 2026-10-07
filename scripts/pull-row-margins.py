"""
Carry each inner section's own vertical margin, per breakpoint.

An Elementor inner section -- a row of columns nested in a column -- can set a
margin of its own, and the extractor flattened every inner section into a
`columns` block and dropped it. The services section on
/personal-vehicle-wraps/ spaces its three rows 40px, 100px and 100px apart;
the port had them 20px apart, and the page ran 194px short at 1440. The
/locations-served/ pages, /racing-stripes/, /cybertruck-wraps/ and a few others
lose 25-35px the same way.

A `columns` block has no id of its own, so each margin is keyed by the element
id of the first widget in the row, which the block does carry. A template's ids
are the same on every page built from it, so one entry covers them all.

Writes src/data/row-css.json, `{ firstWidgetId: { "d"|"t"|"m": [top, bottom] } }`.

    python3 scripts/pull-row-margins.py --cache DIR
"""
import argparse, glob, importlib.util, json, os, re

OUT = "src/data/row-css.json"
_spec = importlib.util.spec_from_file_location(
    "layers", os.path.join(os.path.dirname(__file__), "pull-section-layers.py"))
layers = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(layers)

from lxml import html as lhtml

# The single-post template's sidebar row (48d21ce, 25px below it) is already
# accounted for in the post template's own spacing.
SKIP = {"48d21ce"}


def sides(v):
    p = v.split()
    if len(p) == 1:
        return p[0], p[0]
    return p[0], p[2] if len(p) >= 3 else p[0]


def first_widget(el):
    for w in el.iter():
        if isinstance(w.tag, str) and " elementor-widget " in f" {w.get('class') or ''} " and w.get("data-id"):
            return w.get("data-id")
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    a = ap.parse_args()
    out, clash = {}, set()
    for f in sorted(glob.glob(os.path.join(a.cache, "*.html"))):
        html = open(f, encoding="utf8", errors="replace").read()
        tree = lhtml.fromstring(html)
        inner = {}
        for el in tree.xpath('//section[contains(concat(" ", normalize-space(@class), " "), " elementor-inner-section ")]'):
            if el.xpath('ancestor::*[@data-elementor-type="header" or @data-elementor-type="footer" or @data-elementor-type="popup"]'):
                continue
            if el.get("data-id") not in SKIP:
                inner[el.get("data-id")] = el
        got = {}
        for media, sel, body in layers.rules(html):
            m = re.search(r"\.elementor-element-([0-9a-f]+)$", sel.strip())
            if not m or m.group(1) not in inner:
                continue
            bp = layers.bp(media)
            if bp not in ("d", "t", "m"):
                continue
            top = bot = None
            v = layers.decl(body, "margin")
            if v:
                top, bot = sides(v)
            top = layers.decl(body, "margin-top") or top
            bot = layers.decl(body, "margin-bottom") or bot
            if top is None and bot is None:
                continue
            cur = got.setdefault(m.group(1), {}).setdefault(bp, [None, None])
            cur[0] = top if top is not None else cur[0]
            cur[1] = bot if bot is not None else cur[1]
        for sid, per in got.items():
            per = {bp: [x or "0px" for x in v] for bp, v in per.items()}
            if all(re.fullmatch(r"0(px)?", x) for v in per.values() for x in v):
                continue
            key = first_widget(inner[sid])
            if not key:
                continue
            if key in out and out[key] != per:
                clash.add(key)
            out[key] = per
    for k in clash:
        out.pop(k, None)
    with open(OUT, "w", encoding="utf8") as fh:
        json.dump(out, fh, indent=1, sort_keys=True)
        fh.write("\n")
    print(f"{len(out)} rows" + (f", {len(clash)} dropped for differing between pages" if clash else ""))


if __name__ == "__main__":
    main()
