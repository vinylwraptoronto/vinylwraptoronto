"""
Carry each button's own padding, per breakpoint, from the original.

Elementor's default button padding is 12px 24px and the port draws every button
with it. Twelve page buttons set their own -- the Cybertruck hero's CTA and the
landing pages' are 8px 15px or 8px 20px, two on /tesla-vinyl-wraps/ drop to
8px 10px on a phone -- and the default made each of them 18-30px wider and 8px
taller than the original's, which on a bottom-aligned hero moves the headline
above it by the same amount.

Read from the page's own `.elementor-element-ID .elementor-button` rules.
Writes `pad`, `padT` and `padM` onto the button block, only where they differ.
The posts' button (e4d3235) is set in Blocks.astro: posts render from D1.

    python3 scripts/pull-button-padding.py --dry-run --cache DIR /lp/ /cybertruck-wraps/
"""
import argparse, glob, importlib.util, json, os, re, urllib.request

PAGES = "src/data/pages"
_spec = importlib.util.spec_from_file_location(
    "layers", os.path.join(os.path.dirname(__file__), "pull-section-layers.py"))
layers = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(layers)
KEY = {"d": "pad", "t": "padT", "m": "padM"}


def norm(v):
    """`08px 15px 08px 15px` as the shortest equivalent: `8px 15px`."""
    parts = [re.sub(r"^0+(\d)", r"\1", p) for p in v.split()]
    if len(parts) == 4 and parts[0] == parts[2] and parts[1] == parts[3]:
        parts = parts[:2]
    if len(parts) == 2 and parts[0] == parts[1]:
        parts = parts[:1]
    return " ".join(parts)


def read(html):
    out = {}
    for media, sel, body in layers.rules(html):
        b = layers.bp(media)
        if b is None or not sel.endswith(".elementor-button"):
            continue
        m = re.search(r"elementor-element-(\w+)", sel)
        v = layers.decl(body, "padding")
        if m and v:
            out.setdefault(m.group(1), {})[b] = norm(v)
    return out


def buttons(doc):
    for s in doc.get("sections", []):
        for b in s.get("blocks", []):
            if b.get("type") == "button":
                yield b
            if b.get("type") == "columns":
                for c in b.get("cols", []):
                    for bb in c.get("blocks", []):
                        if bb.get("type") == "button":
                            yield bb


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
        if doc.get("kind") in ("post", "story"):
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
        for b in buttons(doc):
            for bp, v in got.get(b.get("eid"), {}).items():
                k = KEY[bp]
                if b.get(k) != v:
                    changed.append(f"{b['eid']} {k} {b.get(k)!r} -> {v!r}")
                    b[k] = v
        if not changed:
            continue
        total += len(changed)
        print(f"/{doc['slug']}/: {len(changed)}")
        for c in changed:
            print("   ", c)
        if a.dry_run:
            continue
        pretty = raw.lstrip().startswith("{\n")
        out = (json.dumps(doc, ensure_ascii=False, indent=1) if pretty
               else json.dumps(doc, ensure_ascii=False, separators=(", ", ": ")))
        open(f, "w", encoding="utf8").write(out + ("\n" if raw.endswith("\n") else ""))
    print(f"\n{total} {'found' if a.dry_run else 'written'}")


if __name__ == "__main__":
    main()
