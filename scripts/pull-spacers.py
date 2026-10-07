"""
Record where the original's Gutenberg spacers sit in rich text.

A post or page body can carry `<div class="wp-block-spacer" style="height:Npx">`
between paragraphs and headings -- 83 of them across nine addresses, 15px to
50px each. The extractor dropped them, so every heading after one sat that
much higher, and /car-wrap-colours-avery-dennison-3m/ alone lost five.

The bodies of six of the nine are blog posts, whose content lives in D1 and is
not edited from here. So the spacers are recorded instead, per address, by the
element that follows each one -- its tag and the start of its text -- and
Blocks.astro puts them back in front of that element when it renders the body.

Writes src/data/spacers.json: { "/path/": [[tag, text, heightPx], ...] }.

    python3 scripts/pull-spacers.py --cache DIR
"""
import argparse, glob, json, os, re

from lxml import html as lhtml

OUT = "src/data/spacers.json"
PAGES = "src/data/pages"


def norm(s):
    return " ".join((s or "").split())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    a = ap.parse_args()
    paths = {}
    for f in glob.glob(f"{PAGES}/*.json"):
        d = json.load(open(f, encoding="utf8"))
        paths[os.path.basename(f)[:-5]] = "/" + d["slug"] + "/" if d["slug"] else "/"
    out = {}
    for f in sorted(glob.glob(os.path.join(a.cache, "*.html"))):
        name = os.path.basename(f)[:-5]
        if name not in paths:
            continue
        tree = lhtml.fromstring(open(f, encoding="utf8", errors="replace").read())
        rows = []
        for sp in tree.xpath('//div[contains(concat(" ", normalize-space(@class), " "), " wp-block-spacer ")]'):
            if sp.xpath('ancestor::*[@data-elementor-type="header" or @data-elementor-type="footer" or @data-elementor-type="popup"]'):
                continue
            m = re.search(r"height:\s*(\d+(?:\.\d+)?)px", sp.get("style") or "")
            nxt = sp.getnext()
            while nxt is not None and not isinstance(nxt.tag, str):
                nxt = nxt.getnext()
            if not m or nxt is None:
                continue
            text = norm(nxt.text_content())[:40]
            if not text:
                continue
            rows.append([nxt.tag, text, float(m.group(1))])
        if rows:
            out[paths[name]] = rows
    with open(OUT, "w", encoding="utf8") as fh:
        json.dump(out, fh, indent=1, ensure_ascii=False, sort_keys=True)
        fh.write("\n")
    print(f"{sum(len(v) for v in out.values())} spacers on {len(out)} addresses")


if __name__ == "__main__":
    main()
