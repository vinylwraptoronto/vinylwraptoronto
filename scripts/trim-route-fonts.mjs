/**
 * Postbuild step: route-scoped font-CSS byte reduction for /car-wraps/ and
 * /contact/ only. Runs after minify-static-css.mjs.
 *
 * Two provable removals, each guarded so the build FAILS (rather than silently
 * dropping glyphs) if the page ever stops satisfying the proof:
 *
 *  1. roboto.css link dropped. Browser-verified at 390/768/1280 (initial, nav,
 *     both modals, invalid-form states): zero text, pseudo-element, placeholder
 *     or form control on either route resolves to Roboto and no Roboto face is
 *     ever fetched. The only Roboto references in the page CSS are unconsumed
 *     custom properties (--e-global-typography-*-font-family, no var() reader)
 *     and the .arch-post h1 / .arch-excerpt system-font stack, which exist
 *     only on archive pages. Guard: no arch-post/arch-excerpt in the HTML.
 *  2. Poppins italic @font-face rules dropped (same technique as the homepage
 *     Roboto-italic trim), served as /fonts/poppins-upright.css. No text on
 *     either route is italic. Guard: no italic/oblique in page CSS, and none of
 *     the UA-italic elements (em, cite, address, dfn, var, non-icon <i>).
 *
 * Every upright Poppins face and subset (latin, latin-ext, devanagari) is
 * kept byte-identical, as is font-display. All other routes keep the shared
 * poppins.css / roboto.css. No performance gain is claimed here: bytes only.
 */
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const ROUTES = ['car-wraps', 'contact'];
const fail = (m) => { console.error(`trim-route-fonts: ${m}`); process.exit(1); };

const read = (p) => { if (!fs.existsSync(p)) fail(`missing ${p}`); return fs.readFileSync(p, 'utf8'); };
const poppins = read(path.join(dist, 'fonts', 'poppins.css'));
const faces = poppins.match(/@font-face\{[^}]*\}/g) ?? [];
const upright = faces.filter((f) => !/font-style:\s*(italic|oblique)/.test(f));
if (faces.length === 0 || poppins.replace(/@font-face\{[^}]*\}/g, '').trim() !== '') {
  fail('poppins.css is not purely @font-face rules; refusing to rewrite it');
}
if (upright.length === 0 || upright.length === faces.length) fail('unexpected italic/upright split in poppins.css');
const trimmed = upright.join('');
fs.writeFileSync(path.join(dist, 'fonts', 'poppins-upright.css'), trimmed);

/*
 * /contact/ only: metric-matched fallback for the Poppins swap (CLS fix).
 * Measured (Chrome 154, desktop 1350 and mobile 412, fonts delayed 0/800 ms):
 * with the generic Sans-serif fallback (Arial) the estimate copy block
 * `div.container>.cols>.col>.rt` re-wraps when Poppins arrives (302px -> 325px
 * tall at desktop, one extra line) and pushes the content below it: CLS 0.1627.
 * The logo is not the cause (153x33 both before and after; width/height attrs
 * reserve its box). Canvas-measured width of the page's own text, Poppins /
 * Arial: 400 -> 1.0949, 500 -> 1.1089, 600 -> 1.0474 (Arial Bold), 700 -> 1.0573
 * (Arial Bold). Poppins vertical metrics (hhea/typo 1050/350/100 per 1000 upm)
 * were confirmed as `line-height: normal` = 1.5em in the browser. Overrides are
 * divided by size-adjust because the metric overrides are scaled by it.
 * Only the inline Poppins stacks on this route gain the fallback family; it is
 * a local() face, so nothing is downloaded, and it is only consulted until
 * Poppins is ready. Hosts without Arial fall through to Sans-serif unchanged.
 */
const FALLBACK = [
  [400, 'Arial', 1.0949], [500, 'Arial', 1.1089],
  [600, 'Arial Bold', 1.0474], [700, 'Arial Bold', 1.0573],
];
const pct = (n) => `${+(n * 100).toFixed(2)}%`;
const fallbackCss = FALLBACK.map(([w, local, r]) =>
  `@font-face{font-family:"Poppins Fallback";font-weight:${w};src:local("${local}");size-adjust:${pct(r)};ascent-override:${pct(1.05 / r)};descent-override:${pct(0.35 / r)};line-gap-override:${pct(0.1 / r)}}`
).join('');

const L = (h) => `<link rel="stylesheet" href="${h}">`;
let saved = 0;
for (const route of ROUTES) {
  const file = path.join(dist, route, 'index.html');
  let html = read(file);
  for (const h of ['/fonts/poppins.css', '/fonts/roboto.css']) {
    if (!html.includes(L(h))) fail(`/${route}/ lacks ${L(h)}`);
  }
  // Collect the CSS this page actually applies (linked _astro sheets + inline).
  let css = [...html.matchAll(/<style[^>]*>([^<]*)<\/style>/g)].map((m) => m[1]).join('\n');
  for (const m of html.matchAll(/<link rel="stylesheet" href="(\/_astro\/[^"]+\.css)"/g)) {
    css += '\n' + read(path.join(dist, m[1]));
  }
  const body = html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<!--[\s\S]*?-->/g, '');
  // Italic is fine where the rule sets its own non-Poppins/Roboto family
  // (testimonial bubble uses Montserrat); the dropped faces are Poppins/Roboto only.
  for (const [, decl] of css.matchAll(/\{([^{}]*)\}/g)) {
    if (/font-style:\s*(italic|oblique)|font:\s*(italic|oblique)/i.test(decl) && !/font-family:\s*['"]?Montserrat/i.test(decl)) fail(`/${route}/ CSS declares italic`);
  }
  if (/<(em|cite|address|dfn|var)[\s>]/i.test(body)) fail(`/${route}/ has a UA-italic element`);
  for (const t of body.match(/<i[\s>][^>]*>/g) ?? []) {
    if (!/class="[^"]*\bfa[srb]?\b/.test(t)) fail(`/${route}/ has a non-icon <i>: ${t}`);
  }
  if (/arch-post|arch-excerpt/.test(body)) fail(`/${route}/ uses the Roboto archive stack`);
  // Roboto must only appear in unconsumed custom properties / the archive selector.
  const consumed = css
    .replace(/--(?:e-global-typography-(?:text|accent)-font-family|font-text):\s*"?Roboto"?(?:,\s*sans-serif)?;?/g, '')
    .replace(/[^{}]*\.arch-(?:post|excerpt)[^{}]*\{[^}]*\}/g, '');
  if (/roboto/i.test(consumed)) fail(`/${route}/ CSS still references Roboto in a consumed rule`);
  if (/var\(--(?:font-text|e-global-typography-(?:text|accent)-font-family)\)/.test(css)) {
    fail(`/${route}/ reads a Roboto custom property`);
  }
  html = html.replace(L('/fonts/poppins.css'), L('/fonts/poppins-upright.css')).replace(L('/fonts/roboto.css'), '');
  if (route === 'contact') {
    const stacks = (html.match(/Poppins&#34;, Sans-serif|font-family:Poppins,sans-serif/g) ?? []).length;
    if (stacks === 0) fail('/contact/ has no Poppins stack to attach the metric fallback to');
    html = html
      .replace(/Poppins&#34;, Sans-serif/g, 'Poppins&#34;, &#34;Poppins Fallback&#34;, Sans-serif')
      .replace(/font-family:Poppins,sans-serif/g, 'font-family:Poppins,"Poppins Fallback",sans-serif')
      .replace('</head>', `<style id="poppins-fallback">${fallbackCss}</style></head>`);
    if (!html.includes('id="poppins-fallback"')) fail('/contact/ has no </head> for the fallback face');
  }
  fs.writeFileSync(file, html);
  saved += 1;
}
const rob = fs.statSync(path.join(dist, 'fonts', 'roboto.css')).size;
console.log(`trim-route-fonts: ${saved} route(s); roboto.css (${rob} B) unlinked; poppins.css ${Buffer.byteLength(poppins)} B -> poppins-upright.css ${Buffer.byteLength(trimmed)} B`);
