import AxeBuilder from '@axe-core/playwright';
import { launchChromium } from './lib/browser.mjs';
import { serveDist } from './lib/static-site.mjs';

const routes = [
  '/', '/car-wraps/', '/commercial-vehicle-wraps/', '/truck-wraps/', '/van-wraps/',
  '/tesla-vinyl-wraps/', '/vehicle-paint-protection-film-toronto/', '/signage/',
  '/storefront-signs-toronto/', '/contact/',
];
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];
const { server, origin } = await serveDist(8161);
const browser = await launchChromium({ headless: true });
const failures = [];

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
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      for (const violation of results.violations) {
        failures.push(`${viewport.name} ${route}: ${violation.id} (${violation.impact}) — ${violation.nodes.length} node(s)`);
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
