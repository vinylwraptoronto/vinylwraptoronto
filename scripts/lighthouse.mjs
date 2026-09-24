import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import { serveDist } from './lib/static-site.mjs';

const routes = process.env.LIGHTHOUSE_ROUTES?.split(',').filter(Boolean) ?? ['/', '/car-wraps/', '/contact/'];
const { server, origin } = await serveDist(8163);
const chrome = await launch({ chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'] });
const failures = [];
const localOnlyAudits = new Set(['is-on-https', 'third-party-cookies']);

try {
  for (const route of routes) {
    const result = await lighthouse(origin + route, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      formFactor: 'mobile',
    });
    const scores = Object.fromEntries(Object.entries(result.lhr.categories).map(([key, value]) => [key, Math.round(value.score * 100)]));
    console.log(`${route} performance=${scores.performance} accessibility=${scores.accessibility} best-practices=${scores['best-practices']} seo=${scores.seo}`);
    const weakBestPractices = result.lhr.categories['best-practices'].auditRefs
      .filter(({ id, weight }) => weight > 0 && result.lhr.audits[id]?.score !== 1)
      .map(({ id }) => `${id}:${result.lhr.audits[id]?.scoreDisplayMode}`);
    if (weakBestPractices.length) console.log(`  best-practices diagnostics: ${weakBestPractices.join(', ')}`);
    const inspectorItems = result.lhr.audits['inspector-issues']?.details?.items ?? [];
    if (inspectorItems.length) console.log(`  inspector issue types: ${[...new Set(inspectorItems.map((item) => item.issueType || item.code || 'unknown'))].join(', ')}`);
    if (scores.accessibility < 90) failures.push(`${route} accessibility ${scores.accessibility} < 90`);
    if (scores.seo < 90) failures.push(`${route} SEO ${scores.seo} < 90`);
    const ignoredAudits = new Set(localOnlyAudits);
    if (inspectorItems.length && inspectorItems.every((item) => item.issueType === 'Cookie')) ignoredAudits.add('inspector-issues');
    const actionableBestPractices = weakBestPractices.filter((item) => !ignoredAudits.has(item.split(':')[0]));
    if (actionableBestPractices.length) failures.push(`${route} actionable best-practices failures: ${actionableBestPractices.join(', ')}`);
  }
} finally {
  try { await Promise.resolve(chrome.kill()); }
  catch (error) { console.warn(`Chrome cleanup warning: ${error.code || error.message}`); }
  server.close();
}

if (failures.length) {
  console.error(`\nLighthouse threshold failure(s):\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('\nPASS  Lighthouse accessibility/SEO/actionable best-practices thresholds met (performance and local HTTP/cookie diagnostics reported, not gated)');
