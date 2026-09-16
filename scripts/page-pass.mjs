/**
 * One page, both sides, everything that differs — the working tool for a
 * page-by-page accuracy pass.
 *
 * The census pair (census.py + census-diff.py) answers "what did the old page
 * have that the new one does not", which catches losses and is blind to
 * everything the port renders at the wrong SIZE. The render census answers
 * shape but reports it as site-wide totals. Neither tells you, for one page,
 * the list of things to go and fix. This does.
 *
 * Both sides are measured in the same browser at the same width, and each is
 * scrolled to the bottom in 700px steps first: a jump to scrollHeight leaves
 * mid-page lazy images unloaded and every box below the fold measures short.
 *
 *   node scripts/page-pass.mjs /trailer-decals-lettering/
 *   node scripts/page-pass.mjs /trailer-decals-lettering/ --new https://astro.vinylwraptoronto.com
 *   node scripts/page-pass.mjs /box-truck-wrap/ --width 390
 */
import { chromium } from 'playwright';

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const PATH = process.argv[2];
if (!PATH || PATH.startsWith('--')) {
  console.error('usage: node scripts/page-pass.mjs /some-path/ [--new ORIGIN] [--width N]');
  process.exit(2);
}
const OLD = 'https://vinylwraptoronto.com';
const NEW = arg('--new', 'http://127.0.0.1:4399');
const WIDTH = Number(arg('--width', '1440'));
const SPKI = 'KnP1OnzHv/y42eRQmbGwoYTHcSJF448m6CU5mdngwKk=';

/* Runs in the page. Everything keyed so the two sides can be matched by
   identity rather than by position — a single inserted element shifts every
   index and turns one difference into a hundred. */
const PAYLOAD = () => {
  const norm = (s) => (s || '')
    .replace(/ /g, ' ').replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ').trim();
  /* checkVisibility is the only reliable test, but it answers "is this
     rendered", and screen-reader-only text IS rendered -- clipped to a 1px
     box off in a corner. The original labels its social icons with
     `.elementor-screen-only` spans and the port uses aria-label, so without
     this every page reported eight lost words and eight missing buttons that
     nobody can see on either side. */
  const srOnly = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return true;
    const c = getComputedStyle(el);
    return c.clip === 'rect(0px, 0px, 0px, 0px)' || c.clipPath === 'inset(50%)';
  };
  const vis = (el) => (el.checkVisibility
    ? el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })
    : !!el.offsetParent) && !srOnly(el);

  /* Sections, by the id Elementor gives them, which our port carries too.
     No size filter: the original keys every container and our port keys only
     the sections it renders as sections, so filtering by width here made a
     dozen of the original's inner containers read as "missing from the port"
     when the port simply does not label them. Ids present on only one side
     are reported separately from ids whose box differs. */
  const sections = {};
  for (const el of document.querySelectorAll('[data-id], [data-eid]')) {
    const id = el.dataset.id || el.dataset.eid;
    if (sections[id]) continue;
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    sections[id] = { h: Math.round(r.height), w: Math.round(r.width),
                     pad: c.padding, bg: c.backgroundColor, minH: c.minHeight };
  }

  /* Visible text runs, deduped — the comparison is "is this sentence on the
     page", not "how many times". */
  const text = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('script, style, noscript')) continue;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3) continue;
      const t = norm(n.nodeValue);
      if (t.length > 1 && vis(el)) text.add(t);
    }
  }

  /* Images by base filename: WordPress writes -300x169 and -768x432 variants
     of one upload and either side may ask for a different one. */
  const base = (u) => {
    try { u = new URL(u, location.href).pathname; } catch { /* keep as given */ }
    /* Strip EVERY trailing extension before the size suffix. The WebP plugin
       writes `name-300x169.jpg.webp`, so a rule anchored on a single final
       extension never sees the `-300x169` and one upload compares as two
       different files. */
    return (u.split('/').pop() || '').toLowerCase()
      .replace(/(\.[a-z0-9]{2,5})+$/, '')
      .replace(/-\d+x\d+$/, '').replace(/-scaled$/, '');
  };
  const images = {};
  for (const el of document.querySelectorAll('img')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    const k = base(el.currentSrc || el.src);
    if (!k) continue;
    (images[k] ||= []).push(`${Math.round(r.width)}x${Math.round(r.height)}`);
  }

  /* Buttons and links, by label. */
  const buttons = {};
  for (const el of document.querySelectorAll('a, button, input[type=submit]')) {
    if (!vis(el)) continue;
    /* aria-label too: the original names its social icons with a
       screen-reader span (filtered out above) and the port uses aria-label,
       so keying on innerText alone left ours unlabelled and reported all
       eight as missing. */
    const label = norm(el.innerText || el.value) || norm(el.getAttribute('aria-label'));
    if (!label) continue;
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    if (!buttons[label]) {
      buttons[label] = { box: `${Math.round(r.width)}x${Math.round(r.height)}`,
                         bg: c.backgroundColor, color: c.color, fs: c.fontSize, radius: c.borderRadius };
    }
  }

  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .filter(vis).map((h) => `${h.tagName} ${norm(h.innerText)}`);

  const forms = [...document.querySelectorAll('form')].map((f) => ({
    /* Visible fields only. `input:not([type=hidden])` does not cover a
       textarea, and the original's forms carry a display:none
       `g-recaptcha-response` one -- so every page reported its form as
       DIFFERING by a field nobody can see and the port has no reason to
       carry. */
    fields: [...f.querySelectorAll('input:not([type=hidden]), textarea, select')]
      .filter((e) => e.getBoundingClientRect().height > 0)
      .map((e) => `${e.tagName.toLowerCase()}:${e.type || ''}[${norm(e.placeholder)}]`),
    submit: norm((f.querySelector('button, input[type=submit]') || {}).innerText || ''),
  }));

  return {
    docHeight: Math.round(document.documentElement.scrollHeight),
    sections, text: [...text], images, buttons, headings, forms,
  };
};

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', `--ignore-certificate-errors-spki-list=${SPKI}`],
  proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' },
});

const grab = async (origin) => {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 1000 } });
  await page.goto(origin + PATH, { waitUntil: 'load', timeout: 120000 });
  /* Stepped, never a jump: a jump to scrollHeight skips the lazy images in
     between and every box below the fold then measures short. */
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
  });
  /* Then wait for the lazy images to actually arrive. On an 11,000px listing
     the stepped scroll reaches the bottom well before 55 thumbnails have
     decoded, and measuring there reports them as missing and the page as
     thousands of pixels short -- both untrue. Settle on the count of complete
     images rather than on a fixed timeout. */
  await page.evaluate(async () => {
    let last = -1, same = 0;
    for (let i = 0; i < 40 && same < 3; i++) {
      const n = [...document.images].filter((im) => im.complete && im.naturalWidth > 0).length;
      same = n === last ? same + 1 : 0;
      last = n;
      await new Promise((r) => setTimeout(r, 250));
    }
  });
  await page.waitForTimeout(500);
  const out = await page.evaluate(PAYLOAD);
  await page.close();
  return out;
};

const old = await grab(OLD);
const neu = await grab(NEW);
await browser.close();

const H = (s) => console.log(`\n${s}`);
console.log(`${PATH}   at ${WIDTH}px   old ${OLD}   new ${NEW}`);
console.log(`  page height ......... ${old.docHeight}  vs  ${neu.docHeight}` +
  (Math.abs(old.docHeight - neu.docHeight) > 40 ? `   <-- ${neu.docHeight - old.docHeight > 0 ? '+' : ''}${neu.docHeight - old.docHeight}` : ''));

H('SECTIONS  (matched by Elementor id; height, then padding)');
const shared = Object.keys(old.sections).filter((k) => neu.sections[k]);
let secDiff = 0;
for (const id of shared) {
  const a = old.sections[id], b = neu.sections[id];
  const dh = b.h - a.h;
  if (Math.abs(dh) > 12 || a.pad !== b.pad) {
    console.log(`  ${id}  h ${a.h} -> ${b.h} (${dh > 0 ? '+' : ''}${dh})` +
      (a.pad !== b.pad ? `   pad ${a.pad} -> ${b.pad}` : ''));
    secDiff++;
  }
}
if (!secDiff) console.log(`  all ${shared.length} matched`);
else console.log(`  (${shared.length} ids matched in total)`);
/* Only ids the port does not carry AT ALL. The original labels every inner
   container and the port labels sections, so an unmatched id is usually a
   container rather than a loss — worth listing, never worth alarming about. */
const unmatched = Object.keys(old.sections).filter((k) => !neu.sections[k]);
if (unmatched.length) console.log(`  ${unmatched.length} of the original's ids are not keyed in the port (inner containers): ${unmatched.slice(0, 8).join(' ')}${unmatched.length > 8 ? ' ...' : ''}`);

H('TEXT  (on the original, not on the port)');
const nt = new Set(neu.text);
const lost = old.text.filter((t) => !nt.has(t));
console.log(lost.length ? lost.map((t) => `  - ${t.slice(0, 110)}`).join('\n') : '  none');
const ot = new Set(old.text);
const added = neu.text.filter((t) => !ot.has(t));
if (added.length) { H('TEXT  (on the port, not on the original)'); console.log(added.map((t) => `  + ${t.slice(0, 110)}`).join('\n')); }

H('IMAGES');
const missing = Object.keys(old.images).filter((k) => !neu.images[k]);
const sized = Object.keys(old.images).filter((k) => neu.images[k] &&
  neu.images[k][0] !== old.images[k][0]);
if (missing.length) console.log(missing.map((k) => `  - ${k}  ${old.images[k].join(',')}`).join('\n'));
for (const k of sized) console.log(`  ~ ${k}   ${old.images[k][0]} -> ${neu.images[k][0]}`);
if (!missing.length && !sized.length) console.log('  all present at the same size');

H('HEADINGS');
const nh = new Set(neu.headings);
const lostH = old.headings.filter((h) => !nh.has(h));
console.log(lostH.length ? lostH.map((h) => `  - ${h}`).join('\n') : '  all present');

H('BUTTONS  (label: box / background / size / radius)');
let btnDiff = 0;
for (const [label, a] of Object.entries(old.buttons)) {
  const b = neu.buttons[label];
  if (!b) { console.log(`  - "${label.slice(0, 50)}"  MISSING`); btnDiff++; continue; }
  const d = [];
  if (a.box !== b.box) d.push(`box ${a.box}->${b.box}`);
  if (a.bg !== b.bg) d.push(`bg ${a.bg}->${b.bg}`);
  if (a.fs !== b.fs) d.push(`fs ${a.fs}->${b.fs}`);
  if (a.radius !== b.radius) d.push(`r ${a.radius}->${b.radius}`);
  if (d.length) { console.log(`  ~ "${label.slice(0, 44)}"  ${d.join('  ')}`); btnDiff++; }
}
if (!btnDiff) console.log('  all matched');

H('FORMS');
old.forms.forEach((a, i) => {
  const b = neu.forms[i];
  if (!b) { console.log(`  #${i} MISSING`); return; }
  const same = JSON.stringify(a.fields) === JSON.stringify(b.fields) && a.submit === b.submit;
  console.log(`  #${i} ${same ? 'matches' : 'DIFFERS'}`);
  if (!same) {
    console.log(`     old ${a.fields.join(' ')}  submit "${a.submit}"`);
    console.log(`     new ${b.fields.join(' ')}  submit "${b.submit}"`);
  }
});
if (neu.forms.length > old.forms.length) console.log(`  port has ${neu.forms.length - old.forms.length} more form(s) — usually the popup, which the original loads on demand`);
if (!old.forms.length) console.log('  no form on either side');
