import AxeBuilder from '@axe-core/playwright';
import { launchChromium } from '../scripts/lib/browser.mjs';
import { serveDist } from '../scripts/lib/static-site.mjs';

const routes = ['/', '/full-car-wrap-toronto/', '/car-wrap-faqs/'];
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];
const { server, origin } = await serveDist(8201);
const browser = await launchChromium({ headless: true });
const results = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    for (const route of routes) {
      await page.goto(origin + route, { waitUntil: 'networkidle' });
      const r = await new AxeBuilder({ page }).analyze();
      for (const v of r.violations) {
        for (const node of v.nodes) {
          results.push({
            route, viewport: viewport.name, id: v.id, impact: v.impact,
            selector: node.target.join(' | '),
            html: node.html,
            failureSummary: node.failureSummary,
          });
        }
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(JSON.stringify(results, null, 2));
