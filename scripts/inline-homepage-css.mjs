/**
 * Postbuild step: inline the homepage's two Vite-emitted CSS chunks instead
 * of loading them as blocking <link rel="stylesheet"> requests.
 *
 * Why only the homepage, and why inlining rather than preload/defer:
 *
 * - Lighthouse's render-blocking-CSS audit on the homepage (the priority
 *   page per task scope) attributes ~2.4s of mobile FCP delay to five
 *   render-blocking stylesheets. Two of them are the Astro/Vite chunks
 *   `_astro/_slug_.*.css` (~33KB + ~32KB) that `[...slug].astro` emits on
 *   effectively every page (1684/1684 and 1684/1685 pages reference them) --
 *   they are not route-specific despite the `_slug_` name, just Vite's own
 *   chunk split of the site's shared component CSS.
 * - A prior attempt at a blanket `rel="preload" + onload` (or `media=print`)
 *   defer swap across all stylesheets did not move the score (documented as
 *   an already-tried, ineffective experiment) -- deferring still delays
 *   first paint until the swap fires, and risks a flash of unstyled content.
 *   This takes a different, narrower approach: inline the bytes so the
 *   browser never has to open a second/third connection or wait on a
 *   separate round trip for CSS it already has to parse before paint
 *   anyway. The CSS is byte-identical (lossless, Vite-minified already);
 *   only its delivery mechanism changes, and only on one page.
 * - Scoped to the homepage only (not all 1684 pages) so the other pages
 *   keep fetching these two files from a cached, shared, browser-cacheable
 *   URL across navigations -- this trades a small amount of per-visit bytes
 *   on the single highest-traffic entry page for two fewer render-blocking
 *   network round trips on it, without touching the cache economics of the
 *   rest of the site.
 *
 * Fails the build loudly (non-zero exit) if the homepage's own two expected
 * chunks are not found, rather than silently leaving them as external
 * <link> tags -- a build where Vite's chunking changed shape (e.g. merged
 * into one file, or split differently) should be looked at, not pass quietly
 * with this optimization silently doing nothing.
 */
import fs from 'node:fs';
import path from 'node:path';

const homepage = path.resolve('dist/index.html');
const distRoot = path.resolve('dist');

if (!fs.existsSync(homepage)) {
  console.error(`inline-homepage-css: expected build output missing: ${homepage}`);
  process.exit(1);
}

let html = fs.readFileSync(homepage, 'utf8');

const linkPattern = /<link rel="stylesheet" href="(\/_astro\/[^"]+\.css)">/g;
const matches = [...html.matchAll(linkPattern)];

if (matches.length === 0) {
  console.error('inline-homepage-css: no /_astro/*.css <link> tags found on the homepage -- '
    + 'expected at least the shared component-CSS chunks. Failing loudly instead of silently '
    + 'leaving the homepage unchanged (Vite\'s chunking or Base.astro\'s head markup may have changed).');
  process.exit(1);
}

let inlined = 0;
let bytesBefore = 0;
let bytesAfter = 0;

for (const [tag, href] of matches) {
  const cssFile = path.join(distRoot, href.replace(/^\//, ''));
  if (!fs.existsSync(cssFile)) {
    console.error(`inline-homepage-css: homepage references ${href} but ${cssFile} does not exist.`);
    process.exit(1);
  }
  const css = fs.readFileSync(cssFile, 'utf8');
  if (css.includes('</style')) {
    // Never expected from Vite-minified CSS output; guard anyway so a future
    // change can't silently break the page by closing the inline <style> tag
    // early.
    console.error(`inline-homepage-css: ${href} contains a literal "</style" sequence -- refusing to inline it unescaped.`);
    process.exit(1);
  }
  html = html.replace(tag, `<style>${css}</style>`);
  inlined += 1;
  bytesBefore += Buffer.byteLength(tag, 'utf8');
  bytesAfter += Buffer.byteLength(css, 'utf8') + '<style></style>'.length;
}

fs.writeFileSync(homepage, html);
console.log(`inline-homepage-css: inlined ${inlined} stylesheet(s) on the homepage only `
  + `(${bytesBefore} bytes of <link> markup -> ${bytesAfter} bytes of inline <style>, `
  + `removing ${inlined} render-blocking network request(s))`);
