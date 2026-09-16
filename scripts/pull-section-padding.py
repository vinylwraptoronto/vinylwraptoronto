"""
Carry each section's REAL padding, and its inner container's, from the original.

The port has one `padding` per section and infers the rest, and on the two
landing pages that lands in the wrong place. Measured on /lp-truck-wraps/:

    section 22307582   original: section `0 10px`, inner `50px 0`
                       port:     section `50px 10px`, inner `10px`

Same 50px, on a different element, plus the port's generic 10px on top -- so
the section renders 20px taller than the original's, and it compounds down the
page. The port's generic column inset is Elementor's default and is right where
a column does not set its own; these pages' columns do.

Reads the rendered page rather than the markup, because these are computed
values: a section's padding comes from the page's own inline Elementor CSS and
the container's from a class, and neither is an attribute to be scraped.

Writes `padding` (the section's own) and `innerPad` (the container's) into the
page data, and each column's own padding where it has one. Only where the
measurement differs from what is already there.

    python3 scripts/pull-section-padding.py /lp-truck-wraps/ /lp/ --dry-run
    python3 scripts/pull-section-padding.py /lp-truck-wraps/ /lp/
"""
import argparse, json, os, subprocess, sys, tempfile

PAGES = "src/data/pages"
SPKI = "KnP1OnzHv/y42eRQmbGwoYTHcSJF448m6CU5mdngwKk="

# Measuring needs a real browser: these are computed values, not attributes.
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
  for (const el of document.querySelectorAll('[data-id]')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1000) continue;                 // sections, not widgets
    const id = el.dataset.id;
    if (res[id]) continue;
    const inner = el.querySelector(':scope > .e-con-inner, :scope > .elementor-container');
    /* A column is Elementor's widget-wrap; its padding is the inset the port
       otherwise supplies generically. */
    const cols = [...el.querySelectorAll(
      ':scope > .e-con-inner > .e-con, :scope > .elementor-container > .elementor-column')]
      .map((c) => {
        const w = c.querySelector(':scope > .elementor-widget-wrap') || c;
        return getComputedStyle(w).padding;
      });
    res[id] = {
      pad: getComputedStyle(el).padding,
      innerPad: inner ? getComputedStyle(inner).padding : null,
      cols,
    };
  }
  return res;
});
await browser.close();
console.log(JSON.stringify(out));
""" % {"spki": SPKI}


def measure(path):
    # Inside the project, not /tmp: an ES module resolves `playwright` against
    # its own directory, and a probe written to a temp dir cannot find it.
    script = os.path.join("scripts", ".section-padding-probe.mjs")
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


def slug_of(path):
    s = path.strip("/")
    return "index" if not s else s.replace("/", "__")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    for path in a.paths:
        got = measure(path)
        if got is None:
            print(f"{path}: not measured")
            continue
        p = f"{PAGES}/{slug_of(path)}.json"
        if not os.path.exists(p):
            print(f"{path}: no page file at {p}")
            continue
        raw = open(p, encoding="utf8").read()
        doc = json.loads(raw)
        changed = []
        for s in doc.get("sections", []):
            m = got.get(s.get("id"))
            if not m:
                continue
            if m["pad"] and s.get("padding") != m["pad"]:
                changed.append(f"{s['id']} padding {s.get('padding')!r} -> {m['pad']!r}")
                s["padding"] = m["pad"]
            if m["innerPad"] and s.get("innerPad") != m["innerPad"]:
                changed.append(f"{s['id']} innerPad {s.get('innerPad')!r} -> {m['innerPad']!r}")
                s["innerPad"] = m["innerPad"]
            # each row's columns, in order
            for b in s.get("blocks", []):
                if b.get("type") != "columns":
                    continue
                for i, c in enumerate(b.get("cols", [])):
                    if i < len(m["cols"]) and m["cols"][i] and c.get("padding") != m["cols"][i]:
                        changed.append(f"{s['id']} col{i} padding {c.get('padding')!r} -> {m['cols'][i]!r}")
                        c["padding"] = m["cols"][i]
        print(f"{path}: {len(changed)} values")
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
