"""
Carry each image-box's layout from the original: where the image sits, how wide
it is per breakpoint, and the space between it and the text.

The port drew every image-box the same way -- picture on top, capped at 320px,
12px under it -- which is right for none of them exactly:

  - Three on /racing-stripes/ put the picture beside the text
    (`elementor-position-left` / `-right`), 30% wide, 15px off the copy and
    centred against it. Stacked, each section rendered 354px tall against
    the original's 221 at 1440.
  - The 37 top-positioned ones size the picture by their own `width: X%`
    rule, not by a fixed cap.

Elementor's own CSS for the widget (widget-image-box.min.css) is reproduced in
Blocks.astro; this carries the per-widget values it reads:

  class  elementor-position-{top,left,right}      -> imagePos
  class  elementor-vertical-align-{top,middle,bottom} -> vAlign
  .elementor-element-ID .elementor-image-box-wrapper .elementor-image-box-img
         { width }  per breakpoint                 -> imgW / imgWT / imgWM
  .elementor-element-ID.elementor-position-<pos> .elementor-image-box-img
         { margin-* } for the widget's own position -> imgGap

    python3 scripts/pull-image-box.py --dry-run --cache DIR
"""
import argparse, glob, importlib.util, json, os, re, urllib.request

PAGES = "src/data/pages"
_spec = importlib.util.spec_from_file_location(
    "layers", os.path.join(os.path.dirname(__file__), "pull-section-layers.py"))
layers = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(layers)
GAP_SIDE = {"left": "margin-right", "right": "margin-left", "top": "margin-bottom"}


def read(html):
    out = {}
    for m in re.finditer(r'class="([^"]*elementor-widget-image-box[^"]*)"\s+data-id="(\w+)"', html):
        cls, eid = m.groups()
        pos = re.search(r"elementor-position-(top|left|right)", cls)
        va = re.search(r"elementor-vertical-align-(top|middle|bottom)", cls)
        out[eid] = {"pos": pos.group(1) if pos else "top", "va": va.group(1) if va else None}
    for media, sel, body in layers.rules(html):
        b = layers.bp(media)
        if b is None:
            continue
        m = re.search(r"elementor-element-(\w+)(\S*)\s*(.*)$", sel.split(",")[-1].strip())
        if not m or m.group(1) not in out:
            continue
        eid, glued, rest = m.group(1), m.group(2), m.group(3).strip()
        slot = out[eid]
        if rest == ".elementor-image-box-wrapper .elementor-image-box-img":
            w = layers.decl(body, "width")
            if w:
                slot.setdefault("w", {})[b] = w
        elif rest == ".elementor-image-box-img" and b == "d" and glued == f".elementor-position-{slot['pos']}":
            g = layers.decl(body, GAP_SIDE[slot["pos"]])
            if g:
                slot["gap"] = g
    return out


def features(doc):
    for s in doc.get("sections", []):
        stack = list(s.get("blocks", []))
        while stack:
            b = stack.pop(0)
            if b.get("type") == "feature" and b.get("image"):
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
        if doc.get("kind") in ("post", "story") or not any(features(doc)):
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
        for b in features(doc):
            g = got.get(b.get("eid"))
            if not g:
                continue
            want = {"imagePos": g["pos"], "vAlign": g["va"],
                    "imgW": g.get("w", {}).get("d"), "imgWT": g.get("w", {}).get("t"),
                    "imgWM": g.get("w", {}).get("m"), "imgGap": g.get("gap")}
            for k, v in want.items():
                if v is not None and b.get(k) != v:
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
