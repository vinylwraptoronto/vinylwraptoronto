# Address comparison — vinylwraptoronto.com → staging.vinylwraptoronto.com

Run 2026-09-10. Old site live and readable at the time of the run.

Chart: https://claude.ai/code/artifact/2542b53b-e7a6-42dd-b159-8da540596274

Every address on the old site was enumerated from its sitemap index and fetched on both
sides. This is a point-in-time claim: after cutover the old side cannot be re-read.

## Addresses

| | |
|---|---|
| addresses on the old site | 678 |
| sources | `/sitemap_index.xml` + 11 children; cross-checked against `dist/` |
| routes on the new build | 1652 |
| **matched, path unchanged** | **678** |
| changed | 0 |
| missing | 0 |
| new on the build | 974 (blog pagination, tag and category archives) |

The address diff is clean. Everything below is what a count does not show.

## Findings that block or need a decision

Seven of the eight are fixed and verified on the live preview. Status updated
2026-09-11; the "verified" column is a real request against
`staging.vinylwraptoronto.com`, not a claim about the build.

| # | Finding | Status |
|---|---|---|
| 1 | **Case-variant addresses 404.** `/Blog/`, `/Our-Work/`, `/Car-Wraps/` all serve 200 on the old site and 404'd on the new. A whole class of live inbound links, invisible to a path diff because the canonical paths all match. | **fixed.** The old site is genuinely case-insensitive — `/cAr-wraps/` and `/CAR-WRAPS/` both serve — so a list of variants could never cover it. `worker-entry.mjs` lowercases the path and 301s when that address is real. Verified: `/Car-Wraps/`, `/CAR-WRAPS/`, `/cAr-wraps/`, `/Blog/`, `/Our-Work/` → 301 |
| 2 | **`/wp-content/uploads/*` 404s**, including both colour-guide PDFs. The files exist on `img.vinylwraptoronto.com` under rewritten paths, but the old public addresses were dead. | **fixed.** Splat redirect to the image host in `public/_redirects`. Verified: both PDFs and a sample image → 301 |
| 3 | **Feeds 404.** `/feed/`, `/blog/feed/` and `/comments/feed/` all serve 200 on the old site. | **fixed.** All three rebuilt as RSS 2.0 with the channel fields the original emits, ten newest posts, item titles taken from each post's H1 as WordPress does — all ten match the original's exactly. The comments feed is valid and empty, as the original's is. Verified: 200, `application/rss+xml` |
| 4 | **The preview is fully indexable.** `staging`'s robots.txt carries `User-agent: *` / `Allow: /`, and its pages carry `index, follow`. | **OPEN — the only one left.** See below. |
| 5 | **The new build serves no sitemap.** Every sitemap path 404s, where the old site publishes an index with 11 children. | **fixed.** The index and all eleven children rebuilt at their original filenames, grouping and lastmod read off the original's own sitemaps. Counts match child for child: 201/200/2/58/8/70/3/42/91/1/2 = 678. `scripts/sweep.mjs` now fails a build whose sitemap lists an address that is not built or is noindex |
| 6 | **`/lp/` and `/lp-truck-wraps/` lost their FAQ schema** — `FAQPage`, `Question` and `Answer` are absent. | open — re-verify after the accordion restore |
| 7 | `/author/admin/` 301s to the homepage on the old site and 404s on the new. | **fixed.** Verified → 301 |
| 8 | Trailing-slash redirect is a **307** on the new site where the old site uses a **301**. | open — Cloudflare's asset server emits the 307; not settable from the repo |

### Finding 4 — why it is still open

It needs a response header on the preview hostname, and the Worker cannot add
one to a page it never sees: static assets are served without invoking it.

Routing documents through the Worker instead was tried, and reverted. Widening
`run_worker_first` to `"/*"` silently broke every redirect on the site —
`/catalogues/`, `/partial-trailer-wrap/` and `/author/admin/` answered 200 from
the catch-all route instead of 301, and `/wp-content/uploads/` became a 404
again — because the asset server is what applies `_redirects` and it only gets
the chance on requests that reach it first. Pages looked perfect throughout.

The remaining instrument is a response-header Transform Rule on the zone,
scoped to `staging.vinylwraptoronto.com`, setting `X-Robots-Tag: noindex,
nofollow`. That is a change to the client's live zone rather than to this
repository, so it is left for the cutover decision.

`noindex`, not `Disallow`. Cloudflare injects a managed robots.txt at the edge
carrying `User-agent: * / Allow: /`, so a Disallow served from here would sit in
the same file arguing with it — and Disallow stops the crawl, which stops Google
ever reading the noindex, leaving a linked address indexable URL-only.

### Found while fixing the above

**`/vinyl/` was a 404 on 3,302 links.** It 301s to the homepage on the original
and is linked from the contact icon strip on 1,651 pages. `astro.config.mjs`
declares the redirect, but the Cloudflare adapter writes it into `_redirects` as
`/vinyl` with no trailing slash, and this site is `trailingSlash: "always"` — so
the one form every page actually links had no rule at all.

`scripts/sweep.mjs` is why nobody saw it. Reading `_redirects`, it credited not
just each rule's path but the trailing-slash counterpart as well, on the
assumption that one implies the other. It does not: the asset server matches
literal paths. So the sweep marked `/vinyl/` reachable on the strength of a rule
that did not exist, and reported **zero dead links across 218,158** while the
most-linked address on the site was a 404. Both are fixed, and with the rule
taken away the sweep now reports `/vinyl/` dead on 3,302 pages and fails the
build.

## Checked and clean

| Field | Result |
|---|---|
| title | 678 of 678 identical |
| meta description | 678 of 678 identical. 9 were flagged and all 9 are whitespace: 8 are a non-breaking space (U+00A0) on the old site where ours emits U+0020 — same text, same length, invisible to a reader and a crawler — and `/privacy-policy/` has a whitespace-only description on the old site too. **Zero real losses.** |
| H1 | 0 regressions. 16 pages do not have exactly one H1, but every one matches the old site's own count — the original has pages with 0, 2 and 4 |
| canonical | 678 of 678 resolve to the production domain |
| meta robots | 0 pages carry noindex where the old page was indexable |
| JSON-LD parses | 678 of 678 |
| JSON-LD @type set | 676 of 678 match (the 2 exceptions are finding 6) |
| JSON-LD byte size | 598 pages shrink, but 596 of those have an identical `@type` set and the deltas cluster at exactly 168 and 56 bytes — formatting, not content |
| og:image | 678 of 678 present where the old page had one |
| word count | 678 of 678 within 10% |
| blog pagination | `/blog/page/2/` and `/blog/page/34/` serve 200 on both sides |
| image references | the build's own sweep checks 9,516 references: 0 missing, 0 on the old origin, 0 direct Backblaze |
| alt text | 7,092 images carry alt on the new build against 4,138 on the old |

## Assets

357 old asset names are absent from the new build. Every one is a WordPress
WebP-plugin variant with a double extension (`name.jpg.webp`, `name-300x169.png.webp`).
The new build serves the same photographs from the image host under single-extension
names, and its own sweep confirms every reference it makes resolves. These are
retired plugin artefacts, not lost pictures — but the old URLs will 404 after cutover,
which is finding 2.

Reference hosts on the new build: 7,168 `img.vinylwraptoronto.com`, 678 relative,
1 `images.unsplash.com` (an allowed third party — worth confirming it is deliberate).

## Internal links — the one finding that was real, and is now fixed

The internal-link count flagged **84** addresses as down more than 10%. **82 are a
measurement artefact**: the crawl counts an anchor as internal by hostname, and a gallery
lightbox anchor that used to point at `vinylwraptoronto.com/wp-content/uploads/…` now
points at the image host, so it stopped counting. Splitting file anchors from page links
shows the page links on those 82 are unchanged — `/vinyl-car-wrap-our-portfolio/`, the
worst of them at −74%, goes from 129 page links to 123 once its 343 lightbox anchors are
set aside.

**Two were real, and both were the same defect.** `/our-work/` linked 52 projects where
the original links 69, and `/tesla-vinyl-wraps/` 11 where the original links 12. Elementor
renders a loop grid by stamping one template per post, so every card carries the
*template's* element id — all 69 cards on `/our-work/` share the eid `56a8ead`. The
extractor keyed on that id, kept each card's title and dropped its href. **17 portfolio
pages were built as routes with nothing on the site linking to them.**

Fixed in `d2a69c0`: cards are matched to the original by position inside the loop
container and verified by title before any href is written. Both pages now link exactly
the set the original links, every target resolves to a built route, and no
`/wraps-before-after/` route is unlinked. The guard refused `/lp/` and `/lp-truck-wraps/`
on a title mismatch and left them untouched.

**This fix is committed but not yet deployed — `staging` still serves the previous build.**

## Not established

- **Search Console** and **GA4** were not available in this environment, so the address
  list could not be verified against real traffic or the top 50 by clicks. A sitemap
  lists what exists, not what matters.
- **www vs apex** could not be tested on the new site: both are deliberately unattached
  pending cutover. Confirm the non-canonical host 301s at that point.
- Old host access logs were not available.

## Redirect rules required

```
1. lowercase the request path                     (fixes the case class)
2. /wp-content/uploads/*  ->  https://img.vinylwraptoronto.com/*   301
3. /author/*             ->  /                                    301
4. /feed/, /blog/feed/, /comments/feed/  -> generate, or 301 to /blog/
```

All published at the edge, never inside WordPress — a rule living in the old CMS dies
when it is switched off, taking every inbound link with it. 301, never 302.

## Per-address table (11 of 678 addresses carry any flag)

Addresses not listed matched on every field checked.

| Address | Flags |
|---|---|
| `/author/harjitbrandingcentres-com/` | heading-order |
| `/author/masoud/` | heading-order |
| `/car-lettering-and-decals-gta/` | heading-order |
| `/locations-served/` | heading-order |
| `/lp-truck-wraps/` | json-ld, heading-order |
| `/lp/` | json-ld, heading-order |
| `/pages_type/vehicle-wraps/` | heading-order |
| `/web-stories/` | heading-order |
| `/web-stories/custom-designed-vehicle-wraps-in-gta/` | heading-order |
| `/web-stories/vehicle-racing-stripes-in-gta-toronto/` | heading-order |
| `/wraps-before-after/` | heading-order |
