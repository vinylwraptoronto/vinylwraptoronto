/**
 * Every phone number on the site is 416-746-1381.
 *
 * Not only the business's own retired lines (647-559-5939, 647-494-4757,
 * 647-474-4645, 416-822-3232) but every number: a charity's contact, a sister
 * company's line, a customer's number described on their van, and the
 * 416-555 / 555-1234 examples in articles all read 416-746-1381 now, by the
 * client's instruction. Anything a visitor might dial goes to the one line.
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
    if (digits(m[2]) !== MAIN) problems.push(`${where}: ${m[1].replace(/\?phone=|\/$/, '')} link to ${m[2].trim()}`);
  }
  for (const m of text.matchAll(NUMBER)) {
    numbers++;
    if (digits(m[0]) !== MAIN) problems.push(`${where}: phone number ${m[0].trim()}`);
  }
  if (/\.html$|^[^.]*$/.test(path.basename(file))) {
    const visible = visibleText(text);
    for (const m of visible.matchAll(SEVEN)) {
      // The tail of a ten-digit number, already judged above.
      if (/\d[\s.\-)]*$/.test(visible.slice(Math.max(0, m.index - 4), m.index))) continue;
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

console.log(`check-phone: ${files} files, ${numbers} written numbers, ${links} call/SMS/WhatsApp links`);
if (problems.length) {
  const shown = [...new Set(problems)];
  console.error(`\nPHONE CHECK FAILED -- ${shown.length} place(s) show or dial a number other than 416-746-1381:`);
  for (const p of shown.slice(0, 60)) console.error(`  ${p}`);
  if (shown.length > 60) console.error(`  ... and ${shown.length - 60} more`);
  process.exit(1);
}
console.log('PHONE CHECK PASSED -- every phone number on the site is 416-746-1381.');
