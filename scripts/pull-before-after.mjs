/**
 * Pull the before/after pairs added from /admin/before-after/ out of D1 into
 * src/data/before-after.json, which the build renders from.
 *
 * The same arrangement as the galleries (scripts/pull-galleries.mjs): the
 * snapshot is committed, so a build with no network, no token or a D1 outage
 * still produces the site from the last known-good copy. A failed query keeps
 * the snapshot; a smaller answer is taken as meant -- these rows are only the
 * pairs someone added, so fewer of them means someone hid one.
 *
 * Only shown pairs are written; hiding one in the admin takes it off the site
 * on the next publish.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/data/before-after.json');

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

function bail(why) {
  const have = existing();
  console.warn(`\n⚠  pull-before-after: ${why}`);
  console.warn(have ? `   Keeping the committed snapshot: ${have.length} pairs.\n` : '   No snapshot; /our-work/ shows its original pairs only.\n');
  process.exit(0);
}

if (!TOKEN) bail('no CLOUDFLARE_API_TOKEN / CF_API_TOKEN in the environment');

let rows;
try {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      sql: `SELECT page_slug, title, href, before_src, before_alt, before_w, before_h,
                   after_src, after_alt, after_w, after_h
              FROM before_after
             WHERE hidden = 0
             ORDER BY page_slug, position, id`,
    }),
  });
  const body = await r.json().catch(() => null);
  if (!r.ok || !body?.success) throw new Error(`D1 ${r.status}: ${JSON.stringify(body?.errors ?? body).slice(0, 300)}`);
  rows = body.result[0].results;
} catch (e) {
  bail(String(e.message ?? e));
}

const snapshot = rows.map((r) => ({
  page: r.page_slug,
  title: r.title,
  href: r.href || null,
  before: { src: r.before_src, alt: r.before_alt ?? '', w: r.before_w ?? undefined, h: r.before_h ?? undefined },
  after: { src: r.after_src, alt: r.after_alt ?? '', w: r.after_w ?? undefined, h: r.after_h ?? undefined },
}));

fs.writeFileSync(OUT, JSON.stringify(snapshot));
console.log(`pull-before-after: ${snapshot.length} pairs`);
