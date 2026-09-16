"""
Harvest the button colours for every blog post from the original, keyed by slug
and element id, into a JSON map for apply-post-button-colours.mjs to write into
D1.

Two steps rather than one because the two halves need different tools: reaching
the old site needs scrapling, and D1 is reached by the same Node fetch the rest
of the build uses.

It is a separate script from pull-button-colours.py for a reason that is easy to
miss: src/data/pages holds an entry for every post, but those entries are the
SEED that was loaded into D1, not a render source. Posts are rendered from
src/data/posts.json, which is pulled from D1 on every build. Writing colours
into the seed files changes nothing on the site -- the first 402 buttons fixed
that way looked fixed in the data and rendered exactly as before.

    python3 scripts/pull-post-button-colours.py --out <file>
"""
import argparse, json, re, sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

from scrapling.fetchers import Fetcher

OLD = "https://vinylwraptoronto.com"
WANTED = ("background-color", "color", "border-color", "border-radius")


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


def shorthand(v):
    """`5px 5px 5px 5px` is one corner said four times; keep it as one value."""
    parts = v.split()
    return parts[0] if len(set(parts)) == 1 else v


def colours_for(styles, eid):
    rest, hover = {}, {}
    for m in re.finditer(r"([^{}]*elementor-element-" + eid + r"[^{}]*)\{([^}]*)\}", styles):
        sel, body = m.group(1), m.group(2)
        if ".elementor-button" not in sel or " svg" in sel:
            continue
        got = {}
        for d in re.finditer(r"([a-z-]+)\s*:\s*([^;]+)", body):
            prop, val = d.group(1).strip(), re.sub(r"\s+", " ", d.group(2)).strip()
            if prop in WANTED:
                got[prop] = val
        if not got:
            continue
        (hover if (":hover" in sel or ":focus" in sel) else rest).update(got)
    out = {}
    if rest.get("background-color"):
        out["bg"] = rest["background-color"]
    if rest.get("border-radius"):
        out["radius"] = shorthand(rest["border-radius"])
    if hover.get("background-color"):
        out["hoverBg"] = hover["background-color"]
    if hover.get("color"):
        out["hoverColor"] = hover["color"]
    if hover.get("border-color"):
        out["hoverBorder"] = hover["border-color"]
    return out


def do(item):
    slug, eids = item
    html = fetch(f"{OLD}/{slug}/")
    if html is None:
        return slug, None
    styles = "\n".join(re.findall(r"<style[^>]*>(.*?)</style>", html, re.S))
    return slug, {e: colours_for(styles, e) for e in eids}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wanted", required=True, help="JSON {slug: [eid, ...]} from the D1 side")
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=12)
    a = ap.parse_args()

    wanted = json.load(open(a.wanted, encoding="utf8"))
    print(f"harvesting {sum(len(v) for v in wanted.values())} buttons "
          f"across {len(wanted)} posts", file=sys.stderr)

    out, tally = {}, Counter()
    with ThreadPoolExecutor(a.workers) as ex:
        for i, (slug, got) in enumerate(ex.map(do, wanted.items()), 1):
            if got is None:
                tally["not fetched"] += 1
                continue
            found = {e: c for e, c in got.items() if c}
            tally["buttons resolved"] += len(found)
            tally["buttons with no rule"] += len(got) - len(found)
            if found:
                out[slug] = found
            if i % 50 == 0:
                print(f"  {i}/{len(wanted)}", file=sys.stderr)

    for k, v in tally.items():
        print(f"  {k:24} {v}")
    json.dump(out, open(a.out, "w", encoding="utf8"))
    print(f"written {a.out} — {len(out)} posts")


if __name__ == "__main__":
    main()
