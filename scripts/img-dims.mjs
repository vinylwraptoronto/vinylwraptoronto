/**
 * Record the pixel size of every uploaded image, into src/data/img-dims.json.
 *
 * Why this exists: a masonry gallery shows each photograph at its own shape, so
 * the CSS cannot state one ratio for every tile — and with nothing stating a
 * ratio, nothing reserves the tile's box. A picture that has not decoded yet, or
 * that the image host fails to serve, is then zero pixels tall, which collapses
 * the column and stacks the alt text on top of itself. That is the failure a
 * visitor sees on /vinyl-car-wrap-our-portfolio/ when the host has a bad moment.
 *
 * The fix is to give each tile the ratio of its own file, which needs the file's
 * real dimensions. The original site's gallery is rendered by script, so its
 * served HTML carries none to copy; the uploads themselves do.
 *
 * Dimensions belong to the file, not to the page that references it, so they are
 * recorded once per file here rather than on each of the 970-odd references.
 * Posts render from D1 and pages from src/data/pages, and a single manifest
 * serves both without either having to carry the numbers.
 *
 * The manifest is read at build time only — every page is prerendered, so none
 * of this reaches the browser.
 *
 *   node scripts/img-dims.mjs           # report, write nothing
 *   node scripts/img-dims.mjs --write
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WRITE = process.argv.includes('--write');
const ROOT = path.resolve(import.meta.dirname, '..');
const UPLOADS = path.join(ROOT, 'public/wp-content/uploads');
const OUT = path.join(ROOT, 'src/data/img-dims.json');

const IMAGE = /\.(jpe?g|png|webp|gif|avif)$/i;

/** Every image under uploads, as the site-root path a block would reference. */
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (IMAGE.test(e.name)) acc.push(p);
  }
  return acc;
}

const files = walk(UPLOADS);
console.log(`images under uploads: ${files.length}`);

/* One Python process for all of them rather than one per file. Pillow reads the
   header only, so this does not decode 2,853 pictures. */
const listFile = path.join(ROOT, 'node_modules/.cache-img-dims.txt');
fs.mkdirSync(path.dirname(listFile), { recursive: true });
fs.writeFileSync(listFile, files.join('\n'));
const out = execFileSync(
  'python3',
  ['-c', `
import sys
from PIL import Image
for line in open(${JSON.stringify(listFile)}):
    p = line.strip()
    if not p: continue
    try:
        with Image.open(p) as im:
            print(p + "\\t" + str(im.width) + "\\t" + str(im.height))
    except Exception:
        pass
`],
  { maxBuffer: 1 << 28 },
).toString();
fs.rmSync(listFile, { force: true });

const dims = {};
for (const line of out.split('\n')) {
  const [p, w, h] = line.split('\t');
  if (!p || !w || !h) continue;
  const key = '/' + path.relative(path.join(ROOT, 'public'), p).split(path.sep).join('/');
  dims[key] = [Number(w), Number(h)];
}

const keys = Object.keys(dims).sort();
const sorted = {};
for (const k of keys) sorted[k] = dims[k];

console.log(`dimensions read: ${keys.length}   unreadable: ${files.length - keys.length}`);

if (!WRITE) {
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const added = keys.filter((k) => !(k in prev));
  const changed = keys.filter((k) => k in prev && String(prev[k]) !== String(sorted[k]));
  console.log(`would add ${added.length}, change ${changed.length}, drop ${Object.keys(prev).filter((k) => !(k in sorted)).length}`);
  console.log('\n(report only — pass --write to save)');
  process.exit(0);
}

fs.writeFileSync(OUT, JSON.stringify(sorted));
console.log(`written ${OUT} (${(JSON.stringify(sorted).length / 1024).toFixed(0)} KB)`);
