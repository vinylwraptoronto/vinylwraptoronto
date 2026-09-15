/**
 * Write the harvested button colours into D1, which is the source of truth for
 * every blog post.
 *
 * Posts render from src/data/posts.json, pulled from D1 before each build. The
 * entries under src/data/pages for the same slugs are the seed that was loaded
 * into D1 once and are not read at render time, so editing those changes
 * nothing that ships.
 *
 * The change is additive: it sets bg / hoverBg / hoverColor / hoverBorder on
 * button blocks inside sections_json and touches no other field. Rows whose
 * buttons already carry the right values are left alone, so a second run is a
 * no-op rather than 409 pointless writes.
 *
 *   node scripts/apply-post-button-colours.mjs --map <file> --dry-run
 *   node scripts/apply-post-button-colours.mjs --map <file>
 */
import fs from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DRY = process.argv.includes('--dry-run');
const MAP = JSON.parse(fs.readFileSync(arg('--map'), 'utf8'));

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || '47a82355b575e264047206a36c2cd05c';
const DB = process.env.BLOG_DB_ID || 'ed3116e7-7699-4d4d-8785-2ea67f81aed1';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;
if (!TOKEN) { console.error('no Cloudflare API token in the environment'); process.exit(1); }

async function d1(sql, params = []) {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`,
    { method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sql, params }) });
  const body = await r.json().catch(() => null);
  if (!r.ok || !body?.success) {
    throw new Error(`D1 ${r.status}: ${JSON.stringify(body?.errors ?? body).slice(0, 300)}`);
  }
  return body.result[0].results;
}

/** Set the colours on every button block in a post's sections, in place. */
const paint = (node, forSlug, stats) => {
  if (Array.isArray(node)) { node.forEach((n) => paint(n, forSlug, stats)); return; }
  if (!node || typeof node !== 'object') return;
  if (node.type === 'button' && node.eid) {
    const want = forSlug[node.eid];
    if (want) {
      for (const [k, v] of Object.entries(want)) {
        if (node[k] !== v) { node[k] = v; stats.fields++; }
      }
    } else stats.unmatched++;
  }
  for (const v of Object.values(node)) paint(v, forSlug, stats);
};

const slugs = Object.keys(MAP);
console.log(`${slugs.length} posts to consider${DRY ? '  (dry run)' : ''}`);

let changed = 0, same = 0, missing = 0;
const stats = { fields: 0, unmatched: 0 };

/* One row at a time. 409 small updates against D1 is not worth batching, and a
   failure part-way leaves a state that is obvious rather than half-applied
   inside one giant statement. */
for (const [i, slug] of slugs.entries()) {
  const rows = await d1('SELECT sections_json FROM posts WHERE slug = ?', [slug]);
  if (!rows.length) { missing++; continue; }
  const before = rows[0].sections_json;
  if (!before) { missing++; continue; }
  const sections = JSON.parse(before);
  const s = { fields: 0, unmatched: 0 };
  paint(sections, MAP[slug], s);
  stats.fields += s.fields; stats.unmatched += s.unmatched;
  const after = JSON.stringify(sections);
  if (after === before) { same++; continue; }
  changed++;
  if (!DRY) await d1('UPDATE posts SET sections_json = ? WHERE slug = ?', [after, slug]);
  if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${slugs.length}`);
}

console.log(`  rows ${DRY ? 'that would change' : 'updated'} ... ${changed}`);
console.log(`  already correct .......... ${same}`);
console.log(`  slug not in D1 .......... ${missing}`);
console.log(`  fields set ............... ${stats.fields}`);
console.log(`  buttons with no harvest .. ${stats.unmatched}`);
