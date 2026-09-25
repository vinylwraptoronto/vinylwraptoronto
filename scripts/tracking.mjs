import { launchChromium } from './lib/browser.mjs';
import { serveDist } from './lib/static-site.mjs';

const expectDenied = process.argv.includes('--expect-consent-denied');
const { server, origin } = await serveDist(8162);
const browser = await launchChromium({ headless: true });
const context = await browser.newContext();
await context.route('**/*', (route) => {
  const url = new URL(route.request().url());
  return url.origin === origin ? route.continue() : route.abort();
});
const page = await context.newPage();
const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

try {
  await page.goto(`${origin}/car-wraps/?gclid=TEST-GCLID&utm_source=google&utm_campaign=verification`, { waitUntil: 'domcontentloaded' });
  const attribution = await page.evaluate(() => {
    const raw = document.cookie.match(/(?:^|;\s*)vwt_attr=([^;]*)/)?.[1];
    return raw ? JSON.parse(decodeURIComponent(raw)) : null;
  });
  check('paid-click attribution cookie', attribution?.gclid === 'TEST-GCLID' && attribution?.utm_campaign === 'verification');

  await page.locator('a[href^="tel:"]').first().dispatchEvent('click');
  const phoneEvents = await page.evaluate(() => (window.dataLayer || []).filter((entry) => entry?.event === 'phone_click'));
  check('phone click dataLayer event', phoneEvents.length === 1 && !JSON.stringify(phoneEvents[0]).includes('TEST-GCLID'));

  const consent = await page.evaluate(() => ({
    available: typeof window.vwtConsent === 'function',
    layer: (window.dataLayer || []).map((entry) => Array.from(entry || [])),
  }));
  const hasDeniedDefault = consent.layer.some((entry) => entry[0] === 'consent' && entry[1] === 'default' && entry[2]?.analytics_storage === 'denied');
  check(expectDenied ? 'consent defaults to denied' : 'consent gate remains opt-in', expectDenied ? hasDeniedDefault : !hasDeniedDefault);
  if (expectDenied) {
    await page.evaluate(() => window.vwtConsent(true));
    const granted = await page.evaluate(() => (window.dataLayer || []).some((entry) => entry?.event === 'consent_granted'));
    check('consent can be granted', consent.available && granted);
  }

  await page.route('**/api/quote/', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await page.goto(`${origin}/contact/`, { waitUntil: 'domcontentloaded' });
  const form = page.locator('form.qform').first();
  await form.locator('[name="name"]').fill('Verification Test');
  await form.locator('[name="email"]').fill('verification@example.test');
  await form.locator('[name="phone"]').fill('4165550100');
  await form.locator('.qbtn').click();
  await form.evaluate((element) => element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await form.locator('.qstatus[data-state="ok"]').waitFor({ state: 'attached' });
  const leadEvents = await page.evaluate(() => (window.dataLayer || []).filter((entry) => entry?.event === 'generate_lead'));
  check('successful quote records one lead', leadEvents.length === 1, `${leadEvents.length} event(s)`);
  check('lead event contains no contact PII', !/Verification Test|verification@example|4165550100/.test(JSON.stringify(leadEvents)));

  await form.locator('[name="name"]').fill('Bot');
  await form.locator('[name="email"]').fill('bot@example.test');
  await form.locator('[name="phone"]').fill('4165550101');
  await form.locator('[name="website"]').fill('https://spam.example');
  await form.locator('.qbtn').click();
  await form.locator('.qstatus[data-state="ok"]').waitFor();
  const afterHoneypot = await page.evaluate(() => (window.dataLayer || []).filter((entry) => entry?.event === 'generate_lead').length);
  check('honeypot response is not counted as a lead', afterHoneypot === 1, `${afterHoneypot} total event(s)`);
} finally {
  await browser.close();
  server.close();
}

for (const item of checks) console.log(`${item.pass ? 'PASS' : '*** FAIL'}  ${item.name}${item.detail ? ` (${item.detail})` : ''}`);
const failed = checks.filter((item) => !item.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} tracking checks passed`);
process.exit(failed.length ? 1 : 0);
