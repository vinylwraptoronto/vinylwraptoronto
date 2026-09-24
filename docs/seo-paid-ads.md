# SEO and paid-ads optimisation — branch `claude/seo-paid-ads-optimization`

Prepared 2026-09-23. Read alongside [seo.md](seo.md) (the port's SEO record)
and [address-comparison.md](address-comparison.md) (the URL parity audit).

**Status: implemented, NOT built, NOT deployed, NOT verified on staging.** The
environment this was written in could not run `node`, `npm`, `curl`, a
browser, or any git write command. Every claim below about behaviour is a
claim about the code as written; the validation section says exactly what
still has to be run, and by whom.

**Resumed 2026-09-23 (second bridge run).** Same limits held: `npm`, `node
<script>`, `gh api`, `git checkout` and `git switch` each stopped at a
permission prompt this non-interactive run could not answer; `node_modules/`
and `dist/` do not exist in the checkout, so nothing was installed, built,
type-checked or linted. `git add` was permitted. What was done instead is a
read-only review of the full diff against `4a8edba9`: `git diff --check`
clean; the three page-JSON edits confirmed as copy-only (five "warrenty",
one "an" → "and", the `/signage/` title and description); the address,
zero-`Offer` and `#organization` shapes that `ld.ts` keys on confirmed
present in `src/data/pages/*.json` by grep -- note the `streetAddress: "24
Ronson Dr"` node occurs in 20 files and the `addressLocality: "Unit 1"` form
in 19, not on every page as the table above says; `Astro.url.pathname` confirmed to be the
trailing-slash form `nav.json` uses, because the existing canonical and
`excludePaths` code already relies on it. Nothing in this section is a
substitute for the commands in §3.

## 1. Baseline

### Sources

- The heads of all 678 original addresses, harvested while the WordPress site
  was live (gate 8) and stored per page under `src/data/pages/*.json` and in
  D1 `head_json`. Every title, description, robots, Open Graph, Twitter,
  verification token and JSON-LD block below was read from there.
- `docs/address-comparison.md` — 678/678 addresses matched, 0 changed, 0
  missing; canonicals 678/678 on the production domain; JSON-LD parses 678/678.
- `docs/seo.md` — the lint's own measurements at `8faa1eb`.

### Firecrawl

**Not run, still blocked.** No `FIRECRAWL_API_KEY` is configured, the local
MCP template holds only a placeholder, and the claude.ai Firecrawl connector
that appeared in the second run was not used because it is not the
authenticated integration this task specified. No substitute crawler was run
in its place, in either run. The route inventory above comes from
the repository's own stored copy of the original's sitemap index (eleven
children, 678 URLs, `src/data/sitemap-groups.json`), not from a live crawl.

### Migration regressions (introduced by the port) — none new

The port's own audit closed every regression it found (case-variant paths,
uploads redirects, feeds, sitemaps, `/vinyl/`, `/author/admin/`). One remains
open and is outside the repository: the trailing-slash redirect is a 307 from
Cloudflare's asset server where the original used a 301.

### Pre-existing issues (on the original, carried faithfully)

Structured data, on every one of the 1,937 Rank Math graphs:

| Defect | Where | Effect |
|---|---|---|
| `addressLocality: "Unit 1"`, `addressRegion: "Etobicoke ON"` | Place + Organization on all pages | Local Business address unreadable to Google |
| `legalName: "content"` | Organization on 1,520 page files | Placeholder published as fact |
| Image `@id` / `url` / `contentUrl` are root-relative `/wp-content/uploads/...` | logo, primaryImageOfPage, Article image | Not URLs in JSON-LD; nodes dangle |
| `offers: { "@type": "Offer", "price": "0" }` | 22 `Service` nodes (`/car-wraps/`, `/boat-wrap-toronto/` …) | A free service, to a rich-result parser |
| `&amp;` inside `name` / `headline` strings | ~all | HTML escaping inside JSON |
| No `BreadcrumbList` anywhere | all | No breadcrumb rich result |
| No `LocalBusiness` type | all | Organization only |

Metadata, on the ten priority pages: titles 46–60 characters, all present;
descriptions all present. Two typos ("warrenty" on `/truck-wraps/`, "decals
an full wraps" on `/commercial-vehicle-wraps/`). `/signage/` was still titled
and described around "Covid-19 Signs" and "covid-19 posters".

Measurement, as ported and as on the original: GA4 configured twice (direct
`gtag` and inside GTM-WJQ6MSM) so page views are double counted; GTM, Meta
Pixel, Google Ads with call-forwarding substitution, Clarity — all
unconditional; no consent banner; no reCAPTCHA; the quote form fires the Ads
lead conversion on its in-page success (the original fires it on
`/thank-you/`). No `dataLayer` events of the site's own. No click-id or UTM
persistence. No honeypot.

## 2. What changed

| File | Change |
|---|---|
| `src/lib/ld.ts` (new) | `repairLd()` corrects the five graph defects at render time; `breadcrumbsFor()` generates a BreadcrumbList from `nav.json` |
| `src/layouts/Base.astro` | every carried block passes through `repairLd`; the breadcrumb block is appended where the page is in the menu |
| `seo.config.mjs` | `productionOrigin`, `previewHosts`, the `dataLayerEvents` contract, `attributionKeys` |
| `scripts/check-seo.mjs` | fails on: canonical off the production origin; preview host in `og:url` or JSON-LD; any of the four graph defects; reports BreadcrumbList count |
| `src/components/Analytics.astro` | Consent Mode v2 default + `window.vwtConsent()` (only when `PUBLIC_CONSENT_DEFAULT=denied`); first-party `vwt_attr` cookie for gclid/gbraid/wbraid/dclid/msclkid/fbclid/utm_*; `phone_click` / `whatsapp_click` / `email_click` dataLayer events |
| `src/components/QuoteForm.astro` | honeypot field; hidden `attribution` field filled from the cookie at submit; double-submit guard; `generate_lead` dataLayer push and Meta `Lead` on the server's 200, alongside the existing Ads conversion |
| `src/pages/api/quote.ts` | honeypot answered with a silent 200; attribution keys rendered as a `Campaign` row in the lead email (not stored in D1) |
| `src/env.d.ts`, `.env.example` | the two build variables, typed and documented |
| `src/data/pages/truck-wraps.json` | "warrenty" → "warranty" (description, og, twitter, Article node) |
| `src/data/pages/commercial-vehicle-wraps.json` | "decals an full wraps" → "decals and full wraps" |
| `src/data/pages/signage.json` | title → "Custom Signage Toronto - Storefront, Window & Wall Graphics"; description rewritten without the Covid reference |

### Structured data: carried vs generated

- **Carried and corrected:** every ported block (Organization/Place/WebSite/
  WebPage graph, 218 FAQPage, 185 Article, 27 Service, 642 BlogPosting). Only
  the five fields above change; `@id` values, dates, authors and the FAQ
  content are byte-identical. The page JSON files are untouched — the
  correction is a function, not an edit to 1,600 files.
- **Generated:** one `BreadcrumbList` per page that appears in the main menu
  (about 45 pages). Nothing else. No ratings, prices, opening hours, service
  areas or reviews were invented.
- The Organization node gains `"@type": ["Organization", "LocalBusiness"]`
  and `telephone: 416-746-1381` — both facts already on every page.

### Verification tokens and legacy URLs

Unchanged and still asserted by value on every build: `google-site-verification`,
`msvalidate.01` (homepage), `p:domain_verify`, `ahrefs-site-verification`,
`statvooVerification` (every page). `_redirects`, the lowercase-path Worker
rule, the eleven sitemap children and the three feeds are untouched.

### Staging stays out of the index

`public/_headers` still sends `X-Robots-Tag: noindex, nofollow` scoped to
`https://astro.vinylwraptoronto.com/*` only. Canonicals on staging remain
production URLs on purpose. No DNS was touched. The lint now fails a build
whose canonical, `og:url` or JSON-LD names the preview host.

### Paid landing pages

Message match was checked against the ten priority pages' ported content:
each already carries the service and vehicle type in the H1, a Toronto/GTA
claim, the Avery/3M material claim, a phone button and a quote form above
the fold, plus the site-wide sticky call/quote bar. No layout was changed —
this environment could not render a page to see one, and a blind edit to a
measured Elementor port is a regression risk, not an optimisation. The
metadata fixes above are the on-page change. Recommended follow-ups needing a
browser: confirm the hero form is visible without scrolling at 375px on
`/car-wraps/`, `/truck-wraps/`, `/van-wraps/`, `/tesla-vinyl-wraps/`; consider
a `chrome="bare"` variant for the two `/lp*/` pages' ad traffic.

### dataLayer contract

See `seo.config.mjs` → `dataLayerEvents`. Events fire once each, carry
`page_path`, and never carry a name, email, phone or message. `generate_lead`
fires only on `/api/quote/` HTTP 200 — not on click, not on a 4xx/5xx, not on
the honeypot's decoy 200 (the honeypot answer is only reachable by a bot that
filled the hidden field; a real browser never sends it). The existing Ads
conversion label `AW-11342080648/Hac5CN7WneMYEIjVqaAq` still fires from the
same place, and the phone label `L6h1CJDjyogcEIjVqaAq` still drives number
substitution site-wide.

### Consent Mode v2

Prepared, off. Reason: the original has no banner and Canada does not
require one for this stack; a denied default with no way to grant would zero
every conversion. To activate: choose a CMP, set `PUBLIC_CONSENT_DEFAULT=denied`
at build, have the CMP call `window.vwtConsent(true|false)`. GTM's own tags
will honour the signal only once consent settings are configured on each tag
in the container — that is account-side work.

### Not done, and why

- **reCAPTCHA:** not on the original, not added. Protection is the origin
  check + rate limit that already existed, plus the honeypot added here.
- **Enhanced conversions / advanced matching:** not enabled; needs approval
  and a lawful basis.
- **Duplicate GA4 page views:** left as the original has it. Fixing it means
  removing either the direct `gtag('config', G-4MYWXBW53L)` or the GA4 tag
  inside GTM-WJQ6MSM; the container could not be inspected here, so which one
  is a decision for whoever owns the account.
- **Sitemap XSLT, Keystatic:** not needed; `/admin/pages/` is the editing UI.

## 3. Validation — run on 2026-09-24

The branch now owns a repeatable `npm run check` gate. It runs Astro type
checks, browser rendering and interactions, the complete route/link/image
crawl, SEO lint, axe accessibility checks, paid-tracking tests and Lighthouse.

- `npm ci`: passed (478 packages).
- `npm run build`: passed; 1,684 HTML pages checked and zero SEO regressions.
- `npm run check:astro`: 0 errors (13 deprecation/unused-code hints remain).
- Browser checks: 15/15 rendering checks and 21/21 interaction checks passed.
- Route crawl: 1,688 pages, 13 sitemaps, 229,082 internal links and 11,240
  image references; zero broken entries, links, images or empty pages.
- Accessibility: automated WCAG 2.0/2.1/2.2 A/AA rules passed on ten priority
  routes at desktop and mobile sizes (20 combinations). This is automated
  coverage, not a claim of complete manual WCAG conformance.
- Tracking: 6/6 default-mode tests and 7/7 consent-denied tests passed. They
  cover click attribution, contact events, consent grant, one-event lead
  deduplication, absence of contact PII and honeypot suppression. The quote
  endpoint was intercepted; no real lead or conversion was sent.
- Lighthouse mobile (performance/accessibility/best-practices/SEO): `/`
  67/100/58/92, `/car-wraps/` 73/99/58/92, `/contact/` 76/100/58/92. The
  best-practices deductions are the local HTTP origin, third-party analytics
  cookies and their resulting inspector warning; the gate found no actionable
  code-level best-practices failure. Performance is recorded but not gated.

`npm audit --omit=dev` reports 8 dependency advisories (1 critical, 4 high,
2 moderate, 1 low) in Astro 5 / the Cloudflare adapter and transitive build
packages. The offered fix upgrades Astro and the adapter across major versions,
so it is a separate migration and release blocker rather than an automatic
`--force` change inside this SEO patch.

Still required on staging (`npm run deploy` with the Cloudflare token):

- view-source `/`: address reads `24 Ronson Dr, Unit 1 / Etobicoke / ON`,
  no `legalName`, image URLs absolute on `img.vinylwraptoronto.com`, no
  `"price":"0"`; `/car-wraps/` carries a BreadcrumbList Home › Car Wraps.
- Rich Results Test on `/`, `/car-wraps/`, `/lp/` (FAQPage must still be
  detected).
- `curl -I https://astro.vinylwraptoronto.com/` → `x-robots-tag: noindex, nofollow`.
- Land on `/car-wraps/?gclid=TEST&utm_source=google&utm_campaign=x` → cookie
  `vwt_attr` present; submit the form with **`website` filled** (honeypot) →
  200, no email, no dataLayer event; submit normally → one `generate_lead`
  in `dataLayer`, one `Lead` in Meta Pixel Helper, one Ads conversion in Tag
  Assistant, and the lead email shows a `Campaign` row. Double-click submit →
  still one of each. Use QUOTE_TO_EMAIL pointed at a test inbox first.
- Tap a `tel:` link and the WhatsApp link → `phone_click` / `whatsapp_click`.
- With `PUBLIC_CONSENT_DEFAULT=denied` built to a preview: Tag Assistant shows
  consent default denied; `vwtConsent(true)` → update granted.
- Lighthouse mobile + desktop on `/`, `/car-wraps/`, `/contact/`; keyboard
  through the form (the honeypot must not receive focus).

## 4. Account-side checklist

- Google Ads: audit every conversion action; confirm the lead label above is
  the one in use; consider importing the GA4 `generate_lead` event as a
  secondary conversion, not primary (it would double count with the label).
- GTM-WJQ6MSM: add triggers for `generate_lead`, `phone_click`,
  `whatsapp_click`, `email_click`; decide which GA4 config to keep; set
  consent settings per tag before activating Consent Mode.
- Meta: verify `Lead` arrives in Events Manager; build the retargeting
  audience off `PageView` on the service pages and exclude `Lead`.
- Search Console: nothing to resubmit — sitemaps and tokens are unchanged.
- Resend: `QUOTE_TO_EMAIL` to the shop inbox before the form is trusted.

## 5. Launch, monitor, roll back

**Launch (after staging sign-off, separate approval):** attach apex + www to
the Worker (custom domains), confirm `https://vinylwraptoronto.com/` serves
this build over HTTPS and `www` 301s to apex, keep the `_headers` block scoped
to the staging host, resubmit nothing.

**Monitor, first 14 days:** Search Console coverage and enhancements
(Breadcrumbs, FAQ, Local Business), Ads conversion counts vs. the prior 14
days, GA4 `generate_lead` vs. Ads label counts (they should match), lead
emails carrying a `Campaign` row for paid traffic, Clarity for form abandons.

**Rollback:** `git revert` the branch merge and redeploy — every change is in
the build. No DNS, no D1 migration, no account setting was changed, so
nothing outside the repository needs undoing.
