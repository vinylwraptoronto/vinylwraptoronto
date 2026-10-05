"""
Carry each section's tablet and mobile minimum height from the original.

The port took one `minHeight` per section -- the desktop value -- and applied
it at every width. Elementor sets it per breakpoint, and the photo banners
that open most service pages drop sharply on the way down. Measured on
/jeep-and-suv-partial-wraps-in-toronto/, section 3122b57:

    desktop 650px    tablet (<=1024) 320px    mobile (<=767) 155px

At 390 the port drew that banner 650px tall with `background-size: cover`, so
a landscape photograph of a Jeep was cropped to a tall sliver of its middle.

Reads the page's own inline Elementor CSS (CSS Print Method = Internal
Embedding, see README), not the rendered page: a min-height is declared, not
computed from content, so the declaration is the value. Both forms are read --
`> .elementor-container{min-height:…}` on a classic section and
`{--min-height:…}` on a flex container.

Elementor inherits upwards: a tablet value left unset is the desktop one, and
an unset mobile value is the tablet one. Only values the original actually
declares are written, and the renderer resolves the inheritance.

Writes `minHeightTablet` and `minHeightMobile` into the page data, only for
sections that already carry a `minHeight`.

    python3 scripts/pull-section-heights.py --dry-run
    python3 scripts/pull-section-heights.py
"""
import argparse, glob, json, re, subprocess, sys, time

PAGES = "src/data/pages"


def fetch(url):
    """curl, not urllib: curl reads the session's CA configuration as-is."""
    for attempt in range(3):
        r = subprocess.run(
            ["curl", "-sS", "-m", "30", "-A", "Mozilla/5.0", "-w", "\n%{http_code}", url],
            capture_output=True,
        )
        body, _, code = r.stdout.decode("utf-8", "ignore").rpartition("\n")
        if code == "200":
            return body
        # 429/5xx are "unknown", not "missing": back off and try again.
        if code in ("429", "500", "502", "503", "504") and attempt < 2:
            time.sleep(4 * (attempt + 1))
            continue
        raise RuntimeError(f"{url}: HTTP {code or r.stderr.decode().strip()}")


def blocks(css):
    """Yield (media-condition or None, rule body text) for every top-level rule."""
    i, n = 0, len(css)
    while i < n:
        open_ = css.find("{", i)
        if open_ < 0:
            return
        head = css[i:open_].strip()
        depth, j = 1, open_ + 1
        while j < n and depth:
            depth += {"{": 1, "}": -1}.get(css[j], 0)
            j += 1
        inner = css[open_ + 1 : j - 1]
        if head.startswith("@media"):
            for _, rule in blocks(inner):
                yield head, rule
        else:
            yield None, head + "{" + inner + "}"
        i = j


def breakpoint(media):
    if media is None:
        return "desktop"
    m = re.search(r"max-width:\s*(\d+)px", media)
    if not m or "min-width" in media and "max-width" not in media:
        return None
    w = int(m.group(1))
    return {1024: "tablet", 767: "mobile"}.get(w)


def heights(html, eid):
    """{'desktop'|'tablet'|'mobile': value} declared for one element id."""
    css = "\n".join(re.findall(r"<style[^>]*>(.*?)</style>", html, re.S))
    sel = re.compile(
        r"\.elementor-element-" + re.escape(eid) + r"(?:\s*>\s*\.elementor-container)?\s*\{"
    )
    found = {}
    for media, rule in blocks(css):
        bp = breakpoint(media)
        if not bp or not any(sel.search(part + "{") for part in rule.split("{", 1)[0].split(",")):
            continue
        body = rule.split("{", 1)[1]
        m = re.search(r"(?:^|;)\s*(?:--)?min-height\s*:\s*([^;}]+)", body)
        if m:
            found[bp] = m.group(1).strip()
    return found


def taller(a, b):
    """True when a and b share a unit and a is the larger."""
    ma, mb = (re.fullmatch(r"([\d.]+)(px|vh)", v) for v in (a, b))
    return bool(ma and mb and ma.group(2) == mb.group(2) and float(ma.group(1)) > float(mb.group(1)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    changed = unknown = 0
    for path in sorted(glob.glob(f"{PAGES}/*.json")):
        raw = open(path, encoding="utf8").read()
        page = json.loads(raw)
        tall = [s for s in page.get("sections", []) if s.get("minHeight")]
        if not tall:
            continue
        if page.get("kind") == "post":
            # Posts render from D1 via src/data/posts.json; their files here
            # are only the seed, so writing them would change nothing that
            # ships. The seven /locations-served/<city>/ banners are posts.
            print(f"POST     {page['slug']}: renders from D1, not changed here")
            continue
        try:
            html = fetch(page["url"])
        except RuntimeError as e:
            print(f"UNKNOWN  {e}", file=sys.stderr)
            unknown += 1
            continue
        dirty = False
        for s in tall:
            h = heights(html, s["id"])
            edited = "desktop" in h and h["desktop"] != s["minHeight"]
            if edited:
                # Two sources disagree: report it, do not guess. Both known
                # cases are deliberate edits to the port (ad86766 shortened the
                # /car-wraps/ banner to 280px, 4ccf3c6 the PPF one to 40vh), so
                # the port's desktop value stands.
                print(f"MISMATCH {page['slug']} {s['id']}: data {s['minHeight']} vs live {h['desktop']} -- data kept")
            for bp, key in (("tablet", "minHeightTablet"), ("mobile", "minHeightMobile")):
                if edited and bp in h and taller(h[bp], s["minHeight"]):
                    # Where the port's desktop banner was edited down, a
                    # smaller screen does not get a taller one; it inherits.
                    # (The original itself does go taller in places -- the
                    # anime page is 75vh on desktop, 80vh on tablet -- and
                    # those are left as they are.)
                    print(f"SKIP     {page['slug']} {s['id']}: {bp} {h[bp]} exceeds desktop {s['minHeight']}")
                    continue
                if bp in h and s.get(key) != h[bp]:
                    s[key] = h[bp]
                    dirty = True
            print(
                f"{page['slug'][:44]:45} {s['id']:9} desktop {s['minHeight']:7}"
                f" tablet {s.get('minHeightTablet') or '(inherits)':11}"
                f" mobile {s.get('minHeightMobile') or '(inherits)'}"
            )
        if dirty:
            changed += 1
            if not args.dry_run:
                # Keep each file's own shape (see pull-button-colours.py), and
                # its own escaping: some files hold \u escapes, some raw UTF-8,
                # and flipping either buries the change under a rewritten file.
                kw = dict(ensure_ascii=not re.search(r"[^\x00-\x7f]", raw))
                if raw.lstrip().startswith("{\n"):
                    out = json.dumps(page, indent=1, **kw)
                else:
                    out = json.dumps(page, separators=(", ", ": "), **kw)
                if raw.endswith("\n"):
                    out += "\n"
                open(path, "w", encoding="utf8").write(out)
        time.sleep(1)

    print(f"\n{changed} page(s) {'would change' if args.dry_run else 'changed'}; {unknown} unknown")
    return 1 if unknown else 0


if __name__ == "__main__":
    sys.exit(main())
