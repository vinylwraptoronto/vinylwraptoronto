"""
Carry each top-level section's own outer margin, per breakpoint.

The extractor kept a section's padding, background and height but never its
margin, and the port's Section has nowhere to put one. Elementor templates use
it: every before/after page sits in section 153256c with 50px above and 50px
below it, so all of them ended 100px short, and the gap the original keeps
between the page and its footer was simply gone.

Read from the page's own per-element rules -- `margin`, `margin-top`,
`margin-bottom` on `.elementor-element-ID` itself, and a flex container's
`--margin-top` / `--margin-bottom` -- and only the vertical sides, which are
the only ones Elementor lets a top-level section set.

Writes src/data/section-css.json, `{ id: { "d"|"t"|"m": "margin-top:..;margin-bottom:.." } }`,
keyed by section id rather than written into each page: a template's section
id is the same on every page built from it, so one entry covers every post --
and posts render from D1, where page JSON is never read.

    python3 scripts/pull-section-margins.py --cache DIR
"""
import argparse, glob, importlib.util, json, os, re

OUT = "src/data/section-css.json"
_spec = importlib.util.spec_from_file_location(
    "layers", os.path.join(os.path.dirname(__file__), "pull-section-layers.py"))
layers = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(layers)

from lxml import html as lhtml


# Deliberate departures from the source CSS, re-applied on every regeneration so
# they cannot be lost. Keyed by section id -> breakpoint -> declarations.
#
# 5e6ea08 is the /contact/ H1 section. The source gives it 50px above and below
# at every width, which on a phone parks the dark form's submit button
# (.qform--dark > .qbtn) 1px above the fixed sticky-booking pill at 390x844 and
# lets the pill cover it at shorter viewports. Below 768px only, 28px above and
# 10px below lifts the button ~62px clear (40px target fully hit-testable at
# 390x844 and 412x915). The pill itself is global and left untouched; keyboard
# focus is kept clear of it by the 72px scroll-padding-bottom already on <html>.
# The margins only shift where the button sits; they cannot keep it clear of
# the pill at every viewport height, so the submit also carries `data-sb-avoid`
# (QuoteForm, dark tone) and StickyBar hides the pill while their rects overlap.
OVERRIDES = {
    "5e6ea08": {"m": "margin-bottom:10px;margin-top:28px"},
}


def apply_overrides(keep):
    for sid, bps in OVERRIDES.items():
        keep.setdefault(sid, {}).update(bps)
    return keep


def sides(v):
    p = v.split()
    if len(p) == 1:
        return p[0], p[0]
    if len(p) in (2, 3):
        return p[0], p[2] if len(p) == 3 else p[0]
    return p[0], p[2]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    a = ap.parse_args()
    out = {}
    for f in sorted(glob.glob(os.path.join(a.cache, "*.html"))):
        html = open(f, encoding="utf8", errors="replace").read()
        tree = lhtml.fromstring(html)
        # Top-level sections only: a direct child of an Elementor document.
        tops = set()
        for doc in tree.xpath('//*[@data-elementor-type]'):
            if doc.get("data-elementor-type") in ("header", "footer", "popup"):
                continue
            for el in doc:
                if isinstance(el.tag, str) and el.get("data-id"):
                    tops.add(el.get("data-id"))
        for media, sel, body in layers.rules(html):
            bp = layers.bp(media)
            if bp not in ("d", "t", "m"):
                continue
            for one in sel.split(","):
                m = re.search(r"\.elementor-element-(\w+)$", one.strip())
                if not m or m.group(1) not in tops:
                    continue
                top = bot = None
                v = layers.decl(body, "margin")
                if v:
                    top, bot = sides(v)
                top = layers.decl(body, "margin-top") or layers.decl(body, "--margin-top") or top
                bot = layers.decl(body, "margin-bottom") or layers.decl(body, "--margin-bottom") or bot
                slot = out.setdefault(m.group(1), {}).setdefault(bp, {})
                if top:
                    slot["margin-top"] = top
                if bot:
                    slot["margin-bottom"] = bot
    # Drop sections whose every margin is zero at every breakpoint: nothing to do.
    zero = lambda v: re.fullmatch(r"0(px|%|em)?", v.strip()) is not None
    keep = {k: {bp: ";".join(f"{p}:{v}" for p, v in sorted(d.items())) for bp, d in bps.items() if d}
            for k, bps in out.items()
            if any(not zero(v) for d in bps.values() for v in d.values())}
    apply_overrides(keep)
    with open(OUT, "w", encoding="utf8") as fh:
        json.dump(keep, fh, indent=1, sort_keys=True)
        fh.write("\n")
    print(f"{len(keep)} sections with a margin ({len(out)} declare one)")


if __name__ == "__main__":
    main()
