import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
import { launchChromium } from './lib/browser.mjs';
import { serveDist } from './lib/static-site.mjs';

// Minimal failure-capture instrumentation (blog-targetsize-capture-20261003):
// on ANY target-size violation hit inside the actual full suite run below,
// dump the exact axe node + surrounding scan context to disk so the next
// diagnosis step works from proven data instead of isolated-replay guesses.
const EVIDENCE_DIR = 'D:/Codex/vinyl-external-evidence-20261002/blog-targetsize-capture-20261003';
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
let buildIdentity;
try {
  buildIdentity = {
    headSha: execSync('git rev-parse HEAD', { cwd: process.cwd() }).toString().trim(),
    dirty: execSync('git status --short', { cwd: process.cwd() }).toString().trim().split('\n').filter(Boolean),
  };
} catch (error) {
  buildIdentity = { error: error.message };
}
let distMtime;
try {
  distMtime = fs.statSync(path.join(process.cwd(), 'dist')).mtime.toISOString();
} catch {
  distMtime = null;
}

const routes = [
  '/', '/car-wraps/', '/commercial-vehicle-wraps/', '/truck-wraps/', '/van-wraps/',
  '/tesla-vinyl-wraps/', '/vehicle-paint-protection-film-toronto/', '/signage/',
  '/storefront-signs-toronto/', '/contact/', '/full-car-wrap-toronto/', '/car-wrap-faqs/',
  // Direct coverage for the two routes fixed by the structured/rich-text
  // heading-level-skip clamp (Blocks.astro collectHeadings), plus one
  // representative route affected by the categories-widget `<h5>` clamp
  // (/blogs/vwt-tinting/) -- previously only covered indirectly via the
  // 12 routes above, not run through axe directly (QA681a87ec gap).
  '/trailer-wrap-toronto/', '/car-lettering-and-decals-gta/', '/blogs/vwt-tinting/',
  // Direct coverage for the card-badge contrast fix (/blog/, the cards
  // widget's badge pill), the our-work anchor/TOC rename pass, and the
  // boat-wrap-toronto h3 heading-hover fix (badge-contrast-repair-20261003).
  '/blog/', '/our-work/', '/boat-wrap-toronto/',
];
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];
const { server, origin } = await serveDist(8161);
const browser = await launchChromium({ headless: true });
const failures = [];

// StickyBar fades in 1000ms after load and reveals itself via a clip-path +
// transform transition that takes a further 450ms to settle
// (src/components/StickyBar.astro) — it never animates opacity, because an
// opacity fade was measured to blend the pill below AA contrast mid-transition.
// Scanning before the clip-path/transform finish leaves `.sb-btn--msg`
// partially clipped or offset, which can hide real contrast/focus-order
// issues from axe. Checking `opacity >= 0.99` is vacuous here: this element's
// opacity is always 1, so that condition is true immediately and never
// actually waits for the clip/transform to resolve. Wait for the real
// `data-shown` marker the component sets, then for clip-path and transform to
// reach their final settled values — true under full motion (after the
// 0.45s transition) and equally true under prefers-reduced-motion / no
// animation support (the transition is skipped and the final values apply
// immediately) — with a bounded timeout and a diagnostic error rather than a
// silent pass-through or a fixed sleep.
async function waitForStickyBarSettled(page, routeLabel) {
  const bar = page.locator('[data-sticky-bar]');
  if ((await bar.count()) === 0) {
    throw new Error(`${routeLabel}: no [data-sticky-bar] element found — StickyBar is expected on every route`);
  }
  try {
    await bar.waitFor({ state: 'attached', timeout: 5000 });
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.hasAttribute('data-shown'),
      '[data-sticky-bar]',
      { timeout: 5000 },
    );
    await page.waitForFunction(
      (selector) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        const style = getComputedStyle(element);
        // Final revealed state: clip-path fully open (inset(0 0 0 0), any
        // unit/whitespace formatting) and the translateY offset resolved to
        // no transform. This is true whether we got here via the 0.45s
        // transition completing or because reduced-motion/no-animation
        // support meant the final values applied with no transition at all.
        const clipSettled = /^inset\(\s*0(px)?(\s+0(px)?){0,3}\s*\)$/.test(style.clipPath.trim());
        const transformSettled = style.transform === 'none' || style.transform === 'matrix(1, 0, 0, 1, 0, 0)';
        return clipSettled && transformSettled;
      },
      '[data-sticky-bar]',
      { timeout: 3000 },
    );
  } catch (error) {
    throw new Error(
      `${routeLabel}: StickyBar did not reach a shown+settled state within the bounded timeout ` +
        `(expected [data-shown] at ~1000ms and clip-path/transform settled by ~1450ms). ` +
        `Underlying error: ${error.message}`,
    );
  }
}

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      return url.origin === origin ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    for (const route of routes) {
      await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
      await waitForStickyBarSettled(page, `${viewport.name} ${route}`);
      // target-size (WCAG 2.2 AA, 2.5.8) ships `enabled: false` in axe-core by
      // default — `.withTags([... 'wcag22aa'])` alone never runs it, so every
      // prior pass of this gate silently skipped touch-target-size checks
      // (root cause of the "mobile target-size node not identified" QA gap).
      // Explicitly re-enabling it here is the fix.
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .options({ rules: { 'target-size': { enabled: true } } })
        .analyze();
      for (const violation of results.violations) {
        failures.push(`${viewport.name} ${route}: ${violation.id} (${violation.impact}) — ${violation.nodes.length} node(s)`);
        if (violation.id === 'target-size') {
          // Capture full forensic evidence for every target-size node at the
          // moment of actual failure inside the real full-suite scan (not a
          // replay): selector/html/check data, viewport, scroll position,
          // the element's own rect, any overlapping-neighbor rect axe
          // reports, a screenshot, StickyBar's live settled state, and
          // source/build identity.
          const stickyBarState = await page.evaluate(() => {
            const bar = document.querySelector('[data-sticky-bar]');
            if (!bar) return null;
            const style = getComputedStyle(bar);
            return {
              hasShownAttr: bar.hasAttribute('data-shown'),
              clipPath: style.clipPath,
              transform: style.transform,
              opacity: style.opacity,
              rect: bar.getBoundingClientRect().toJSON(),
            };
          });
          const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
          for (const [nodeIndex, node] of violation.nodes.entries()) {
            let targetRect = null;
            let elementHandle = null;
            try {
              elementHandle = await page.$(node.target[0]);
              if (elementHandle) {
                targetRect = await elementHandle.boundingBox();
              }
            } catch (error) {
              targetRect = { error: error.message };
            }
            const screenshotPath = path.join(
              EVIDENCE_DIR,
              `targetsize-${viewport.name}-${route.replace(/[^a-z0-9]+/gi, '-')}-node${nodeIndex}.png`,
            );
            try {
              if (elementHandle) {
                await elementHandle.screenshot({ path: screenshotPath }).catch(() =>
                  page.screenshot({ path: screenshotPath, fullPage: false }),
                );
              } else {
                await page.screenshot({ path: screenshotPath, fullPage: false });
              }
            } catch (error) {
              // non-fatal; still write the JSON evidence below
            }
            const record = {
              capturedAt: new Date().toISOString(),
              viewport,
              route,
              scroll,
              targetRect,
              node: {
                target: node.target,
                html: node.html,
                failureSummary: node.failureSummary,
                impact: node.impact,
                any: node.any,
                all: node.all,
                none: node.none,
              },
              stickyBarState,
              buildIdentity,
              distMtime,
              screenshotPath,
            };
            fs.appendFileSync(
              path.join(EVIDENCE_DIR, 'target-size-capture.ndjson'),
              `${JSON.stringify(record)}\n`,
            );
          }
        }
      }
      const basics = await page.evaluate(() => ({
        lang: document.documentElement.lang,
        h1s: document.querySelectorAll('h1').length,
        unlabeled: [...document.querySelectorAll('input:not([type="hidden"]), select, textarea')]
          .filter((field) => !field.closest('[aria-hidden="true"]'))
          .filter((field) => !field.closest('label') && !field.getAttribute('aria-label') &&
            !(field.id && document.querySelector(`label[for="${CSS.escape(field.id)}"]`))).length,
      }));
      if (!basics.lang) failures.push(`${viewport.name} ${route}: document language is missing`);
      if (basics.h1s !== 1) failures.push(`${viewport.name} ${route}: expected one h1, found ${basics.h1s}`);
      if (basics.unlabeled) failures.push(`${viewport.name} ${route}: ${basics.unlabeled} unlabeled form control(s)`);
      const routeFailures = failures.filter((failure) => failure.startsWith(`${viewport.name} ${route}:`)).length;
      console.log(`${routeFailures ? 'FAIL' : 'PASS'}  ${viewport.name} ${route}${routeFailures ? ` (${routeFailures} rule(s))` : ''}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} accessibility failure(s):\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`\nPASS  Automated WCAG checks on ${routes.length * viewports.length} route/viewport combinations`);
