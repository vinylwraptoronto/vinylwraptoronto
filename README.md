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

Both were adjusted when images moved to the bucket, because both would otherwise
have passed on a page with no working images on it:

- `sweep.mjs` only validated `src="/…"`. Absolute URLs would have been skipped
  and it would have reported *0 images checked, 0 missing*. It now fails on an
  upload path that was never rewritten, and on any reference to
  `*.backblazeb2.com` anywhere in the document — a stylesheet `url()` bypasses
  Cloudflare and bills per view just as an `<img>` would.
- `verify.mjs` only recorded responses with `status >= 400`. A request that gets
  no response at all — DNS failure, refused connection — fires `requestfailed`
  and was invisible. It now listens for both.

`verify.mjs` judges **same-origin requests only**, and says so in its check name.
A sandbox with no outbound egress fails every remote image regardless of whether
the host is healthy, which would make the check permanently red for a reason
that has nothing to do with the site.

The images are verified for real instead, over the network:

```bash
npm run check:images   # sweep, then request every distinct image over HTTPS
```

`img-check.mjs` requests all 2,844 of them and requires a 200 carrying
`cf-cache-status` — proof the response came through Cloudflare rather than
direct from Backblaze. Failures are retried serially, because the outbound proxy
drops connections under parallel load and a flaky check is a useless one.

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

Cloudflare Workers, deployed by `wrangler` from
`.github/workflows/deploy.yml` on every push to `main`.

**Workers Builds is deliberately not used.** The deploy is defined in this
repository, so it is readable in the diff and reviewable in a PR, and no
Cloudflare GitHub app is installed against the org.

The workflow needs two repository secrets:

| Secret | Value |
|---|---|
| `CF_API_TOKEN` *or* `CLOUDFLARE_API_TOKEN` | token with **Workers Scripts: Edit** on the account |
| `CLOUDFLARE_ACCOUNT_ID` | `47a82355b575e264047206a36c2cd05c` |

`Workers Scripts` is an **Account** permission, not a Zone one — the Workers
entry under Zone is `Workers Routes`, which is a different thing and not needed
here, because `staging.vinylwraptoronto.com` is attached as a Custom Domain
rather than a route. Account Resources must include this account.

Either token name works: the workflow passes both and `scripts/deploy.sh` takes
whichever is set, then exports the name wrangler expects. A token scoped this
narrowly cannot read `/memberships`, which is where wrangler normally resolves
the account from, so the account id is set explicitly rather than discovered.

The deploy is gated on `scripts/sweep.mjs`, so a dead link, an image reference
that resolves to nothing, an empty page, or any reference to
`*.backblazeb2.com` fails the run before anything ships.

To deploy by hand — same build, same check, same command the workflow runs:

```bash
export CLOUDFLARE_API_TOKEN=…
export CLOUDFLARE_ACCOUNT_ID=47a82355b575e264047206a36c2cd05c
npm run deploy
```

`wrangler.jsonc` is committed, with `not_found_handling: "404-page"` so unknown
addresses reach `404.astro`. `public/.assetsignore` keeps `_worker.js` and
`_routes.json` out of the uploaded asset set — without it `wrangler deploy`
refuses to run, because uploading `_worker.js` as an asset would publish the
server bundle.

### Hostnames

| Hostname | Points at |
|---|---|
| `staging.vinylwraptoronto.com` | this Worker, as a Custom Domain |
| `vinylwraptoronto.com` | **still the old WordPress server** — not this site |

The apex has not been cut over. Only staging serves this build.

## Images

Images are served from Backblaze B2 at **`img.vinylwraptoronto.com`** (AD-9),
out of the bucket `vinylwraptoronto-img`. Bucket keys are the WordPress upload
paths with the `/wp-content/uploads/` prefix stripped, so
`/wp-content/uploads/2023/07/foo.webp` is the object `2023/07/foo.webp` — the
same layout as the other migrated sites in the account.

Two pieces of Cloudflare config carry that hostname, and **both** are load-bearing:

```
CNAME  img  ->  f005.backblazeb2.com   proxied
```

`f005…` is B2's native origin. `s3.us-east-005…` is the S3 endpoint, for keys
and SDKs only — the two look alike, and using the S3 one as the CNAME target
fails confusingly. Proxied is not cosmetic either: grey-cloud means the client
pays Backblaze egress on every image view.

```
Transform Rule, http_request_transform phase
  when     http.host eq "img.vinylwraptoronto.com"
  rewrite  concat("/file/vinylwraptoronto-img", http.request.uri.path)
```

Without the rule the hostname maps to the whole shared B2 origin and anyone
could pull another Backblaze customer's public bucket through this domain. With
it, `/file/wrap-authority/…` — a real public bucket in the same account — 404s.
Worth re-checking after any change to the rule.

The page JSON keeps the live site's original paths. It is the extraction record,
and rewriting the strings inside it to carry a hostname would destroy that. The
prefix is translated at render time in `src/lib/img.ts`, so the host is **one
value**, not a bulk edit:

- `img(src)` — image `src`, `ogImage`, the favicon, and any `href` that points
  at an upload (the three PDF catalogues, and the full-size image behind a
  gallery thumbnail).
- `imgHtml(html)` — the same translation inside rich-text blocks, which are
  emitted with `set:html` and so never pass through `img()`. 145 of the ported
  blocks carry their own `<img>` tags and are reachable no other way.

The host is a constant that `PUBLIC_IMG_BASE` overrides, not an environment
variable alone: pages are prerendered, so a build with the variable missing
would quietly emit local paths and nothing would look broken.

`PUBLIC_IMG_BASE` overrides the host. Set it to `/wp-content/uploads` to serve
from `public/` again — a bad cutover is one env var to undo:

```bash
PUBLIC_IMG_BASE=/wp-content/uploads npm run build
```

### What is in the bucket

**23,379 files, 1,329,675,216 bytes** — the whole of the live site's `uploads/`,
not just what this site references. The port had only ever downloaded the images
it displayed, at the sizes it displayed them: 943 files. The rest are the
WordPress-generated size variants (`-300x169`, `-768x432`, `-1024x682`) that a
`srcset` needs, plus 357 `.jpg.webp` / `.png.webp` conversions written by an
optimisation plugin on the live site.

No single source could list them, and each is short in a different way:

| Source | Yield | Why it is not enough |
|---|---|---|
| REST `wp/v2/media` | 3,012 records → 22,920 files | reports 3,107 total and returns ~3,000 whatever the ordering or date slicing — the rest are withheld, not lost to paging |
| Sitemap `<image:loc>` | 755 | featured images only; found 8 the API never returned |
| Directory listing | — | nginx, autoindex off, 403 |
| Crawl of all 676 pages | 7,118 | found 427 the others could not, including every plugin-written `.webp` |

The target set is the union of all four. `imageUrl()` translates a path; it does
not check that the object exists, so anything missed here is a broken image with
no build error behind it.

Four files under `uploads/` are deliberately excluded:
`elementor/google-fonts/css/*.css`. They are stylesheets, and the site
self-hosts its fonts from `public/fonts/`.

`public/wp-content/uploads/` in this repo is **1,006 files — a subset, not a
mirror.** It is what `sweep.mjs` resolves image references against, which works
because every reference the site emits is inside that subset. Dropping it takes
~98 MB out of every Workers build, but `sweep.mjs` has to check against the
bucket first or the check silently stops meaning anything.

**The site must never reference `*.backblazeb2.com` directly** — that address
bypasses Cloudflare and bills the client for every image view. Only
`src/data/images.ts` knows the host, and `sweep.mjs` fails the build on any such
reference.
