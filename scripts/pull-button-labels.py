"""
Carry the buttons whose label is markup rather than a line of text.

A handful of the site's buttons stack two lines -- a small caption over the
phone number -- which Elementor writes as

    <span style="font-size:12px">Price My Truck Decals</span><br>416-746-1381

The port took the element's textContent, so it rendered one full-size line
reading "Price My Truck Decals 416-746-1381". The words were all there, which
is why a text census never flagged it; the shape was gone.

Only labels that actually contain markup get `textHtml`. A plain label keeps
`text` and renders exactly as before, so this touches nothing it does not have
to.

    python3 scripts/pull-button-labels.py --dry-run
    python3 scripts/pull-button-labels.py
"""
import argparse, bisect, glob, json, os, re, sys
from concurrent.futures import ThreadPoolExecutor

from scrapling.fetchers import Fetcher

OLD = "https://vinylwraptoronto.com"
PAGES = "src/data/pages"


def fetch(url, tries=3):
    for _ in range(tries):
        try:
            r = Fetcher.get(url, timeout=60, stealthy_headers=True)
            if r.status == 200:
                b = r.body
                return b if isinstance(b, str) else b.decode("utf8", "replace")
            if r.status in (404, 410):
                return None
        except Exception:
            pass
    return None


def labels(page_html):
    """{element id: label markup} for every button whose label carries tags."""
    out = {}
    # Bind each button to the NEAREST PRECEDING element id. Matching an id and
    # then scanning forward for a button instead picks up whichever ancestor
    # happened to come first -- these ids nest several deep, so that found four
    # of the site's buttons and attributed them to the wrong elements.
    ids = [(m.start(), m.group(1))
           for m in re.finditer(r"elementor-element-([0-9a-f]{6,8})\b", page_html)]
    starts = [p for p, _ in ids]
    for m in re.finditer(r'<span class="elementor-button-text">(.*?)</span>\s*</span>',
                         page_html, re.S):
        inner = re.sub(r"\s+", " ", m.group(1)).strip()
        if not re.search(r"<\w+", inner):
            continue          # a plain label; `text` already holds it
        i = bisect.bisect_left(starts, m.start()) - 1
        if i < 0:
            continue
        out.setdefault(ids[i][1], inner)
    return out


def page_url(slug):
    if slug == "index":
        return f"{OLD}/"
    return f"{OLD}/{slug.replace('__', '/')}/"


def do(path):
    slug = os.path.basename(path)[:-5]
    raw = open(path, encoding="utf8").read()
    doc = json.loads(raw)
    buttons = []

    def walk(n):
        if isinstance(n, dict):
            if n.get("type") == "button" and n.get("eid"):
                buttons.append(n)
            for v in n.values():
                walk(v)
        elif isinstance(n, list):
            for v in n:
                walk(v)

    walk(doc)
    if not buttons:
        return None
    page_html = fetch(page_url(slug))
    if page_html is None:
        return {"slug": slug, "error": "not fetched"}
    rich = labels(page_html)
    changed = []
    for b in buttons:
        got = rich.get(b["eid"])
        if got and b.get("textHtml") != got:
            b["textHtml"] = got
            changed.append((b.get("text", "")[:34], got[:60]))
    if not changed:
        return None
    return {"slug": slug, "path": path, "doc": doc, "raw": raw, "changed": changed}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--workers", type=int, default=12)
    a = ap.parse_args()

    paths = sorted(glob.glob(f"{PAGES}/*.json"))
    print(f"scanning {len(paths)} page files", file=sys.stderr)
    results = []
    with ThreadPoolExecutor(a.workers) as ex:
        for i, r in enumerate(ex.map(do, paths), 1):
            if r:
                results.append(r)
            if i % 200 == 0:
                print(f"  {i}/{len(paths)}", file=sys.stderr)

    ok = [r for r in results if not r.get("error")]
    total = sum(len(r["changed"]) for r in ok)
    print(f"\n  {total} buttons with a markup label, across {len(ok)} pages")
    for r in ok:
        print(f"    {r['slug']}")
        for was, now in r["changed"]:
            print(f"        {was!r:38} -> {now!r}")
    bad = [r for r in results if r.get("error")]
    if bad:
        print(f"  not fetched: {', '.join(r['slug'] for r in bad)}")

    if a.dry_run:
        print("dry run — nothing written")
        return
    for r in ok:
        pretty = r["raw"].lstrip().startswith("{\n")
        out = (json.dumps(r["doc"], ensure_ascii=False, indent=1) if pretty
               else json.dumps(r["doc"], ensure_ascii=False, separators=(",", ":")))
        if r["raw"].endswith("\n"):
            out += "\n"
        open(r["path"], "w", encoding="utf8").write(out)
    print(f"written {len(ok)} page files")


if __name__ == "__main__":
    main()
