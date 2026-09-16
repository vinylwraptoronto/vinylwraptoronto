"""
Carry each icon-box's text alignment, measured rather than read.

The port centres all 3,292 of its icon boxes. Whether that is right cannot be
answered from the page CSS, and the first version of this script got it wrong
by trying: Elementor writes a rule per widget, but most widgets declare only

    .elementor-element-47cbdad3 .elementor-icon-box-wrapper { gap: 5px; }

with no alignment at all -- and a box that declares none INHERITS it from an
ancestor. Reading the declarations and calling the rest "Elementor's default"
produced `start` for eight boxes on /lp-truck-wraps/ that the original renders
centred. Those values were written and reverted.

So this measures the computed value in a real browser, per element id, which is
the only thing that answers the question. Slower, and correct.

`gap` is carried with it -- the space between the icon and its text, which the
port had one value for.

    python3 scripts/pull-iconbox-align.py --dry-run
    python3 scripts/pull-iconbox-align.py
    python3 scripts/pull-iconbox-align.py --only lp lp-truck-wraps
"""
import argparse, glob, json, os, subprocess, sys
from collections import Counter

PAGES = "src/data/pages"
SPKI = "KnP1OnzHv/y42eRQmbGwoYTHcSJF448m6CU5mdngwKk="
PROBE_PATH = "scripts/.iconbox-align-probe.mjs"
# The measurement is the expensive half -- a browser over 1,074 pages. Cached
# so a dry run, an apply and a later re-inspection all share one pass.
CACHE = "_research/iconbox-align.json"

PROBE = r"""
/* One browser, many pages: for each address, the computed text-align and icon
   gap of every icon-box on the original, keyed by its element id. */
import fs from 'node:fs';
import { chromium } from 'playwright';
const SPKI = '%(spki)s';
const paths = fs.readFileSync(process.argv[2], 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', `--ignore-certificate-errors-spki-list=${SPKI}`],
  proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' },
});
const out = {};
let i = 0;
const worker = async () => {
  while (i < paths.length) {
    const path = paths[i++];
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      await page.goto('https://vinylwraptoronto.com' + path, { waitUntil: 'load', timeout: 120000 });
      out[path] = await page.evaluate(() => {
        const res = {};
        for (const el of document.querySelectorAll('.elementor-widget-icon-box')) {
          const host = el.closest('[data-id]');
          if (!host) continue;
          const wrap = el.querySelector('.elementor-icon-box-wrapper') || el;
          const cs = getComputedStyle(wrap);
          res[host.dataset.id] = { align: cs.textAlign, gap: cs.gap };
        }
        return res;
      });
    } catch (e) {
      out[path] = null;
    }
    await page.close();
    if (i %% 50 === 0) console.error(`  ${i}/${paths.length}`);
  }
};
await Promise.all(Array.from({ length: 6 }, worker));
await browser.close();
console.log(JSON.stringify(out));
""" % {"spki": SPKI}


def slug_to_path(slug):
    return "/" if slug == "index" else "/" + slug.replace("__", "/") + "/"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--cached", action="store_true",
                    help="apply the saved measurement instead of re-measuring")
    a = ap.parse_args()

    files = sorted(glob.glob(f"{PAGES}/*.json"))
    if a.only:
        keep = set(a.only)
        files = [p for p in files if os.path.basename(p)[:-5] in keep]

    # Only the pages that actually carry an icon box.
    wanted = {}
    for p in files:
        doc = json.loads(open(p, encoding="utf8").read())
        ids = []

        def walk(n):
            if isinstance(n, dict):
                if n.get("type") == "feature" and n.get("eid"):
                    ids.append(n["eid"])
                for v in n.values():
                    walk(v)
            elif isinstance(n, list):
                for v in n:
                    walk(v)

        walk(doc)
        if ids:
            wanted[slug_to_path(os.path.basename(p)[:-5])] = p
    print(f"{len(wanted)} pages carry an icon box", file=sys.stderr)

    if a.cached and os.path.exists(CACHE):
        measured = json.loads(open(CACHE, encoding="utf8").read())
        print(f"using the cached measurement ({len(measured)} pages)", file=sys.stderr)
        return apply_measurement(wanted, measured, a)

    listfile = "scripts/.iconbox-align-paths.txt"
    open(listfile, "w").write("\n".join(wanted))
    open(PROBE_PATH, "w", encoding="utf8").write(PROBE)
    try:
        r = subprocess.run(["node", PROBE_PATH, listfile], capture_output=True, text=True, timeout=7200)
        if r.returncode != 0:
            print(r.stderr[-600:], file=sys.stderr)
            return
        measured = json.loads(r.stdout.strip().splitlines()[-1])
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        open(CACHE, "w", encoding="utf8").write(json.dumps(measured, indent=1, sort_keys=True))
        print(f"measurement cached to {CACHE}", file=sys.stderr)
    finally:
        for f in (PROBE_PATH, listfile):
            if os.path.exists(f):
                os.unlink(f)

    return apply_measurement(wanted, measured, a)


def apply_measurement(wanted, measured, a):
    tally = Counter()
    written = 0
    for path, p in wanted.items():
        got = measured.get(path)
        if not got:
            continue
        raw = open(p, encoding="utf8").read()
        doc = json.loads(raw)
        changed = 0

        def walk(n):
            nonlocal changed
            if isinstance(n, dict):
                if n.get("type") == "feature" and n.get("eid"):
                    m = got.get(n["eid"])
                    if m:
                        tally[m["align"]] += 1
                        if n.get("align") != m["align"]:
                            n["align"] = m["align"]
                            changed += 1
                        g = m.get("gap")
                        if g and g != "normal" and n.get("iconGap") != g:
                            n["iconGap"] = g
                            changed += 1
                    else:
                        tally["not measured"] += 1
                for v in n.values():
                    walk(v)
            elif isinstance(n, list):
                for v in n:
                    walk(v)

        walk(doc)
        if not changed or a.dry_run:
            continue
        pretty = raw.lstrip().startswith("{\n")
        out = (json.dumps(doc, ensure_ascii=False, indent=1) if pretty
               else json.dumps(doc, ensure_ascii=False, separators=(", ", ": ")))
        if raw.endswith("\n"):
            out += "\n"
        open(p, "w", encoding="utf8").write(out)
        written += 1

    print("\n  measured alignment, every icon box:")
    for k, v in tally.most_common():
        print(f"      {v:6}  {k}")
    print("dry run — nothing written" if a.dry_run else f"  written {written} page files")


if __name__ == "__main__":
    main()
