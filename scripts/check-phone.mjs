/**
 * Every call and WhatsApp on the site goes to 416-746-1381.
 *
 * The business has had other numbers in front of the public -- 647-559-5939,
 * 647-494-4757, 647-474-4645 and 416-822-3232 -- and they survived in post
 * bodies, meta descriptions, JSON-LD article descriptions, a web story and the
 * contact page's WhatsApp button long after 416-746-1381 became the line. A
 * reader who tapped one rang the wrong phone; a search result that quoted one
 * sent the call there too.
 *
 * This walks the built site and fails on:
 *   - any of those retired numbers, in any format, anywhere in the output;
 *   - any `tel:` link that does not dial 416-746-1381, unless it is listed in
 *     THIRD_PARTY below as someone else's number on purpose;
 *   - any WhatsApp link that does not open a chat with 416-746-1381.
 *
 *   npx astro build && node scripts/check-phone.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');
const MAIN = '4167461381';

/* Retired business numbers, digits only. */
const RETIRED = ['6475595939', '6474944757', '6474744645', '4168223232'];

/* Numbers that are deliberately someone else's, with where and why. */
const THIRD_PARTY = {
  '4163719660': 'the BAOBAB project\'s contact, on /the-baobab-project-bike-charity/',
};

const digits = (s) => s.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
const retiredRx = new RegExp(
  RETIRED.map((n) => `\\(?${n.slice(0, 3)}\\)?[\\s.\\-]?${n.slice(3, 6)}[\\s.\\-]?${n.slice(6)}`).join('|'),
  'g',
);
const SKIP = new Set(['_astro', 'fonts']);

const problems = [];
let files = 0;
let telLinks = 0;
let waLinks = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) walk(p);
      continue;
    }
    /* Pages, feeds and data -- and the few extension-less HTML documents the
       WordPress scrape left under /wp-content/uploads/, which are served too. */
    if (/\.(html|xml|json|txt)$/.test(entry.name)) check(p, fs.readFileSync(p, 'utf8'));
    else if (!path.extname(entry.name) && fs.statSync(p).size < 5e6) {
      const text = fs.readFileSync(p, 'utf8');
      if (/^\s*<(!doctype|html)/i.test(text)) check(p, text);
    }
  }
}

function check(file, text) {
  files++;
  const where = '/' + path.relative(DIST, file).replace(/index\.html$/, '');
  for (const m of text.matchAll(retiredRx)) {
    problems.push(`${where}: retired number ${m[0]}`);
  }
  for (const m of text.matchAll(/tel:([+\d().\-\s%20]{7,25})/g)) {
    telLinks++;
    const n = digits(decodeURIComponent(m[1]));
    if (n !== MAIN && !THIRD_PARTY[n]) problems.push(`${where}: tel: link to ${m[1].trim()}`);
  }
  for (const m of text.matchAll(/(?:api\.whatsapp\.com\/send\/?\?phone=|wa\.me\/|whatsapp:\/\/send\?phone=)(\+?\d+)/g)) {
    waLinks++;
    if (digits(m[1]) !== MAIN) problems.push(`${where}: WhatsApp link to ${m[1]}`);
  }
}

if (!fs.existsSync(DIST)) {
  console.error('dist/ not found -- build first.');
  process.exit(1);
}
walk(DIST);

console.log(`check-phone: ${files} files, ${telLinks} tel: links, ${waLinks} WhatsApp links`);
if (problems.length) {
  const shown = [...new Set(problems)];
  console.error(`\nPHONE CHECK FAILED -- ${shown.length} place(s) send a call somewhere other than 416-746-1381:`);
  for (const p of shown.slice(0, 60)) console.error(`  ${p}`);
  if (shown.length > 60) console.error(`  ... and ${shown.length - 60} more`);
  process.exit(1);
}
console.log('PHONE CHECK PASSED -- every call and WhatsApp link goes to 416-746-1381.');
