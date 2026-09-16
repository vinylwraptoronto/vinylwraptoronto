"""
Carry each carousel's paging and its bullets' colours from the original.

The port paged a screenful at a time and drew one bullet per screenful in its
own grey and green. Elementor's image carousel does neither:

    /tesla-vinyl-wraps/   8 slides, 3 per view   original 8 bullets, port 3
    /demo-page-home/      6 slides, 4 per view   original 2 bullets, port 2

-- and the difference between those two rows is a setting, not a rule of thumb.
The widget has a "Slides to Scroll" that the Tesla carousel leaves at 1 and the
homepage strip sets to 6, and the bullet count follows from it. Paging by the
screenful happened to land on the homepage's number and was wrong everywhere
else, including in the motion: the original slides one photograph at a time.

The bullets' colours are per widget, written into the page's own CSS, and no
two of the four agree:

    tesla-vinyl-wraps   active #FF0099   inactive the site green
    racing-stripes      active #14A278   inactive its own pair
    ford-mustang...     active white

so they are measured in a browser rather than inferred, taking the active
bullet's background and then one that is not active.

`slides_to_scroll` comes out of the widget's data-settings JSON, which is where
Elementor keeps it -- it is in no stylesheet.

    python3 scripts/pull-carousel-dots.py --dry-run
    python3 scripts/pull-carousel-dots.py
"""
import argparse, glob, json, os, subprocess, sys

PAGES = "src/data/pages"
SPKI = "KnP1OnzHv/y42eRQmbGwoYTHcSJF448m6CU5mdngwKk="

PROBE = r"""
import { chromium } from 'playwright';
const SPKI = %(spki)r;
const PATH = process.argv[2];
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', `--ignore-certificate-errors-spki-list=${SPKI}`],
  proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' },
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto('https://vinylwraptoronto.com' + PATH, { waitUntil: 'load', timeout: 120000 });
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 700) {
    window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 80));
  }
});
await page.waitForTimeout(1500);
const out = await page.evaluate(() => {
  const res = {};
  for (const el of document.querySelectorAll('[data-widget_type="image-carousel.default"]')) {
    const id = el.dataset.id;
    let settings = {};
    try { settings = JSON.parse(el.dataset.settings || '{}'); } catch {}
    const pag = el.querySelector('.swiper-pagination');
    const bullets = pag ? [...pag.children] : [];
    const on = bullets.find((b) => b.classList.contains('swiper-pagination-bullet-active'));
    const off = bullets.find((b) => !b.classList.contains('swiper-pagination-bullet-active'));
    res[id] = {
      scroll: Number(settings.slides_to_scroll || 1),
      count: bullets.length,
      active: on ? getComputedStyle(on).backgroundColor : null,
      idle: off ? getComputedStyle(off).backgroundColor : null,
    };
  }
  return res;
});
await browser.close();
console.log(JSON.stringify(out));
""" % {"spki": SPKI}


def measure(path):
    # Inside the project: an ES module resolves `playwright` against its own
    # directory, so a probe written to a temp dir cannot find it.
    script = os.path.join("scripts", ".carousel-dots-probe.mjs")
    with open(script, "w", encoding="utf8") as f:
        f.write(PROBE)
    try:
        r = subprocess.run(["node", script, path], capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            print(r.stderr[-400:], file=sys.stderr)
            return None
        return json.loads(r.stdout.strip().splitlines()[-1])
    finally:
        os.unlink(script)


def path_of(slug):
    return "/" if slug == "index" else "/" + slug.replace("__", "/") + "/"


def carousels(doc):
    out = []

    def walk(n):
        if isinstance(n, dict):
            if n.get("type") == "carousel" and n.get("eid"):
                out.append(n)
            for v in n.values():
                walk(v)
        elif isinstance(n, list):
            for v in n:
                walk(v)

    walk(doc)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", nargs="*")
    a = ap.parse_args()

    for p in sorted(glob.glob(f"{PAGES}/*.json")):
        slug = os.path.basename(p)[:-5]
        if a.only and slug not in a.only:
            continue
        raw = open(p, encoding="utf8").read()
        if '"type": "carousel"' not in raw and '"type":"carousel"' not in raw:
            continue
        doc = json.loads(raw)
        blocks = carousels(doc)
        if not blocks:
            continue
        got = measure(path_of(slug))
        if got is None:
            print(f"{slug}: not measured")
            continue
        changed = []
        for b in blocks:
            m = got.get(b["eid"])
            if not m:
                continue
            if m["scroll"] and m["scroll"] != (b.get("scroll") or 1):
                changed.append(f"{b['eid']} scroll {b.get('scroll')!r} -> {m['scroll']}")
                b["scroll"] = m["scroll"]
            if m["active"] and b.get("dotActive") != m["active"]:
                changed.append(f"{b['eid']} dotActive {b.get('dotActive')!r} -> {m['active']!r}"
                               f"   ({m['count']} bullets)")
                b["dotActive"] = m["active"]
            if m["idle"] and b.get("dotColor") != m["idle"]:
                changed.append(f"{b['eid']} dotColor {b.get('dotColor')!r} -> {m['idle']!r}")
                b["dotColor"] = m["idle"]
        print(f"{slug}: {len(changed)} values")
        for line in changed:
            print("   ", line)
        if a.dry_run or not changed:
            continue
        pretty = raw.lstrip().startswith("{\n")
        out = (json.dumps(doc, ensure_ascii=False, indent=1) if pretty
               else json.dumps(doc, ensure_ascii=False, separators=(", ", ": ")))
        if raw.endswith("\n"):
            out += "\n"
        open(p, "w", encoding="utf8").write(out)
        print(f"    written {p}")


if __name__ == "__main__":
    main()
