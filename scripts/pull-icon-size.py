"""
Carry each icon box's own icon size, per breakpoint.

Elementor draws an icon box's icon at 50px on a 1 line height unless the
widget sets a size:

    .elementor-element-ID .elementor-icon { font-size: 35px }

The port drew every one at 28px on a 42px line. /tesla-model-3-wraps/'s
feature tiles, which set nothing, came out 8px short each. 18 of the site's
88 icon boxes set their own size, at 30, 35 or 40px; the renderer falls
back to Elementor's 50px for the rest.

Writes src/data/icon-size.json, `{ id: { "d"|"t"|"m": "35px" } }`.

    python3 scripts/pull-icon-size.py --cache DIR
"""
import argparse, glob, importlib.util, json, os, re

OUT = "src/data/icon-size.json"
_spec = importlib.util.spec_from_file_location(
    "layers", os.path.join(os.path.dirname(__file__), "pull-section-layers.py"))
layers = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(layers)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    a = ap.parse_args()
    out, clash = {}, set()
    for f in sorted(glob.glob(os.path.join(a.cache, "*.html"))):
        html = open(f, encoding="utf8", errors="replace").read()
        ids = set(re.findall(r'data-id="([0-9a-f]+)"[^>]*data-widget_type="icon-box\.default"', html))
        got = {}
        for media, sel, body in layers.rules(html):
            bp = layers.bp(media)
            if bp not in ("d", "t", "m"):
                continue
            for part in sel.split(","):
                m = re.search(r"\.elementor-element-([0-9a-f]+) \.elementor-icon$", part.strip())
                if m and m.group(1) in ids:
                    v = layers.decl(body, "font-size")
                    if v:
                        got.setdefault(m.group(1), {})[bp] = v.strip()
        for k, v in got.items():
            if k in out and out[k] != v:
                clash.add(k)
            out[k] = v
    for k in clash:
        out.pop(k, None)
    with open(OUT, "w", encoding="utf8") as fh:
        json.dump(out, fh, indent=1, sort_keys=True)
        fh.write("\n")
    print(f"{len(out)} icon boxes" + (f", {len(clash)} dropped for differing between pages" if clash else ""))


if __name__ == "__main__":
    main()
