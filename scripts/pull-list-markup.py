"""
Carry the icon-list items whose text is markup rather than a plain line.

The third widget with this defect, after the two-line buttons and the headings.
Elementor writes an icon-list item's text as HTML, and where the client
emphasised the lead-in the port took the element's textContent and lost it:

    <strong>Protects Original Paint</strong> - Shields against minor scratches

renders on the port as one unemphasised line. On /tesla-model-s-wraps/ that is
five list items in a row, each a benefit title followed by its explanation,
with nothing left to separate the two.

Every page checked carries at least two of these and the Tesla pages six or
seven, so it is worth a harvest rather than a hand fix.

Items are matched to the page data by their widget's element id and then by
their own normalised text, so an item that has moved within its list still
binds to itself and an item whose words differ is left alone.

Only items whose text actually contains a tag get `textHtml`; a plain item
keeps `text` and renders exactly as before. Tags are restricted to inline
emphasis -- an <a> is already carried as `href`, and anything else is not
passed through set:html.

    python3 scripts/pull-list-markup.py --dry-run
    python3 scripts/pull-list-markup.py
"""
import argparse, glob, html as htmllib, json, os, re, sys
from concurrent.futures import ThreadPoolExecutor

from scrapling.fetchers import Fetcher

OLD = "https://vinylwraptoronto.com"
PAGES = "src/data/pages"

ALLOWED = re.compile(r"</?(strong|b|em|i|u|s|mark|sup|sub|br|span)\b[^>]*>", re.I)
ANY_TAG = re.compile(r"</?([a-zA-Z][\w-]*)\b[^>]*>")
# An icon-list widget, then the items inside it, in document order.
WIDGET = re.compile(
    r'elementor-element-([0-9a-f]{6,8})[^>]*elementor-widget-icon-list(.*?)(?=elementor-widget-icon-list|\Z)',
    re.S)
ITEM = re.compile(r'<span class="elementor-icon-list-text"[^>]*>(.*?)</span>', re.S)


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


def norm(s):
    """Words only, so whitespace, entities and dash style do not decide a match."""
    s = htmllib.unescape(re.sub(r"<[^>]+>", "", s))
    s = (s.replace(" ", " ").replace("’", "'").replace("‘", "'")
          .replace("“", '"').replace("”", '"')
          .replace("–", "-").replace("—", "-"))
    return re.sub(r"\s+", " ", s).strip().lower()


def lists(page_html):
    """{widget id: {normalised text: inner markup}} for items carrying tags."""
    out = {}
    for m in WIDGET.finditer(page_html):
        eid, body = m.group(1), m.group(2)
        items = {}
        for it in ITEM.finditer(body):
            inner = re.sub(r"\s+", " ", it.group(1)).strip()
            if not ANY_TAG.search(inner):
                continue                       # plain; `text` already holds it
            if any(not ALLOWED.fullmatch(t.group(0)) for t in ANY_TAG.finditer(inner)):
                continue
            items[norm(inner)] = inner
        if items:
            out.setdefault(eid, {}).update(items)
    return out


def page_url(slug):
    if slug == "index":
        return f"{OLD}/"
    return f"{OLD}/{slug.replace('__', '/')}/"


def do(path):
    slug = os.path.basename(path)[:-5]
    raw = open(path, encoding="utf8").read()
    doc = json.loads(raw)
    blocks = []

    def walk(n):
        if isinstance(n, dict):
            if n.get("type") == "list" and n.get("eid") and n.get("items"):
                blocks.append(n)
            for v in n.values():
                walk(v)
        elif isinstance(n, list):
            for v in n:
                walk(v)

    walk(doc)
    if not blocks:
        return None
    page_html = fetch(page_url(slug))
    if page_html is None:
        return {"slug": slug, "error": "not fetched"}
    rich = lists(page_html)
    changed = []
    for blk in blocks:
        got = rich.get(blk["eid"])
        if not got:
            continue
        for item in blk["items"]:
            want = got.get(norm(item.get("text", "")))
            if not want or item.get("textHtml") == want:
                continue
            item["textHtml"] = want
            changed.append((item.get("text", "")[:40], want[:66]))
    if not changed:
        return None
    return {"slug": slug, "path": path, "doc": doc, "raw": raw, "changed": changed}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--workers", type=int, default=12)
    a = ap.parse_args()

    paths = sorted(glob.glob(f"{PAGES}/*.json"))
    if a.only:
        keep = set(a.only)
        paths = [p for p in paths if os.path.basename(p)[:-5] in keep]
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
    print(f"\n  {total} list items carrying emphasis, across {len(ok)} pages")
    for r in ok[:12]:
        print(f"    {r['slug']}")
        for was, now in r["changed"][:3]:
            print(f"        {was!r:42} -> {now!r}")
    if len(ok) > 12:
        print(f"    ... and {len(ok) - 12} more pages")
    bad = [r for r in results if r.get("error")]
    if bad:
        print(f"  not fetched: {len(bad)}")

    if a.dry_run:
        print("dry run — nothing written")
        return
    for r in ok:
        pretty = r["raw"].lstrip().startswith("{\n")
        out = (json.dumps(r["doc"], ensure_ascii=False, indent=1) if pretty
               else json.dumps(r["doc"], ensure_ascii=False, separators=(", ", ": ")))
        if r["raw"].endswith("\n"):
            out += "\n"
        open(r["path"], "w", encoding="utf8").write(out)
    print(f"written {len(ok)} page files")


if __name__ == "__main__":
    main()
