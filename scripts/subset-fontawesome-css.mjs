/**
 * Postbuild step: drop Font Awesome icon-glyph rules for classes that are
 * genuinely never rendered anywhere in the built site, before
 * minify-static-css losslessly minifies what remains.
 *
 * Why: render-blocking-insight attributes significant mobile FCP/LCP delay to
 * `fonts/fontawesome.css` -- the second-largest render-blocking stylesheet on
 * every page after roboto.css (see `_evidence/pr7-merge-verify-20251001/
 * mobile-fcp-lcp-diagnosis.md` and the plan at
 * `.claude/plans/you-are-the-execution-luminous-moore.md`). The file ships
 * 1,463 per-icon `.fa-xxx:before{content:"\fNNN"}` glyph rules (Font Awesome
 * Free 5.15.3's entire icon set), 92% of the file's bytes, covering every
 * icon in the library -- while this site renders only a few dozen of them.
 *
 * This is NOT a blind removal: every built HTML page's `class="..."`
 * attributes are scanned for whitespace-delimited tokens matching
 * `fa-[a-z0-9-]+` before anything is dropped. Scanning the BUILT HTML (not
 * `src/`) catches icon classes assembled by any runtime/template logic, not
 * just literal source strings. Scanning is attribute-scoped (not a raw
 * substring search of the whole page) specifically because this site's blog
 * content includes car-model slugs/URLs such as "alfa-romeo" that contain the
 * literal substring "fa-romeo" -- a naive whole-document substring scan
 * false-positives on these; restricting to `class="..."` token matches
 * avoids that trap entirely (verified 2026-10-01, see
 * `_evidence/pr7-fontawesome-subset-20261001/`).
 *
 * If the scan finds zero `fa-` classes anywhere, or finds a `fa-` class used
 * in markup that has no matching glyph rule in the source CSS (a content
 * integrity problem, not a subsetting decision), the build fails loudly
 * instead of silently shipping a broken or guessed-at subset -- same
 * defensive pattern as `assertSafeToDrop` in `subset-roboto-css.mjs`.
 *
 * Self-healing by construction: the allowlist is derived from the *current*
 * build's own HTML every run, so a future page adding a new icon keeps that
 * glyph automatically -- no hardcoded icon list to maintain.
 *
 * Keeps unconditionally: all 3 `@font-face` blocks, every non-glyph
 * structural/utility rule (`.fa`, `.fas`, `.fab`, `.fa-lg`, `.fa-spin`,
 * `.fa-stack`, etc. -- anything not matching the
 * `.fa-xxx:before{content:"..."}` shape), and the license banner (handled by
 * `minify-static-css.mjs`'s `legalComments: 'eof'`, unaffected by this
 * script, which runs first).
 *
 * Scoped to `dist/fonts/fontawesome.css` only (the built copy) -- the full,
 * readable, unmodified source stays in `public/fonts/fontawesome.css` for
 * maintenance, exactly like `subset-roboto-css.mjs`'s own pattern for
 * roboto.css.
 *
 * Must run AFTER `astro build` (so `dist/**\/*.html` exists to scan) and
 * BEFORE `scripts/minify-static-css.mjs` (so the subsequent esbuild minify
 * pass also shrinks whitespace/comments on the now-smaller file). Mirrors
 * `subset-roboto-css.mjs`'s build-script slot exactly; both run back to
 * back, in either order relative to each other (they touch different files).
 */
import fs from 'node:fs';
import path from 'node:path';

const distRoot = path.resolve('dist');
const faPath = path.join(distRoot, 'fonts', 'fontawesome.css');

if (!fs.existsSync(faPath)) {
  console.error(`subset-fontawesome-css: expected build output missing: ${faPath}`);
  process.exit(1);
}

const EXPECTED_FONT_FACE_COUNT = 3; // brands / regular / solid, verified against public/fonts/fontawesome.css

function listHtmlFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listHtmlFiles(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

/**
 * Scan every built HTML page's `class="..."` / `class='...'` attribute
 * values for whitespace-delimited tokens shaped like `fa-xxx`. Deliberately
 * NOT a whole-document substring search: this site's blog/page slugs and
 * URLs (e.g. "alfa-romeo", "alfa-romeo-4c") contain the literal substring
 * "fa-romeo" / "fa-romeo-4c", which a substring scan would wrongly treat as
 * used icon classes. Restricting to actual class-attribute tokens avoids
 * this false-positive class entirely.
 */
function scanUsedIconClasses(htmlFiles) {
  const used = new Set();
  const classAttrRe = /class=(["'])(.*?)\1/g;
  for (const file of htmlFiles) {
    const text = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = classAttrRe.exec(text))) {
      for (const token of m[2].split(/\s+/)) {
        if (/^fa-[a-z0-9-]+$/.test(token)) used.add(token);
      }
    }
  }
  return used;
}

const htmlFiles = listHtmlFiles(distRoot);
if (htmlFiles.length === 0) {
  console.error('subset-fontawesome-css: no built .html files found under dist/ -- cannot safety-check '
    + 'icon-glyph removal against zero pages. Aborting instead of guessing.');
  process.exit(1);
}

const usedClasses = scanUsedIconClasses(htmlFiles);
if (usedClasses.size === 0) {
  console.error('subset-fontawesome-css: scanned ' + htmlFiles.length + ' built HTML file(s) and found zero '
    + '"fa-xxx" class tokens anywhere. This site uses Font Awesome icons extensively (nav carets, social '
    + 'links, contact icons) -- a zero result means the scan itself is broken, not that icons are unused. '
    + 'Aborting instead of shipping a near-empty icon file.');
  process.exit(1);
}

const css = fs.readFileSync(faPath, 'utf8');

const fontFaceBlocks = css.match(/@font-face\s*\{[^}]*\}/g) || [];
if (fontFaceBlocks.length !== EXPECTED_FONT_FACE_COUNT) {
  console.error(`subset-fontawesome-css: expected ${EXPECTED_FONT_FACE_COUNT} @font-face rules in ${faPath}, `
    + `found ${fontFaceBlocks.length}. The source file's shape has changed -- aborting instead of guessing `
    + 'which rules are safe to keep.');
  process.exit(1);
}

// Every per-icon glyph rule has this exact shape in Font Awesome Free 5.15.3:
// a single class selector (no grouped/aliased selectors in this build, each
// icon has exactly one glyph rule), a single `:before` pseudo-element, and a
// single-character `content: "\fNNN"` escape. Matched against the full
// un-minified source file (public/fonts/fontawesome.css, copied verbatim
// into dist/ by Astro before this script runs).
const glyphRuleRe = /\.fa-[a-z0-9-]+:before\{content:"[^"]*"\}/g;
const glyphRules = css.match(glyphRuleRe) || [];
if (glyphRules.length === 0) {
  console.error(`subset-fontawesome-css: no icon-glyph rules matched in ${faPath} -- expected ~1,463 `
    + '`.fa-xxx:before{content:"..."}` rules. The source file\'s shape has changed -- aborting instead of '
    + 'silently doing nothing.');
  process.exit(1);
}

// Map every glyph rule to the single class name it defines, and verify every
// class actually used in the built markup has a matching rule -- a used
// class with no glyph rule is a content-integrity bug worth surfacing loudly
// rather than silently shipping a subset that's still missing an icon.
const glyphByClass = new Map();
for (const rule of glyphRules) {
  const classMatch = rule.match(/^\.(fa-[a-z0-9-]+):before/);
  if (!classMatch) {
    console.error(`subset-fontawesome-css: matched a glyph rule with no parseable class name -- aborting: ${rule}`);
    process.exit(1);
  }
  glyphByClass.set(classMatch[1], rule);
}

const missingGlyphs = [...usedClasses].filter((cls) => !glyphByClass.has(cls));
if (missingGlyphs.length > 0) {
  console.error('subset-fontawesome-css: the following class(es) are used in built markup but have no '
    + `matching glyph rule in ${faPath} -- this is a pre-existing content bug (a typo'd or removed icon `
    + 'class), not something this subsetting step should paper over. Aborting instead of shipping a subset '
    + `that's still missing an icon:`);
  for (const cls of missingGlyphs) console.error(`  ${cls}`);
  process.exit(1);
}

let kept = 0;
let dropped = 0;
const remainingGlyphRules = glyphRules.filter((rule) => {
  const classMatch = rule.match(/^\.(fa-[a-z0-9-]+):before/);
  const isUsed = usedClasses.has(classMatch[1]);
  if (isUsed) { kept += 1; return true; }
  dropped += 1;
  return false;
});

if (kept !== usedClasses.size) {
  console.error(`subset-fontawesome-css: expected to keep ${usedClasses.size} glyph rule(s) (one per used `
    + `class), actually kept ${kept}. Aborting without writing (no partial/unexpected edits).`);
  process.exit(1);
}

// Reassemble: replace every original glyph rule occurrence with either itself
// (kept) or nothing (dropped), leaving every other byte of the file --
// comments, @font-face blocks, structural/utility rules -- untouched and in
// their original order.
const keptSet = new Set(remainingGlyphRules);
let newCss = '';
let cursor = 0;
let matchIndex;
glyphRuleRe.lastIndex = 0;
let m2;
while ((m2 = glyphRuleRe.exec(css))) {
  matchIndex = m2.index;
  newCss += css.slice(cursor, matchIndex);
  if (keptSet.has(m2[0])) newCss += m2[0];
  cursor = matchIndex + m2[0].length;
}
newCss += css.slice(cursor);

const bytesBefore = Buffer.byteLength(css, 'utf8');
const bytesAfter = Buffer.byteLength(newCss, 'utf8');

if (bytesAfter >= bytesBefore) {
  console.error(`subset-fontawesome-css: expected a smaller file after dropping ${dropped} unused glyph `
    + `rule(s), got ${bytesBefore} -> ${bytesAfter} bytes. Aborting without writing.`);
  process.exit(1);
}

fs.writeFileSync(faPath, newCss);
console.log(`subset-fontawesome-css: scanned ${htmlFiles.length} built HTML file(s), found `
  + `${usedClasses.size} distinct used "fa-xxx" class(es); kept ${kept} glyph rule(s), dropped ${dropped} `
  + `unused glyph rule(s) of ${glyphRules.length} total; ${bytesBefore} -> ${bytesAfter} bytes `
  + `(${bytesBefore - bytesAfter} saved, before minify)`);
console.log(`subset-fontawesome-css: used classes: ${[...usedClasses].sort().join(', ')}`);
