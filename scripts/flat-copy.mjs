/**
 * Build a flat, self-contained copy of the built site for side-by-side review.
 *
 * The normal build links /_astro/….css — an absolute path that resolves to the
 * drive root over file://, so opening dist/ directly renders unstyled and looks
 * catastrophically broken when nothing is wrong. This inlines the CSS and JS,
 * rewrites internal links to flat filenames, and writes the result to review/.
 *
 *   node scripts/flat-copy.mjs
 *   # then open review/index.html next to the live site
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const DIST = 'dist';
const OUT = 'review';

const read = (p) => fs.readFile(p, 'utf8');

async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '_worker.js') continue;
      out.push(...(await walk(p)));
    } else if (e.name.endsWith('.html')) {
      out.push(p);
    }
  }
  return out;
}

/** /car-wraps/ -> car-wraps.html ; / -> index.html */
const flatName = (href) => {
  const clean = href.split('#')[0].split('?')[0];
  const slug = clean.replace(/^\/+|\/+$/g, '');
  return slug === '' ? 'index.html' : `${slug.replace(/\//g, '__')}.html`;
};

const pages = await walk(DIST);
await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });

let inlinedCss = 0;
let inlinedJs = 0;

for (const page of pages) {
  let html = await read(page);

  // Inline every local stylesheet.
  const links = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/g)];
  for (const [tag] of links) {
    const href = (tag.match(/href=["']([^"']+)["']/) || [])[1];
    if (!href || href.startsWith('http')) continue;
    try {
      const css = await read(path.join(DIST, href.replace(/^\//, '')));
      html = html.replace(tag, `<style>\n${css}\n</style>`);
      inlinedCss++;
    } catch {
      /* font CSS lives in public/ and may reference files not present; leave it */
    }
  }

  // Inline local scripts — carousels and menus need their JS or the review is
  // of a static page.
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*><\/script>/g)];
  for (const [tag, src] of scripts) {
    if (src.startsWith('http')) continue;
    try {
      const js = await read(path.join(DIST, src.replace(/^\//, '')));
      html = html.replace(tag, `<script type="module">\n${js}\n</script>`);
      inlinedJs++;
    } catch {
      /* ignore */
    }
  }

  // Rewrite internal page links to the flat filenames.
  html = html.replace(/href="(\/[^"#?]*?)"/g, (m, href) => {
    if (/\.(css|js|png|jpe?g|webp|svg|ico|xml|pdf|woff2?)$/i.test(href)) return m;
    return `href="${flatName(href)}"`;
  });

  // Images stay root-relative; point them at the built dist copy so they load.
  const rel = path.relative(OUT, DIST).replace(/\\/g, '/');
  html = html.replace(/(src|href)="\/(wp-content|images|fonts)\//g, `$1="${rel}/$2/`);

  const name = flatName('/' + path.relative(DIST, page).replace(/index\.html$/, ''));
  await fs.writeFile(path.join(OUT, name), html);
}

console.log(`flat copy: ${pages.length} pages -> ${OUT}/`);
console.log(`inlined: ${inlinedCss} stylesheets, ${inlinedJs} scripts`);
console.log(`open ${OUT}/index.html beside the live site at desktop width`);
