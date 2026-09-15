"""
Phase 0 of the Elementor clone: survey the whole old site before porting any of it.

Reads, for every address on the old site: the Elementor document type, every
widget type it uses, the element ids that carry per-element rules, the JSON in
each section's data-settings, and the stylesheets the page loads -- including
whether its own per-page sheet actually resolves.

That last one is the reason this runs over every page rather than a sample. A
per-page CSS file returning 404 means that page is rendering unstyled on the live
site, so there is nothing to port; the page can only be inferred, and an inferred
page must never be presented as a port. Found now it changes the plan. Found
mid-port, the pages built against it were already guesses.

Widget types, element ids and data-settings are all in the served HTML, so this
half needs no browser and runs over the whole site cheaply. Computed styles and
screenshots need a real browser and are a separate, smaller pass.

    python3 scripts/dossier.py --urls paths.txt --out _research/pages.jsonl
"""
import argparse, html as htmllib, json, re, sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlsplit

from scrapling.fetchers import Fetcher

OLD = "https://vinylwraptoronto.com"


def fetch(url, tries=3):
    for _ in range(tries):
        try:
            r = Fetcher.get(url, timeout=60, stealthy_headers=True)
            if r.status == 200:
                b = r.body
                return b if isinstance(b, str) else b.decode("utf8", "replace")
            if r.status == 404:
                return None
        except Exception:
            pass
    return None


def survey(path):
    doc = fetch(OLD + path)
    if doc is None:
        return {"path": path, "error": "not fetched"}

    # --- what kind of Elementor document this is ---
    kinds = sorted(set(re.findall(r'data-elementor-type="([^"]+)"', doc)))

    # --- the widget census: the build list ---
    widgets = sorted(set(re.findall(r'data-widget_type="([^".]+)', doc)))

    # --- element ids that carry per-element rules ---
    eids = sorted(set(re.findall(r'elementor-element-([0-9a-f]{6,8})\b', doc)))

    # --- data-settings: animations, sticky, slideshows, shape dividers.
    #     None of this is in a stylesheet, and a port that reads only CSS ships
    #     the static half of a moving thing. ---
    settings_keys = Counter()
    for m in re.finditer(r'data-settings="([^"]*)"', doc):
        try:
            blob = json.loads(htmllib.unescape(m.group(1)))
        except Exception:
            continue
        if isinstance(blob, dict):
            settings_keys.update(blob.keys())

    # --- stylesheets, and which one is this page's own ---
    sheets = [urljoin(OLD + path, h) for h in
              re.findall(r'<link[^>]+rel=["\']stylesheet["\'][^>]*href=["\']([^"\']+)', doc, re.I)]
    sheets += [urljoin(OLD + path, h) for h in
               re.findall(r'<link[^>]+href=["\']([^"\']+)["\'][^>]*rel=["\']stylesheet', doc, re.I)]
    sheets = sorted(set(sheets))
    own = [s for s in sheets if re.search(r"/elementor/css/post-\d+\.css", s)]

    # --- template id, which is what groups pages into families ---
    body_classes = re.search(r"<body[^>]*class=\"([^\"]*)\"", doc)
    tpl = sorted(set(re.findall(r"elementor-page-(\d+)", doc)))

    return {
        "path": path,
        "kinds": kinds,
        "widgets": widgets,
        "eid_count": len(eids),
        "settings_keys": dict(settings_keys.most_common()),
        "sheets": len(sheets),
        "own_css": own,
        "elementor_page_ids": tpl,
        "body_class": (body_classes.group(1)[:200] if body_classes else ""),
        "bytes": len(doc),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--urls", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=12)
    a = ap.parse_args()

    paths = [l.strip() for l in open(a.urls) if l.strip()]
    import os
    done = set()
    if os.path.exists(a.out):
        for line in open(a.out):
            try:
                done.add(json.loads(line)["path"])
            except Exception:
                pass
    todo = [p for p in paths if p not in done]
    print(f"surveying {len(todo)} addresses ({len(done)} already done)", file=sys.stderr)

    with open(a.out, "a") as fh, ThreadPoolExecutor(a.workers) as ex:
        for i, rec in enumerate(ex.map(survey, todo), 1):
            fh.write(json.dumps(rec) + "\n")
            fh.flush()
            if i % 50 == 0:
                print(f"  {i}/{len(todo)}", file=sys.stderr)
    print("done", file=sys.stderr)


if __name__ == "__main__":
    main()
