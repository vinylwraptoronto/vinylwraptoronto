"""
Read every button's resting and hover colours off the original and write them
onto our own button blocks.

Elementor stores these per element, not as a site-wide rule: one page's navy
button goes green on hover while another's goes pink, and some buttons do not
rest navy at all. The port had a single `.btn:hover` for all 545 of them, so
every button that was not the common case was wrong -- and matching it to the
commonest case, as an earlier pass did, only moved which ones were wrong.

The site serves its per-element CSS inline (Elementor's "Internal Embedding"),
so each page carries its own rules in a <style> block in the head and there is
nothing to resolve across files. For each button element id the rules look like

    .elementor-<page> .elementor-element.elementor-element-<eid> .elementor-button
        { background-color: ...; ... }
    ... .elementor-element-<eid> .elementor-button:hover,
    ... .elementor-element-<eid> .elementor-button:focus
        { background-color: ...; color: ...; border-color: ...; }

The var(--e-global-color-*) references are kept as written rather than resolved
to hex: the port defines the same tokens, so carrying the reference keeps the
two in step if a colour is ever retuned in the kit.

    python3 scripts/pull-button-colours.py            # writes the JSON
    python3 scripts/pull-button-colours.py --dry-run  # reports, changes nothing
"""
import argparse, glob, json, os, re, sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

from scrapling.fetchers import Fetcher

OLD = "https://vinylwraptoronto.com"
PAGES = "src/data/pages"

# The three declarations worth carrying. Anything else about a button (its type,
# size, font) the port already has from its own style string.
WANTED = ("background-color", "color", "border-color")


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


def decls(block):
    """The declarations of one rule body, as a dict, values left verbatim."""
    out = {}
    for m in re.finditer(r"([a-z-]+)\s*:\s*([^;]+)", block):
        prop, val = m.group(1).strip(), re.sub(r"\s+", " ", m.group(2)).strip()
        if prop in WANTED:
            out[prop] = val
    return out


def colours_for(styles, eid):
    """Resting and hover colours for one button element id."""
    rest, hover = {}, {}
    for m in re.finditer(r"([^{}]*elementor-element-" + eid + r"[^{}]*)\{([^}]*)\}", styles):
        sel, body = m.group(1), m.group(2)
        if ".elementor-button" not in sel:
            continue
        # svg fill rules carry no colour we use, and would otherwise overwrite
        # the real ones with a fill value.
        if " svg" in sel:
            continue
        got = decls(body)
        if not got:
            continue
        if ":hover" in sel or ":focus" in sel:
            hover.update(got)
        else:
            rest.update(got)
    return rest, hover


def page_url(slug):
    # A nested address is stored with __ for the separator, so
    # locations-served__custom-decals-oakville is /locations-served/custom-decals-oakville/.
    if slug == "index":
        return f"{OLD}/"
    return f"{OLD}/{slug.replace('__', '/')}/"


def collect(path):
    """Every button block in one page file, with the node so it can be edited."""
    d = json.load(open(path, encoding="utf8"))
    found = []

    def walk(n):
        if isinstance(n, dict):
            if n.get("type") == "button" and n.get("eid"):
                found.append(n)
            for v in n.values():
                walk(v)
        elif isinstance(n, list):
            for v in n:
                walk(v)

    walk(d)
    return d, found


def do_page(path):
    slug = os.path.basename(path)[:-5]
    doc, buttons = collect(path)
    if not buttons:
        return None
    html = fetch(page_url(slug))
    if html is None:
        return {"slug": slug, "error": "not fetched", "n": len(buttons)}
    styles = "\n".join(re.findall(r"<style[^>]*>(.*?)</style>", html, re.S))
    changed, missing, combos = 0, 0, []
    for b in buttons:
        rest, hover = colours_for(styles, b["eid"])
        if not rest and not hover:
            missing += 1
            continue
        new = {}
        if rest.get("background-color"):
            new["bg"] = rest["background-color"]
        if hover.get("background-color"):
            new["hoverBg"] = hover["background-color"]
        if hover.get("color"):
            new["hoverColor"] = hover["color"]
        if hover.get("border-color"):
            new["hoverBorder"] = hover["border-color"]
        if any(b.get(k) != v for k, v in new.items()):
            changed += 1
        combos.append(f"{new.get('bg', '-')}  ->  {new.get('hoverBg', '-')}")
        b.update(new)
    return {"slug": slug, "path": path, "doc": doc, "n": len(buttons),
            "changed": changed, "missing": missing, "combos": combos}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--workers", type=int, default=12)
    a = ap.parse_args()

    paths = sorted(glob.glob(f"{PAGES}/*.json"))
    todo = [p for p in paths if collect(p)[1]]
    print(f"{len(todo)} pages carry buttons", file=sys.stderr)

    results, tally, combos = [], Counter(), Counter()
    with ThreadPoolExecutor(a.workers) as ex:
        for i, r in enumerate(ex.map(do_page, todo), 1):
            if r is None:
                continue
            results.append(r)
            if r.get("error"):
                tally["fetch failed"] += 1
            else:
                tally["buttons"] += r["n"]
                tally["changed"] += r["changed"]
                tally["no rule found"] += r["missing"]
                combos.update(r.get("combos", []))
            if i % 50 == 0:
                print(f"  {i}/{len(todo)}", file=sys.stderr)

    for k, v in tally.items():
        print(f"  {k:16} {v}")
    print("\n  distinct rest -> hover combinations:")
    for c, n in combos.most_common(20):
        print(f"    {n:5}x  {c}")
    bad = [r["slug"] for r in results if r.get("error")]
    if bad:
        print(f"  not fetched: {', '.join(bad[:10])}{' ...' if len(bad) > 10 else ''}")

    if a.dry_run:
        print("dry run — nothing written")
        return
    for r in results:
        if r.get("error"):
            continue
        raw = open(r["path"], encoding="utf8").read()
        # Keep each file's own shape. Most are minified on one line, but a
        # couple are pretty-printed at one space, and rewriting those minified
        # buries a two-value change under a 1,500-line diff.
        pretty = raw.lstrip().startswith("{\n")
        if pretty:
            out = json.dumps(r["doc"], ensure_ascii=False, indent=1)
        else:
            out = json.dumps(r["doc"], ensure_ascii=False, separators=(",", ":"))
        if raw.endswith("\n"):
            out += "\n"
        open(r["path"], "w", encoding="utf8").write(out)
    print(f"written {len([r for r in results if not r.get('error')])} page files")


if __name__ == "__main__":
    main()
