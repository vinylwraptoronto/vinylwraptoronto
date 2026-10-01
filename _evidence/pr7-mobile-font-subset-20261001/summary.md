# PR7 bounded validation — Roboto font-subset removal (mobile render-blocking CSS) — 2026-10-01

Branch: `automation/vinyl-mobile-perf-20261001`, continued from HEAD
`46d9a9b884e0a798a8387e22c7827eddf7651571` (verified local==origin==PR7 head
before starting). System UTC at build time: `2026-10-01T19:14:15Z`. Runtime
automation task ID: unavailable in this workspace — not invented.

## Change
Added `scripts/subset-roboto-css.mjs`, wired into `package.json`'s `build`
script immediately after `astro build` and before `minify-static-css.mjs`.
Drops the 6 of 9 Google-Fonts Roboto unicode-range subsets (cyrillic,
cyrillic-ext, greek, greek-ext, vietnamese, latin-ext — 108 of 162
`@font-face` rules) that no character anywhere in the built site's HTML
actually requires, per exhaustive codepoint-range scanning of all 56 distinct
non-Latin-1 characters found in `src/`/`db/` content. Keeps latin + the two
symbol/pictograph subsets unconditionally (covers all observed punctuation,
arrows, math symbols, emoji). Fails the build loudly if new content ever
introduces a character requiring a dropped subset (`assertSafeToDrop`,
functionally verified via a sandboxed Cyrillic-injection test, cleaned up
afterward with no leakage into the real `dist/`). Chosen per the diagnosis in
`_evidence/pr7-merge-verify-20261001/mobile-fcp-lcp-diagnosis.md`: `roboto.css`
was the single largest render-blocking stylesheet (2,101ms). This is the "next
bounded lever" that doc named, not a repeat of the already-tried-and-ineffective
blanket `media=print`/`preload+onload` CSS-defer experiment.

Result: shipped `roboto.css` 85,033 → 53,335 bytes (37% / 31.7KB smaller),
after the existing lossless `minify-static-css.mjs` pass.

## Method — matched before/after, production-config LOCAL homepage, idle sequential
1. Built "after" via the real unmodified `npm run build` (includes the new
   step). Exit 0. `build-after.log`. Copied to `dist-after/` for measurement.
2. Built "before" via the same pipeline with only the new step skipped
   (pull-posts → pull-galleries → astro build → minify-static-css →
   inline-homepage-css → check-seo), same working tree. Exit 0.
   `build-before.log`. Copied to `dist-before/`.
3. Byte-diffed the two dists (`dist-diff-summary.txt`): only `fonts/roboto.css`
   differs in content, plus the expected non-deterministic `_worker.js`
   manifest chunk hash (not served by the static Lighthouse harness). All
   `.html` files identical.
4. Ran Lighthouse 13.5.0 via a fresh one-off harness (`scripts/_tmp-subset-median3.mjs`,
   not committed — deleted after use, same convention as the prior
   `pr7-desktop-fix-20261001` pass), idle sequential (server+Chrome fully
   closed between every run, 300ms settle), 3 runs each for mobile and
   desktop against the homepage of each dist. Standard mobile throttling
   (`rttMs:150, throughputKbps:1638.4, cpuSlowdownMultiplier:4`,
   `screenEmulation.mobile:true, 412x823@1.75x`) and standard desktop
   throttling (`rttMs:40, throughputKbps:10240, cpuSlowdownMultiplier:1`,
   `screenEmulation.mobile:false, 1350x940@1x`), `throttlingMethod:'simulate'`.
5. Raw-setting assertion performed in-script before trusting any score: every
   run's `configSettings.formFactor` and `configSettings.screenEmulation.mobile`
   checked for agreement (threw otherwise); all 12 runs confirmed correct
   (no mobile-labeled-as-desktop mistake). Full raw settings printed per run
   in `before-median3-run.log` / `after-median3-run.log`.

## Result — matched median3 (raw JSONs: `{before,after}-{mobile,desktop}-run{1,2,3}.json`)
| | run1 | run2 | run3 | median | a11y/BP/SEO |
|---|---|---|---|---|---|
| mobile before (no font-subset) | 72 | 74 | 72 | **72** | 100/100/100 |
| mobile after (font-subset) | 74 | 77 | 76 | **76** | 100/100/100 |
| desktop before (no font-subset) | 97 | 98 | 98 | **98** | 100/100/100 |
| desktop after (font-subset) | 98 | 98 | 98 | **98** | 100/100/100 |

**Genuine mobile improvement: +4 median (72→76), no desktop regression
(98→98 flat), a11y/BP/SEO unchanged at 100/100/100 on both sides.** This is
the first change in this bounded series to move the rounded mobile
Performance score (prior `inline-homepage-css.mjs` pass moved the mechanism
but left the score flat at 73). Target of 95 remains unmet — further levers
(e.g. deferring `fontawesome.css` icon glyphs not needed above-the-fold, per
the diagnosis doc's #3 item) remain for a future bounded pass.

## Required checks — re-run against the real "after" production build
| Check | Result | Log |
|---|---|---|
| Production build (`npm run build`) | **PASS**, exit 0 (re-verified twice) | `build-after.log`, `build-final-reverify.log` |
| `check:astro` | **PASS**, exit 0 | `check-astro.log` |
| `check:routes` | **PASS** — 0 dead links, 0 missing images, 0 empty pages | `check-routes.log` |
| `check:seo` | **PASS**, SEO lint passed | `check-seo.log` |
| `check:tracking` | **PASS** 6/6 | `check-tracking.log` |
| `check:a11y` (desktop+mobile) | **PASS** — 20/20 route×viewport combos incl. `/contact/` both viewports | `check-a11y.log` |
| `check:browser` (verify+behaviour) | **PASS** 15/15 + 21/21 (see note below) | `check-browser.log` |
| `check:lighthouse` (mobile gate: `/`, `/car-wraps/`, `/contact/`) | **PASS** — a11y≥99, SEO≥92, clean actionable best-practices | `check-lighthouse.log` |

**Flaky-test note**: first `check:browser` run showed a single transient
failure (`opens over the CTA bar, not under it`, 20/21). Reproduced the same
check 3 more times against the identical unchanged "after" dist: passed
21/21 every time. Also ran the same check against `dist-before` (pre-change):
passed 21/21 on the first try. Confirmed pre-existing test flakiness
unrelated to this change, not a regression (`check-behaviour-before-dist.log`).

Service/contact regression check: `/contact/` explicitly covered by both
`check:a11y` (both viewports, pass) and `check:browser`'s quote-form/
empty-submit assertions (pass), plus byte-identical HTML to the pre-change
dist (step 3 above).

## Config/diff review
`git diff --stat` shows exactly one changed tracked file (`package.json`,
1-line insertion wiring in the new script) plus one new untracked file
(`scripts/subset-roboto-css.mjs`). Explicitly confirmed **no changes** to
`astro.config.mjs`, wrangler config, redirects, robots/noindex logic, or any
form/security/tracking code (also confirmed indirectly by `check:tracking`
6/6 and `check:seo` passing unchanged).

## Cleanup
Deleted the one-off measurement harness (`scripts/_tmp-subset-median3.mjs`)
and the throwaway `dist-before/`, `dist-after/`, `dist-check-before/`
comparison copies after use — none are committed. Real `dist/` restored via
a final full `npm run build` re-run (confirmed `fonts/roboto.css` = 53,335
bytes, SEO lint passed).

## Verdict
All required gates pass. Genuine, non-regressive, evidence-backed mobile
improvement with matched-pair methodology and raw-config assertions on every
run. Safe to commit `package.json` + `scripts/subset-roboto-css.mjs` to PR7's
branch (commit + push only, **no merge**, per task bound). A fresh
independent QA pass is required after this commit (not performed by this
same execution agent in this same pass).
