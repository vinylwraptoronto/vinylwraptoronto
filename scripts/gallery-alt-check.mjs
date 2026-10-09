/** Offline fixture: a D1-refreshed old snapshot and the tokenless committed snapshot must render identical alts. */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { applyAltOverrides } from '../src/lib/gallery-alt.ts';
const map = JSON.parse(fs.readFileSync('src/data/gallery-alt-overrides.json', 'utf8'));
const tokenless = JSON.parse(fs.readFileSync('src/data/galleries.json', 'utf8'));
const base = process.env.OLD_SNAPSHOT_REF || 'f5db8e6c';
// "refreshed" = what pull-galleries writes from D1 as of the pre-fix commit: long alts, no alt on 3M After Back.
const refreshed = JSON.parse(execSync(`git show ${base}:src/data/galleries.json`, { maxBuffer: 1 << 28 }).toString());
let fail = 0, hits = 0, n = 0;
const rd = (snap) => snap.flatMap((g) => applyAltOverrides(g.items, map).map((it) => ({ page: g.page, ...it })));
const A = rd(refreshed), B = rd(tokenless);
if (A.length !== B.length) { console.log('FAIL length', A.length, B.length); fail++; }
A.forEach((a, i) => { const b = B[i]; n++;
  const ra = a.alt ?? a.title, rb = b.alt ?? b.title;
  if (map[a.src]) { hits++; if (ra !== map[a.src] || rb !== map[a.src]) { console.log('FAIL alt', a.page, a.src); fail++; } }
  else if (ra !== rb) { console.log('FAIL non-override drift', a.page, a.src); fail++; }
  if (a.title !== b.title) { console.log('FAIL title drift', a.page, a.src); fail++; } });
console.log(`gallery-alt-check: ${n} items, ${hits} override hits across ${Object.keys(map).length} srcs, ${fail} failures`);
process.exit(fail ? 1 : 0);
