import AxeBuilder from '@axe-core/playwright';
import { launchChromium } from '../scripts/lib/browser.mjs';
import { serveDist } from '../scripts/lib/static-site.mjs';

const routes = ['/', '/full-car-wrap-toronto/', '/car-wrap-faqs/'];
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];
const { server, origin } = await serveDist(8162);
const browser = await launchChromium({ headless: true });
const failures = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    for (const route of routes) {
      await page.goto(origin + route, { waitUntil: 'networkidle' });
      const results = await new AxeBuilder({ page }).analyze();
      if (results.violations.length) {
        failures.push({ route, viewport: viewport.name, violations: results.violations.map(v => ({ id: v.id, nodes: v.nodes.length })) });
        console.log('FAIL', viewport.name, route, JSON.stringify(results.violations.map(v => v.id)));
      } else {
        console.log('PASS', viewport.name, route);
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.log(JSON.stringify(failures, null, 2));
  process.exit(1);
}
