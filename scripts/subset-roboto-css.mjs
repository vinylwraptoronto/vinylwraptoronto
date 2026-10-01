/**
 * Postbuild step: drop the Roboto @font-face subsets for scripts that are
 * genuinely never used anywhere in the built site, before minify-static-css
 * losslessly minifies what remains.
 *
 * Why: render-blocking-insight attributes ~2,101 ms of mobile FCP/LCP delay
 * to `fonts/roboto.css` alone -- the single largest render-blocking
 * stylesheet on every page (see
 * `_evidence/pr7-desktop-fix-20261001/summary.md` and
 * `_evidence/pr7-merge-verify-20261001/mobile-fcp-lcp-diagnosis.md`). The
 * file ships 162 `@font-face` rules (18 weights/styles x 9 unicode-range
 * subsets) -- the full Google-Fonts Roboto split, covering Cyrillic,
 * Cyrillic-ext, Greek, Greek-ext, Vietnamese, and Latin-ext-additional in
 * addition to the Latin + symbols subsets this English-language Toronto
 * vehicle-wrap site actually renders.
 *
 * This is NOT a blind glyph removal: every character in every built HTML
 * page is scanned against the 6 candidate-drop subsets' own unicode-range
 * codepoints before anything is removed. If so much as one character
 * anywhere in the build requires a subset slated for removal, the build
 * fails loudly instead of silently shipping a page with missing glyphs --
 * see `assertSafeToDrop()` below. This also means future content (new blog
 * posts, pages, locations) that introduces e.g. Vietnamese or Cyrillic text
 * will fail the build the moment it's added, rather than silently falling
 * back to a system font for those characters.
 *
 * Scoped to `dist/fonts/roboto.css` only (the built copy) -- the full,
 * readable, unmodified 162-rule source stays in `public/fonts/roboto.css`
 * for maintenance, exactly like `scripts/minify-static-css.mjs`'s own
 * pattern for the same file.
 *
 * Must run AFTER `astro build` (so `dist/**\/*.html` exists to scan) and
 * BEFORE `scripts/minify-static-css.mjs` (so the subsequent esbuild minify
 * pass also shrinks whitespace/comments on the now-smaller file).
 */
import fs from 'node:fs';
import path from 'node:path';

const distRoot = path.resolve('dist');
const robotoPath = path.join(distRoot, 'fonts', 'roboto.css');

if (!fs.existsSync(robotoPath)) {
  console.error(`subset-roboto-css: expected build output missing: ${robotoPath}`);
  process.exit(1);
}

// The 6 subsets this English-language site never renders, identified from
// `public/fonts/roboto.css`'s own 9 distinct unicode-range values (verified
// 2026-10-01 against every character in src/, db/, and the built dist/
// HTML -- see _evidence/pr7-mobile-font-subset-20261001/).
const DROP_SUBSETS = [
  { name: 'cyrillic-ext', range: 'U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F' },
  { name: 'cyrillic', range: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116' },
  { name: 'greek-ext', range: 'U+1F00-1FFF' },
  { name: 'greek', range: 'U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF' },
  { name: 'vietnamese', range: 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB' },
  { name: 'latin-ext', range: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
];
// Subsets kept unconditionally: latin (U+0000-00FF...), the math/greek-letter
// "symbols" subset, and the pictograph/emoji "symbols" subset -- all three
// are demonstrably in use (arrows, bullets, em dashes, stars, checkmarks,
// pictograph emoji in blog/page JSON content).
const EXPECTED_WEIGHTS_PER_SUBSET = 18; // 9 weights x {normal, italic}

function normalizeRange(raw) {
  return raw.replace(/\s+/g, ' ').trim();
}

function parseRanges(rangeStr) {
  // "U+0000-00FF" -> [0,255]; "U+2116" -> [0x2116,0x2116]
  return rangeStr.split(',').map((part) => {
    const trimmed = part.trim().replace(/^U\+/i, '');
    const [lo, hi] = trimmed.split('-');
    return [parseInt(lo, 16), hi ? parseInt(hi, 16) : parseInt(lo, 16)];
  });
}

function codepointInRanges(cp, ranges) {
  for (const [lo, hi] of ranges) {
    if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

function listHtmlFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listHtmlFiles(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

/**
 * Fail loudly (non-zero exit) if any character anywhere in the built site
 * requires one of the subsets we're about to drop. Never silently ship a
 * missing glyph.
 */
function assertSafeToDrop(dropSubsetsWithRanges) {
  const htmlFiles = listHtmlFiles(distRoot);
  if (htmlFiles.length === 0) {
    console.error('subset-roboto-css: no built .html files found under dist/ -- cannot safety-check '
      + 'font subset removal against zero pages. Aborting instead of guessing.');
    process.exit(1);
  }
  const offenders = [];
  for (const file of htmlFiles) {
    const text = fs.readFileSync(file, 'utf8');
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp <= 0xFF) continue; // fast path: ASCII/Latin-1 is always in the kept "latin" subset
      for (const subset of dropSubsetsWithRanges) {
        if (codepointInRanges(cp, subset.ranges)) {
          offenders.push({ file: path.relative(distRoot, file), char: ch, codepoint: `U+${cp.toString(16).toUpperCase()}`, subset: subset.name });
          if (offenders.length >= 20) break;
        }
      }
      if (offenders.length >= 20) break;
    }
    if (offenders.length >= 20) break;
  }
  if (offenders.length > 0) {
    console.error('subset-roboto-css: refusing to drop font subsets -- found character(s) in the built '
      + 'site that require a subset slated for removal. This means new content now uses a script this '
      + 'optimization assumed was unused. Add the relevant subset back (or re-scope this script) instead '
      + 'of shipping missing glyphs:');
    for (const o of offenders) {
      console.error(`  ${o.char} (${o.codepoint}) in ${o.file} requires subset "${o.subset}"`);
    }
    process.exit(1);
  }
}

const css = fs.readFileSync(robotoPath, 'utf8');
const blocks = css.match(/@font-face\s*\{[^}]*\}/g);
if (!blocks || blocks.length === 0) {
  console.error(`subset-roboto-css: no @font-face blocks found in ${robotoPath} -- expected the full `
    + 'Roboto stylesheet copied from public/. Aborting instead of silently doing nothing.');
  process.exit(1);
}

const dropSubsetsWithRanges = DROP_SUBSETS.map((s) => ({ ...s, ranges: parseRanges(s.range), normalized: normalizeRange(s.range) }));

// Verify each candidate-drop subset is present the expected number of times
// before touching anything -- if Roboto's own file shape changed (different
// subset split, different weight count), fail loud rather than silently
// dropping the wrong thing or nothing at all.
for (const subset of dropSubsetsWithRanges) {
  const count = blocks.filter((b) => {
    const m = b.match(/unicode-range:\s*([^;]+);/);
    return m && normalizeRange(m[1]) === subset.normalized;
  }).length;
  if (count !== EXPECTED_WEIGHTS_PER_SUBSET) {
    console.error(`subset-roboto-css: expected ${EXPECTED_WEIGHTS_PER_SUBSET} @font-face rules for the `
      + `"${subset.name}" subset in ${robotoPath}, found ${count}. The source file's shape has changed -- `
      + 'aborting instead of guessing which rules to remove.');
    process.exit(1);
  }
}

assertSafeToDrop(dropSubsetsWithRanges);

let kept = 0;
let dropped = 0;
const remainingBlocks = blocks.filter((b) => {
  const m = b.match(/unicode-range:\s*([^;]+);/);
  const normalized = m ? normalizeRange(m[1]) : null;
  const isDrop = dropSubsetsWithRanges.some((s) => s.normalized === normalized);
  if (isDrop) { dropped += 1; return false; }
  kept += 1;
  return true;
});

if (dropped !== DROP_SUBSETS.length * EXPECTED_WEIGHTS_PER_SUBSET) {
  console.error(`subset-roboto-css: expected to drop ${DROP_SUBSETS.length * EXPECTED_WEIGHTS_PER_SUBSET} `
    + `rules, actually matched ${dropped}. Aborting without writing (no partial/unexpected edits).`);
  process.exit(1);
}

// Reassemble: replace the original concatenation of @font-face blocks with
// the kept subset, preserving the file's leading header/comment (everything
// before the first "@font-face").
const firstBlockIndex = css.indexOf(blocks[0]);
const header = css.slice(0, firstBlockIndex);
const newCss = header + remainingBlocks.join('\n\n') + '\n';

const bytesBefore = Buffer.byteLength(css, 'utf8');
const bytesAfter = Buffer.byteLength(newCss, 'utf8');

fs.writeFileSync(robotoPath, newCss);
console.log(`subset-roboto-css: kept ${kept} @font-face rule(s) (latin + 2 symbol subsets), dropped `
  + `${dropped} rule(s) across ${DROP_SUBSETS.length} unused-script subsets `
  + `(${dropSubsetsWithRanges.map((s) => s.name).join(', ')}); `
  + `${bytesBefore} -> ${bytesAfter} bytes (${bytesBefore - bytesAfter} saved, before minify)`);
