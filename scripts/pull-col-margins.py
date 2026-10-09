"""
Carry each column's own vertical margin, per breakpoint.

Elementor puts a column's margin on its `.elementor-element-populated` box,
which the port's column is: /contact/'s form panel sits 30px below the copy
on a phone, its three feature tiles 5px apart on every side, and the
/locations-served/ pages' tiles the same. The extractor kept a column's
padding and dropped its margin. Only the vertical sides are carried: the
horizontal ones inset the box inside its column and change no heights.

A column has no id the port keeps, so each is keyed by the element id of
its first widget. The site footer's columns are skipped; the footer is its
own component.

Writes src/data/col-css.json, `{ firstWidgetId: { "d"|"t"|"m": [top, bottom] } }`.

    python3 scripts/pull-col-margins.py --cache DIR
"""
import argparse, glob, importlib.util, json, os, re

OUT = "src/data/col-css.json"
_spec = importlib.util.spec_from_file_location(
    "layers", os.path.join(os.path.dirname(__file__), "pull-section-layers.py"))
layers = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(layers)

from lxml import html as lhtml


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
        cols = {}
        for el in tree.xpath('//*[@data-element_type="column"]'):
            if el.xpath('ancestor::*[@data-elementor-type="header" or @data-elementor-type="footer" or @data-elementor-type="popup"]'):
                continue
            cols[el.get("data-id")] = el
        got = {}
        for media, sel, body in layers.rules(html):
            m = re.search(r"\.elementor-element-([0-9a-f]+) > \.elementor-element-populated$", sel.strip())
            if not m or m.group(1) not in cols:
                continue
            bp = layers.bp(media)
            v = layers.decl(body, "margin")
            if bp not in ("d", "t", "m") or not v:
                continue
            got.setdefault(m.group(1), {})[bp] = list(sides(v))
        for cid, per in got.items():
            if all(re.fullmatch(r"0(px)?", x) for v in per.values() for x in v):
                continue
            key = first_widget(cols[cid])
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
    print(f"{len(out)} columns" + (f", {len(clash)} dropped for differing between pages" if clash else ""))


if __name__ == "__main__":
    main()
