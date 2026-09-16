"""
Carry the icon-box titles whose text is markup rather than a plain line.

The fourth widget with this defect, after the two-line buttons, the headings
and the icon-list items. The site's warranty box is titled

    3 Year Warranty<sup>*</sup>

and the port took its textContent, so it renders "3 Year Warranty *" -- the
asterisk dropped to the baseline and a space appeared in front of it. It is a
footnote marker, and on the port it reads as part of the name.

WHAT COUNTS AS EMPHASIS matters more here than in the other three. Elementor
wraps every icon-box title in a bare `<span>`, so a test that accepts any tag
calls three quarters of the site's titles "markup" and rewrites them for
nothing. Only markup that changes how the words RENDER is carried: the inline
emphasis tags, or a span that actually carries a style or a class. With that
test, the whole site has one case, on the pages that show the warranty box.

    python3 scripts/pull-feature-markup.py --dry-run
    python3 scripts/pull-feature-markup.py
"""
import argparse, bisect, glob, html as htmllib, json, os, re, sys
from concurrent.futures import ThreadPoolExecutor

from scrapling.fetchers import Fetcher

OLD = "https://vinylwraptoronto.com"
PAGES = "src/data/pages"

# Markup that changes how the words render. A bare <span> is a wrapper.
REAL = re.compile(r"<(strong|b|em|i|u|s|mark|sup|sub|br)\b|<span\s+[^>]*(style|class)=", re.I)
ANY_TAG = re.compile(r"</?([a-zA-Z][\w-]*)\b[^>]*>")
ALLOWED = re.compile(r"</?(strong|b|em|i|u|s|mark|sup|sub|br|span)\b[^>]*>", re.I)
TITLE = re.compile(
    r'<(h[1-6]|span|p|div)[^>]*class="[^"]*elementor-icon-box-title[^"]*"[^>]*>(.*?)</\1>', re.S)


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
    s = htmllib.unescape(re.sub(r"<[^>]+>", "", s))
    s = (s.replace(" ", " ").replace("’", "'").replace("‘", "'")
          .replace("“", '"').replace("”", '"')
          .replace("–", "-").replace("—", "-"))
    # Whitespace-insensitive, because the spacing is the very thing that
    # differs: the original's "3 Year Warranty<sup>*</sup>" flattens to
    # "3 Year Warranty*" and the port stored "3 Year Warranty *". Comparing on
    # the letters is what lets the two bind to each other.
    return re.sub(r"\s+", "", s).strip().lower()


def titles(page_html):
    """{element id: inner markup} for icon-box titles carrying real emphasis."""
    out = {}
    ids = [(m.start(), m.group(1))
           for m in re.finditer(r"elementor-element-([0-9a-f]{6,8})\b", page_html)]
    starts = [p for p, _ in ids]
    for m in TITLE.finditer(page_html):
        inner = re.sub(r"\s+", " ", m.group(2)).strip()
        # Strip Elementor's own wrapper span before judging and before storing.
        inner = re.sub(r"^<span\s*>\s*", "", inner)
        inner = re.sub(r"\s*</span>$", "", inner)
        if not REAL.search(inner):
            continue
        if any(not ALLOWED.fullmatch(t.group(0)) for t in ANY_TAG.finditer(inner)):
            continue
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
    boxes = []

    def walk(n):
        if isinstance(n, dict):
            if n.get("type") == "feature" and n.get("eid"):
                boxes.append(n)
            for v in n.values():
                walk(v)
        elif isinstance(n, list):
            for v in n:
                walk(v)

    walk(doc)
    if not boxes:
        return None
    page_html = fetch(page_url(slug))
    if page_html is None:
        return {"slug": slug, "error": "not fetched"}
    rich = titles(page_html)
    changed = []
    for b in boxes:
        got = rich.get(b["eid"])
        if not got or norm(got) != norm(b.get("title", "")):
            continue
        if b.get("titleHtml") == got:
            continue
        b["titleHtml"] = got
        changed.append((b.get("title", "")[:36], got[:56]))
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
    print(f"\n  {total} icon-box titles carrying emphasis, across {len(ok)} pages")
    seen = {}
    for r in ok:
        for was, now in r["changed"]:
            seen.setdefault(now, 0)
            seen[now] += 1
    for now, n in sorted(seen.items(), key=lambda kv: -kv[1]):
        print(f"    {n:5}x  {now!r}")
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
