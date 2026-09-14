/**
 * Pull the galleries out of D1 into src/data/galleries.json, which the build
 * renders from.
 *
 * The same arrangement the posts use, and for the same reasons: the snapshot is
 * committed, so a build with no network, no token or a D1 outage still produces
 * the full site from the last known-good copy rather than silently shipping
 * pages with empty galleries, and a content change is reviewable as a diff
 * before it goes out.
 *
 * It refuses to overwrite a good snapshot with a smaller one unless
 * ALLOW_GALLERY_SHRINK is set. "The query returned fewer rows than expected"
 * and "somebody deleted the portfolio" look identical from in here, and one of
 * those is 341 photographs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/data/galleries.json');

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || '47a82355b575e264047206a36c2cd05c';
const DB = process.env.BLOG_DB_ID || 'ed3116e7-7699-4d4d-8785-2ea67f81aed1';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;

function existing() {
  try {
    return JSON.parse(fs.readFileSync(OUT, 'utf8'));
  } catch {
    return null;
  }
}

const countImages = (snap) =>
  Array.isArray(snap) ? snap.reduce((n, g) => n + (g.items?.length ?? 0), 0) : 0;

/** Keep the last good snapshot and explain why, or carry on without one. */
function bail(why) {
  const have = existing();
  if (have?.length) {
    console.warn(`\n⚠  pull-galleries: ${why}`);
    console.warn(`   Keeping the committed snapshot: ${have.length} galleries, ${countImages(have)} images.\n`);
    process.exit(0);
  }
  /* Unlike the posts, an absent snapshot is survivable: src/lib/gallery.ts
     falls back to the copy frozen in the page data, which is what the site
     rendered before any of this existed. Say so and let the build continue. */
  console.warn(`\n⚠  pull-galleries: ${why}`);
  console.warn('   No snapshot; pages will use the galleries frozen in their own data.\n');
  process.exit(0);
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

let galleries, images;
try {
  galleries = await d1('SELECT id, page_slug, eid, label, filters FROM galleries ORDER BY id');
  images = await d1(
    `SELECT gallery_id, src, title, alt, tag
       FROM gallery_images
      WHERE hidden = 0
      ORDER BY gallery_id, position, id`,
  );
} catch (e) {
  bail(String(e.message ?? e));
}

const byGallery = new Map();
for (const row of images) {
  if (!byGallery.has(row.gallery_id)) byGallery.set(row.gallery_id, []);
  byGallery.get(row.gallery_id).push({
    src: row.src,
    title: row.title ?? undefined,
    tag: row.tag ?? undefined,
    alt: row.alt ?? undefined,
  });
}

const snapshot = galleries.map((g) => {
  let filters = [];
  try {
    filters = JSON.parse(g.filters || '[]');
  } catch {
    /* A hand-edited row. An empty filter list renders the gallery without tabs
       rather than failing the build. */
  }
  return {
    page: g.page_slug,
    eid: g.eid,
    label: g.label ?? null,
    filters,
    items: byGallery.get(g.id) ?? [],
  };
});

const total = countImages(snapshot);
const had = existing();
if (had?.length && !process.env.ALLOW_GALLERY_SHRINK) {
  const before = countImages(had);
  if (snapshot.length < had.length || total < before) {
    bail(
      `D1 returned ${snapshot.length} galleries / ${total} images, ` +
        `down from ${had.length} / ${before}. Set ALLOW_GALLERY_SHRINK=1 if that is intended.`,
    );
  }
}

fs.writeFileSync(OUT, JSON.stringify(snapshot));
console.log(`pull-galleries: ${snapshot.length} galleries, ${total} images`);
