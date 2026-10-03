/**
 * Targeted regression check for the structured+rich-text heading-level-skip
 * clamp in Blocks.astro (collectHeadings / tocHeadingRenderLevel / the
 * `hlvl*` + `rt-lvl*` parallel-class typography preservation).
 *
 * Covers, on real pages, the exact mixed cases the fix addresses:
 *  - /trailer-wrap-toronto/: structured `heading`-type widgets where the
 *    authored sequence DECREASES then would otherwise JUMP (H1 -> H4 card
 *    titles with no H2/H3) -- the clamp must render no skip, and the
 *    clamped tags must carry an `hlvl{authoredLevel}` class whose
 *    font-size/text-transform match the ORIGINAL authored level, not the
 *    rendered tag, on both desktop and mobile viewports (computed style is
 *    viewport-independent for this CSS, but we check both to catch any
 *    future viewport-scoped override).
 *  - /car-lettering-and-decals-gta/: same clamp, single H1->H3 widget skip.
 *  - /blogs/vwt-tinting/: deliberately NOT asserted clean -- its H1->H5 skip
 *    comes from the unrelated `categories`-block's hardcoded `<h5
 *    class="cat-title">` (see heading-skip-scan.mjs evidence), which this
 *    fix does not touch. Asserted here only as a "still present, don't
 *    silently regress further" marker so a future fix of that widget is
 *    expected to flip this assertion, not break it.
 *
 * Usage: node scripts/heading-hierarchy-regression.mjs
 */
import { launchChromium } from './lib/browser.mjs';
import { serveDist } from './lib/static-site.mjs';

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

// expectedStyle: authored-level typography that must survive the clamp via
// the `hlvl{N}` class, read from global.css's bare h2-h6 font-size/
// text-transform rules (the only two properties keyed to level number there).
const EXPECTED_BY_LEVEL = {
  2: { fontSize: '28px', textTransform: 'capitalize' },
  3: { fontSize: '22px', textTransform: 'capitalize' },
  4: { fontSize: '18px', textTransform: 'none' },
};

const checks = [
  {
    route: '/trailer-wrap-toronto/',
    expectNoSkip: true,
    clampedHeadings: [
      { eid: '659d5c5b', authoredLevel: 4 },
      { eid: 'f61fee7', authoredLevel: 4 },
    ],
  },
  {
    route: '/car-lettering-and-decals-gta/',
    expectNoSkip: true,
    clampedHeadings: [{ eid: '44115b32', authoredLevel: 3 }],
  },
  {
    // Not fixed by this change (different widget entirely) -- asserted as a
    // "known, still open" marker, not a pass/fail on the clamp itself.
    route: '/blogs/vwt-tinting/',
    expectNoSkip: false,
  },
];

const { server, origin } = await serveDist(8162);
const browser = await launchChromium({ headless: true });
const failures = [];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    for (const check of checks) {
      await page.goto(origin + check.route, { waitUntil: 'domcontentloaded' });

      const { tags, hasSkip } = await page.evaluate(() => {
        const nodes = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')];
        const tags = nodes.map((n) => Number(n.tagName.slice(1)));
        let max = 0;
        let hasSkip = false;
        for (const n of tags) {
          if (max > 0 && n > max + 1) hasSkip = true;
          max = Math.max(max, n);
        }
        return { tags, hasSkip };
      });

      const label = `${viewport.name} ${check.route}`;
      if (check.expectNoSkip && hasSkip) {
        failures.push(`${label}: expected no heading-level skip, got sequence [${tags.join(',')}]`);
      }
      if (!check.expectNoSkip && !hasSkip) {
        failures.push(
          `${label}: expected the known (not-yet-fixed) skip to still be present as a marker, ` +
            `but found none -- either it was fixed (update this script) or something else changed`,
        );
      }

      for (const h of check.clampedHeadings ?? []) {
        const style = await page
          .locator(`[data-eid="${h.eid}"]`)
          .evaluate((el, authoredLevel) => ({
            tag: el.tagName.toLowerCase(),
            fontSize: getComputedStyle(el).fontSize,
            textTransform: getComputedStyle(el).textTransform,
            hasClamp: el.classList.contains(`hlvl${authoredLevel}`),
            // An authored inline font-size (set directly on this specific
            // block in the source data, independent of the hlvl*/global.css
            // class mechanism) takes CSS precedence over any class and is
            // visual parity in itself -- the tag change can't affect it, so
            // the global.css-derived font-size expectation below doesn't
            // apply to this element at all.
            hasInlineFontSize: /font-size\s*:/i.test(el.getAttribute('style') || ''),
          }), h.authoredLevel)
          .catch((error) => ({ error: String(error) }));
        if (style.error) {
          failures.push(`${label}: could not read [data-eid="${h.eid}"] -- ${style.error}`);
          continue;
        }
        if (!style.hasClamp) {
          failures.push(
            `${label}: [data-eid="${h.eid}"] (<${style.tag}>) is missing the expected ` +
              `hlvl${h.authoredLevel} typography-preservation class`,
          );
        }
        if (style.hasInlineFontSize) continue;
        const expected = EXPECTED_BY_LEVEL[h.authoredLevel];
        if (!expected) continue;
        if (style.fontSize !== expected.fontSize) {
          failures.push(
            `${label}: [data-eid="${h.eid}"] (<${style.tag}>, authored H${h.authoredLevel}) ` +
              `font-size is ${style.fontSize}, expected ${expected.fontSize} (original authored-level typography)`,
          );
        }
        if (style.textTransform !== expected.textTransform) {
          failures.push(
            `${label}: [data-eid="${h.eid}"] (<${style.tag}>, authored H${h.authoredLevel}) ` +
              `text-transform is ${style.textTransform}, expected ${expected.textTransform}`,
          );
        }
      }
      const routeFailures = failures.filter((f) => f.startsWith(`${label}:`)).length;
      console.log(`${routeFailures ? 'FAIL' : 'PASS'}  ${label} [${tags.join(',')}]${routeFailures ? ` (${routeFailures} issue(s))` : ''}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} heading-hierarchy regression failure(s):\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`\nPASS  Heading-hierarchy regression checks on ${checks.length * viewports.length} route/viewport combinations`);
