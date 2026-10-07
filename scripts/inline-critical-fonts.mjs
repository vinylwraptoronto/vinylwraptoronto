/**
 * Postbuild step: inline the three shared, render-blocking font stylesheets
 * (poppins.css, roboto.css, fontawesome.css) on an explicit allowlist of
 * routes (/, /car-wraps/, /contact/) instead of loading them as blocking
 * <link rel="stylesheet"> requests.
 *
 * UPDATE: the allowlist was extended from the homepage to /car-wraps/ and
 * /contact/ after a fresh current-build critical-chain review showed the same
 * three font <link>s render-block those routes. Those two routes inline the
 * COMPLETE, unmodified dist/fonts/*.css (no Roboto italic trim -- italic use
 * there is not verified). Their /_astro/_slug_.*.css links are left untouched.
 * Performance benefit is UNPROVEN until an exclusive matched measurement.
 * Every other page still fetches the three files externally, as described
 * below.
 *
 * Why these three files, and why homepage-only:
 *
 * - Lighthouse's render-blocking-insight audit on the homepage attributes
 *   ~1.5-2s of mobile FCP/LCP delay (combined) to these three <link> tags in
 *   Base.astro -- the single largest shared bottleneck measured in
 *   _evidence/lh-full-20261002/DIAGNOSIS.md, bigger than the hero-image
 *   preload fix already shipped.
 * - They are shared across all ~1684 pages via Base.astro, and the postbuild
 *   subsetting/minify steps (subset-roboto-css.mjs, subset-fontawesome-css.mjs,
 *   minify-static-css.mjs) already shrank them considerably. Inlining
 *   site-wide would throw away the shared-cache benefit those files get
 *   across navigations on the other ~1683 pages, so -- exactly like
 *   inline-homepage-css.mjs's precedent for the Vite CSS chunks -- this is
 *   scoped to the homepage only (the one page this task measures and is
 *   accountable for), not an allowlist of several routes. Every other page,
 *   including /car-wraps/ and /contact/, keeps fetching these three files
 *   externally from a cached, shared URL exactly as before.
 *
 * Reads the already-subsetted/minified dist/fonts/*.css (never the larger
 * public/fonts/*.css sources -- inlining those would undo the subsetting
 * work and ship far more bytes than necessary).
 *
 * Unlike an earlier, parked version of this script, this one does NOT rewrite
 * font-display. A prior attempt rewrote every face's `swap`/`block` to
 * `optional` to try to avoid a CLS regression, but that gives the browser
 * only a ~100ms window to use the network font before permanently falling
 * back for that paint -- which measurably broke font rendering (Poppins
 * permanently falling back on the homepage, confirmed via
 * scripts/verify.mjs's "Poppins renders (not falling back)" check going
 * 15/15 -> 14/15) without the build failing loudly. The CSS here is inlined
 * byte-identical to what ships externally today, preserving the existing
 * font-display: swap (Poppins/Roboto) and font-display: block (Font Awesome)
 * behaviour exactly -- the same FOUT/FOIT trade-off the site already ships,
 * just delivered without an extra render-blocking network round trip.
 *
 * Fails the build loudly (non-zero exit) if the homepage's built HTML is
 * missing, or doesn't contain all three expected <link> tags, rather than
 * silently leaving it unoptimized.
 */
import fs from 'node:fs';
import path from 'node:path';

const distRoot = path.resolve('dist');
const FONT_HREFS = ['/fonts/poppins.css', '/fonts/roboto.css', '/fonts/fontawesome.css'];
/* route -> html file, and whether the homepage-only Roboto italic trim applies */
const ROUTES = [
  { route: '/', file: 'index.html', trimItalic: true },
  { route: '/car-wraps/', file: 'car-wraps/index.html', trimItalic: false },
  { route: '/contact/', file: 'contact/index.html', trimItalic: false },
];

for (const { route, file, trimItalic } of ROUTES) {
  const page = path.join(distRoot, file);
  if (!fs.existsSync(page)) {
    console.error(`inline-critical-fonts: expected build output missing: ${page}`);
    process.exit(1);
  }
  let html = fs.readFileSync(page, 'utf8');
  let inlined = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;

  for (const href of FONT_HREFS) {
    const tag = `<link rel="stylesheet" href="${href}">`;
    if (html.split(tag).length !== 2) {
      console.error(`inline-critical-fonts: ${route} must contain exactly one ${tag} -- `
        + 'refusing to proceed silently (the Base.astro head markup may have changed).');
      process.exit(1);
    }
    const cssFile = path.join(distRoot, href.replace(/^\//, ''));
    if (!fs.existsSync(cssFile)) {
      console.error(`inline-critical-fonts: ${route} references ${href} but ${cssFile} does not exist.`);
      process.exit(1);
    }
    let css = fs.readFileSync(cssFile, 'utf8');
    /* Homepage-only trim: no Roboto text on / is italic (verified in a real
       browser at 412px and 1280px), so Roboto italic @font-face rules are dead
       weight in the inlined HTML. Other routes inline the complete file. */
    if (trimItalic && href === '/fonts/roboto.css') {
      css = css.replace(/@font-face\{[^}]*font-style:\s*italic[^}]*\}/g, '');
    }
    if (css.includes('</style')) {
      console.error(`inline-critical-fonts: ${href} contains a literal "</style" sequence -- refusing to inline it unescaped.`);
      process.exit(1);
    }
    html = html.replace(tag, () => `<style>${css}</style>`);
    inlined += 1;
    bytesBefore += Buffer.byteLength(tag, 'utf8');
    bytesAfter += Buffer.byteLength(css, 'utf8') + '<style></style>'.length;
  }

  fs.writeFileSync(page, html);
  console.log(`inline-critical-fonts: ${route}: inlined ${inlined} font stylesheet(s) `
    + `(${bytesBefore} bytes of <link> markup -> ${bytesAfter} bytes of inline <style>, font-display unchanged)`);
}
