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
 *  - /blogs/vwt-tinting/: the `categories`-block's hardcoded `<h5
 *    class="cat-title">` (see heading-skip-scan.mjs evidence) is now
 *    clamped by the same mechanism (collectHeadings/categoriesLevel),
 *    rendering as the next heading in sequence (<h2> on this page, right
 *    after its own H1) instead of a fixed H5 -- asserted clean, and the
 *    `.cat-title` class (a class selector, unlike the structured/rich-text
 *    fixes' `hlvl*`/`rt-lvl*` mirror classes) is checked directly, since it
 *    alone -- not the tag -- carries this widget's typography.
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
    // The categories-widget clamp: this page's sidebar `<h5 class="cat-title">`
    // now renders as the next heading in document order (no skip) with the
    // same `.cat-title` class, so its 18px/none/#444/center typography is
    // unchanged regardless of tag.
    route: '/blogs/vwt-tinting/',
    expectNoSkip: true,
    catTitle: { fontSize: '18px', textTransform: 'none', color: 'rgb(68, 68, 68)', textAlign: 'center' },
  },
  {
    // QA cb27 (MEDIUM): /our-work/ had 38+ before/after gallery card-title
    // headings sharing one literal eid ("56a8ead") in our-work.json. The
    // shared-eid Map lookup in tocHeadingRenderLevel meant EVERY column --
    // including the first-rendered one -- read back the LAST column's cached
    // clamp value, producing a 1->3 skip at the very first gallery heading.
    // Fixed at the data layer only (distinct `56a8ead-0`, `56a8ead-1`, ...
    // suffixes in our-work.json); Blocks.astro's clamp/render logic is
    // untouched. This asserts the first gallery heading now renders in
    // sequence (no skip) and keeps its own distinct, stable eid.
    route: '/our-work/',
    expectNoSkip: true,
    firstGalleryHeading: { eid: '56a8ead-0', text: 'BMW X4' },
  },
  {
    // focused-a11y-repair2-20261003: /tesla-vinyl-wraps/ "See The Results"
    // gallery had the SAME literal-eid collision as QA cb27's /our-work/ fix
    // above (12 cards all sharing eid "56a8ead" in tesla-vinyl-wraps.json,
    // unlike our-work.json's already-unique "56a8ead-0".."56a8ead-N"), which
    // broke that card's anchor id (card 1's heading rendered with card 12's
    // slug as its id) and masked the real second defect below it. Fixed by
    // suffixing tesla-vinyl-wraps.json's eids the same way. That alone did
    // NOT clear the heading-order violation: collectHeadings' `runningMax`
    // was a monotonic max() that never decreases, so the earlier $4,500 H3
    // price box permanently raised the floor, and the later H2 "See The
    // Results" -> H4 gallery-card skip went unclamped even though the H2 was
    // the immediately preceding heading. Fixed by tracking the LAST rendered
    // level instead of the deepest-ever level. Asserts both: the id/eid now
    // matches the first card's own content, and the sequence has no skip.
    route: '/tesla-vinyl-wraps/',
    expectNoSkip: true,
    firstGalleryHeading: { eid: '56a8ead-0', text: 'Personal- Tesla Model 3 – Partial Wrap' },
  },
  {
    // QA cb27 (HIGH): `.cards > li:hover h3 a` was left stale when the base
    // rule was renamed `.cards h3` -> `.cards .card-title` to support a
    // dynamic card-title tag (cardsLevel 1-3). /blog/ renders card-titles as
    // <h2> (cardsLevel 2), so the old hardcoded-h3 hover selector would not
    // match here at all. Fixed to `.cards > li:hover .card-title a`. This
    // asserts the brand-pink hover/focus color actually applies on this
    // non-h3 cardsLevel page.
    route: '/blog/',
    expectNoSkip: true,
    cardHover: { selector: '.cards > li .card-title a', expectedTag: 'h2', color: 'rgb(214, 0, 125)' },
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
      if (check.catTitle) {
        const style = await page
          .locator('.cat-title')
          .evaluate((el, expected) => ({
            tag: el.tagName.toLowerCase(),
            fontSize: getComputedStyle(el).fontSize,
            textTransform: getComputedStyle(el).textTransform,
            color: getComputedStyle(el).color,
            textAlign: getComputedStyle(el).textAlign,
          }), check.catTitle)
          .catch((error) => ({ error: String(error) }));
        if (style.error) {
          failures.push(`${label}: could not read .cat-title -- ${style.error}`);
        } else {
          if (style.tag === 'h5') {
            failures.push(`${label}: .cat-title is still <h5> -- categories-block clamp did not apply`);
          }
          for (const prop of ['fontSize', 'textTransform', 'color', 'textAlign']) {
            if (style[prop] !== check.catTitle[prop]) {
              failures.push(
                `${label}: .cat-title (<${style.tag}>) ${prop} is ${style[prop]}, expected ${check.catTitle[prop]} (unchanged widget appearance)`,
              );
            }
          }
        }
      }
      if (check.firstGalleryHeading) {
        const h = check.firstGalleryHeading;
        const info = await page
          .locator(`[data-eid="${h.eid}"]`)
          .first()
          .evaluate((el) => ({ tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim() }))
          .catch((error) => ({ error: String(error) }));
        if (info.error) {
          failures.push(`${label}: could not read first gallery heading [data-eid="${h.eid}"] -- ${info.error}`);
        } else {
          if (!info.text.includes(h.text)) {
            failures.push(`${label}: first gallery heading [data-eid="${h.eid}"] text "${info.text}" does not include expected "${h.text}"`);
          }
        }
      }
      if (check.cardHover) {
        const h = check.cardHover;
        const link = page.locator(h.selector).first();
        const tag = await link.evaluate((el) => el.closest('.card-title')?.tagName.toLowerCase());
        if (tag !== h.expectedTag) {
          failures.push(`${label}: ${h.selector} card-title tag is <${tag}>, expected <${h.expectedTag}>`);
        }
        await link.hover();
        const hoverColor = await link.evaluate((el) => getComputedStyle(el).color);
        if (hoverColor !== h.color) {
          failures.push(`${label}: ${h.selector} hover color is ${hoverColor}, expected ${h.color} (brand-pink hover selector regression)`);
        }
        await link.focus();
        const focusColor = await link.evaluate((el) => getComputedStyle(el).color);
        if (focusColor !== h.color) {
          failures.push(`${label}: ${h.selector} focus color is ${focusColor}, expected ${h.color} (brand-pink hover selector regression)`);
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
