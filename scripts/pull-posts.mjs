/**
 * Pull every published post out of D1 into src/data/posts.json, which the
 * build renders from.
 *
 * D1 is the source of truth for the blog; this is the step that gets it into a
 * static build. The snapshot it writes is committed, which is deliberate:
 *
 *   - a build with no network, no token, or a D1 outage still produces the
 *     full site from the last known-good snapshot rather than silently
 *     dropping 478 pages, and
 *   - the diff of a content change is reviewable before it ships.
 *
 * It refuses to overwrite a good snapshot with a smaller one unless
 * ALLOW_POST_SHRINK is set, because "the query returned fewer rows than
 * expected" and "we deleted half the blog" look identical to a build script.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/data/posts.json');

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || '47a82355b575e264047206a36c2cd05c';
const DB = process.env.BLOG_DB_ID || 'ed3116e7-7699-4d4d-8785-2ea67f81aed1';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;

const BATCH = 40;

function existing() {
  try {
    return JSON.parse(fs.readFileSync(OUT, 'utf8'));
  } catch {
    return null;
  }
}

/** Keep the last good snapshot and explain why, or fail if there is none. */
function bail(why) {
  const have = existing();
  if (have?.length) {
    console.warn(`\n⚠  pull-posts: ${why}`);
    console.warn(`   Keeping the committed snapshot of ${have.length} posts.\n`);
    process.exit(0);
  }
  console.error(`\n✘ pull-posts: ${why}`);
  console.error('   No snapshot to fall back on, so the build would ship with no posts.\n');
  process.exit(1);
}

async function d1(sql) {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sql }),
    },
  );
  const body = await r.json().catch(() => null);
  if (!r.ok || !body?.success) {
    throw new Error(`D1 ${r.status}: ${JSON.stringify(body?.errors ?? body).slice(0, 300)}`);
  }
  return body.result[0].results;
}

if (!TOKEN) bail('no CLOUDFLARE_API_TOKEN / CF_API_TOKEN in the environment');

let rows;
try {
  const [{ n }] = await d1("SELECT COUNT(*) AS n FROM posts WHERE status = 'published'");
  console.log(`pull-posts: ${n} published posts in D1`);

  rows = [];
  for (let offset = 0; offset < n; offset += BATCH) {
    rows.push(...await d1(`
      SELECT p.slug, p.title, p.seo_title, p.headline, p.excerpt, p.status,
             p.published_at, p.modified_at, p.canonical_url, p.robots,
             p.head_json, p.sections_json, p.page_css, p.layout, p.origin,
             a.name AS author, m.path AS featured
        FROM posts p
        LEFT JOIN authors a ON a.id = p.author_id
        LEFT JOIN media   m ON m.id = p.featured_id
       WHERE p.status = 'published'
       ORDER BY p.id
       LIMIT ${BATCH} OFFSET ${offset}`));
  }
  if (rows.length !== n) throw new Error(`expected ${n} rows, assembled ${rows.length}`);
} catch (e) {
  bail(String(e.message || e));
}

// Back into the shape the renderer already takes, so nothing downstream has to
// know the content arrived from a database.
const posts = rows.map((r) => ({
  slug: r.slug,
  url: r.canonical_url,
  title: r.seo_title || r.title,
  description: r.excerpt || '',
  ogImage: r.featured || null,
  robots: r.robots || null,
  kind: 'post',
  sections: r.sections_json ? JSON.parse(r.sections_json) : [],
  css: r.page_css || undefined,
  head: r.head_json ? JSON.parse(r.head_json) : undefined,
  published: r.published_at || null,
  modified: r.modified_at || null,
  author: r.author || null,
  layout: r.layout || null,
  origin: r.origin || 'imported',
}));

/*
 * Getting a newly written post into the blog listing.
 *
 * The archives on this site do not list from `members`: nearly all of them,
 * /blog/ included, carry zero and render their listing from the Elementor
 * markup ported off the original. So a post written in /admin would be live at
 * its own address and linked from nowhere.
 *
 * These additions fix that without touching a single existing page. Only posts
 * written here are added, and /blog/ has no members today, so until the first
 * one is written the file is empty and every page builds exactly as before.
 */
const authored = posts.filter((p) => p.origin === 'authored');
const additions = {
  summaries: Object.fromEntries(
    authored.map((p) => [
      p.slug,
      {
        slug: p.slug,
        title: p.title,
        description: p.description,
        image: p.ogImage,
        alt: p.title,
        published: p.published,
        kind: 'post',
      },
    ]),
  ),
  // Newest first, which is the order every listing on this site uses.
  members: {
    blog: authored
      .slice()
      .sort((a, b) => String(b.published ?? '').localeCompare(String(a.published ?? '')))
      .map((p) => p.slug),
  },
};
fs.writeFileSync(path.join(ROOT, 'src/data/post-additions.json'), JSON.stringify(additions));

const empty = posts.filter((p) => !p.sections?.length).length;
const prev = existing();
if (prev && posts.length < prev.length && !process.env.ALLOW_POST_SHRINK) {
  bail(`D1 returned ${posts.length} posts but the snapshot has ${prev.length}. ` +
       'Set ALLOW_POST_SHRINK=1 if posts really were removed.');
}

fs.writeFileSync(OUT, JSON.stringify(posts));
console.log(`pull-posts: wrote ${posts.length} posts to src/data/posts.json` +
            `${empty ? ` (${empty} with an empty render tree)` : ''}`);
