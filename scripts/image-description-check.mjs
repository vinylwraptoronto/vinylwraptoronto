/**
 * Production-path check for the hand-checked image descriptions.
 * Runs the real src/lib/gallery.ts (withGalleries) against the real committed
 * snapshot, a no-match fallback, nested columns, and the non-gallery helper
 * (descriptionFor/describeHtml) on responsive variants and look-alike siblings.
 * Negative controls run the same gallery assertions against the pre-fix
 * gallery.ts (git ref CONTROL_REF, default HEAD, i.e. the commit before this
 * change) and must FAIL; a control that passes is itself a failure.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ov = JSON.parse(fs.readFileSync('src/data/gallery-alt-overrides.json', 'utf8'));
const snapshot = JSON.parse(fs.readFileSync('src/data/galleries.json', 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'imgdesc-'));
const bundle = async (name, entry) => {
  const out = path.join(tmp, name + '.mjs');
  await build({ stdin: { contents: entry, resolveDir: path.resolve('src/lib'), loader: 'ts' }, bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'silent' });
  return import(pathToFileURL(out).href);
};

const CUR = await bundle('cur', "export { withGalleries } from './gallery'; export { descriptionFor, describeHtml, describe } from './image-desc';");
const refSrc = process.env.CONTROL_REF || 'HEAD';
const headSrc = execSync(`git show ${refSrc}:src/lib/gallery.ts`, { maxBuffer: 1 << 26 }).toString().replace(/\0/g, '\\0');
const OLD = await bundle('old', headSrc);

const six = Object.keys(ov).filter((k) => !k.includes('/2020/08/'));
const base = (s) => s.split('/').pop();
const longAlt = 'Audi A4 2006 - Full Car Wrap - VinylWrapToronto.com - Sand Vinyl Wrap Toronto - Vehicle Wrap - Side Front';
const items = (alt) => six.map((src) => ({ src, title: 'T-' + base(src), alt }));
const walk = (blocks, f) => blocks.forEach((b) => { if (b.type === 'columns') b.cols.forEach((c) => walk(c.blocks, f)); else if (b.type === 'filtergallery') f(b); });
const page = (blocks) => ({ slug: 'zz-test', sections: [{ id: 's', blocks }] });

function run(mod, label) {
  const fails = []; let n = 0;
  const ok = (c, m) => { n++; if (!c) fails.push(m); };
  // 1. real snapshot, every real page: override srcs carry the override
  const dir = 'src/data/pages'; let hits = 0, tiles = 0;
  for (const f of fs.readdirSync(dir)) {
    const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const out = mod.withGalleries(p);
    walk(out.sections?.flatMap((s) => s.blocks) ?? [], (b) => (b.items ?? []).forEach((it) => {
      tiles++;
      if (ov[it.src]) { hits++; ok(it.alt === ov[it.src], `${label} real ${p.slug} ${base(it.src)} alt=${it.alt}`); }
    }));
  }
  ok(hits >= 18, `${label} real-snapshot hits ${hits} < 18`);
  // 2. snapshot row present, nested in columns
  const g = snapshot.find((x) => x.items.some((i) => ov[i.src]));
  const gb = { type: 'filtergallery', eid: g.eid, filters: [], items: [] };
  const nested = mod.withGalleries({ slug: g.page, sections: [{ id: 's', blocks: [{ type: 'columns', cols: [{ blocks: [{ type: 'text' }] }, { blocks: [gb] }] }] }] });
  let seen = 0;
  walk(nested.sections[0].blocks, (b) => b.items.forEach((it) => { seen++; if (ov[it.src]) ok(it.alt === ov[it.src], `${label} nested-snapshot ${base(it.src)}`); }));
  ok(seen === g.items.length, `${label} nested-snapshot item count ${seen}/${g.items.length}`);
  // 3. no-match fallback, top level and nested: ported items still get the description; titles kept
  for (const [name, blocks] of [
    ['top', [{ type: 'filtergallery', eid: 'nomatch1', filters: [], items: items(longAlt) }]],
    ['nested', [{ type: 'columns', cols: [{ blocks: [{ type: 'filtergallery', eid: 'nomatch2', filters: [], items: items(longAlt) }] }] }]],
  ]) {
    const o = mod.withGalleries(page(blocks)); let k = 0;
    walk(o.sections[0].blocks, (b) => b.items.forEach((it) => {
      k++;
      ok(it.alt === ov[it.src], `${label} no-match-${name} ${base(it.src).slice(0, 20)} alt=${String(it.alt).slice(0, 30)}`);
      ok(it.title === 'T-' + base(it.src), `${label} no-match-${name} title`);
    }));
    ok(k === six.length, `${label} no-match-${name} count ${k}`);
  }
  // 4. unrelated gallery without overrides is returned by identity
  const plain = page([{ type: 'filtergallery', eid: 'nomatch3', filters: [], items: [{ src: '/wp-content/uploads/x/y.jpg', title: 'y', alt: 'keep' }] }]);
  ok(mod.withGalleries(plain) === plain, `${label} untouched page identity`);
  return { n, fails, hits, tiles };
}

const cur = run(CUR, 'CUR');
let fail = cur.fails.length;
cur.fails.forEach((f) => console.log('FAIL', f));

// Non-gallery helper (current code)
const d = CUR.descriptionFor; let hn = 0;
const hok = (c, m) => { hn++; if (!c) { fail++; console.log('FAIL', m); } };
for (const k of six) {
  const stem = k.replace(/\.\w+$/, ''), ext = k.match(/\.\w+$/)[0];
  for (const v of [k, `${stem}-768x432${ext}`, `${stem}-300x169${ext}`, `${stem}-300x200${ext}`, 'https://img.vinylwraptoronto.com/' + k.replace('/wp-content/uploads/', '')]) hok(d(v) === ov[k], 'variant ' + v);
}
hok(d('/wp-content/uploads/2020/08/Hyundai-Veloster-2016-Full-Wrap-Personal-1-768x432.jpg') === ov['/wp-content/uploads/2020/09/Hyundai-Veloster-2016-Full-Wrap-Personal.jpg'], 'home Veloster-1 variant');
for (const neg of [
  '/wp-content/uploads/2020/10/Audi-A4-2006-Full-Car-Wrap-VinylWrapToronto.com-Sand-Vinyl-Wrap-Toronto-Vehicle-Wrap-Side-768x432.jpg',
  '/wp-content/uploads/2021/01/Toyota-Highlander-Hybrid-Full-Car-Wrap-Commercial-Wrap-680-News-VinylWrapToronto.com-Best-Vehicle-Wrap-in-Toronto-Front-Side-768x512.jpg',
  '/wp-content/uploads/2020/09/Porsche-Macan-2016-Vinyl-Wrap-Toronto-Full-Car-Wrap-Etobicoke-Front-768x432.jpg',
  '/wp-content/uploads/2020/09/Hyundai-Veloster-2016-Full-Wrap-Personal-Other.jpg', '/hero/x.webp', null,
]) hok(d(neg) === undefined, 'collision ' + neg);
const tag = (s) => `<p><img alt="long old" decoding="async" src="${s}"/><img src="/wp-content/uploads/a/b.jpg" alt="keep"><img src="${s}"></p>`;
const h = CUR.describeHtml(tag(six[1]));
hok((h.match(/alt="Audi A4 sedan with a matte tan full wrap, side-front view"/g) || []).length === 2 && h.includes('alt="keep"') && !h.includes('long old'), 'describeHtml replace/add/keep');
const linked = JSON.parse(fs.readFileSync('src/data/linked-image-names.json', 'utf8'));
for (const k of Object.keys(linked)) hok(fs.existsSync('public' + k.replace(/\.webp$/, '-768x461.webp')), 'linked-name variant file exists ' + k);
console.log(`CUR: ${cur.n} gallery asserts (${cur.hits} override hits over ${cur.tiles} real tiles), ${hn} helper asserts, ${fail} failures`);

// Negative controls: pre-fix gallery.ts must fail the same gallery asserts
const old = run(OLD, 'OLD');
const oldNoMatch = old.fails.filter((f) => f.includes('no-match')).length;
console.log(`CONTROL(${refSrc}): ${old.fails.length} failures, ${oldNoMatch} in no-match`);
if (!oldNoMatch) { console.log('FAIL negative control did not fail on no-match fallback'); fail++; }
const loose = (s) => (Object.keys(ov).some((k) => s.includes(base(k).replace(/\.\w+$/, '').slice(0, 40))) ? 'x' : undefined);
if (loose('/wp-content/uploads/2020/10/Audi-A4-2006-Full-Car-Wrap-VinylWrapToronto.com-Sand-Vinyl-Wrap-Toronto-Vehicle-Wrap-Side-768x432.jpg') === undefined) { console.log('FAIL loose control did not collide'); fail++; } else console.log('CONTROL loose-prefix matcher collides with Audi Side sibling (expected)');
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
