"""
Carry three section properties the port never read: height per breakpoint,
where the content sits in that height, and the overlay over the background.

Each is in the original's own per-element rules (Internal Embedding puts them
in the page HTML), and each was lost differently:

  height      The port kept the desktop `min-height` and held it at every
              width. Elementor writes a tablet and a mobile value too, and the
              heroes use them: /cybertruck-wraps/ is 70vh, 45vh and 60vh, so a
              phone got a 700px hero where the original draws 528.

  position    Inside a section taller than its content, Elementor places the
              content with Column Position on a classic section
              (`elementor-section-items-top|middle|bottom`) and with
              `--justify-content` on a flex container. The port centred every
              one, which put the Cybertruck headline 194px above the original's,
              over the bright cab instead of the dark ground.

  overlay     The tint between a section's photograph and its content: a child
              `.elementor-background-overlay` on a classic section, the
              container's own `::before` at `--overlay-opacity` on a flex one.
              The port carried one, on /thank-you/. The Cybertruck hero's 50%
              black was among those lost, so its photograph rendered at full
              brightness behind white type.

Read from the declared rules rather than measured, because heights are written
in vh: a computed min-height is pixels at whatever window measured it, and
would pin a hero to one screen size.

  padding     The port kept a section's desktop padding at every width. The
              original changes it per breakpoint -- the archive listings are
              100px top and bottom on desktop and 50px on a phone, so every one
              of them ran 100px long at 390.

Writes `minHeight`, `minHeightT`, `minHeightM`, `itemsAlign`, `overlay`,
`paddingT` and `paddingM` onto the section, only where the original sets them
and they differ from the data.

    python3 scripts/pull-section-layers.py --dry-run
    python3 scripts/pull-section-layers.py /cybertruck-wraps/
"""
import argparse, glob, json, os, re, urllib.request

PAGES = "src/data/pages"
STYLE = re.compile(r"<style[^>]*>(.*?)</style>", re.S)


def rules(html):
    css = "\n".join(STYLE.findall(html))
    out, i, media = [], 0, ""
    while True:
        j = css.find("{", i)
        if j < 0:
            break
        head = css[i:j].strip()
        while head.startswith("}"):
            media, head = "", head[1:].strip()
        if head.startswith("@media"):
            media, i = head.replace(" ", ""), j + 1
            continue
        k = css.find("}", j)
        if k < 0:
            break
        out.append((media, head, css[j + 1:k]))
        i = k + 1
    return out


def bp(media):
    """Elementor's breakpoint for a media query: d, t, m, or None to ignore."""
    if not media:
        return "d"
    if "max-width:1024px" in media:
        return "t"
    if "max-width:767px" in media:
        return "m"
    return None


def decl(body, prop):
    m = re.search(r"(?:^|;)\s*" + re.escape(prop) + r"\s*:\s*([^;]+)", body)
    return m.group(1).strip() if m else None


def read(html):
    """Per section id: {'mh': {bp: v}, 'items': v, 'overlay': {...}}."""
    out = {}
    get = lambda sid: out.setdefault(sid, {"mh": {}, "items": None, "overlay": {}, "pad": {}, "cw": {}})
    # Classic sections declare Column Position as a class.
    for m in re.finditer(r'class="([^"]*elementor-section[^"]*)"\s+data-id="(\w+)"', html):
        cls, sid = m.groups()
        pos = re.search(r"elementor-section-items-(top|middle|bottom)", cls)
        if pos:
            get(sid)["items"] = pos.group(1)
    for media, sel, body in rules(html):
        b = bp(media)
        # A flex container's boxed width is usually written for 768px and up
        # only, leaving phones on Elementor's default.
        if b is None and media.replace(" ", "") == "@media(min-width:768px)":
            for part in sel.split(","):
                m = re.search(r"elementor-element-(\w+)\s*$", part.strip())
                v = decl(body, "--content-width")
                if m and v:
                    get(m.group(1))["cw"]["dt"] = v
            continue
        if b is None:
            continue
        for part in sel.split(","):
            part = part.strip()
            m = re.search(r"elementor-element-(\w+)(.*)$", part)
            if not m:
                continue
            sid, rest = m.group(1), m.group(2).strip()
            if rest == "":
                cw = decl(body, "--content-width")
                if cw:
                    get(sid)["cw"][b] = cw
                p = decl(body, "padding")
                if p and b in ("t", "m"):
                    get(sid)["pad"][b] = p
                # A flex container writes its padding side by side.
                sides = [decl(body, f"--padding-{k}") for k in ("top", "right", "bottom", "left")]
                if any(sides) and b in ("t", "m"):
                    get(sid)["pad"].setdefault(b + "_sides", sides)
                v = decl(body, "--min-height")
                if v:
                    get(sid)["mh"][b] = v
                jc = decl(body, "--justify-content")
                if jc and b == "d":
                    get(sid)["items"] = {"flex-start": "top", "center": "middle",
                                         "flex-end": "bottom"}.get(jc, get(sid)["items"])
                op = decl(body, "--overlay-opacity")
                if op and b == "d":
                    get(sid)["overlay"]["opacity"] = op
            elif rest == "> .elementor-container":
                mw = decl(body, "max-width")
                if mw:
                    get(sid)["cw"][b] = mw
                v = decl(body, "min-height")
                if v:
                    get(sid)["mh"][b] = v
            elif rest in ("> .elementor-background-overlay", "::before") and b == "d":
                ov = get(sid)["overlay"]
                for prop, key in (("background-color", "color"), ("background-image", "image"),
                                  ("opacity", "opacity")):
                    v = decl(body, prop)
                    if v and not (key == "opacity" and "opacity" in ov and rest == "::before"):
                        ov[key] = v
                if rest == "::before" and decl(body, "--background-overlay") is not None:
                    ov["econ"] = True
            elif rest.startswith("> .elementor-motion-effects-container") and rest.endswith("::before") and b == "d":
                ov = get(sid)["overlay"]
                v = decl(body, "background-color")
                if v and "color" not in ov:
                    ov["color"] = v
                if decl(body, "--background-overlay") is not None:
                    ov["econ"] = True
    return out


def expand(v):
    """A CSS padding shorthand as its four sides, or None."""
    if not v:
        return None
    p = v.split()
    if len(p) == 1:
        return p * 4
    if len(p) == 2:
        return p * 2
    if len(p) == 3:
        return [p[0], p[1], p[2], p[1]]
    return p[:4]


def apply(doc, got):
    changed = []
    for s in doc.get("sections", []):
        g = got.get(s.get("id"))
        if not g:
            continue
        mh = g["mh"]
        # A desktop height the data already has, set to something else, is a
        # deliberate local change rather than an extraction miss -- the Phase 3
        # landing-page rewrites of /car-wraps/ and the PPF page shortened their
        # heroes on purpose. Leave every breakpoint of those alone.
        deliberate = s.get("minHeight") and mh.get("d") and s["minHeight"] != mh["d"]
        if mh.get("d") and not deliberate:
            for key, b in (("minHeight", "d"), ("minHeightT", "t"), ("minHeightM", "m")):
                v = mh.get(b)
                if v and s.get(key) != v:
                    changed.append(f"{s['id']} {key} {s.get(key)!r} -> {v!r}")
                    s[key] = v
            if g["items"] and g["items"] != "middle" and s.get("itemsAlign") != g["items"]:
                changed.append(f"{s['id']} itemsAlign {s.get('itemsAlign')!r} -> {g['items']!r}")
                s["itemsAlign"] = g["items"]
        # Breakpoint padding. A flex container's sides are partial: a side it
        # does not restate keeps the value above it, so they are merged onto
        # the section's own padding.
        prev = expand(s.get("padding"))
        for b, key in (("t", "paddingT"), ("m", "paddingM")):
            pad = g["pad"]
            v = None
            if pad.get(b):
                v = " ".join(expand(pad[b]) or [])
            elif pad.get(b + "_sides") and prev:
                v = " ".join(x or y for x, y in zip(pad[b + "_sides"], prev))
            if v:
                prev = v.split()
                if s.get(key) != v:
                    changed.append(f"{s['id']} {key} {s.get(key)!r} -> {v!r}")
                    s[key] = v
        # Boxed width per breakpoint. Only the tablet and mobile values are
        # written; the desktop one is already the section's maxWidth.
        cw = g["cw"]
        if cw:
            t = cw.get("t") or cw.get("dt")
            m = cw.get("m") or ("min(100%, 767px)" if "dt" in cw else None)
            d = cw.get("d") or cw.get("dt")
            for key, v in (("maxWidthT", t), ("maxWidthM", m)):
                if v and v != d and s.get(key) != v:
                    changed.append(f"{s['id']} {key} {s.get(key)!r} -> {v!r}")
                    s[key] = v
        ov = g["overlay"]
        # A flex container's ::before only paints when --background-overlay
        # gives it content; a classic overlay div always exists once styled.
        if ov.get("color") == "transparent":
            ov.pop("color")
        paints = ((ov.get("color") or ov.get("image")) and (ov.get("econ") or "econ" not in ov)
                  and ov.get("opacity") not in ("0", "0.0"))
        if paints:
            want = {k: ov[k] for k in ("color", "image", "opacity") if ov.get(k)}
            if ov.get("econ") and "opacity" not in want:
                want["opacity"] = "0.5"   # Elementor's container default
            have = s.get("overlay") or {}
            if any(have.get(k) != v for k, v in want.items()):
                changed.append(f"{s['id']} overlay {have or None!r} -> {want!r}")
                s["overlay"] = {**have, **want}
    return changed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="*")
    ap.add_argument("--cache", help="directory of cached production HTML, <slug>.html")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    files = sorted(glob.glob(f"{PAGES}/*.json"))
    if a.paths:
        want = {p.strip("/").replace("/", "__") or "index" for p in a.paths}
        files = [f for f in files if os.path.basename(f)[:-5] in want]
    total = 0
    for f in files:
        raw = open(f, encoding="utf8").read()
        doc = json.loads(raw)
        if doc.get("kind") in ("post", "story"):
            continue
        slug = os.path.basename(f)[:-5]
        cached = a.cache and os.path.join(a.cache, f"{slug}.html")
        if cached and os.path.exists(cached):
            html = open(cached, encoding="utf8", errors="replace").read()
        else:
            req = urllib.request.Request(doc["url"], headers={"User-Agent": "Mozilla/5.0"})
            try:
                html = urllib.request.urlopen(req, timeout=60).read().decode("utf8", "replace")
            except Exception as e:  # noqa: BLE001
                print(f"{doc['url']}: {e}")
                continue
        changed = apply(doc, read(html))
        if not changed:
            continue
        total += len(changed)
        print(f"/{doc['slug']}/: {len(changed)}")
        for c in changed:
            print("   ", c)
        if a.dry_run:
            continue
        pretty = raw.lstrip().startswith("{\n")
        out = (json.dumps(doc, ensure_ascii=False, indent=1) if pretty
               else json.dumps(doc, ensure_ascii=False, separators=(", ", ": ")))
        open(f, "w", encoding="utf8").write(out + ("\n" if raw.endswith("\n") else ""))
    print(f"\n{total} {'found' if a.dry_run else 'written'}")


if __name__ == "__main__":
    main()
