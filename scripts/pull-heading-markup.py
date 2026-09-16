"""
Carry the headings whose text is markup rather than a plain line.

The same defect as the two-line buttons, in a different widget. Elementor
writes a heading's content as HTML, and where the client emphasised part of it
the port took the element's textContent and lost the emphasis:

    <h4>Colour change wraps start at <strong>$2,500 </strong>for select
        vehicles/finishes. Final pricing depends on size, curves, and coverage.

renders on the port as one unemphasised line. Every word is present, which is
why no text census ever flagged it -- what is gone is which words the page is
drawing attention to, and on this page those words are the price.

Only headings whose content actually contains a tag get `textHtml`; a plain
heading keeps `text` and renders exactly as before, so this touches nothing it
does not have to. `text` is left in place as well, because the table-of-contents
anchors are built from it.

Tags are restricted to inline emphasis. Anything else in a heading is either
the port's own concern (an <a> is already carried as `href`) or not safe to
pass through set:html.

    python3 scripts/pull-heading-markup.py --dry-run
    python3 scripts/pull-heading-markup.py
"""
import argparse, bisect, glob, html as htmllib, json, os, re, sys
from concurrent.futures import ThreadPoolExecutor

from scrapling.fetchers import Fetcher

OLD = "https://vinylwraptoronto.com"
PAGES = "src/data/pages"

# Inline emphasis only. A heading containing anything else is left alone rather
# than passed through set:html.
ALLOWED = re.compile(r"</?(strong|b|em|i|u|s|mark|sup|sub|br|span)\b[^>]*>", re.I)
ANY_TAG = re.compile(r"</?([a-zA-Z][\w-]*)\b[^>]*>")


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
    """Compare on words, so whitespace and entities do not decide a match."""
    s = htmllib.unescape(re.sub(r"<[^>]+>", "", s))
    s = s.replace(" ", " ").replace("’", "'").replace("‘", "'")
    s = s.replace("“", '"').replace("”", '"').replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", s).strip()


def headings(page_html):
    """{element id: inner markup} for every heading whose content has tags."""
    out = {}
    # Bind each heading to the NEAREST PRECEDING element id. Matching an id and
    # scanning forward instead picks up whichever ancestor came first -- these
    # ids nest several deep.
    ids = [(m.start(), m.group(1))
           for m in re.finditer(r"elementor-element-([0-9a-f]{6,8})\b", page_html)]
    starts = [p for p, _ in ids]
    for m in re.finditer(r"<(h[1-6]|p|div)([^>]*class=\"[^\"]*elementor-heading-title[^\"]*\"[^>]*)>(.*?)</\1>",
                         page_html, re.S):
        inner = re.sub(r"\s+", " ", m.group(3)).strip()
        if not ANY_TAG.search(inner):
            continue                      # a plain heading; `text` already holds it
        # every tag in it must be one we are willing to pass through
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
    found = []

    def walk(n):
        if isinstance(n, dict):
            if n.get("type") == "heading" and n.get("eid"):
                found.append(n)
            for v in n.values():
                walk(v)
        elif isinstance(n, list):
            for v in n:
                walk(v)

    walk(doc)
    if not found:
        return None
    page_html = fetch(page_url(slug))
    if page_html is None:
        return {"slug": slug, "error": "not fetched"}
    rich = headings(page_html)
    changed = []
    for h in found:
        got = rich.get(h["eid"])
        if not got:
            continue
        # The same words, or it is not the same heading.
        if norm(got) != norm(h.get("text", "")):
            continue
        if h.get("textHtml") == got:
            continue
        h["textHtml"] = got
        changed.append((h.get("text", "")[:44], got[:72]))
    if not changed:
        return None
    return {"slug": slug, "path": path, "doc": doc, "raw": raw, "changed": changed}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", nargs="*", help="slugs, for a scoped run")
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
    print(f"\n  {total} headings carrying markup, across {len(ok)} pages")
    for r in ok[:40]:
        print(f"    {r['slug']}")
        for was, now in r["changed"][:4]:
            print(f"        {was!r:46} -> {now!r}")
    if len(ok) > 40:
        print(f"    ... and {len(ok) - 40} more pages")
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
