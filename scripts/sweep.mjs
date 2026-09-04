/**
 * Sitewide sweep over the built output: every internal link resolves to a built
 * page, every referenced image exists on disk, and no page came out empty.
 *
 * Static analysis of dist/ rather than a browser crawl — at 676 pages that is
 * the difference between seconds and an hour, and it catches the failures that
 * actually happen after a bulk port: a dead link, a missing upload, a page that
 * rendered its chrome and nothing else.
 */
import fs from 'node:fs';
import path from 'node:path';

const DIST = 'dist';

const htmlFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (e.name !== '_worker.js') walk(p);
    } else if (e.name.endsWith('.html')) htmlFiles.push(p);
  }
})(DIST);

const routeOf = (f) =>
  '/' + path.relative(DIST, f).replace(/index\.html$/, '').replace(/\\/g, '/');
const routes = new Set(htmlFiles.map(routeOf));

// Addresses handled by a redirect are reachable even though no page is built
// for them — read _redirects so they are not reported as dead.
const redirectsFile = path.join(DIST, '_redirects');
if (fs.existsSync(redirectsFile)) {
  for (const line of fs.readFileSync(redirectsFile, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const from = t.split(/\s+/)[0];
    if (from) {
      routes.add(from);
      routes.add(from.endsWith('/') ? from : from + '/');
    }
  }
}

const deadLinks = new Map();
const missingImages = new Map();
const directToB2 = new Map();
const emptyPages = [];
let totalLinks = 0;
let totalImages = 0;
let remoteImages = 0;

// Images are served from the B2 bucket through img.[domain] (AD-9), so most
// src values are now absolute and no longer resolve inside dist/. Recognise
// that host and check the key behind it; PUBLIC_IMAGE_BASE keeps this honest
// when the build was pointed somewhere else.
const IMAGE_BASE = (process.env.PUBLIC_IMAGE_BASE || 'https://img.vinylwraptoronto.com')
  .replace(/\/+$/, '');

/** The uploads key a src refers to, or null if it is not an upload. */
const uploadKey = (src) => {
  if (IMAGE_BASE && src.startsWith(IMAGE_BASE + '/')) {
    remoteImages++;
    return src.slice(IMAGE_BASE.length + 1);
  }
  if (src.startsWith('/wp-content/uploads/')) return src.slice('/wp-content/uploads/'.length);
  return null;
};

const exists = (p) => fs.existsSync(path.join(DIST, decodeURIComponent(p).replace(/^\//, '')));

for (const f of htmlFiles) {
  const html = fs.readFileSync(f, 'utf8');
  const route = routeOf(f);

  // main content between </header> and <footer>, to spot pages with chrome only
  const body = html.split('</header>')[1]?.split('<footer')[0] ?? html;
  const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const imgsInBody = (body.match(/<img /g) || []).length;
  if (text.length < 60 && imgsInBody === 0) emptyPages.push(route);

  for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) {
    const href = m[1];
    if (/\.(css|js|png|jpe?g|webp|svg|ico|xml|pdf|woff2?|txt)$/i.test(href)) continue;
    totalLinks++;
    const norm = href.endsWith('/') ? href : href + '/';
    if (!routes.has(norm) && !routes.has(href)) {
      if (!deadLinks.has(href)) deadLinks.set(href, []);
      deadLinks.get(href).push(route);
    }
  }

  for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/g)) {
    const src = m[1];
    const key = uploadKey(src);

    // An image on the host is still checkable offline: the bucket was proved
    // byte-for-byte against public/wp-content/uploads at gate 5, so the local
    // tree is a faithful index of what the bucket holds.
    if (key !== null) {
      totalImages++;
      if (!exists(`/wp-content/uploads/${key}`)) {
        if (!missingImages.has(src)) missingImages.set(src, []);
        missingImages.get(src).push(route);
      }
      continue;
    }

    if (src.startsWith('/')) {
      totalImages++;
      if (!exists(src)) {
        if (!missingImages.has(src)) missingImages.set(src, []);
        missingImages.get(src).push(route);
      }
    }
  }

  // The site must never name the bucket's own origin: that address bypasses
  // Cloudflare and bills the client for every image view.
  for (const m of html.matchAll(/["'(]([^"'()\s]*backblazeb2\.com[^"'()\s]*)/g)) {
    if (!directToB2.has(m[1])) directToB2.set(m[1], []);
    directToB2.get(m[1]).push(route);
  }
}

console.log(`pages:        ${htmlFiles.length}`);
console.log(`internal links checked: ${totalLinks}   dead: ${deadLinks.size}`);
console.log(`image refs checked:     ${totalImages}   missing: ${missingImages.size}`);
console.log(`  on ${IMAGE_BASE}: ${remoteImages}   served from public/: ${totalImages - remoteImages}`);
console.log(`direct *.backblazeb2.com refs: ${directToB2.size}   (must be 0)`);
console.log(`empty pages:  ${emptyPages.length}`);

const show = (label, map, n = 15) => {
  if (map.size === 0) return;
  console.log(`\n${label}:`);
  let i = 0;
  for (const [k, v] of map) {
    if (i++ >= n) { console.log(`  ...and ${map.size - n} more`); break; }
    console.log(`  ${k}  (${v.length} page${v.length > 1 ? 's' : ''}, e.g. ${v[0]})`);
  }
};

show('DEAD LINKS', deadLinks);
show('MISSING IMAGES', missingImages);
show('DIRECT TO BACKBLAZE — must go through Cloudflare', directToB2);
if (emptyPages.length) console.log('\nEMPTY PAGES:\n  ' + emptyPages.slice(0, 15).join('\n  '));

process.exit(
  deadLinks.size || missingImages.size || directToB2.size || emptyPages.length ? 1 : 0,
);
