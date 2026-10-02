import { launchChromium } from '../scripts/lib/browser.mjs';
import { serveDist } from '../scripts/lib/static-site.mjs';

const targets = [
  { route: '/', name: 'home-footer', selector: 'footer' },
  { route: '/', name: 'home-stickybar', selector: '[data-sticky-bar]' },
  { route: '/full-car-wrap-toronto/', name: 'fullcarwrap-footer', selector: 'footer' },
  { route: '/car-wrap-faqs/', name: 'faqs-full', selector: null },
];
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];
const { server, origin } = await serveDist(8202);
const browser = await launchChromium({ headless: true });
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    for (const t of targets) {
      await page.goto(origin + t.route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200); // allow sticky bar fade-in to settle
      const out = `_evidence/vinyl-bounded-repair3-20261002/${t.name}-${viewport.name}.png`;
      if (t.selector) {
        const el = await page.$(t.selector);
        if (el) await el.screenshot({ path: out });
        else await page.screenshot({ path: out, fullPage: true });
      } else {
        await page.screenshot({ path: out, fullPage: true });
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log('done');
