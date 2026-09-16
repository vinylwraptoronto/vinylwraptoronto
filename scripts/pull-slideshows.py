"""
Carry the background slideshows the port dropped.

Fifteen sections across the site have `background_background: "slideshow"` --
an Elementor background slideshow, four of them with a Ken Burns zoom. None of
it is in a stylesheet: Elementor writes the image list and the timings into the
section's `data-settings` attribute as JSON, and the port read only CSS. So it
took the section's background COLOUR and nothing else, and every one of those
heroes renders as a flat panel where the original cycles photographs. This is
the failure the clone procedure names in as many words -- "a port that reads
only CSS ships the static half of a moving thing".

The element carrying the settings has the same id as the section in our own
page data, so the two map without guessing.

Image URLs are rewritten to the image host, because nothing the port serves may
reference the old origin.

    python3 scripts/pull-slideshows.py --dry-run
    python3 scripts/pull-slideshows.py
"""
import argparse, glob, html as htmllib, json, os, re, sys
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


def localise(url):
    """The upload path, kept whole.

    The prefix stays on: `img()` rewrites onto the image host only for paths
    that begin `/wp-content/uploads/`, and drops everything else through
    untouched. Stripping it here produced `/2026/03/Truck-Wrap.webp`, which
    resolved against the site's own origin -- so the slideshow ran correctly
    behind the hero with four images that all 404ed, and the section looked
    exactly as black as it had before.
    """
    m = re.search(r"(/wp-content/uploads/.+)$", url)
    return m.group(1) if m else url


def slideshows(page_html):
    """{section id: slideshow} for every section on the page that has one."""
    out = {}
    for m in re.finditer(r"<\w+([^>]*data-settings=\"[^\"]*\"[^>]*)>", page_html):
        attrs = m.group(1)
        ds = re.search(r'data-settings="([^"]*)"', attrs)
        did = re.search(r'data-id="([^"]+)"', attrs)
        if not ds or not did:
            continue
        try:
            blob = json.loads(htmllib.unescape(ds.group(1)))
        except Exception:
            continue
        if not isinstance(blob, dict) or blob.get("background_background") != "slideshow":
            continue
        gallery = [g.get("url") for g in blob.get("background_slideshow_gallery") or [] if g.get("url")]
        if not gallery:
            continue
        out[did.group(1)] = {
            "images": [localise(u) for u in gallery],
            # Elementor's own names, kept so the values stay traceable to the
            # settings they came from.
            "duration": blob.get("background_slideshow_slide_duration", 5000),
            "transition": blob.get("background_slideshow_slide_transition", "fade"),
            "transitionMs": blob.get("background_slideshow_transition_duration", 500),
            "loop": blob.get("background_slideshow_loop", "yes") == "yes",
            "kenBurns": blob.get("background_slideshow_ken_burns") == "yes",
            "zoom": blob.get("background_slideshow_ken_burns_zoom_direction", "in"),
        }
    return out


def page_url(slug):
    if slug == "index":
        return f"{OLD}/"
    return f"{OLD}/{slug.replace('__', '/')}/"


def do(path):
    slug = os.path.basename(path)[:-5]
    raw = open(path, encoding="utf8").read()
    doc = json.loads(raw)
    ids = {s.get("id") for s in doc.get("sections", []) if s.get("id")}
    if not ids:
        return None
    page_html = fetch(page_url(slug))
    if page_html is None:
        return {"slug": slug, "error": "not fetched"}
    found = slideshows(page_html)
    hit = {k: v for k, v in found.items() if k in ids}
    if not found:
        return None
    changed = 0
    for s in doc.get("sections", []):
        want = hit.get(s.get("id"))
        if want and s.get("slideshow") != want:
            s["slideshow"] = want
            changed += 1
    return {"slug": slug, "path": path, "doc": doc, "raw": raw,
            "found": len(found), "matched": len(hit), "changed": changed,
            "unmatched": sorted(set(found) - ids)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--workers", type=int, default=10)
    a = ap.parse_args()

    paths = sorted(glob.glob(f"{PAGES}/*.json"))
    print(f"scanning {len(paths)} page files", file=sys.stderr)
    results = []
    with ThreadPoolExecutor(a.workers) as ex:
        for i, r in enumerate(ex.map(do, paths), 1):
            if r:
                results.append(r)
            if i % 100 == 0:
                print(f"  {i}/{len(paths)}", file=sys.stderr)

    ok = [r for r in results if not r.get("error")]
    print(f"\n  pages with a slideshow ... {len(ok)}")
    for r in ok:
        note = f"  (section ids not in our data: {', '.join(r['unmatched'])})" if r["unmatched"] else ""
        print(f"    {r['slug']:46} found {r['found']}  matched {r['matched']}  set {r['changed']}{note}")
    bad = [r for r in results if r.get("error")]
    if bad:
        print(f"  not fetched: {', '.join(r['slug'] for r in bad)}")

    if a.dry_run:
        print("dry run — nothing written")
        return
    n = 0
    for r in ok:
        if not r["changed"]:
            continue
        pretty = r["raw"].lstrip().startswith("{\n")
        out = (json.dumps(r["doc"], ensure_ascii=False, indent=1) if pretty
               else json.dumps(r["doc"], ensure_ascii=False, separators=(",", ":")))
        if r["raw"].endswith("\n"):
            out += "\n"
        open(r["path"], "w", encoding="utf8").write(out)
        n += 1
    print(f"written {n} page files")


if __name__ == "__main__":
    main()
