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
const CONC = Number(arg('--concurrency', '6'));
const BOXES = !process.argv.includes('--no-boxes');
const SPKI = 'KnP1OnzHv/y42eRQmbGwoYTHcSJF448m6CU5mdngwKk=';

/* Runs inside the page. Returns everything comparable about the laid-out
   document; matching between the two sides happens in Node, below. */
const PAYLOAD = (withBoxes) => {
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
    /* checkVisibility(), not a walk up the ancestors checking display and
       opacity. Those three properties are not the only way a browser hides
       something: a collapsed <details> hides its panel with content-visibility,
       and a subtree hidden that way still answers getComputedStyle with
       display:block AND still returns a non-zero rect for a Range inside it.
       Counting by hand therefore reported a page's ten collapsed FAQ answers as
       209 words of visible copy the original did not have -- a defect that was
       not there, on a page that was correct. */
    const host = n.parentElement;
    if (!host || !host.checkVisibility({
      contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true,
    })) continue;
    visibleText.push(t);
  }

  /* Matched by the Elementor element id, which both sides carry under different
     names -- data-id on the original, data-eid on the port. The hard part is
     that they do not put a widget's styling on the same node, and no choice of
     single node makes the two comparable.

     Elementor splits one widget across three: the outer wrapper carries
     alignment, `> .elementor-widget-container` carries the box (background,
     padding, border), and the content element inside it carries the type
     (font-size, colour). The port collapses all three onto the one element it
     renders. So matching wrapper-to-element, or descending to the content and
     matching that, both compare a styled node against an unstyled one.

     Measured: matching wrapper-to-element produced 480 "differences" across
     five pages and 27 "unit-class errors"; descending to the content produced
     198 more. Every one checked by hand was this mismatch -- a heading whose
     navy box the original puts on the container and the port puts on the h3
     renders identically and compares as four separate defects.

     So the old side is flattened: walk the wrapper, its container and its
     content, and take each property from the first node that sets it to
     something other than the initial value. That is the union the port's single
     element is actually equivalent to. */
  const INITIAL = { backgroundColor: 'rgba(0, 0, 0, 0)', boxShadow: 'none' };
  const flatten = (wrap) => {
    if (wrap.dataset.eid) return [wrap];                 // the port: one node
    const chain = [wrap];
    const container = wrap.querySelector(':scope > .elementor-widget-container');
    if (container) {
      chain.push(container);
      const content = container.firstElementChild;
      if (content) chain.push(content);
    }
    return chain;
  };
  const pick = (chain, prop, initial) => {
    for (const el of chain) {
      const v = getComputedStyle(el)[prop];
      if (v && v !== initial && v !== '0px' && v !== 'normal') return v;
    }
    return getComputedStyle(chain[0])[prop];
  };
  const boxes = [...document.querySelectorAll('[data-eid],[data-id]')].map((wrap) => {
    const chain = flatten(wrap);
    const el = chain[chain.length - 1];
    const type_ = getComputedStyle(el);
    const r = (chain[1] || chain[0]).getBoundingClientRect();
    return {
      eid: wrap.dataset.eid || wrap.dataset.id,
      tag: el.tagName.toLowerCase(),
      w: Math.round(r.width), h: Math.round(r.height),
      /* Box properties come from whichever node in the chain sets them --
         usually the widget container. INHERITED ones must not: font-size,
         line-height and colour have a computed value on every node, so "the
         first node that sets it" always returns the wrapper's inherited 16px
         and never reaches the 35px heading inside. Read those off the content
         node. That one distinction accounted for the bulk of the residual
         differences -- mb, colour, line-height and font-size were 4 of the top
         5 properties flagged. */
      pt: pick(chain, 'paddingTop'), pb: pick(chain, 'paddingBottom'),
      pl: pick(chain, 'paddingLeft'), pr: pick(chain, 'paddingRight'),
      mt: type_.marginTop, mb: type_.marginBottom,
      gap: pick(chain, 'gap'), rowGap: pick(chain, 'rowGap'), colGap: pick(chain, 'columnGap'),
      maxW: pick(chain, 'maxWidth'),
      fs: type_.fontSize, lh: type_.lineHeight, color: type_.color,
      br: pick(chain, 'borderTopLeftRadius'), bw: pick(chain, 'borderTopWidth'),
      bg: pick(chain, 'backgroundColor', INITIAL.backgroundColor),
      shadow: pick(chain, 'boxShadow', INITIAL.boxShadow),
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
    boxes: withBoxes ? boxes : undefined,
  };
};

const census = async (page) => {
  const out = {};
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 1000 });
    await page.waitForTimeout(700);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(900);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    out[w] = await page.evaluate(PAYLOAD, BOXES);
  }
  return out;
};

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', `--ignore-certificate-errors-spki-list=${SPKI}`],
  proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' },
});

/* Resumable, a line at a time. A full-site pass is hours of browser work and
   the first long run died two thirds through holding everything in memory. */
const done = new Set();
if (fs.existsSync(OUT)) {
  for (const line of fs.readFileSync(OUT, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { done.add(JSON.parse(line).path); } catch { /* half-written last line */ }
  }
}
const todo = PATHS.filter((p) => !done.has(p));
console.log(`${todo.length} addresses to measure (${done.size} already done), ` +
  `${CONC} at a time, boxes ${BOXES ? 'on' : 'off'}`);

const fh = fs.openSync(OUT, 'a');
let cursor = 0, finished = 0;

const one = async (path) => {
  const rec = { path };
  for (const [side, host] of [['old', 'vinylwraptoronto.com'], ['new', 'astro.vinylwraptoronto.com']]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      await page.goto(`https://${host}${path}`, { waitUntil: 'load', timeout: 120000 });
      rec[side] = await census(page);
    } catch (e) {
      rec[`${side}_error`] = String(e.message).split('\n')[0].slice(0, 120);
    }
    await page.close();
  }
  return rec;
};

const worker = async () => {
  while (cursor < todo.length) {
    const path = todo[cursor++];
    let rec;
    try { rec = await one(path); }
    catch (e) { rec = { path, fatal: String(e.message).slice(0, 120) }; }
    fs.writeSync(fh, JSON.stringify(rec) + '\n');
    finished++;
    const o = rec.old?.[1440], n = rec.new?.[1440];
    if (!o || !n || n.imgBroken || n.overflow || n.parkedInvisible ||
        (o.visibleWords && Math.abs(o.visibleWords - n.visibleWords) > o.visibleWords * 0.1)) {
      console.log(`  FLAG ${path} ` + (o && n
        ? `words ${o.visibleWords}/${n.visibleWords} broken ${n.imgBroken} ovf ${n.overflow} parked ${n.parkedInvisible}`
        : `old:${rec.old_error ?? 'ok'} new:${rec.new_error ?? 'ok'}`));
    }
    if (finished % 25 === 0) console.log(`  ${finished}/${todo.length}`);
  }
};

await Promise.all(Array.from({ length: CONC }, worker));
fs.closeSync(fh);
await browser.close();
console.log(`\nwritten ${OUT}`);
