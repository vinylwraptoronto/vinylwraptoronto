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
  if (/font-style:\s*(italic|oblique)|font:\s*(italic|oblique)/i.test(css)) fail(`/${route}/ CSS declares italic`);
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
  fs.writeFileSync(file, html);
  saved += 1;
}
const rob = fs.statSync(path.join(dist, 'fonts', 'roboto.css')).size;
console.log(`trim-route-fonts: ${saved} route(s); roboto.css (${rob} B) unlinked; poppins.css ${Buffer.byteLength(poppins)} B -> poppins-upright.css ${Buffer.byteLength(trimmed)} B`);
