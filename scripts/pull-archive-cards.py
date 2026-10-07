"""
Bring a FILTERED posts widget's card list up to the original's.

Most posts widgets on the site list one topic's posts -- a category archive, a
service page's own work -- and are rendered as captured, not recomputed (see
LIVE_LOOPS in Blocks.astro for the three that list the newest posts instead).
A capture is a snapshot: /blogs/ai-to-print/ was taken with five posts, and
the original now lists six, the newest of them a post this site already
serves at its own address and links from nowhere in that topic.

Reads each such widget's cards off the original, in its order. A card the
port already has is kept as it is; a new one is built from the original's own
article -- title, link, image, badge, author, date, read-more label -- in the
shape the extractor wrote. Only widgets whose every listed post exists on this
site are touched, so no card ever links to an address the build does not have.

    python3 scripts/pull-archive-cards.py --cache DIR [--dry-run]
"""
import argparse, glob, json, os, re

from lxml import html as lhtml

PAGES = "src/data/pages"
LIVE = {"100f1ef", "d09f711", "31cc265a", "7b1f0d7f"}
ORIGIN = "https://vinylwraptoronto.com"


def local(u):
    return u.replace(ORIGIN, "") if u else u


def text(el, xp):
    got = el.xpath(xp)
    return " ".join(got[0].text_content().split()) if got else None


def card_of(art):
    a = art.xpath('.//*[contains(@class,"elementor-post__title")]//a')[0]
    img = art.xpath(".//img")
    more = text(art, './/*[contains(@class,"elementor-post__read-more")]')
    return {
        "title": " ".join(a.text_content().split()),
        "href": local(a.get("href")),
        "image": local(img[0].get("src")) if img else None,
        "badge": text(art, './/*[contains(@class,"elementor-post__badge")]'),
        "alt": img[0].get("alt") if img else None,
        "author": text(art, './/*[contains(@class,"elementor-post-author")]'),
        "date": text(art, './/*[contains(@class,"elementor-post-date")]'),
        **({"more": more} if more else {}),
    }


def served():
    """Every address this build serves, as /slug/."""
    out = set()
    for f in glob.glob(f"{PAGES}/*.json"):
        s = json.load(open(f, encoding="utf8"))["slug"]
        out.add(f"/{s}/" if s else "/")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    have = served()
    total = 0
    for f in sorted(glob.glob(f"{PAGES}/*.json")):
        cached = os.path.join(a.cache, os.path.basename(f)[:-5] + ".html")
        if not os.path.exists(cached):
            continue
        raw = open(f, encoding="utf8").read()
        doc = json.loads(raw)
        if doc.get("kind") in ("post", "story"):
            continue
        tree = None
        changed = []

        def walk(blocks):
            nonlocal tree
            for b in blocks:
                if b.get("type") == "cards" and not b.get("stacked") and b.get("eid") and b["eid"] not in LIVE:
                    if tree is None:
                        tree = lhtml.fromstring(open(cached, encoding="utf8", errors="replace").read())
                    w = tree.xpath(f'//*[@data-id="{b["eid"]}"]')
                    if not w:
                        continue
                    arts = w[0].xpath('.//article[contains(@class,"elementor-post")]')
                    real = [card_of(x) for x in arts]
                    if not real or [c["href"] for c in real] == [c["href"] for c in b["cards"]]:
                        continue
                    missing = [c["href"] for c in real if c["href"] not in have]
                    if missing:
                        print(f"/{doc['slug']}/ {b['eid']}: skipped, not served here: {missing}")
                        continue
                    mine = {c["href"]: c for c in b["cards"]}
                    new = [c["href"] for c in real if c["href"] not in mine]
                    b["cards"] = [mine.get(c["href"], c) for c in real]
                    changed.append(f"{b['eid']}: {len(mine)} -> {len(real)} cards, new {new}")
                if b.get("type") == "columns":
                    for c in b.get("cols", []):
                        walk(c.get("blocks", []))

        for s in doc.get("sections", []):
            walk(s.get("blocks", []))
        if not changed:
            continue
        total += len(changed)
        print(f"/{doc['slug']}/:", *changed, sep="\n    ")
        if a.dry_run:
            continue
        pretty = raw.lstrip().startswith("{\n")
        out = (json.dumps(doc, ensure_ascii=False, indent=1) if pretty
               else json.dumps(doc, ensure_ascii=False, separators=(", ", ": ")))
        open(f, "w", encoding="utf8").write(out + ("\n" if raw.endswith("\n") else ""))
    print(f"\n{total} {'found' if a.dry_run else 'written'}")


if __name__ == "__main__":
    main()
