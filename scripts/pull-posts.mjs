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

/**
 * A post's own title — its H1 — which is not what `title` holds.
 *
 * Both `title` and `seo_title` in D1 carry the Yoast search-result title, the
 * one that belongs in <title>. The post's real heading survives only inside
 * sections_json, and on 383 of the 402 listed posts the two differ: "Knifeless
 * Tape Wraps: Perfect Edges, Zero Paint Damage" against a heading of
 * "Knifeless Tape Technology: How We Wrap Your Car Without Touching the Paint".
 *
 * The original's listing cards carry the heading — checked on /blog/ and on
 * both author archives — so that is what a card here has to say. Falls back to
 * the stored title for anything with no H1.
 */
function postHeading(sections, fallback) {
  const find = (blocks) => {
    for (const b of blocks ?? []) {
      if (b.type === 'columns') {
        for (const c of b.cols ?? []) {
          const found = find(c.blocks);
          if (found) return found;
        }
      }
      if (b.type === 'heading' && b.level === 1 && b.text) return b.text;
    }
    return undefined;
  };
  for (const s of sections ?? []) {
    const found = find(s.blocks);
    if (found) return found;
  }
  return fallback;
}

const headingBySlug = new Map(posts.map((p) => [p.slug, postHeading(p.sections, p.title)]));

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

/*
 * The blog index.
 *
 * /blog/ was a frozen snapshot: the Elementor cards block ported on the day the
 * site was cloned, 13 entries, no pagination. The original paginates 402 posts
 * across 34 pages, so 460 of the 478 posts on this site were reachable only by
 * knowing their address -- not from the blog at all, and not by a crawler
 * following links.
 *
 * This emits the real list, newest first, with the category each post is filed
 * under so the card badge says what the original's says.
 */
try {
  const rows = await d1(`
    SELECT p.slug, p.title, p.published_at, p.sticky, a.name AS author, m.path AS image,
           (SELECT t.name FROM post_terms pt JOIN terms t ON t.id = pt.term_id
             WHERE pt.post_id = p.id AND t.taxonomy = 'category'
             ORDER BY t.name LIMIT 1) AS category
      FROM posts p
      LEFT JOIN authors a ON a.id = p.author_id
      LEFT JOIN media   m ON m.id = p.featured_id
     WHERE p.status = 'published'
       AND p.slug NOT LIKE '%/%'
     /* By publication date, NULLs last. NOT COALESCE(published_at,
        created_at): created_at is when the row was seeded into D1, identical
        for all 478, so it floated every undated post above every dated one and
        put a 2020 post at the top of the blog. */
     ORDER BY (p.published_at IS NULL), p.published_at DESC`);

  const index = rows.map((r) => ({
    slug: r.slug,
    // The post's heading, not its search-result title — see postHeading above.
    title: headingBySlug.get(r.slug) ?? r.title,
    image: r.image ?? null,
    author: r.author ?? null,
    published: r.published_at ?? null,
    category: r.category ?? 'Uncategorized',
    // WordPress's "stick this post to the front page". Kept in its natural
    // date position here; src/lib/bloglist.ts prepends it to page 1, which is
    // what the original does -- see db/migrations/0010.
    ...(r.sticky ? { sticky: true } : {}),
  }));
  fs.writeFileSync(path.join(ROOT, 'src/data/blog-index.json'), JSON.stringify(index));
  const pinned = index.filter((e) => e.sticky).length;
  console.log(`pull-posts: blog index has ${index.length} posts` +
              `${pinned ? ` (${pinned} pinned to the top)` : ''}`);
} catch (e) {
  console.warn(`⚠  pull-posts: could not build the blog index (${e.message || e}); keeping the committed copy.`);
}

/*
 * The category dropdown in /blog/'s sidebar.
 *
 * The original renders WordPress's categories widget in dropdown mode: nested
 * options, and a parent's number is the DISTINCT posts in it or any of its
 * descendants -- not the ones filed directly against it. Getting that wrong
 * showed Car Wrap (79) where the original says (92), and six more like it.
 *
 * Computed here rather than hard-coded off the original, so the numbers stay
 * true as posts are written. Empty categories are dropped, which is what
 * WordPress's hide_empty does and why neither dropdown lists "Tinting".
 */
try {
  const terms = await d1(
    `SELECT t.id, t.name, t.href, t.parent_id
       FROM terms t WHERE t.taxonomy = 'category' AND t.href IS NOT NULL`,
  );
  const pairs = await d1(
    `SELECT pt.term_id, pt.post_id
       FROM post_terms pt
       JOIN posts p ON p.id = pt.post_id
       JOIN terms t ON t.id = pt.term_id
      WHERE t.taxonomy = 'category' AND p.status = 'published'`,
  );

  const direct = new Map();
  for (const { term_id, post_id } of pairs) {
    if (!direct.has(term_id)) direct.set(term_id, new Set());
    direct.get(term_id).add(post_id);
  }
  const kids = new Map();
  for (const t of terms) {
    if (t.parent_id == null) continue;
    if (!kids.has(t.parent_id)) kids.set(t.parent_id, []);
    kids.get(t.parent_id).push(t);
  }
  // Distinct posts in this term or below it. A post filed under both a parent
  // and one of its children must not be counted twice, which is why this is a
  // set union and not a sum.
  const reach = (id) => {
    const set = new Set(direct.get(id) ?? []);
    for (const k of kids.get(id) ?? []) for (const p of reach(k.id)) set.add(p);
    return set;
  };

  /* Plain code-unit ordering, not localeCompare: en collation ignores the
     space in "Go Cart Wraps", which sorts it after "Golf Cart Wraps" and puts
     two entries in an order the original does not use. */
  const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

  const out = [];
  const walk = (parentId, level) => {
    for (const t of terms.filter((x) => x.parent_id === parentId).sort(byName)) {
      const count = reach(t.id).size;
      if (count > 0) out.push({ name: t.name, href: t.href, count, level });
      walk(t.id, level + 1);
    }
  };
  walk(null, 0);

  fs.writeFileSync(path.join(ROOT, 'src/data/categories.json'), JSON.stringify(out));
  console.log(`pull-posts: ${out.length} categories with posts`);
} catch (e) {
  console.warn(`⚠  pull-posts: could not rebuild the category list (${e.message || e}); keeping the committed copy.`);
}

/*
 * Site settings.
 *
 * The phone number, address and email in src/data/site.ts are defaults;
 * /admin/settings/ can override them, and this is how the override reaches a
 * static build. Written last and separately from the posts, so a settings
 * failure cannot take the blog down with it.
 *
 * Every key is taken as-is: it was validated against src/lib/settings.ts when
 * it was saved, and site.ts only reads the keys it knows about.
 */
try {
  const rows = await d1('SELECT key, value FROM settings');
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  fs.writeFileSync(path.join(ROOT, 'src/data/site-settings.json'), JSON.stringify(settings));
  const n = Object.keys(settings).length;
  console.log(`pull-posts: ${n} site setting${n === 1 ? '' : 's'} overridden`);
} catch (e) {
  // Keep whatever is committed. The defaults in site.ts are a working site.
  console.warn(`⚠  pull-posts: could not read settings (${e.message || e}); keeping the committed copy.`);
}

/*
 * SEO overrides for the site's own pages, set in /admin/pages/.
 *
 * Sparse by design: a row exists only for a page somebody edited, and only the
 * columns they set are non-null. src/lib/pageseo.ts merges them over the head
 * tags each page was ported with, so an empty table renders the site exactly
 * as it is today. Pulled separately from the posts so a failure here cannot
 * take the blog down with it.
 */
try {
  const rows = await d1(
    `SELECT slug, seo_title, meta_description, canonical_url,
            robots_index, robots_follow, robots_advanced,
            og_title, og_description, og_image,
            twitter_card, twitter_title, twitter_description
       FROM page_seo`,
  );
  const overrides = Object.fromEntries(rows.map((r) => [r.slug, r]));
  fs.writeFileSync(path.join(ROOT, 'src/data/page-seo.json'), JSON.stringify(overrides));
  const n = rows.length;
  console.log(`pull-posts: ${n} page${n === 1 ? '' : 's'} with SEO overrides`);
} catch (e) {
  console.warn(`⚠  pull-posts: could not read page SEO (${e.message || e}); keeping the committed copy.`);
}

const empty = posts.filter((p) => !p.sections?.length).length;
const prev = existing();
if (prev && posts.length < prev.length && !process.env.ALLOW_POST_SHRINK) {
  bail(`D1 returned ${posts.length} posts but the snapshot has ${prev.length}. ` +
       'Set ALLOW_POST_SHRINK=1 if posts really were removed.');
}

fs.writeFileSync(OUT, JSON.stringify(posts));
console.log(`pull-posts: wrote ${posts.length} posts to src/data/posts.json` +
            `${empty ? ` (${empty} with an empty render tree)` : ''}`);
