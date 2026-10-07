"""
Carry each section's real COLUMN inset from the original, and nothing else.

The port draws a single-column section as one `.container.stack`, and gives it
Elementor's default column padding -- 10px a side, what a column gets under
`elementor-column-gap-default`. Rows of columns get the same 10px per column.

That default is wrong wherever a section says otherwise, and 366 of the site's
845 top-level sections do: they are `elementor-column-gap-no`, whose columns
carry no padding at all. The port inset every one of them by 10px anyway, so
their contents came out 20px narrow. On /vinyl-car-wrap-our-portfolio/ that is
the whole gallery -- 1180px against the original's 1200 at desktop, and 370
against 390 on a phone, where every one of 341 tiles then measured short and
the page ended 4,500px early.

Read off the rendered page rather than the class, because a column can carry
its own padding that beats the gap class, and only the computed value says
which one won.

Writes, only where the measurement differs from what the port already draws:

  - a single-column section:  `innerPad`, the container's padding plus the one
    column's (the port has no column element there; its container stands in)
  - a row of columns:         each column's own `padding`

pull-section-padding.py measures the same boxes but also rewrites section
padding, width and gutters; this is the narrow half of it, safe to run across
every page.

    python3 scripts/pull-column-inset.py /vinyl-car-wrap-our-portfolio/ --dry-run
    python3 scripts/pull-column-inset.py --all
"""
import argparse, glob, json, os, re, subprocess, sys

PAGES = "src/data/pages"
SPKI = "KnP1OnzHv/y42eRQmbGwoYTHcSJF448m6CU5mdngwKk="
GENERIC = "10px"

PROBE = r"""
import { chromium } from 'playwright';
const SPKI = %(spki)r;
const PATHS = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', `--ignore-certificate-errors-spki-list=${SPKI}`],
  proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' },
});
for (const PATH of PATHS) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let out = null;
  try {
    await page.goto('https://vinylwraptoronto.com' + PATH, { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(700);
    out = await page.evaluate(() => {
      const res = {};
      for (const el of document.querySelectorAll('.elementor-section[data-id]')) {
        if (el.closest('.elementor-location-header, .elementor-location-footer, .elementor-popup-modal')) continue;
        const id = el.dataset.id;
        if (res[id]) continue;
        const inner = el.querySelector(':scope > .elementor-container');
        if (!inner) continue;
        const cols = [...inner.querySelectorAll(':scope > .elementor-column')].map((c) => {
          const w = c.querySelector(':scope > .elementor-widget-wrap') || c;
          const s = getComputedStyle(w);
          return [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(parseFloat);
        });
        const s = getComputedStyle(inner);
        res[id] = {
          inner: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(parseFloat),
          cols,
        };
      }
      // A flex container has no column: its widgets sit straight inside it, and
      // its own padding (split between the box and its boxed inner) is the
      // whole inset.
      for (const el of document.querySelectorAll('.e-con.e-parent[data-id]')) {
        if (el.closest('.elementor-location-header, .elementor-location-footer, .elementor-popup-modal')) continue;
        const id = el.dataset.id;
        if (res[id]) continue;
        const inner = el.querySelector(':scope > .e-con-inner') || el;
        const kids = [...inner.children].filter((k) => k.classList.contains('elementor-element'));
        if (kids.some((k) => k.classList.contains('e-con'))) continue;
        const pad = (e) => { const s = getComputedStyle(e); return [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(parseFloat); };
        const a = pad(el), b = inner === el ? [0, 0, 0, 0] : pad(inner);
        res[id] = { econ: a.map((v, i) => v + b[i]) };
      }
      return res;
    });
  } catch (e) {
    out = { __error: String(e.message).split('\n')[0] };
  }
  await page.close();
  console.log(JSON.stringify({ path: PATH, got: out }));
}
await browser.close();
""" % {"spki": SPKI}


def css(sides):
    """Four numbers as the shortest CSS padding that says the same thing."""
    t, r, b, l = (f"{round(v, 2):g}px" for v in sides)
    if t == r == b == l:
        return t
    if t == b and r == l:
        return f"{t} {r}"
    return f"{t} {r} {b} {l}"


def sides_of(value):
    """A CSS padding shorthand as four numbers, for comparing like with like."""
    if not value:
        return None
    nums = [float(x) for x in re.findall(r"-?[\d.]+", value)]
    if not nums:
        return None
    if len(nums) == 1:
        return [nums[0]] * 4
    if len(nums) == 2:
        return [nums[0], nums[1], nums[0], nums[1]]
    if len(nums) == 3:
        return [nums[0], nums[1], nums[2], nums[1]]
    return nums[:4]


def slug_of(path):
    s = path.strip("/")
    return "index" if not s else s.replace("/", "__")


def measure(paths):
    script = os.path.join("scripts", ".column-inset-probe.mjs")
    with open(script, "w", encoding="utf8") as f:
        f.write(PROBE)
    try:
        r = subprocess.run(["node", script, *paths], capture_output=True, text=True,
                           timeout=180 * len(paths) + 60)
        if r.returncode != 0:
            print(r.stderr[-400:], file=sys.stderr)
        for line in r.stdout.splitlines():
            if line.startswith("{"):
                yield json.loads(line)
    finally:
        os.unlink(script)


def apply(doc, got):
    changed = []
    for s in doc.get("sections", []):
        m = got.get(s.get("id"))
        if not m:
            continue
        rows = [b for b in s.get("blocks", []) if b.get("type") == "columns"]
        if "econ" in m:
            # The port pads the section itself; what is left over is the inset.
            if rows:
                continue
            outer = sides_of(s.get("padding")) or [0, 0, 0, 0]
            inset = [max(0, a - b) for a, b in zip(m["econ"], outer)]
            now = sides_of(s.get("innerPad")) or sides_of(GENERIC)
            if [round(v, 2) for v in inset] != [round(v, 2) for v in now]:
                changed.append(f"{s['id']} innerPad {s.get('innerPad')!r} -> {css(inset)!r}")
                s["innerPad"] = css(inset)
            continue
        if not rows:
            if len(m["cols"]) != 1:
                continue        # flattened from several columns: not a single inset
            inset = [a + b for a, b in zip(m["inner"], m["cols"][0])]
            now = sides_of(s.get("innerPad")) or sides_of(GENERIC)
            if [round(v, 2) for v in inset] != [round(v, 2) for v in now]:
                changed.append(f"{s['id']} innerPad {s.get('innerPad')!r} -> {css(inset)!r}")
                s["innerPad"] = css(inset)
            continue
        if len(m["cols"]) == 1 and not (len(rows) == 1 and len(rows[0].get("cols", [])) == 1):
            # One outer column holding a heading and an inner section: the
            # port's rows are the INNER section's columns, and the outer
            # column's padding is the container's inset -- which the port
            # drops whenever a container holds a row (racing-stripes' "Why
            # Choose Us" and "What We Use" ran 10px wide on both sides).
            inset = [a + b for a, b in zip(m["inner"], m["cols"][0])]
            now = sides_of(s.get("innerPad")) or [0, 0, 0, 0]
            if [round(v, 2) for v in inset] != [round(v, 2) for v in now]:
                changed.append(f"{s['id']} innerPad {s.get('innerPad')!r} -> {css(inset)!r}")
                s["innerPad"] = css(inset)
            continue
        if len(rows) != 1:
            continue            # several inner rows: no one-to-one column match
        cols = rows[0].get("cols", [])
        if len(cols) != len(m["cols"]):
            continue
        for i, (c, real) in enumerate(zip(cols, m["cols"])):
            now = sides_of(c.get("padding")) or sides_of(GENERIC)
            if [round(v, 2) for v in real] != [round(v, 2) for v in now]:
                changed.append(f"{s['id']} col{i} padding {c.get('padding')!r} -> {css(real)!r}")
                c["padding"] = css(real)
    return changed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="*")
    ap.add_argument("--all", action="store_true",
                    help="every page file that is not a post (posts render from D1)")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    paths = list(a.paths)
    if a.all:
        for f in sorted(glob.glob(f"{PAGES}/*.json")):
            d = json.load(open(f, encoding="utf8"))
            if d.get("kind") == "post":
                continue
            paths.append("/" if d["slug"] == "" else f"/{d['slug']}/")

    total = 0
    for rec in measure(paths):
        path, got = rec["path"], rec["got"]
        if not got or "__error" in got:
            print(f"{path}: not measured {got and got.get('__error')}")
            continue
        p = f"{PAGES}/{slug_of(path)}.json"
        if not os.path.exists(p):
            print(f"{path}: no page file at {p}")
            continue
        raw = open(p, encoding="utf8").read()
        doc = json.loads(raw)
        changed = apply(doc, got)
        if not changed:
            continue
        total += len(changed)
        print(f"{path}: {len(changed)} values")
        for line in changed:
            print("   ", line)
        if a.dry_run:
            continue
        pretty = raw.lstrip().startswith("{\n")
        out = (json.dumps(doc, ensure_ascii=False, indent=1) if pretty
               else json.dumps(doc, ensure_ascii=False, separators=(", ", ": ")))
        if raw.endswith("\n"):
            out += "\n"
        open(p, "w", encoding="utf8").write(out)
    print(f"\n{total} values {'found' if a.dry_run else 'written'}")


if __name__ == "__main__":
    main()
