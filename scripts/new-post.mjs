#!/usr/bin/env node
/**
 * Publish a post written outside /admin -- by the scheduled blog routine, or
 * by anyone with a body of HTML and a few fields -- the same way the editor
 * does, in one command.
 *
 *     node scripts/new-post.mjs db/posts/2026-10-06-my-post.json            # write the SQL only
 *     node scripts/new-post.mjs db/posts/2026-10-06-my-post.json --apply    # and apply it to D1, then pull
 *
 * The spec is a small JSON file beside the body it names:
 *
 *   {
 *     "slug": "my-post",                      required; the address, /my-post/
 *     "title": "…",                           required; the <title> and card title
 *     "headline": "…",                        the H1, defaults to title
 *     "seoTitle": "…",                        defaults to title
 *     "excerpt": "…",                         the meta description; defaults to the first 155 chars
 *     "focusKeyword": "…", "extraKeywords": ["…"],
 *     "featured": "/wp-content/uploads/…",    an image that EXISTS on the image host
 *     "featuredAlt": "…",                     defaults to title
 *     "author": "masoud",                     an authors.name; see src/data/author-archives.json
 *     "publishedAt": "2026-10-06T09:00:00-04:00",
 *     "categories": ["Car Wrap"],             existing category names (not created here)
 *     "tags": ["Matte"],                      created when missing, as the editor does
 *     "body": "2026-10-06-my-post.html"       relative to the spec
 *   }
 *
 * What it does, in order:
 *   1. Sanitises the body and generates sections_json, head_json, robots and
 *      the SEO score with src/lib/postdoc.ts and src/lib/seo.ts -- the same
 *      code the /admin save route runs, bundled on the fly with esbuild so a
 *      post written here is indistinguishable from one typed into the editor.
 *   2. Writes db/posts/<date>-<slug>.sql: an idempotent INSERT that resolves
 *      the author, image and terms by name, so it carries no ids and is safe
 *      to re-run. The spec, the body and the SQL are all committed, which is
 *      what makes a post reviewable as a diff.
 *   3. With --apply: runs the SQL against D1 with wrangler (the documented
 *      path in db/README.md), reads the row back over the HTTP API to prove
 *      it landed, and runs scripts/pull-posts.mjs so the committed snapshot
 *      matches the database. Nothing is deployed: that is the Deploy workflow
 *      on a push to main.
 *
 * Needs CLOUDFLARE_API_TOKEN or CF_API_TOKEN for --apply. Without --apply it
 * needs nothing and touches nothing but the SQL file.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || '47a82355b575e264047206a36c2cd05c';
const DB_NAME = 'vinylwraptoronto-blog';
const DB_ID = process.env.BLOG_DB_ID || 'ed3116e7-7699-4d4d-8785-2ea67f81aed1';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;

const args = process.argv.slice(2);
const specPath = args.find((a) => !a.startsWith('--'));
const APPLY = args.includes('--apply');
const NO_PULL = args.includes('--no-pull');
const outIdx = args.indexOf('--out');
const OUT_OVERRIDE = outIdx >= 0 ? args[outIdx + 1] : null;

function fail(msg) {
  console.error(`\n✘ new-post: ${msg}\n`);
  process.exit(1);
}
if (!specPath) fail('usage: node scripts/new-post.mjs <spec.json> [--apply] [--no-pull] [--out file.sql]');

/* ---- the spec ---- */

const specFile = path.resolve(specPath);
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const req = (k) => {
  if (!spec[k] || typeof spec[k] !== 'string') fail(`spec needs a string "${k}"`);
  return spec[k].trim();
};
const slug = req('slug').toLowerCase().replace(/^\/+|\/+$/g, '');
if (!/^[a-z0-9][a-z0-9\-/]*$/.test(slug)) fail('slug may hold lowercase letters, digits, hyphens and slashes');
const title = req('title').slice(0, 200);
const bodyPath = path.resolve(path.dirname(specFile), req('body'));
if (!fs.existsSync(bodyPath)) fail(`body not found: ${bodyPath}`);
const publishedAt = req('publishedAt');
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(publishedAt)) {
  fail('publishedAt must be an ISO datetime with a time zone, e.g. 2026-10-06T09:00:00-04:00 -- a bare date renders a day early in Toronto');
}
const featured = (spec.featured ?? '').trim();
if (featured && !featured.startsWith('/wp-content/uploads/')) fail('featured must be an upload path, /wp-content/uploads/…');
const author = (spec.author ?? '').trim();
const categories = (spec.categories ?? []).map(String).map((s) => s.trim()).filter(Boolean);
const tags = (spec.tags ?? []).map(String).map((s) => s.trim()).filter(Boolean);
const extraKeywords = [];
for (const k of (spec.extraKeywords ?? []).map(String).map((s) => s.trim().slice(0, 120))) {
  if (k && !extraKeywords.some((x) => x.toLowerCase() === k.toLowerCase())) extraKeywords.push(k);
}

/* ---- the same code the editor runs ---- */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'new-post-'));
const entry = path.join(tmp, 'entry.ts');
fs.writeFileSync(
  entry,
  `export * as postdoc from ${JSON.stringify(path.join(ROOT, 'src/lib/postdoc.ts'))};\n` +
    `export * as seo from ${JSON.stringify(path.join(ROOT, 'src/lib/seo.ts'))};\n`,
);
const bundle = path.join(tmp, 'lib.mjs');
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'silent' });
const { postdoc, seo } = await import(pathToFileURL(bundle).href);

const bodyHtml = postdoc.sanitizeHtml(fs.readFileSync(bodyPath, 'utf8'));
if (/<h1\b/i.test(bodyHtml)) fail('the body has an <h1>; the page already prints one from the title, so start the body at <h2>');

const excerpt = (spec.excerpt ?? '').trim().slice(0, 320) || postdoc.excerptFrom(bodyHtml);
const seoTitle = (spec.seoTitle ?? '').trim().slice(0, 200) || title;
const headline = (spec.headline ?? '').trim().slice(0, 200) || title;
const focusKeyword = (spec.focusKeyword ?? '').trim().slice(0, 120);

const doc = {
  slug,
  title,
  headline,
  seoTitle,
  excerpt,
  bodyHtml,
  featuredPath: featured || null,
  featuredAlt: (spec.featuredAlt ?? '').trim() || title,
  author: author || null,
  publishedAt,
  modifiedAt: null,
  canonicalUrl: null,
  focusKeyword,
  twitterCard: 'summary_large_image',
  schemaType: 'BlogPosting',
  robotsIndex: true,
  robotsFollow: true,
  robotsAdvanced: [],
  faq: Array.isArray(spec.faq) ? spec.faq : [],
};

const report = seo.analyse({ title, seoTitle, description: excerpt, slug, bodyHtml, focusKeyword, extraKeywords });
const sectionsJson = JSON.stringify(postdoc.buildSections(doc));
const headJson = JSON.stringify(postdoc.buildHead(doc));
const robots = postdoc.robotsString(doc);

console.log(`new-post: /${slug}/  ${report.stats.words} words, SEO score ${report.score}`);
for (const c of report.checks) if (c.status !== 'good') console.log(`  ${c.status === 'bad' ? '✘' : '△'} ${c.label}`);

/* ---- the SQL ---- */

const q = (v) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const termSlug = (name) => seo.slugify(name).slice(0, 120);

const lines = [];
lines.push(`-- Blog post: ${JSON.stringify(title)}`);
lines.push(`--`);
lines.push(`-- Generated by scripts/new-post.mjs from ${path.relative(ROOT, specFile)} and its body.`);
lines.push(`-- The row is in the shape src/pages/api/admin/posts/save.ts writes: sections_json,`);
lines.push(`-- head_json and robots from src/lib/postdoc.ts, seo_score ${report.score} from src/lib/seo.ts.`);
lines.push(`--`);
lines.push(`-- Apply with:  npx wrangler d1 execute ${DB_NAME} --remote --file=<this file>`);
lines.push(`-- then:        npm run build   (pulls the row into the committed snapshot)`);
lines.push(`--`);
lines.push(`-- Safe to re-run: the post is skipped when its slug exists, and the author,`);
lines.push(`-- image and terms are resolved by name rather than by id.`);
lines.push(``);
lines.push(`PRAGMA foreign_keys = ON;`);
lines.push(``);
if (featured) lines.push(`INSERT OR IGNORE INTO media (path) VALUES (${q(featured)});`);
for (const t of tags) {
  lines.push(`INSERT OR IGNORE INTO terms (taxonomy, slug, name) VALUES ('tag', ${q(termSlug(t))}, ${q(t.slice(0, 120))});`);
}
lines.push(``);

const cols = [
  ['slug', q(slug)],
  ['title', q(title)],
  ['seo_title', q(seoTitle)],
  ['headline', q(headline)],
  ['excerpt', q(excerpt)],
  ['body_html', q(bodyHtml)],
  ['status', q('published')],
  ['featured_id', featured ? `(SELECT id FROM media WHERE path = ${q(featured)})` : 'NULL'],
  ['author_id', author ? `(SELECT id FROM authors WHERE name = ${q(author)})` : 'NULL'],
  ['published_at', q(publishedAt)],
  ['canonical_url', 'NULL'],
  ['robots', q(robots)],
  ['head_json', q(headJson)],
  ['focus_keyword', q(focusKeyword || null)],
  ['seo_score', q(report.score)],
  ['seo_checks_json', q(JSON.stringify(report.checks))],
  ['og_title', 'NULL'],
  ['og_description', 'NULL'],
  ['og_image_id', 'NULL'],
  ['twitter_card', q('summary_large_image')],
  ['twitter_title', 'NULL'],
  ['twitter_description', 'NULL'],
  ['schema_type', q('BlogPosting')],
  ['breadcrumb_title', 'NULL'],
  ['robots_index', '1'],
  ['robots_follow', '1'],
  ['robots_advanced', q('[]')],
  ['origin', q('authored')],
  ['updated_by', 'NULL'],
  ['extra_keywords', extraKeywords.length ? q(JSON.stringify(extraKeywords)) : 'NULL'],
  ['faq_json', doc.faq.length ? q(JSON.stringify(doc.faq)) : 'NULL'],
  ['sections_json', q(sectionsJson)],
];
lines.push(`INSERT INTO posts (${cols.map(([c]) => c).join(', ')}, modified_at)`);
lines.push(`SELECT ${cols.map(([, v]) => v).join(', ')}, datetime('now')`);
lines.push(` WHERE NOT EXISTS (SELECT 1 FROM posts WHERE slug = ${q(slug)});`);
lines.push(``);
for (const [taxonomy, names] of [['category', categories], ['tag', tags]]) {
  for (const name of names) {
    lines.push(`INSERT OR IGNORE INTO post_terms (post_id, term_id)`);
    lines.push(`SELECT p.id, t.id FROM posts p, terms t`);
    lines.push(` WHERE p.slug = ${q(slug)} AND t.taxonomy = ${q(taxonomy)} AND t.name = ${q(name)};`);
  }
}

const sqlPath = OUT_OVERRIDE
  ? path.resolve(OUT_OVERRIDE)
  : path.join(ROOT, 'db/posts', `${publishedAt.slice(0, 10)}-${slug.replace(/\//g, '--')}.sql`);
fs.mkdirSync(path.dirname(sqlPath), { recursive: true });
fs.writeFileSync(sqlPath, lines.join('\n') + '\n');
console.log(`new-post: wrote ${path.relative(ROOT, sqlPath)}`);

if (!APPLY) {
  console.log('new-post: not applied (pass --apply to run it against D1 and pull the snapshot).');
  process.exit(0);
}

/* ---- apply ---- */

if (!TOKEN) fail('--apply needs CLOUDFLARE_API_TOKEN / CF_API_TOKEN in the environment');

const env = { ...process.env, CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCOUNT };
delete env.CF_API_TOKEN;
console.log(`new-post: applying to ${DB_NAME} with wrangler`);
const run = spawnSync('npx', ['wrangler', 'd1', 'execute', DB_NAME, '--remote', `--file=${sqlPath}`], {
  cwd: ROOT,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
  encoding: 'utf8',
});
if (run.status !== 0) {
  console.error(run.stdout);
  console.error(run.stderr);
  fail(`wrangler exited ${run.status}. The SQL file is written; apply it by hand and run scripts/pull-posts.mjs.`);
}

/* Read it back over the API rather than trusting wrangler's exit code: the
   statements are all conditional, so "0 rows written" is a success code too. */
async function d1(sql, params = []) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB_ID}/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const body = await r.json().catch(() => null);
  if (!r.ok || !body?.success) throw new Error(`D1 ${r.status}: ${JSON.stringify(body?.errors ?? body).slice(0, 300)}`);
  return body.result[0].results;
}
const [row] = await d1(
  `SELECT p.id, p.status, p.origin, a.name AS author, m.path AS featured,
          (SELECT COUNT(*) FROM post_terms pt WHERE pt.post_id = p.id) AS terms
     FROM posts p LEFT JOIN authors a ON a.id = p.author_id LEFT JOIN media m ON m.id = p.featured_id
    WHERE p.slug = ?`,
  [slug],
);
if (!row) fail('the row is not in D1 after applying -- nothing was inserted');
console.log(`new-post: in D1 as posts.id ${row.id} (${row.status}, ${row.origin})`);
if (author && row.author !== author) console.warn(`  △ author "${author}" is not in the authors table; the post has no author`);
if (featured && row.featured !== featured) console.warn(`  △ featured image did not resolve`);
const wanted = categories.length + tags.length;
if (row.terms !== wanted) console.warn(`  △ ${row.terms} of ${wanted} terms attached -- a category name probably does not exist`);

if (NO_PULL) process.exit(0);
console.log('new-post: pulling the snapshot');
const pull = spawnSync(process.execPath, [path.join(ROOT, 'scripts/pull-posts.mjs')], { cwd: ROOT, env, stdio: 'inherit' });
if (pull.status !== 0) fail('pull-posts failed; the row is in D1, run it again by hand');
console.log('new-post: done. Review the diff, run the build, then commit.');
