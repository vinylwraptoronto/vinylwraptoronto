"""
Carry each icon list's own item spacing ("Space Between"), per breakpoint.

Elementor writes it as half the space below every item but the last and half
above every item but the first:

    .elementor-element-ID .elementor-icon-list-items:not(.elementor-inline-items)
        .elementor-icon-list-item:not(:last-child) { padding-block-end: calc(13px/2) }

The port spaced every list's items a flat 5px apart. On /contact/ the
workflow lists are 13px apart on a phone and 8px on a tablet, and the
contact list 20px, so the page ran short by about 8px an item.

Keyed by element id rather than written into each page, so the template
lists on every post are covered too.

Writes src/data/list-space.json, `{ id: { "d"|"t"|"m": px } }`.

    python3 scripts/pull-list-space.py --cache DIR
"""
import argparse, glob, importlib.util, json, os, re

OUT = "src/data/list-space.json"
_spec = importlib.util.spec_from_file_location(
    "layers", os.path.join(os.path.dirname(__file__), "pull-section-layers.py"))
layers = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(layers)

SEL = re.compile(r"\.elementor-element-([0-9a-f]+) \.elementor-icon-list-items:not\(\.elementor-inline-items\) "
                 r"\.elementor-icon-list-item:not\(:last-child\)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    a = ap.parse_args()
    out, clash = {}, set()
    for f in sorted(glob.glob(os.path.join(a.cache, "*.html"))):
        html = open(f, encoding="utf8", errors="replace").read()
        got = {}
        for media, sel, body in layers.rules(html):
            bp = layers.bp(media)
            if bp not in ("d", "t", "m"):
                continue
            for part in sel.split(","):
                m = SEL.search(part.strip())
                if not m:
                    continue
                v = layers.decl(body, "padding-block-end") or layers.decl(body, "padding-bottom")
                n = re.search(r"calc\(\s*([\d.]+)px\s*/\s*2\s*\)", v or "")
                if n:
                    got.setdefault(m.group(1), {})[bp] = float(n.group(1))
        for k, v in got.items():
            if k in out and out[k] != v:
                clash.add(k)
            out[k] = v
    for k in clash:
        out.pop(k, None)
    with open(OUT, "w", encoding="utf8") as fh:
        json.dump(out, fh, indent=1, sort_keys=True)
        fh.write("\n")
    print(f"{len(out)} lists" + (f", {len(clash)} dropped for differing between pages" if clash else ""))


if __name__ == "__main__":
    main()
