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

| # | Finding | Severity |
|---|---|---|
| 1 | **Case-variant addresses 404.** `/About/`, `/Contact/`, `/Blog/`, `/Our-Work/`, `/Car-Wraps/` all serve 200 on the old site and 404 on the new. A whole class of live inbound links, invisible to a path diff because the canonical paths all match. Needs an edge rule that lowercases the path. | blocks cutover |
| 2 | **`/wp-content/uploads/*` 404s**, including both colour-guide PDFs. The files exist on `img.vinylwraptoronto.com` under rewritten paths, but the old public addresses are dead. A PDF is a page to Google and often the best-linked address on a trades site. Needs a redirect from `/wp-content/uploads/*` to the image host. | blocks cutover |
| 3 | **Feeds 404.** `/feed/`, `/blog/feed/` and `/comments/feed/` all serve 200 on the old site. Real subscribers, and they break silently. | needs a decision |
| 4 | **The preview is fully indexable.** `staging`'s robots.txt carries `User-agent: *` / `Allow: /`, and its pages carry `index, follow`. A canonical alone leaves a full duplicate of the site eligible for indexing. | fix before launch |
| 5 | **The new build serves no sitemap.** Every sitemap path 404s, where the old site publishes an index with 11 children. | fix before launch |
| 6 | **`/lp/` and `/lp-truck-wraps/` lost their FAQ schema** — `FAQPage`, `Question` and `Answer` are absent. These are the only two real JSON-LD losses on the site. | real SEO loss |
| 7 | `/author/admin/` 301s to the homepage on the old site and 404s on the new. | minor |
| 8 | Trailing-slash redirect is a **307** on the new site where the old site uses a **301**. 307 is temporary and does not pass authority the same way. | minor |

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
