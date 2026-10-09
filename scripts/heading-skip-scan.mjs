#!/usr/bin/env node
/**
 * Full-site heading-level-skip scanner, reusing the EXACT same built-route
 * manifest as scripts/check-seo.mjs (same walk + SKIP regex for
 * sitemap/feed/admin), so skip counts are reconcilable against the SEO
 * lint's own page count rather than a separately-invented file list.
 *
 * A "skip" = an <hN> opening tag (document order) whose N is more than one
 * greater than the highest N seen so far on the page (standard heading-
 * outline skip definition; H1 -> H3 with no H2 first is a skip, H3 -> H2
 * -> H3 is not).
 *
 * Usage: node scripts/heading-skip-scan.mjs [--out file.json]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');

const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : e.name === 'index.html' ? [p] : [];
  });

// Identical to scripts/check-seo.mjs's SKIP so the "pages" denominator matches.
const SKIP = /^\/(?:[^/]*sitemap[^/]*\.xml|(?:[^/]+\/)?feed|admin(?:\/.*)?)\/$/;

const files = walk(DIST);
let pages = 0, skipped = 0;
const skipPages = [];

for (const f of files) {
  const rel = '/' + path.relative(DIST, f).split(path.sep).join('/').replace(/index\.html$/, '');
  if (SKIP.test(rel)) { skipped++; continue; }
  pages++;
  const html = fs.readFileSync(f, 'utf8');
  // Only headings inside <body> content, matching opening tags in document order.
  const tags = [...html.matchAll(/<h([1-6])\b[^>]*>/g)].map((m) => Number(m[1]));
  let max = 0;
  const instances = [];
  for (const n of tags) {
    if (max > 0 && n > max + 1) instances.push({ from: max, to: n });
    max = Math.max(max, n);
  }
  if (instances.length) skipPages.push({ page: rel, instances });
}

console.log(`total index.html found......... ${files.length}`);
console.log(`not pages, skipped.............. ${skipped}`);
console.log(`pages scanned.................... ${pages}`);
console.log(`pages with a heading-level skip.. ${skipPages.length}`);

const outArg = process.argv.indexOf('--out');
if (outArg !== -1 && process.argv[outArg + 1]) {
  fs.writeFileSync(process.argv[outArg + 1], JSON.stringify({ totalFiles: files.length, skippedNonPages: skipped, pages, skipPageCount: skipPages.length, skipPages }, null, 2));
  console.log(`full detail written to ${process.argv[outArg + 1]}`);
}
