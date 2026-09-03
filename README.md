# Vinyl Wrap Toronto — Astro

An Astro port of vinylwraptoronto.com, built to run on Cloudflare Workers.

The live site is WordPress with Elementor Pro (hello-elementor theme, JetEngine,
Rank Math). This repository is the same site on a static stack: no PHP, no
database, no plugin surface.

## How the design was ported

The design was **not** inferred from page text. Elementor writes the site's
appearance to disk and that is what was read:

- The live site runs Elementor with **CSS Print Method = Internal Embedding**,
  so per-page CSS is inlined in each page's `elementor-frontend-inline-css`
  block rather than served from `/uploads/elementor/css/post-<id>.css`. Nothing
  404s — the rules are in the HTML, and all 58 pages carry theirs.
- Template ids: **18399** header, **18407** footer, **20716** homepage,
  17564 / 18856 popups.
- Kit tokens (12 colours, 4 declared type families, the 1200/1024/767 container
  widths) are copied verbatim into `src/styles/tokens.css`. Near-duplicate
  values are kept where they were found; collapsing Elementor drift into one
  token is a visible change to the design.
- Per-element rules carry their Elementor element id in a comment
  (`/* #6ebf65a — CTA column */`) so any rule can be traced back to its source.
- Type scale, colours and spacing in `src/styles/global.css` come from
  `getComputedStyle` at 1440px, not from the kit — a kit declaration routinely
  loses the cascade to a per-element rule.

### Fonts were settled by measurement

The kit declares four families. Measured on the rendered page:

| Family | Declared | Faces actually loaded | Ported |
|---|---|---|---|
| Poppins | yes | 300, 400, 500, 600, 700, 900 | yes |
| Roboto | yes | 400 | yes |
| Roboto Slab | yes | **none** | **no** |

"Roboto Slab" is declared as `--e-global-typography-secondary` but loads no face
on the live site, and a width probe measured it identical to a nonexistent
family. It is deliberately not imported. Poppins and Roboto are self-hosted in
`public/fonts/`, the same faces and unicode-range subsets the live site serves.

## Structure

```
src/
  data/
    pages/*.json      one file per address, extracted from the live page
    nav.json          primary menu: 9 items, 51 sub-links
    site.ts           phone, email, address, socials, logo
    footer.ts         footer column content
  components/
    Header.astro      template 18399
    Footer.astro      template 18407
    Blocks.astro      renders the block model
  layouts/Base.astro
  pages/
    [...slug].astro   every address in page-sitemap.xml
    404.astro
  styles/
    tokens.css        kit tokens, verbatim
    global.css        measured type scale and globals
```

Elementor's nesting is not reproduced — it is a builder artefact, not the
design. Each page is reduced to ordered sections of typed blocks (heading,
text, image, button, list, feature, gallery, faq, video) and drawn with the
measured palette and type scale. Every section keeps its Elementor `data-id` as
`data-eid` in the output.

### Header interaction

Three things the original does that a naive rebuild gets wrong, all handled in
`Header.astro`:

- The submenu sits `14px` below its trigger. That gap breaks the hover chain on
  the way down, so a transparent `::before` bridges it.
- The dropdown opens on `:hover` and on `:has(a:focus-visible)` — not
  `:focus-within`, which also matches a mouse click and latches the menu open
  after the pointer has left.
- Every top-level rule uses child combinators (`.nav > ul > li > a`). A
  descendant selector such as `.nav ul` also matches `ul.sub` inside it, would
  out-specify the rule that hides the submenu, and the dropdown would never
  close.

## Scope

**All 676 addresses** in the sitemaps are built:

| Kind | Count | Notes |
|---|---|---|
| Pages | 58 | home, services, vehicle types, Tesla, signage, PPF, contact, legal |
| Posts | 478 | blog posts plus the `wraps-before-after` entries |
| Archives | 138 | categories, vehicle brands, and the index listings |
| Web stories | 2 | converted, see below |

### Archives are regenerated, not ported

The category and brand archives render their listings **client-side** on the
live site — the post-to-term relationship appears in no served HTML, so there is
nothing to port. Those listings are rebuilt from the real mapping returned by
the site's own REST API (`/wp/v2/categories`, `/wp/v2/blogs_vehicles_brand`,
`/wp/v2/posts`), which is authoritative. Matching posts to terms by title would
have been inference dressed up as a port.

`src/data/summaries.json` holds the card data; `members` on each archive page
holds the addresses it lists, newest first.

### Web stories are converted, not ported

The two `/web-stories/` addresses are AMP documents (`amp-story`), not Elementor
pages. Their text and images are carried over into ordinary pages; the story
player itself is not reproduced. They are recorded as **converted**, not ported.

## Checks

```bash
node scripts/verify.mjs   # cascade checks — drives the submenu open and closed
node scripts/sweep.mjs    # every internal link and image across all 676 pages
```

`verify.mjs` checks by cascade rather than by grep, because a declaration can be
present, correct, and still lose. `sweep.mjs` walks the built output: 91,133
internal links, 3,275 image references, zero dead, zero missing, zero empty
pages.

`/partial-trailer-wrap/` is linked from three pages but is a **301 to the
homepage** on the live site, not a page. `public/_redirects` reproduces that
redirect rather than inventing a page for it.

## Local development

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output + Workers entry in dist/
```

## Deployment

Not deployed by this repository. Hosting is Cloudflare Workers via Workers
Builds (`wrangler.jsonc` is committed, with `not_found_handling: "404-page"` so
unknown addresses reach `404.astro`).

Images are currently served from `public/wp-content/uploads/...`, preserving the
live site's paths — which also means existing image URLs keep resolving after a
cutover. The house standard puts them on Backblaze B2 behind
`img.vinylwraptoronto.com`; swapping to that is a path change only.
