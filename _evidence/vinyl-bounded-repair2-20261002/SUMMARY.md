# Bounded repair batch #2 — 2026-10-02

Base: d0f99baf91d650132495cd72ba0ccd7b54ce8153 (prior session: Twitter-meta strip + hours)
DOCX source: "SEO Audit - Vinyl Wrap Toronto_1.docx" (Downloads, modified Oct 2 14:08)

## Verified already-correct (no change, per prior claims)
- `/vinyl/` footer link: sr-only accessible text already present on the icon
  anchor (Footer.astro), href correctly points to live redirect target.
- `/full-car-wrap-toronto/` title already fixed to "Full Car Wrap Toronto |
  Avery & 3M Vinyl Wraps" (48 chars, includes primary keyword + city).

## Fixed this session
1. **Alt text** — src/data/pages/index.json (8 homepage images) and
   src/data/pages/full-car-wrap-toronto.json (9 unique strings, ~10
   occurrences incl. a duplicate gallery image) — shortened from
   keyword-stuffed WP-era strings (150-220 chars) to plain factual
   descriptions (vehicle/year/wrap-type/brand/location), no facts invented,
   no typo "corrections" beyond scope (e.g. "Tuscan" left as-is).
2. **Heading skip, car-wrap-faqs.json** — genuine H1->H3 skip (33 raw `<h3>`
   FAQ-question headings, zero intervening H2). Changed to
   `<h2 style="font-size:22px">` to fix semantic order while preserving the
   original 22px visual size (global.css default h2 is 28px).
   - Blog index and ArchiveList.astro checked: NO skip found, no change made.
3. **Footer "Areas We Serve"** — added 7 real `<a href="/locations-served/...">`
   links (Toronto, Mississauga, North York, Scarborough, Brampton, Markham,
   Oakville) above the existing "and more..." text. Evidence for genuineness:
   src/data/pages/locations-served.json is a real ported WP CPT archive page
   that itself links to these same 7 sub-pages, each with distinct real
   titles/content (confirmed by direct read of each JSON). This supersedes
   the prior session's conflict note (which only had live-site-omission as
   evidence against links, not evidence against the pages' authenticity).
   Minimal CSS added reusing existing `.list` typography for visual parity.

## Accessibility diagnostic (important finding)
Custom targeted axe run (`.qa-tmp/axe-targeted.mjs`, routes `/`,
`/full-car-wrap-toronto/`, `/car-wrap-faqs/`, desktop+mobile — these 3 routes
are NOT in scripts/accessibility.mjs's fixed 10-route list) found violations:
color-contrast + region (on `/`), heading-order + region (on the other two).
**Confirmed PRE-EXISTING and unrelated to this session's edits**: identical
failures reproduced after `git stash` (pre-edit base commit) + rebuild +
re-run. Not a regression. Left unresolved as an out-of-scope, documented gap
(repo's own accessibility.mjs doesn't cover these 3 routes at all, so this
is a genuine audit-coverage gap worth flagging, not a new issue to fix here).

## Not addressed (out of scope for this bounded batch)
- Blog-post-level `<h3>` skips inside ~205 individual rich-text post bodies.
- Footer H4 usage (not a skip in isolation, left unchanged).
- HSTS, srcset/WebP, FAQPage schema, inline-CSS extraction, llms.txt.
- 6 "Trusted By" logo width/height attrs (audit item, not in this session's
  focus list).
- color-contrast/region/heading-order axe findings above (pre-existing).

## Validation (this session)
- npm run build -> exit 0, SEO LINT PASSED (see build.log)
- node scripts/accessibility.mjs -> 20/20 PASS (a11y.log) — route-coverage
  caveat above
- node scripts/tracking.mjs -> 6/6 PASS (tracking.log) — forms/leads/consent
  untouched, confirmatory run only
- node scripts/verify.mjs -> 15/15 PASS (verify.log)
- node .qa-tmp/axe-targeted.mjs -> same 6 pre-existing failures as pre-edit
  baseline (axe-targeted-after.log); confirmed via git-stash comparison, not
  a regression
- Screenshots: footer-after.png (Areas We Serve links, desktop),
  faq-after.png (first FAQ heading rendering) — visual appearance preserved
- dist/ grep spot-checks: footer city links render, FAQ h2 renders with
  22px inline style, shortened alt text renders

Files changed: src/components/Footer.astro, src/data/pages/car-wrap-faqs.json,
src/data/pages/index.json, src/data/pages/full-car-wrap-toronto.json.
Helper scripts added under .qa-tmp/ (repo's existing throwaway-script
convention): shorten_alts.py, fix_faq_headings.py, axe-targeted.mjs, shots.mjs.
