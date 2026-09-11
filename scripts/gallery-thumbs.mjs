/**
 * Work out which sized file each gallery tile should request, into
 * src/data/gallery-thumbs.json.
 *
 * The original does not put a photograph in its gallery grid. Elementor's
 * Gallery widget emits no <img> at all -- each tile is a <div> carrying
 * data-thumbnail, data-width and data-height, and its script sets that
 * thumbnail as a background image. Two things follow, and the port had neither:
 *
 *   - the grid requests a *resized* file, not the original upload. A masonry
 *     gallery asks for WordPress's "medium" (fits inside 300x300); a grid
 *     gallery asks for "medium_large" (768 wide). The full-size file is only
 *     fetched when the lightbox opens, which is what the tile's link points at.
 *   - the tile's box is reserved from data-width/data-height before anything
 *     loads, which is why the original's masonry never collapses.
 *
 * The port asked for the full-size upload in the grid: on the portfolio that is
 * 341 full photographs to draw 341 thumbnails.
 *
 * The rule here was not guessed. It reproduces, exactly, all 474 choices the
 * original makes across three of its own pages -- 341 masonry tiles on the
 * portfolio and 133 grid tiles on two service pages -- including the two edge
 * cases: the base name drops WordPress's own `-scaled` suffix, and an image
 * already smaller than the target is served whole rather than upscaled.
 *
 * Every computed name is then fetched from the image host before it is written,
 * because a name that is right in theory and absent in practice is a broken
 * picture, which is worse than the oversized one it replaced.
 *
 *   node scripts/gallery-thumbs.mjs           # report, write nothing
 *   node scripts/gallery-thumbs.mjs --write
 */
import fs from 'node:fs';
import path from 'node:path';

const WRITE = process.argv.includes('--write');
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'src/data/gallery-thumbs.json');
const HOST = 'https://img.vinylwraptoronto.com';

const dims = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/img-dims.json'), 'utf8'));

/** WordPress's resized filename, or null to use the upload itself. */
export function sized(src, box) {
  const d = dims[src];
  if (!d) return null;
  const [W, H] = d;
  let tw, th;
  if (box === 300) {
    /* "medium": fits inside 300x300, so the longer side governs. */
    if (Math.max(W, H) <= 300) return null;
    const f = 300 / Math.max(W, H);
    tw = Math.round(W * f);
    th = Math.round(H * f);
  } else {
    /* "medium_large": 768 wide, height free. */
    if (W <= 768) return null;
    tw = 768;
    th = Math.round(H * (768 / W));
  }
  /* WordPress derives its sizes from the original upload, not from the
     `-scaled` copy it makes of very large ones. */
  const m = src.match(/^(.*?)(-scaled)?(\.\w+)$/);
  if (!m) return null;
  return { src: `${m[1]}-${tw}x${th}${m[3]}`, w: tw, h: th };
}

/* ---------- collect every gallery tile ---------- */

const need = new Map(); // "box:src" -> {src, box}
const walk = (blocks) => {
  for (const b of blocks ?? []) {
    if (b.type === 'filtergallery' || b.type === 'gallery') {
      const box = b.masonry ? 300 : 768;
      for (const it of b.items ?? b.images ?? []) {
        if (it.src?.startsWith('/wp-content/uploads/')) need.set(`${box}:${it.src}`, { src: it.src, box });
      }
    }
    if (b.type === 'columns') for (const c of b.cols ?? []) walk(c.blocks);
  }
};

const docs = [];
for (const f of fs.readdirSync(path.join(ROOT, 'src/data/pages'))) {
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/pages', f), 'utf8'));
  if (p.kind !== 'post') docs.push(p); // posts render from D1, read below
}
const postsFile = path.join(ROOT, 'src/data/posts.json');
if (fs.existsSync(postsFile)) docs.push(...JSON.parse(fs.readFileSync(postsFile, 'utf8')));
for (const p of docs) for (const s of p.sections ?? []) walk(s.blocks);

console.log(`gallery tiles needing a size: ${need.size}`);

/* ---------- compute, then prove each one exists ---------- */

const candidates = [];
let asIs = 0, noDims = 0;
for (const { src, box } of need.values()) {
  const t = sized(src, box);
  if (!t) { (dims[src] ? asIs++ : noDims++); continue; }
  candidates.push({ key: `${box}:${src}`, ...t });
}
console.log(`  already small enough, served whole: ${asIs}`);
console.log(`  no dimensions on record:            ${noDims}`);
console.log(`  resized candidates to verify:       ${candidates.length}`);

const CONC = 10;
let i = 0, done = 0;
const missing = [];
await Promise.all(Array.from({ length: CONC }, async () => {
  while (i < candidates.length) {
    const c = candidates[i++];
    const url = HOST + c.src.replace('/wp-content/uploads', '');
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        const r = await fetch(encodeURI(url), { headers: { Range: 'bytes=0-15' } });
        if (r.status === 200 || r.status === 206) ok = true;
        else if (r.status === 404) break; // a real absence; no point retrying
      } catch { /* transient; retry */ }
    }
    c.ok = ok;
    if (!ok) missing.push(c);
    if (++done % 300 === 0) console.log(`   verified ${done}/${candidates.length}`);
  }
}));

const good = candidates.filter((c) => c.ok);
console.log(`\nverified present on the image host: ${good.length}`);
console.log(`absent, so the upload is kept:      ${missing.length}`);
missing.slice(0, 15).forEach((c) => console.log(`   ${c.src}`));

const out = {};
for (const c of good.sort((a, b) => a.key.localeCompare(b.key))) out[c.key] = [c.src, c.w, c.h];

if (!WRITE) {
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const keys = Object.keys(out);
  console.log(`\nwould add ${keys.filter((k) => !(k in prev)).length}, ` +
    `change ${keys.filter((k) => k in prev && String(prev[k]) !== String(out[k])).length}, ` +
    `drop ${Object.keys(prev).filter((k) => !(k in out)).length}`);
  console.log('\n(report only — pass --write to save)');
  process.exit(0);
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`\nwritten ${OUT} (${(JSON.stringify(out).length / 1024).toFixed(0)} KB)`);
