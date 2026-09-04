/**
 * Verify the built site by cascade, not by grep.
 *
 * A declaration can be present, correct, and still lose. Grepping for it
 * returns a pass while the page is wrong — so each rule that matters is checked
 * against what actually computes, and the hover behaviour is driven for real.
 *
 *   npx astro build && node scripts/verify.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIST = 'dist';
const PORT = 8123;
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.xml': 'application/xml', '.pdf': 'application/pdf',
};

const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(DIST, p);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    file = path.join(DIST, '404.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(404, { 'content-type': 'text/html' });
    return res.end(fs.readFileSync(file));
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const missing = [];
page.on('response', (r) => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); });
// A request that never gets a response — DNS failure, refused connection —
// fires requestfailed and no response event at all. Listening only for status
// >= 400 was fine while every image was same-origin, but images now come from
// img.vinylwraptoronto.com: if that host does not resolve, every one of them
// fails silently and this check passes on a page with no images on it.
page.on('requestfailed', (r) =>
  missing.push(`${r.failure()?.errorText ?? 'FAILED'} ${r.url()}`));

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

const checks = [];
const ok = (name, pass, detail = '') => checks.push({ name, pass, detail });

// --- fonts actually render -------------------------------------------------
const fonts = await page.evaluate(async () => {
  await document.fonts.ready;
  const probe = (f) => {
    const s = document.createElement('span');
    s.textContent = 'Vehicle Wraps Toronto 12345';
    s.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font-size:40px;font-family:${f}`;
    document.body.appendChild(s);
    const w = s.getBoundingClientRect().width;
    s.remove();
    return Math.round(w * 100) / 100;
  };
  return {
    loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`),
    poppins: probe('Poppins'),
    bogus: probe('"NoSuchFontXYZ"'),
    bodyFamily: getComputedStyle(document.body).fontFamily,
  };
});
ok('Poppins renders (not falling back)', fonts.poppins !== fonts.bogus,
   `poppins=${fonts.poppins} bogus=${fonts.bogus}`);
ok('body computes to Poppins', /Poppins/.test(fonts.bodyFamily), fonts.bodyFamily);

// --- the submenu rule actually wins ---------------------------------------
const sub = await page.evaluate(() => {
  const li = document.querySelector('.nav > ul > li.has-sub');
  const menu = li?.querySelector(':scope > .sub');
  return { display: menu ? getComputedStyle(menu).display : null, found: !!menu };
});
ok('submenu present', sub.found);
ok('submenu hidden at rest (base rule wins)', sub.display === 'none', `display=${sub.display}`);

// Drive the hover for real — presence of a :hover rule is not application.
const trigger = page.locator('.nav > ul > li.has-sub').first();
await trigger.hover();
await page.waitForTimeout(250);
const onHover = await page.evaluate(() => {
  const m = document.querySelector('.nav > ul > li.has-sub > .sub');
  return getComputedStyle(m).display;
});
ok('submenu opens on hover', onHover === 'block', `display=${onHover}`);

// And that it closes again — a menu that latches open is the classic bug.
await page.mouse.move(1420, 980);
await page.waitForTimeout(300);
const afterLeave = await page.evaluate(() => {
  const m = document.querySelector('.nav > ul > li.has-sub > .sub');
  return getComputedStyle(m).display;
});
ok('submenu closes on leave', afterLeave === 'none', `display=${afterLeave}`);

// --- header chrome ---------------------------------------------------------
const header = await page.evaluate(() => {
  const h = document.querySelector('.site-header');
  const cs = getComputedStyle(h);
  const cta = document.querySelector('.cta');
  return {
    borderBottom: cs.borderBottomColor + ' ' + cs.borderBottomWidth,
    bg: cs.backgroundColor,
    ctaBg: cta ? getComputedStyle(cta).backgroundColor : null,
    navLinks: document.querySelectorAll('.nav > ul > li > a').length,
    subLinks: document.querySelectorAll('.nav .sub a').length,
  };
});
ok('header border is 2px #99CC33', header.borderBottom === 'rgb(153, 204, 51) 2px', header.borderBottom);
ok('header background white', header.bg === 'rgb(255, 255, 255)', header.bg);
ok('CTA column is navy #15334C', header.ctaBg === 'rgb(21, 51, 76)', String(header.ctaBg));
ok('9 top-level nav links', header.navLinks === 9, String(header.navLinks));
ok('51 sub links survived', header.subLinks === 51, String(header.subLinks));

// --- no reference to the old server ---------------------------------------
let oldRefs = 0;
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== '_worker.js') walk(p); }
    else if (/\.(html|css|js)$/.test(e.name)) {
      const t = fs.readFileSync(p, 'utf8');
      const m = t.match(/https?:\/\/(www\.)?vinylwraptoronto\.com/g);
      // canonical/og:url legitimately name the production domain
      const refs = (m || []).filter((_, i) => {
        const idx = t.indexOf('vinylwraptoronto.com');
        return idx >= 0;
      });
      const bad = (t.match(/(src|href)=["']https?:\/\/(www\.)?vinylwraptoronto\.com\/wp-content/g) || []).length;
      oldRefs += bad;
    }
  }
};
walk(DIST);
ok('zero asset references to the old server', oldRefs === 0, `${oldRefs} found`);

// --- 404 + prerender -------------------------------------------------------
ok('404.html exists', fs.existsSync(path.join(DIST, '404.html')));
const pageFiles = fs.readdirSync('src/pages');
const noPrerender = pageFiles.filter((f) => f.endsWith('.astro') &&
  !fs.readFileSync(path.join('src/pages', f), 'utf8').includes('prerender = true'));
ok('every page declares prerender', noPrerender.length === 0, noPrerender.join(', '));

ok('no failed requests on the homepage', missing.length === 0, missing.slice(0, 5).join(' | '));

await browser.close();
server.close();

let failed = 0;
for (const c of checks) {
  if (!c.pass) failed++;
  console.log(`${c.pass ? 'PASS' : '*** FAIL'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
