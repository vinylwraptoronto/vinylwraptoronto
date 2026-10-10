/**
 * The site no longer advertises a three-year warranty, anywhere.
 *
 * The client withdrew the 3-year warranty. src/lib/warranty.ts drops the
 * "3 Year Warranty" feature panels the WordPress import repeats on a thousand
 * pages; the hand-written mentions -- hero lines, landing-page FAQs and their
 * FAQPage JSON-LD, list items, post prose, manufacturer "up to 3 years" rows --
 * were removed from the page data and from the posts in D1. This walks the
 * built site and fails on any that comes back, from a post edited in /admin,
 * say, or a page re-imported from WordPress:
 *
 *   - "3-year warranty", "3 Year Warranty", "three-year warranty",
 *     "3 years of warranty", "3 years warranty included";
 *   - "warranty: up to 3 years", "warranted for up to 3 years";
 *   - "36-month warranty";
 *
 * in visible text, alt text, meta tags, JSON-LD, feeds and data files alike.
 * A generic warranty with no term ("backed by a warranty") is fine.
 *
 * It runs at the end of `npm run build`, so the claim stops the deploy instead
 * of shipping.
 *
 *   npx astro build && node scripts/check-warranty.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');
const SKIP = new Set(['_astro', '_worker.js', 'fonts']);
const EXT = /\.(html|xml|json|txt|webmanifest)$/;

/* A three-year term within a few words of a warranty, either way round. Tags
   become spaces first, so a table row ("Warranty | Up to 3 years") or a
   heading followed by its figure is read the way a visitor reads it. */
const TERM = String.raw`\b(?:3|three)[\s\-]*(?:years?|yrs?)\b|\b36[\s\-]*months?\b`;
const CLAIM = new RegExp(
  String.raw`(?:${TERM})[^.!?]{0,30}?\bwarrant|\bwarrant\w*\b[^.!?]{0,30}?(?:${TERM})`,
  'gi',
);

/* Sentences that put "three years" and "warranty" side by side without
   stating a three-year warranty. */
const ALLOW = [
  /costs more over three years than a premium film with a full warranty/i,
];

const decode = (s) =>
  s
    .replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\u00a0|&nbsp;|&#160;/g, ' ')
    .replace(/\\u2011|\\u2010|\\u2013|&#8209;|&#8211;|&ndash;|[‐-–]/g, '-')
    .replace(/&amp;/g, '&')
    .replace(/\\[rnt]/g, ' ')
    .replace(/\s+/g, ' ');

function* files(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (EXT.test(e.name)) yield p;
  }
}

if (!fs.existsSync(DIST)) {
  console.error('check-warranty: no dist/ -- run `astro build` first.');
  process.exit(1);
}

const problems = [];
let scanned = 0;
for (const file of files(DIST)) {
  scanned++;
  const text = decode(fs.readFileSync(file, 'utf8'));
  for (const m of text.matchAll(CLAIM)) {
    const around = text.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80);
    if (ALLOW.some((rx) => rx.test(around))) continue;
    problems.push(`${path.relative(DIST, file)}: …${around.trim()}…`);
  }
}

if (problems.length) {
  console.error(`check-warranty: ${problems.length} three-year warranty mention(s) in the build:\n`);
  for (const p of problems.slice(0, 50)) console.error(`  ${p}`);
  if (problems.length > 50) console.error(`  … and ${problems.length - 50} more`);
  process.exit(1);
}
console.log(`check-warranty: ${scanned} files, no three-year warranty mentions.`);
