/**
 * Where a page's height difference accumulates.
 *
 * A page that is 200px taller than the original is rarely 200px taller in one
 * place, and a list of section heights does not say which gap grew. This walks
 * the ids both renders share in document order and prints the RUNNING drift
 * beside each one, so the line where the drift jumps is the element that owns
 * it. That is how the 12 loop items on /tesla-vinyl-wraps/ were traced to 59px
 * of extra rhythm each rather than to the section around them.
 *
 *   node scripts/drift.mjs /tesla-vinyl-wraps/
 *   node scripts/drift.mjs /our-work/ http://127.0.0.1:4399
 */
import { chromium } from 'playwright';
const PATH = process.argv[2];
const NEW = process.argv[3] || 'http://127.0.0.1:4399';
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--ignore-certificate-errors-spki-list=KnP1OnzHv/y42eRQmbGwoYTHcSJF448m6CU5mdngwKk='],
  proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' },
});
const grab = async (origin, sel) => {
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await p.goto(origin + PATH, { waitUntil: 'load', timeout: 120000 });
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); } window.scrollTo(0, 0); });
  await p.waitForTimeout(1500);
  const r = await p.evaluate((s) => {
    const out = [];
    const seen = new Set();
    for (const el of document.querySelectorAll('[' + s + ']')) {
      const id = el.getAttribute(s);
      if (seen.has(id)) continue;
      seen.add(id);
      const r = el.getBoundingClientRect();
      out.push([id, Math.round(r.y + window.scrollY), Math.round(r.height)]);
    }
    return out;
  }, sel);
  await p.close();
  return r;
};
const [o, n] = [await grab('https://vinylwraptoronto.com', 'data-id'), await grab(NEW, 'data-eid')];
const om = new Map(o.map(([id, y, h]) => [id, { y, h }]));
let prev = 0;
for (const [id, y, h] of n) {
  const a = om.get(id);
  if (!a) continue;
  const drift = y - a.y;
  const step = drift - prev;
  if (Math.abs(step) >= 4 || Math.abs(a.h - h) >= 6)
    console.log(`${id}  y ${a.y}->${y} (drift ${drift >= 0 ? '+' : ''}${drift}, step ${step >= 0 ? '+' : ''}${step})  h ${a.h}->${h}`);
  prev = drift;
}
await b.close();
