/**
 * Fails the build on metadata that is missing, unparseable, or lost relative to
 * the original.
 *
 * Two checks matter, and they are different from each other.
 *
 * 1. `JSON.parse` on every structured-data block. A presence check -- does the
 *    page carry a <script type="application/ld+json"> -- passes on a block
 *    Google throws away whole, and that failure is completely silent: nothing
 *    in the browser, nothing in the build, nothing in Search Console beyond the
 *    rich result quietly never appearing. One stray line break inside a JSON
 *    string is enough. The agency's own site carried such a block for years.
 *
 * 2. Did this page keep what the original had? The head of every one of the 678
 *    carried addresses was captured while the original was still up and lives
 *    in that page's own JSON. So the standard is not a rule invented here --
 *    it is the client's own site, address by address. A page whose source head
 *    declared a description, a JSON-LD graph or an ownership token, and whose
 *    built HTML does not carry it, has lost something in the port, and that is
 *    a failure.
 *
 * The distinction is the whole design. A blanket rule -- "every page must have
 * JSON-LD" -- fails 81 addresses the original also ships without it, and a
 * build that fails on things nobody intends to fix is a build everyone learns
 * to ignore. Those are reported instead, because they are opportunities rather
 * than regressions.
 *
 * Also reported rather than failed:
 *
 *   title and description length. Every carried address has the original's own
 *   text, byte for byte, and that was the requirement. Some of it is longer
 *   than Google shows. Failing on that would be failing on the client's copy,
 *   which this port has no mandate to rewrite.
 *
 *   images without alt. An empty alt is correct for a decorative image and no
 *   script can tell which is which. It should stay near zero.
 *
 *   node scripts/check-seo.mjs            # fail on any regression
 *   node scripts/check-seo.mjs --report   # print, always exit 0
 */
import fs from 'node:fs';
import path from 'node:path';
import { verification } from '../seo.config.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const REPORT_ONLY = process.argv.includes('--report');

if (!fs.existsSync(DIST)) {
  console.error('dist/ not found — run the build first.');
  process.exit(1);
}

/* ---------- what the original carried, address by address ---------- */

/** path -> { meta: [[key, isProperty, value]], ld } */
const source = new Map();
const addSource = (doc) => {
  if (!doc?.url) return;
  try {
    source.set(new URL(doc.url).pathname, doc.head ?? {});
  } catch { /* a malformed url is not a page we can key on */ }
};
for (const f of fs.readdirSync(path.join(ROOT, 'src/data/pages')))
  addSource(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/pages', f), 'utf8')));
const postsFile = path.join(ROOT, 'src/data/posts.json');
if (fs.existsSync(postsFile))
  for (const p of JSON.parse(fs.readFileSync(postsFile, 'utf8'))) addSource(p);

const declared = (head, key) =>
  (head?.meta ?? []).some(([k, , v]) => k.toLowerCase() === key && v);

/* ---------- walk the build ---------- */

const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : e.name === 'index.html' ? [p] : [];
  });

/** Not a page: the sitemaps and the three feeds are XML documents that the
 *  asset server maps from index.html files, and the admin is behind a login. */
const SKIP = /^\/(?:[^/]*sitemap[^/]*\.xml|(?:[^/]+\/)?feed|admin(?:\/.*)?)\/$/;

const fails = [];
const opportunity = { noLd: [], noDesc: [] };
const warn = { titleLen: [], descLen: [] };
let pages = 0, carried = 0, ld = 0, alt = 0, noalt = 0, skipped = 0, noindex = 0;
let tokenPages = 0;

for (const f of walk(DIST)) {
  let rel = '/' + path.relative(DIST, f).replace(/index\.html$/, '');
  if (!rel.endsWith('/')) rel += '/';
  if (SKIP.test(rel)) { skipped++; continue; }
  const html = fs.readFileSync(f, 'utf8');
  const head = source.get(rel);
  pages++;
  if (head) carried++;

  const isNoindex = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html);
  if (isNoindex) noindex++;

  /* --- absolute, on every page --- */
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!title || !title[1].trim()) fails.push([rel, 'missing title']);
  else if (title[1].length < 10 || title[1].length > 60) warn.titleLen.push([rel, title[1].length]);

  if (!/<link[^>]+rel=["']canonical["'][^>]+href=["']https?:\/\//i.test(html))
    fails.push([rel, 'missing canonical']);

  const blocks = [...html.matchAll(
    /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    ld++;
    try { JSON.parse(b[1]); }
    catch (e) { fails.push([rel, `JSON-LD does not parse — ${e.message}`]); }
  }

  /* --- against the original, where there is an original --- */
  const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i);
  if (desc?.[1] && (desc[1].length < 50 || desc[1].length > 160))
    warn.descLen.push([rel, desc[1].length]);

  if (head) {
    if (declared(head, 'description') && !desc?.[1])
      fails.push([rel, 'lost description the original had']);
    if (head.ld != null && !blocks.length)
      fails.push([rel, 'lost the JSON-LD the original had']);
    if (!/property=["']og:image["']/.test(html) && (head.meta ?? []).some(([k, , v]) => k === 'og:image' && v))
      fails.push([rel, 'lost og:image the original had']);

    /* The ownership tags, by name AND value, on exactly the pages whose source
       head declared them -- so a token that drifts is caught as well as one
       that disappears, and the two AMP web stories, which the original serves
       without them, are not asked for tags they never had. */
    const want = verification.filter((v) => declared(head, v.name.toLowerCase()));
    const missing = want.filter((v) => !html.includes(`name="${v.name}" content="${v.content}"`));
    if (missing.length) fails.push([rel, `lost verification: ${missing.map((v) => v.name).join(', ')}`]);
    else if (want.length) tokenPages++;
  } else {
    /* A route this build adds -- pagination, tag and category archives. They
       are noindex, so they are not asked for metadata they do not need. */
    if (!isNoindex && !blocks.length) opportunity.noLd.push(rel);
    if (!isNoindex && !desc?.[1]) opportunity.noDesc.push(rel);
  }

  if (head && !blocks.length && head.ld == null && !isNoindex) opportunity.noLd.push(rel);
  if (head && !desc?.[1] && !declared(head, 'description') && !isNoindex) opportunity.noDesc.push(rel);

  for (const im of html.matchAll(/<img\b[^>]*>/gi))
    /\salt\s*=\s*["'][^"']+["']/i.test(im[0]) ? alt++ : noalt++;
}

const p = (l, n) => console.log(`  ${String(l).padEnd(34, '.')} ${n}`);
console.log('\nSEO LINT\n');
p('pages', pages);
p('  carried from the original', carried);
p('  added by this build', pages - carried);
p('not pages, skipped', skipped);
p('noindex pages', noindex);
p('JSON-LD blocks, all parsing', ld);
p('pages carrying their tokens', tokenPages);
p('images with alt', alt);
p('images without alt', noalt);
p('title outside 10-60', warn.titleLen.length);
p('description outside 50-160', warn.descLen.length);
p('regressions against the original', fails.length);

console.log('\nOPPORTUNITIES — the original has none of these either, so they are');
console.log('not failures. They are what the port could add on top.\n');
p('indexable, no structured data', opportunity.noLd.length);
p('indexable, no meta description', opportunity.noDesc.length);
if (opportunity.noLd.length) {
  console.log('\n  no structured data (first 12):');
  for (const r of opportunity.noLd.slice(0, 12)) console.log(`    ${r}`);
}

for (const [label, rows] of [['TITLE LENGTH', warn.titleLen], ['DESCRIPTION LENGTH', warn.descLen]]) {
  if (!rows.length) continue;
  console.log(`\n${label} — the original's own text, not failed (first 8 of ${rows.length}):`);
  for (const [f, n] of rows.slice(0, 8)) console.log(`  ${String(n).padStart(4)} chars  ${f}`);
}

if (fails.length) {
  const by = new Map();
  for (const [, why] of fails) {
    const k = why.replace(/—.*/, '— …');
    by.set(k, (by.get(k) ?? 0) + 1);
  }
  console.log('\nREGRESSIONS by kind:');
  for (const [k, n] of [...by].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k}`);
  console.log('\nfirst 15:');
  for (const [f, why] of fails.slice(0, 15)) console.log(`  ${f}\n    ${why}`);
  if (!REPORT_ONLY) { console.log('\nSEO LINT FAILED.\n'); process.exit(1); }
}
console.log(`\nSEO LINT ${fails.length ? 'FAILED (report only)' : 'PASSED'}.\n`);
