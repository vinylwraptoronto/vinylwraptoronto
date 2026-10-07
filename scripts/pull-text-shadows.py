"""
Carry the original's text shadows into the page data.

The extractor kept a widget's colour, size, weight and case, and dropped its
`text-shadow` -- there is not one in the port's data, against 20 elements on the
original that set one. They are not decoration: every one is white type laid
over a photograph, and the shadow is what keeps it legible. The Cybertruck,
Model 3 and Model S heroes, both landing pages' headings and ticks, the anime
wraps hero and the thank-you banner all rendered flat white on the brightest
parts of their pictures.

Read from each page's own Elementor rules (Internal Embedding puts them in the
HTML), and written onto the block that renders the element:

  .elementor-element-ID .elementor-heading-title   -> the heading's `style`
  .elementor-element-ID .elementor-icon-list-text  -> the list's `itemStyle`
  .elementor-element-ID                            -> the block's `style`

The posts' H1 (cc1fcc1, on all 402 of them) is not here: posts render from D1,
and their template's rules live in Blocks.astro beside the offer price's.

    python3 scripts/pull-text-shadows.py --dry-run
    python3 scripts/pull-text-shadows.py
"""
import argparse, glob, json, os, re, urllib.request

PAGES = "src/data/pages"
STYLE = re.compile(r"<style[^>]*>(.*?)</style>", re.S)


def rules(html):
    """(media, selector, body) for every rule in the page's inline CSS."""
    css = "\n".join(STYLE.findall(html))
    out, i, media = [], 0, ""
    while True:
        j = css.find("{", i)
        if j < 0:
            break
        head = css[i:j].strip()
        while head.startswith("}"):
            media, head = "", head[1:].strip()
        if head.startswith("@media"):
            media, i = head, j + 1
            continue
        k = css.find("}", j)
        if k < 0:
            break
        out.append((media, head, css[j + 1:k]))
        i = k + 1
    return out


def blocks_of(doc):
    for s in doc.get("sections", []):
        for b in s.get("blocks", []):
            yield b
            if b.get("type") == "columns":
                for c in b.get("cols", []):
                    for bb in c.get("blocks", []):
                        yield bb


def add(style, decl):
    style = (style or "").rstrip(";")
    if "text-shadow" in style:
        return None
    return f"{style};{decl}" if style else decl


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="*", help="only these addresses (default: every page)")
    ap.add_argument("--cache", help="directory of cached production HTML, <slug>.html")
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
            except Exception as e:  # noqa: BLE001 -- report and carry on
                print(f"{doc['url']}: {e}")
                continue
        found = {}
        for media, sel, body in rules(html):
            if media or "text-shadow" not in body:
                continue  # none of the site's shadows are breakpoint-specific
            m = re.search(r"elementor-element-(\w+)((?:\s+\.[\w-]+)?)\s*$", sel.split(",")[-1].strip())
            v = re.search(r"text-shadow:([^;]+)", body)
            if m and v:
                found[m.group(1)] = (m.group(2).strip(), v.group(1).strip())
        changed = []
        for b in blocks_of(doc):
            hit = found.get(b.get("eid"))
            if not hit:
                continue
            inner, value = hit
            key = "itemStyle" if inner == ".elementor-icon-list-text" else "style"
            new = add(b.get(key), f"text-shadow:{value}")
            if new is None:
                continue
            b[key] = new
            changed.append(f"{b['eid']} {key} += text-shadow:{value}")
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
