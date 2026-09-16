/**
 * Section and widget geometry by Elementor element id, both sides, one browser.
 *
 * page-pass.mjs answers "is it there"; this answers "is it the same box". For
 * every id the port keys, it prints the width, the padding, the inner
 * container's width and padding and the height, and stays quiet where they
 * agree -- so a row that is boxed on the port and full width on the original
 * shows up as one line rather than as a page that is mysteriously taller.
 *
 *   node scripts/section-boxes.mjs /tesla-vinyl-wraps/
 *   NEW_ORIGIN=http://127.0.0.1:4399 node scripts/section-boxes.mjs / /our-work/
 */
import { chromium } from 'playwright';
const PATHS = process.argv.slice(2);
const OLD = 'https://vinylwraptoronto.com';
const NEW = process.env.NEW_ORIGIN || 'http://127.0.0.1:4399';
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--ignore-certificate-errors-spki-list=KnP1OnzHv/y42eRQmbGwoYTHcSJF448m6CU5mdngwKk='],
  proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' },
});
const PAYLOAD = (sel) => `(() => {
  const out = {};
  for (const el of document.querySelectorAll('[${sel}]')) {
    if (el.closest('header, footer, .elementor-location-header, .elementor-location-footer, .elementor-popup-modal')) continue;
    const id = el.getAttribute('${sel}');
    if (out[id]) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const inner = el.querySelector(':scope > .container, :scope > .elementor-container, :scope > .e-con-inner');
    const ics = inner ? getComputedStyle(inner) : null;
    const ir = inner ? inner.getBoundingClientRect() : null;
    out[id] = {
      w: Math.round(r.width), x: Math.round(r.x), h: Math.round(r.height),
      pad: cs.paddingTop + ' ' + cs.paddingRight + ' ' + cs.paddingBottom + ' ' + cs.paddingLeft,
      inw: ir ? Math.round(ir.width) : null, inx: ir ? Math.round(ir.x) : null,
      inpad: ics ? ics.paddingTop + ' ' + ics.paddingRight + ' ' + ics.paddingBottom + ' ' + ics.paddingLeft : null,
    };
  }
  return out;
})()`;
const grab = async (origin, path, sel) => {
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await p.goto(origin + path, { waitUntil: 'load', timeout: 120000 });
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 70)); } window.scrollTo(0, 0); });
  await p.waitForTimeout(1200);
  const r = await p.evaluate(PAYLOAD(sel));
  await p.close();
  return r;
};
for (const path of PATHS) {
  const [o, n] = [await grab(OLD, path, 'data-id'), await grab(NEW, path, 'data-eid')];
  console.log('==', path);
  for (const id of Object.keys(n)) {
    const a = o[id];
    if (!a) { console.log(`   ${id}  not on the original`); continue; }
    const c = n[id];
    const diffs = [];
    if (a.w !== c.w) diffs.push(`w ${a.w} vs ${c.w}`);
    if (a.pad !== c.pad) diffs.push(`pad ${a.pad} vs ${c.pad}`);
    if (a.inw !== c.inw) diffs.push(`inner w ${a.inw} vs ${c.inw}`);
    if (a.inpad !== c.inpad) diffs.push(`inner pad ${a.inpad} vs ${c.inpad}`);
    if (Math.abs(a.h - c.h) > 6) diffs.push(`h ${a.h} vs ${c.h}`);
    console.log(`   ${id}  ${diffs.length ? diffs.join(' | ') : 'ok'}`);
  }
}
await b.close();
