// One-off, EXTERNAL to the build (not in scripts/, not run by npm). Re-encodes the
// 8 sources with the recorded recipe and compares to committed bytes.
// usage: node regen-check.mjs <repoRoot> [--rename]
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const root = path.resolve(process.argv[2]); const rename = process.argv.includes('--rename');
const sharp = createRequire(path.join(root,'package.json'))('sharp');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const map = JSON.parse(fs.readFileSync(path.join(root,'src/data/img-opt.json'),'utf8'));
const R = { resize:'lanczos3', webp:{quality:82,effort:6} };
const report = { sharp: JSON.parse(fs.readFileSync(path.join(root,'node_modules/sharp/package.json'),'utf8')).version, versions: sharp.versions, recipe: R, items: [] };
const next = {};
for (const [k,v] of Object.entries(map)) {
  const src = fs.readFileSync(path.join(root,'public',k)); const item = { src:k, srcSha256:sha(src), out:{} }; const o = {};
  for (const w of [384,768]) {
    const cur = path.join(root,'public',v[w]);
    const enc = await sharp(src).resize(w,Math.round(w*432/768),{kernel:R.resize}).webp(R.webp).toBuffer();
    const committed = fs.readFileSync(cur);
    const same = Buffer.compare(enc,committed)===0;
    const h = sha(committed).slice(0,12);
    const base = path.basename(v[w]).replace(/-[0-9a-f]{8}-(\d+)\.webp$/, '');
    const name = rename ? `${base}-${h}-${w}.webp` : path.basename(v[w]);
    item.out[w] = { file:name, bytes:committed.length, sha256:sha(committed), regenIdentical:same };
    if (rename) { fs.renameSync(cur, path.join(root,'public/img-opt',name)); }
    o[w] = `/img-opt/${name}`;
  }
  next[k] = { ...v, ...o };
  report.items.push(item);
}
if (rename) fs.writeFileSync(path.join(root,'src/data/img-opt.json'), JSON.stringify(next,null,1));
fs.writeFileSync(path.join(root,'_evidence/img-delivery-20261007/provenance.json'), JSON.stringify(report,null,1));
console.log(report.sharp, JSON.stringify(report.versions), report.items.every(i=>Object.values(i.out).every(x=>x.regenIdentical)) ? 'ALL IDENTICAL' : 'DIFFERENT');
