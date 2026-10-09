/**
 * Every phone number that reaches Vinyl Wrap Toronto is 416-746-1381.
 *
 * The business's own retired lines (647-559-5939, 647-494-4757, 647-474-4645,
 * 416-822-3232) and the sister company's (416-288-8661) all read 416-746-1381,
 * by the client's instruction: anything a visitor might dial to reach the shop
 * goes to the one line.
 *
 * Numbers that are not the shop's stay as written -- see THIRD_PARTY below: a
 * charity's contact, a customer's number described on their van, and the
 * made-up numbers in example ads. The 2026-10-07 rewrite changed those too,
 * which sent a bicycle-donation call to the wrap shop; this now fails if any of
 * them is rewritten again, or if its passage loses it.
 *
 * This walks the built site and fails on:
 *   - any `tel:` or `sms:` link that does not dial 416-746-1381;
 *   - any WhatsApp link that does not open a chat with 416-746-1381;
 *   - any other North American number anywhere in a page, feed or data file --
 *     text, meta descriptions, JSON-LD -- in any of its written forms:
 *     416-288-8661, (416) 288-8661, 416.288.8661, 416 288 8661, +1 416 …;
 *   - a seven-digit number (555-1234) in a page's visible text.
 *
 * It runs at the end of `npm run build`, so a number that creeps back in --
 * from a post edited in /admin, say -- stops the deploy instead of shipping.
 *
 *   npx astro build && node scripts/check-phone.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');
const MAIN = '4167461381';

/* Ten digits with separators, optionally with +1: (416) 746-1381,
   416-746-1381, 416.746.1381, 416 746 1381, +1 416-746-1381. Unseparated
   runs of ten digits are left to the link checks below -- in running text
   they are file names, ids and timestamps, not phone numbers. */
const NUMBER = /(?<![\w/=.\-#])(?:\+?1[\s.\-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.\-])\d{3}[\s.\-]\d{4}(?![\w-])/g;
const LINK = /(tel:|sms:|api\.whatsapp\.com\/send\/?\?phone=|wa\.me\/|whatsapp:\/\/send\?phone=)(\+?[\d\-\s().]{7,20}|\+?(?:%20|%2B|\d)+)/g;
const SEVEN = /(?<![\w/=.\-:#])(\d{3})[-.](\d{4})(?![\w\-.]?\d)/g;
const SKIP = new Set(['_astro', 'fonts']);

/* Not the shop's numbers, each allowed only in its own passage (the text
   just before it) and required on its own page, with its link where it has one.
   Anything else that is not 416-746-1381 still fails. */
const THIRD_PARTY = [
  { page: '/the-baobab-project-bike-charity/', number: '4163719660', context: /Mr\. Steve at\s*(<a\b[^>]*>?)?\s*$/, link: 'tel:416-371-9660', why: 'the BAOBAB project contact, Mr. Steve' },
  { page: '/van-lettering-and-decals-toronto-ford-transit/', number: '4162487861', context: /Phone number:\s*$/, why: "Greenzeal's number on its van" },
  { page: '/car-decals-toronto-small-business-advertising/', number: '4165551234', context: /Joe’s Plumbing — Call\s*$/, why: "the illustrative Joe's Plumbing ad" },
  { page: '/fleet-branding-toronto-trust-roi/', number: '4165550199', context: /BOB’S PLUMBING” \+ “$/, why: "the illustrative Bob's Plumbing ad" },
  { page: '/truck-decals-for-real-estate-gta-branding/', number: '5551234', context: /Whether it’s “Call\s*$/, why: 'an illustrative call to action' },
];
const thirdParty = (text, index, num) =>
  THIRD_PARTY.some((t) => t.number === num && t.context.test(text.slice(Math.max(0, index - 80), index).replace(/<\/?(strong|b|em)>/g, '')));

const digits = (s) => decodeURIComponent(s).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
const visibleText = (html) => html
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/g, ' ');

const problems = [];
let files = 0;
let numbers = 0;
let links = 0;

function check(file, text) {
  files++;
  const where = '/' + path.relative(DIST, file).replace(/index\.html$/, '');
  for (const m of text.matchAll(LINK)) {
    links++;
    if (digits(m[2]) !== MAIN && !thirdParty(text, m.index, digits(m[2]))) problems.push(`${where}: ${m[1].replace(/\?phone=|\/$/, '')} link to ${m[2].trim()}`);
  }
  for (const m of text.matchAll(NUMBER)) {
    numbers++;
    if (digits(m[0]) !== MAIN && !thirdParty(text, m.index, digits(m[0]))) problems.push(`${where}: phone number ${m[0].trim()}`);
  }
  if (/\.html$|^[^.]*$/.test(path.basename(file))) {
    const visible = visibleText(text);
    for (const m of visible.matchAll(SEVEN)) {
      // The tail of a ten-digit number, already judged above.
      if (/\d[\s.\-)]*$/.test(visible.slice(Math.max(0, m.index - 4), m.index))) continue;
      if (thirdParty(visible, m.index, m[1] + m[2])) continue;
      problems.push(`${where}: seven-digit number ${m[0]}`);
    }
  }
}

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

if (!fs.existsSync(DIST)) {
  console.error('dist/ not found -- build first.');
  process.exit(1);
}
walk(DIST);

/* The other half: each third-party number is still on its page, in its
   passage, with its link. A blanket rewrite would pass the scan above. */
for (const t of THIRD_PARTY) {
  const file = path.join(DIST, t.page, 'index.html');
  if (!fs.existsSync(file)) { problems.push(`${t.page}: page missing (expected ${t.why})`); continue; }
  const html = fs.readFileSync(file, 'utf8');
  const found = [...html.matchAll(NUMBER), ...visibleText(html).matchAll(SEVEN)]
    .some((m) => digits(m[0]) === t.number);
  if (!found) problems.push(`${t.page}: ${t.why} no longer shows its own number`);
  if (t.link && !html.includes(`href="${t.link}"`)) problems.push(`${t.page}: ${t.why} lost its ${t.link} link`);
}

console.log(`check-phone: ${files} files, ${numbers} written numbers, ${links} call/SMS/WhatsApp links`);
if (problems.length) {
  const shown = [...new Set(problems)];
  console.error(`\nPHONE CHECK FAILED -- ${shown.length} place(s) show or dial a number other than 416-746-1381:`);
  for (const p of shown.slice(0, 60)) console.error(`  ${p}`);
  if (shown.length > 60) console.error(`  ... and ${shown.length - 60} more`);
  process.exit(1);
}
console.log(`PHONE CHECK PASSED -- every number that reaches the shop is 416-746-1381; ${THIRD_PARTY.length} third-party/example numbers kept in their own passages.`);
