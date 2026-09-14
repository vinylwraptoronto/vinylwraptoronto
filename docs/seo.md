# SEO — what the port carries, and what now guards it

Run 2026-09-14, against the build at `8faa1eb`. The original was still live and
readable, which is the only reason several numbers below could be established at
all.

## The problem this addresses

Astro emits no metadata of its own. Rank Math emitted all of it on the original,
out of the WordPress database — and what it actually gave the client was not the
tags but a box on every edit screen that turned red. Switch WordPress off and
both go, silently, with nothing anywhere reporting the loss.

The tags themselves were already carried: every one of the 678 addresses had its
head captured at gate 8 and stored in that page's own JSON. What was missing was
any record of what they are, and anything that would notice if they went.

## Verification tokens

Five, harvested from the live original before cutover. They are written down in
`seo.config.mjs` and asserted on every build.

| Tag | Where the original serves it |
|---|---|
| `google-site-verification` | homepage only |
| `msvalidate.01` | homepage only |
| `p:domain_verify` | every page |
| `ahrefs-site-verification` | every page |
| `statvooVerification` | every page |

The homepage-only placement is the original's own and is reproduced rather than
normalised — both of those methods verify at the site root, and widening the set
of pages a token appears on would be a change to the client's site rather than a
port of it. The two AMP web stories carry none, on the original and here.

`seo.config.mjs` **emits nothing.** A second emission in `Base.astro` was tried
and reverted: it only duplicated tags that per-page head data already carries,
and the homepage measured 10 of 5. The file's job is to be findable and to give
the lint something to check against.

## The lint — `scripts/check-seo.mjs`

Gates `npm run build`. Its standard is the client's own site, address by
address, not a rule invented here.

**Fails on a regression:** a page whose source head declared a description, a
JSON-LD graph, an `og:image` or an ownership token, and whose built HTML does
not carry it. Tokens are checked by name *and* value, so drift is caught as well
as absence.

**Fails absolutely:** a missing title, a missing canonical, and any
structured-data block that does not survive `JSON.parse`.

That last one is the check worth having. A presence test — does the page carry a
`<script type="application/ld+json">` — passes on a block Google discards whole.
One line break inside a JSON string is enough, and there is no error anywhere:
not in the browser, not in the build, not in Search Console beyond the rich
result quietly never appearing. The agency's own site has shipped such a block
for years.

**Deliberately not failed**, because a build that fails on things nobody intends
to fix is a build everyone learns to ignore:

- 133 titles and 63 descriptions outside Google's display lengths. That text is
  the original's byte for byte and rewriting it is not this port's mandate.
- 80 indexable pages with no structured data — the original has none there either.
- 80 images without alt text — 78 of which the original also ships without it.

## Measured

```
  pages ............................. 1684
    carried from the original ....... 1619
    added by this build ............. 65
  noindex pages ..................... 938
  JSON-LD blocks, all parsing ....... 1606
  pages carrying their tokens ....... 1617
  images with alt ................... 9475      (the original: 4138)
  images without alt ................ 80
  regressions against the original .. 0

  schema carried verbatim ........... 1937
  schema generated .................. 0
  no schema, as the original ........ 160
  verification tokens harvested ..... 5 of 5    MATCH the old <head>
```

Zero regressions is why the lint gates `build` directly rather than sitting
behind a failure budget.

Every structured-data block is **carried verbatim** — 218 `FAQPage`, 185
`Article`, 27 `Service`, 642 `BlogPosting`, and the `Organization` / `WebSite` /
`Place` graph on all 1,937. None was regenerated. The FAQ schema in particular is
hand-written content that earns the expandable Q&A block in Google; a generated
equivalent would validate, be a tenth the size, and lose the rich result.

## The guard is proven, not assumed

Each break applied to one page in a copy of `dist`, one at a time:

| Break | Result |
|---|---|
| drop the description | exit 1 — `lost description the original had` |
| drop the canonical | exit 1 — `missing canonical` |
| corrupt the JSON-LD | exit 1 — `JSON-LD does not parse — …` |
| drop a token | exit 1 — `lost verification: statvooVerification` |
| drop og:image | exit 1 — `lost og:image the original had` |
| blank the title | exit 1 — `missing title` |
| baseline, and after each restore | exit 0 — 0 regressions |

## Where this deviates from the kit, and why

- **No Zod content collection.** Pages render from JSON snapshots and posts from
  D1, not from markdown frontmatter, so there is no frontmatter for Astro to
  validate. The lint is the guardrail instead, and it runs against the built
  HTML, which is what actually ships.
- **No Keystatic.** It is git- and markdown-based; this site's content is in D1.
  The red box is `/admin/`, already built and deployed: a Rank Math-shaped panel
  with a score, a SERP preview and the per-check breakdown, computed by
  `src/lib/seo.ts` — which runs in the browser on every keystroke *and* again on
  the server at save, so the stored score is never one the client chose.

## Open, and not acted on

- **80 indexable pages carry no structured data.** The original has none either,
  so this is an addition rather than a restoration. The clearest group is the
  seven `/locations-served/*` pages, which are local landing pages and the
  natural home for `LocalBusiness`. Not generated unilaterally: wrong structured
  data is worse than none, and 80 pages is a content decision.
- **198 indexable pages carry no meta description**, again as on the original.
- **78 images have no alt text**, matching the original. Accessibility and image
  search both lose by it.
- **Search Console and GA4** were unavailable in this environment, so none of the
  above is ranked by what actually earns traffic.
