/**
 * The half of the census that HTML cannot answer: what the page actually looks
 * like once it has laid out, at three widths, on both sites.
 *
 * Reaching the two live hosts from a browser here needs both the session proxy
 * AND the proxy's own CA. Chromium does not read the CA bundle, so the run is
 * pinned to exactly that one key with --ignore-certificate-errors-spki-list --
 * NOT --ignore-certificate-errors, which would switch verification off
 * altogether. Verified: expired.badssl.com still fails through this browser.
 *
 * Both sides are measured at the same width and the same scroll state, and the
 * page is scrolled to the bottom and back before anything is counted. Lazy
 * images and entrance animations have not fired at the top of a long page, and
 * a census taken there reports the clone as missing content it simply had not
 * loaded yet.
 *
 *   node scripts/census-render.mjs --urls paths.txt --out render.json
 */
import fs from 'node:fs';
import { chromium } from 'playwright';

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const OUT = arg('--out', 'render.json');
const PATHS = fs.readFileSync(arg('--urls'), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
const WIDTHS = [1440, 900, 390];
const SPKI = 'KnP1OnzHv/y42eRQmbGwoYTHcSJF448m6CU5mdngwKk=';

/* Runs inside the page. Returns everything comparable about the laid-out
   document; matching between the two sides happens in Node, below. */
const PAYLOAD = () => {
  const vis = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  /* Text that a person can actually read: every text node whose ancestors are
     all visible. A section parked at opacity:0 waiting for an observer that
     never fires is in the DOM and invisible to every human being. */
  const visibleText = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = n.nodeValue.replace(/\s+/g, ' ').trim();
    if (t.length < 2) continue;
    let ok = true;
    for (let p = n.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) { ok = false; break; }
    }
    if (ok) visibleText.push(t);
  }

  const boxes = [...document.querySelectorAll('[data-eid]')].map((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      eid: el.dataset.eid,
      tag: el.tagName.toLowerCase(),
      w: Math.round(r.width), h: Math.round(r.height),
      pt: s.paddingTop, pb: s.paddingBottom, pl: s.paddingLeft, pr: s.paddingRight,
      mt: s.marginTop, mb: s.marginBottom,
      gap: s.gap, rowGap: s.rowGap, colGap: s.columnGap,
      maxW: s.maxWidth, fs: s.fontSize, lh: s.lineHeight,
      br: s.borderTopLeftRadius, bw: s.borderTopWidth,
      bg: s.backgroundColor, color: s.color, shadow: s.boxShadow,
    };
  });

  const imgs = [...document.querySelectorAll('img')].filter((i) => i.getAttribute('src'));
  return {
    docHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    widest: (() => {
      if (document.documentElement.scrollWidth <= document.documentElement.clientWidth) return null;
      let worst = null, max = 0;
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.right > max) { max = r.right; worst = el; }
      }
      return worst ? `${worst.tagName.toLowerCase()}.${(worst.className || '').toString().split(' ')[0]} right=${Math.round(max)}` : null;
    })(),
    headings: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .filter(vis).map((h) => [h.tagName.toLowerCase(), h.textContent.replace(/\s+/g, ' ').trim()]),
    visibleTextCount: visibleText.length,
    visibleWords: visibleText.join(' ').split(/\s+/).length,
    imgTotal: imgs.length,
    imgBroken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
    imgPending: imgs.filter((i) => !i.complete).length,
    parkedInvisible: [...document.querySelectorAll('body *')]
      .filter((el) => { const s = getComputedStyle(el); return +s.opacity === 0 && el.getBoundingClientRect().height > 8; })
      .length,
    boxes,
  };
};

const census = async (page, url) => {
  const out = { url };
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 1000 });
    await page.waitForTimeout(700);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(900);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    out[w] = await page.evaluate(PAYLOAD);
  }
  return out;
};

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', `--ignore-certificate-errors-spki-list=${SPKI}`],
  proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' },
});

const results = [];
for (const path of PATHS) {
  const rec = { path };
  for (const [side, host] of [['old', 'vinylwraptoronto.com'], ['new', 'astro.vinylwraptoronto.com']]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      await page.goto(`https://${host}${path}`, { waitUntil: 'load', timeout: 120000 });
      rec[side] = await census(page, `https://${host}${path}`);
    } catch (e) {
      rec[`${side}_error`] = String(e.message).split('\n')[0].slice(0, 120);
    }
    await page.close();
  }
  results.push(rec);
  const o = rec.old?.[1440], n = rec.new?.[1440];
  console.log(
    `${path.padEnd(48)} ` +
    (o && n
      ? `h ${String(o.docHeight).padStart(6)}/${String(n.docHeight).padStart(6)}  ` +
        `words ${String(o.visibleWords).padStart(5)}/${String(n.visibleWords).padStart(5)}  ` +
        `broken ${n.imgBroken}  parked ${n.parkedInvisible}`
      : `old:${rec.old_error ?? 'ok'} new:${rec.new_error ?? 'ok'}`)
  );
  fs.writeFileSync(OUT, JSON.stringify(results));
}
await browser.close();
console.log(`\nwritten ${OUT}`);
