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

/** Prefixes from splat rules in _redirects, e.g. "/wp-content/uploads/". */
const splatRedirects = [];

/*
 * Addresses handled by a redirect are reachable even though no page is built
 * for them — read _redirects so they are not reported as dead.
 *
 * Exactly the paths the file declares, and no variants. This used to also
 * credit the trailing-slash counterpart of every rule, on the assumption that
 * one implies the other. It does not: the asset server matches literal paths.
 * The Cloudflare adapter writes astro.config's /vinyl/ redirect into this file
 * as "/vinyl" with no slash, this site is trailingSlash "always", and so the
 * form that 1,651 pages actually link had no rule and answered 404 — while
 * this check reported zero dead links, because it had invented the rule that
 * would have covered it. A splat still covers everything beneath it.
 */
const redirectsFile = path.join(DIST, '_redirects');
if (fs.existsSync(redirectsFile)) {
  for (const line of fs.readFileSync(redirectsFile, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const from = t.split(/\s+/)[0];
    if (!from) continue;
    if (from.endsWith('*')) splatRedirects.push(from.slice(0, -1));
    else routes.add(from);
  }
}

const deadLinks = new Map();
const missingImages = new Map();
const unrewritten = new Map();
const directToB2 = new Map();
const remoteKeys = new Set();
const emptyPages = [];

/** Keep the same value the build baked in, so this checks what actually shipped. */
const IMG_BASE = (process.env.PUBLIC_IMG_BASE ?? 'https://img.vinylwraptoronto.com')
  .replace(/\/+$/, '');

const collect = (map, key, route) => {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(route);
};
let totalLinks = 0;
let totalImages = 0;

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
    if (/\.(css|js|png|jpe?g|webp|svg|ico|xml|pdf|woff2?|txt)$/i.test(href)) {
      // Asset links used to be skipped outright. That hid three colour-guide
      // PDFs that 404'd the moment the uploads tree stopped shipping in the
      // Worker: they are downloads, not <img>, so the image pass never saw
      // them either. Hold them to the same rule.
      if (href.startsWith('/wp-content/uploads/')) collect(unrewritten, href, route);
      else if (!exists(href)) collect(missingImages, href, route);
      continue;
    }
    totalLinks++;
    const norm = href.endsWith('/') ? href : href + '/';
    if (
      !routes.has(norm) &&
      !routes.has(href) &&
      !splatRedirects.some((p) => href.startsWith(p))
    ) {
      if (!deadLinks.has(href)) deadLinks.set(href, []);
      deadLinks.get(href).push(route);
    }
  }

  for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/g)) {
    const src = m[1];
    totalImages++;

    // Uploads are served from the image host. A src still pointing at the
    // local uploads path means the rewrite missed that emission point — the
    // page would still render, because the files are also in public/, so
    // nothing looks wrong until those copies are dropped. Catch it here.
    if (src.startsWith('/wp-content/uploads/')) {
      collect(unrewritten, src, route);
      continue;
    }

    // Collected for img-check.mjs, which requests every one of them over the
    // network. An offline check against public/wp-content/uploads would be
    // cheaper but no longer sound: a handful of files whose names contain an
    // en-dash are in the bucket under names the local tree does not carry.
    if (src.startsWith(IMG_BASE + '/')) {
      remoteKeys.add(src.slice(IMG_BASE.length + 1));
      continue;
    }

    if (!src.startsWith('/')) continue;
    if (!exists(src)) collect(missingImages, src, route);
  }

  // The site must never name the bucket's own origin: that address bypasses
  // Cloudflare and bills the client for every image view. Scanned across the
  // whole document, not just <img src> — a stylesheet url() or a link href
  // would cost the same.
  for (const m of html.matchAll(/["'(]([^"'()\s]*backblazeb2\.com[^"'()\s]*)/g)) {
    collect(directToB2, m[1], route);
  }
}

/*
 * The sitemaps.
 *
 * They are generated from a snapshot of the original's own sitemap index
 * (src/data/sitemap-groups.json), which is a list of addresses rather than a
 * query over the build. Nothing makes the two agree on their own: delete a
 * page and the sitemap keeps advertising it, which hands Google a soft 404 and
 * is invisible until Search Console reports it weeks later. So check here.
 *
 * A sitemap is also the one document on the site that must never name a
 * noindex page — the two instructions contradict each other and Google treats
 * the pairing as an error.
 */
const sitemapLocs = new Map();
let sitemapFiles = 0;
for (const f of fs.readdirSync(DIST)) {
  if (!f.endsWith('.xml')) continue;
  sitemapFiles++;
  const xml = fs.readFileSync(path.join(DIST, f), 'utf8');
  const isIndex = xml.includes('<sitemapindex');
  for (const m of xml.matchAll(/<loc>([^<]*)<\/loc>/g)) {
    const { pathname } = new URL(m[1]);
    if (isIndex) {
      // A child named by the index must exist as a file next to it.
      if (!fs.existsSync(path.join(DIST, pathname.replace(/^\//, '')))) {
        collect(sitemapLocs, pathname + '  (child named by the index is not built)', f);
      }
      continue;
    }
    if (!routes.has(pathname)) {
      collect(sitemapLocs, pathname + '  (listed but not built)', f);
      continue;
    }
    const page = path.join(DIST, pathname.replace(/^\//, ''), 'index.html');
    if (fs.existsSync(page)) {
      const robots = /<meta name="robots" content="([^"]*)"/.exec(fs.readFileSync(page, 'utf8'));
      if (robots && /noindex/i.test(robots[1])) {
        collect(sitemapLocs, pathname + '  (listed but noindex)', f);
      }
    }
  }
}

console.log(`pages:        ${htmlFiles.length}`);
console.log(`sitemaps:     ${sitemapFiles}   bad entries: ${sitemapLocs.size}`);
console.log(`internal links checked: ${totalLinks}   dead: ${deadLinks.size}`);
console.log(`image refs checked:     ${totalImages}   missing: ${missingImages.size}`);
console.log(`  on image host:        ${remoteKeys.size} distinct keys`);
console.log(`  not rewritten:        ${unrewritten.size}`);
console.log(`direct *.backblazeb2.com refs: ${directToB2.size}   (must be 0)`);
console.log(`empty pages:  ${emptyPages.length}`);

// The keys the built pages ask for, so img-check.mjs can request exactly those.
fs.writeFileSync('dist-img-keys.json', JSON.stringify([...remoteKeys].sort(), null, 0));

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
show('NOT REWRITTEN TO IMAGE HOST', unrewritten);
show('DIRECT TO BACKBLAZE — must go through Cloudflare', directToB2);
show('SITEMAP ENTRIES THAT DO NOT RESOLVE', sitemapLocs);
if (emptyPages.length) console.log('\nEMPTY PAGES:\n  ' + emptyPages.slice(0, 15).join('\n  '));

process.exit(
  deadLinks.size ||
  missingImages.size ||
  unrewritten.size ||
  directToB2.size ||
  emptyPages.length ||
  sitemapLocs.size
    ? 1
    : 0,
);
