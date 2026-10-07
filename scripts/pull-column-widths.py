"""
Carry each column's width and padding at the tablet and mobile breakpoints.

The port kept one width per column -- the desktop one -- and stacked every
section column full width at 767px, which is Elementor's DEFAULT. A column that
sets its own mobile width keeps a share of the row on a phone instead, and the
site has them: the three vinyl-brand logos on /racing-stripes/ stay side by side
at 33.3% each, and stacking them made that one section 991px tall against the
original's 274. Columns change their padding per breakpoint too (5px on those
logos, against 10px on desktop).

Read from the page's own per-element rules:

  @media(max-width:1024px) .elementor-element-COL { width: X% }   -> tabletWidth
  @media(max-width:767px)  .elementor-element-COL { width: X% }   -> mobileWidth
  ... > .elementor-element-populated { padding }                   -> padT / padM
  (and a flex container's child: `--width` in the same rules)

The port's columns do not carry their Elementor id, so each is matched through
the first widget inside it: the column is that widget's nearest ancestor column
whose row has as many columns as the port's row does.

    python3 scripts/pull-column-widths.py --dry-run --cache DIR /racing-stripes/
"""
import argparse, glob, importlib.util, json, os, re, urllib.request

from lxml import html as lhtml

PAGES = "src/data/pages"
_spec = importlib.util.spec_from_file_location(
    "layers", os.path.join(os.path.dirname(__file__), "pull-section-layers.py"))
layers = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(layers)


def is_col(el):
    c = el.get("class", "")
    return "elementor-column" in c.split() or ("e-con" in c.split() and "e-child" in c.split())


def row_of(col):
    p = col.getparent()
    return p


def first_eid(blocks):
    for b in blocks:
        if b.get("eid"):
            return b["eid"]
        if b.get("type") == "columns":
            for c in b.get("cols", []):
                e = first_eid(c.get("blocks", []))
                if e:
                    return e
    return None


def css_rules(html):
    """{col id: {bp: {'width': %, 'pad': css}}} from the page's own rules."""
    out = {}
    for media, sel, body in layers.rules(html):
        b = layers.bp(media)
        if b not in ("d", "t", "m"):
            continue
        for part in sel.split(","):
            m = re.search(r"elementor-element-(\w+)(.*)$", part.strip())
            if not m:
                continue
            cid, rest = m.group(1), m.group(2).strip()
            slot = out.setdefault(cid, {}).setdefault(b, {})
            if rest == "":
                w = layers.decl(body, "width") or layers.decl(body, "--width")
                if w and w.endswith("%") and b != "d":
                    slot["width"] = float(w[:-1])
                # A flex container's child writes its padding side by side.
                sides = [layers.decl(body, f"--padding-{k}") for k in ("top", "right", "bottom", "left")]
                if any(sides):
                    slot["sides"] = sides
            elif rest in ("> .elementor-element-populated", "> .elementor-widget-wrap"):
                p = layers.decl(body, "padding")
                if p:
                    slot["pad"] = p
    return out


def walk_rows(doc):
    for s in doc.get("sections", []):
        stack = list(s.get("blocks", []))
        while stack:
            b = stack.pop(0)
            if b.get("type") == "columns":
                yield b
                for c in b.get("cols", []):
                    stack.extend(c.get("blocks", []))


def short(p):
    parts = p.split()
    if len(parts) == 4 and parts[0] == parts[2] and parts[1] == parts[3]:
        parts = parts[:2]
    if len(parts) == 2 and parts[0] == parts[1]:
        parts = parts[:1]
    return " ".join(parts)


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
        tree = lhtml.fromstring(html)
        by_id = {el.get("data-id"): el for el in tree.iter() if isinstance(el.tag, str) and el.get("data-id")}
        rules = css_rules(html)
        changed = []
        for row in walk_rows(doc):
            cols = row.get("cols", [])
            for c in cols:
                eid = first_eid(c.get("blocks", []))
                el = by_id.get(eid)
                if el is None:
                    continue
                col = None
                for anc in el.iterancestors():
                    if not isinstance(anc.tag, str) or not is_col(anc):
                        continue
                    siblings = [x for x in row_of(anc) if isinstance(x.tag, str) and is_col(x)]
                    if len(siblings) == len(cols):
                        col = anc
                        break
                if col is None:
                    continue
                got = rules.get(col.get("data-id"), {})
                # A flex child's own padding, merged side by side down the
                # breakpoints (a side a breakpoint does not restate inherits).
                prev = None
                for bp in ("d", "t", "m"):
                    sides = got.get(bp, {}).get("sides")
                    if sides:
                        base = prev or ["0px"] * 4
                        prev = [s or p for s, p in zip(sides, base)]
                        got.setdefault(bp, {})["pad"] = " ".join(prev)
                hide = sorted(set(re.findall(r"elementor-hidden-(desktop|tablet|mobile)", col.get("class", ""))))
                if hide and c.get("hide") != hide:
                    changed.append(f"{col.get('data-id')} hide {c.get('hide')!r} -> {hide!r}")
                    c["hide"] = hide
                dpad = got.get("d", {}).get("pad")
                if dpad and c.get("padding") != short(dpad):
                    changed.append(f"{col.get('data-id')} padding {c.get('padding')!r} -> {short(dpad)!r}")
                    c["padding"] = short(dpad)
                for bp, wkey, pkey in (("t", "tabletWidth", "padT"), ("m", "mobileWidth", "padM")):
                    slot = got.get(bp, {})
                    w = slot.get("width")
                    if w is not None and c.get(wkey) != w:
                        changed.append(f"{col.get('data-id')} {wkey} {c.get(wkey)!r} -> {w!r}")
                        c[wkey] = w
                    p = slot.get("pad")
                    if p and c.get(pkey) != short(p):
                        changed.append(f"{col.get('data-id')} {pkey} {c.get(pkey)!r} -> {short(p)!r}")
                        c[pkey] = short(p)
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
