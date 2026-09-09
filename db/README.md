# Blog database

Cloudflare D1, bound to the Worker as `BLOG`.

| | |
|---|---|
| name | `vinylwraptoronto-blog` |
| id | `ed3116e7-7699-4d4d-8785-2ea67f81aed1` |
| region | ENAM |
| seeded | 2026-09-05 |

## What is in it

| table | rows | |
|---|---|---|
| `posts` | 478 | every post currently on the site |
| `terms` | 1,051 | 44 categories, 539 vehicle brands, 468 tags |
| `media` | 757 | every image a post uses |
| `post_terms` | 1,223 | |
| `post_media` | 848 | 478 featured + 370 in-body |
| `authors` | 3 | |

## How a post reaches the page

D1 is the source of truth for the blog. The site is a static build, so there is
a pull step between the two:

    npm run posts:pull    # D1 -> src/data/posts.json   (needs CLOUDFLARE_API_TOKEN)
    npm run build         # runs posts:pull, then astro build

`src/data/posts.json` is committed on purpose. A build with no network, no
token, or a D1 outage then still produces the whole site from the last
known-good snapshot instead of silently dropping 478 pages, and a content
change is reviewable as a diff before it ships. `scripts/pull-posts.mjs`
refuses to overwrite a good snapshot with a smaller one unless
`ALLOW_POST_SHRINK` is set — "the query returned fewer rows than expected" and
"we deleted half the blog" look identical to a build script.

The post entries still under `src/data/pages/*.json` are the seed input, not a
render source. `src/pages/[...slug].astro` filters them out, because taking
both would give two sources of truth for the same 478 addresses and they would
drift the moment anyone edited a post.

## Editorial columns vs the render tree

`title`, `body_html`, `featured_id` and the terms are what an editor edits.
They are not enough to redraw a post: 312 of the 318 filterable galleries are
distinct per post, and all 69 before/after comparisons are. So each post also
carries `sections_json` (the document as it renders), `page_css` (its own
responsive rules) and `layout` (which template furniture it uses, so the
authoring feature can compose the same shape rather than guess).

| layout | posts |
|---|---|
| `standard+gallery` | 259 |
| `standard` | 143 |
| `comparison+gallery` | 52 |
| `comparison` | 17 |
| `minimal+gallery` | 7 |

## What is deliberately not in it

The static pages mix the post an author wrote with the template Elementor
wrapped around it. The table of contents, the related-posts grid, the quote
form, the promo panel and the prev/next links are template furniture, identical
on every post, and are rendered by the template rather than stored 478 times.

## Rebuilding the seed

    python3 db/blog_export.py     # static pages -> db/blog_rows.json
    python3 db/blog_sql.py        # rows -> db/blog_seed.sql
    python3 db/blog_render.py     # render tree -> db/blog_render.sql
    python3 db/fix_featured.py    # featured = declared og:image -> db/fix_featured.sql

Each reads from `src/data/pages/*.json` and the cached taxonomy exports, and
each is re-runnable. Apply with:

    npx wrangler d1 execute vinylwraptoronto-blog --remote --file=db/<file>.sql

The generated `.sql` is gitignored — `blog_render.sql` alone is 5.8MB and it
regenerates from committed inputs. `db/migrations/` is tracked.

## Admin sign-in

`/admin` on the deployed site. Three tables carry it: `admin_users`,
`admin_sessions`, `admin_login_attempts` (migration 0004). The pages are the
only on-demand routes besides the quote form — everything else is still a
static file.

Accounts are managed from the command line, never from a page, because there is
no signed-in surface to create the *first* account from:

    npm run admin:user create <username>    # generates the password, prints it once
    npm run admin:user reset  <username>    # new password, and ends their sessions
    npm run admin:user disable <username>   # and signs them out
    npm run admin:user logout <username>
    npm run admin:user list
    npm run admin:user sessions

`create` and `reset` generate the password locally, print it once and store only
its hash. It is not recoverable — only replaceable. Both flag the account
`must_change_password`, so /admin sends the holder to the change-password form
and answers nothing else until they have picked their own.

### How the credentials are held

Passwords are PBKDF2-HMAC-SHA256, salted per account, stored as

    pbkdf2$sha256$<iterations>$<rounds>$<salt-b64>$<key-b64>

Both cost figures live in the hash, so they can be raised later without
invalidating existing passwords: an old hash verifies at its own cost and is
rewritten at the current one the next time its owner signs in.

The cost is two numbers rather than one because **Workers rejects any single
PBKDF2 call above 100,000 iterations** —

    NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not
    supported (requested 210000)

— which is below what is considered adequate today. So six rounds are chained,
each at the platform maximum, each round taking the previous round's output:
600,000 iterations of work per guess, and no shortcut through them. Measured at
about 280ms, against a 30s CPU budget per request on this account's usage model.

`scripts/admin-user.mjs` must derive identically or nothing it writes will ever
verify. The two implementations were checked against each other on ASCII,
accented and 200-character passwords before the first account was created.

### What protects it

| | |
|---|---|
| session cookie | `__Host-` prefixed, HttpOnly, Secure, SameSite=Lax |
| stored server-side | only the SHA-256 of the token, so a database copy hands over no live session |
| expiry | 8 hours, enforced by SQLite in the same query that reads the session |
| CSRF | double-submit cookie on login, per-session token on every authenticated POST, plus an `Origin`/`Sec-Fetch-Site` check |
| rate limiting | 8 failures per username and 25 per address in 15 minutes |
| enumeration | one message for every failure, and the same PBKDF2 work is spent on a username that does not exist |
| password change | requires the current password, and revokes every other session |
| headers | `no-store`, `noindex`, a CSP with `script-src 'none'`, `frame-ancestors 'none'` |

`admin_login_attempts` doubles as the audit trail; the dashboard shows the
signed-in user their own recent sign-ins, which is how someone notices a
password in the wrong hands.

## Writing posts

`/admin/posts/` lists everything; `/admin/posts/new/` writes one. Migration
0005 adds the SEO columns and `post_revisions`; 0006 adds `deleted_posts`; 0012
adds `faq_json`.

### What the editor sets

| | |
|---|---|
| Content | title, permalink, body, excerpt, cover image, author, publish date, status |
| Body | H1–H4 and paragraph, bold/italic, bulleted and numbered lists, quote, link, **table**, image (alt text is asked for on insert), and a raw-HTML view |
| Keywords | one focus keyword, plus **secondary keywords** as chips |
| Metadata | SEO title, meta description, canonical URL, robots flags, breadcrumb title |
| Social | og title/description/image, Twitter card/title/description |
| Taxonomy | categories (tick existing or **type a new one**), **tags**, vehicle brands |
| Schema | article type, and a **FAQ** list that publishes as both an accordion and a `FAQPage` node |

Three notes on the ones that are not obvious:

**Secondary keywords** are scored as a single check, not one per keyword, so
adding a fifth cannot dilute a post that already covers four. The check does
not appear at all when none are set — a post that does not use them is not
doing anything wrong, and the score's denominator should not move.

**H1 is offered but flagged.** `buildSections` already prints an H1 from the
post title, so an H1 typed into the body is a second one on the page; the
analyser scores that as a fault. The sanitiser allows `h1` through rather than
stripping it, because a button that appears to work while its output silently
vanishes on save is worse than one that works and warns.

**A new category has no archive page.** The `/blogs/…` archives are ported
pages, so `terms.href` is left null for anything created here: claiming an
address would publish a link to a 404. The post is filed immediately and its
card badge shows the name — the badge is text, not a link — but the category
will not appear in the blog sidebar's dropdown, which is built from terms that
have an href, until an archive exists.

Tags had a bug worth recording: the save route deletes every `post_terms` row
and re-inserts what the form submitted, and tags were never rendered as form
fields, so **saving an imported post through the editor silently dropped its
tags**. The tags field is populated from the post's existing tags, which is
what fixes it.

### How a post becomes a page

The editor stores editorial fields. `src/lib/postdoc.ts` turns them into
exactly the shapes an imported post already carries — `sections_json`,
`head_json` as `[key, isProperty, value]` triples, and the `robots` string — so
the site's renderer needs no idea whether a post was written here or ported
from Elementor. Nothing in `Base.astro` or `Blocks.astro` changed for this.

**Imported posts are not regenerated.** Their `sections_json` is the full
Elementor layout (galleries, before/after sliders, the sidebar) while their
`body_html` is only the text blocks extracted from it — so rebuilding one from
the other would silently throw the rest of the page away. Editing an imported
post's body is refused unless the request carries `relayout=1`, and the post is
marked `origin='authored'` from then on. Editing only its SEO fields is always
safe. `posts.origin` records which is which.

### SEO

`src/lib/seo.ts` is a Rank Math-style analyser: 18 checks in four groups
(basic, additional, title readability, content readability), a 0–100 weighted
score, and the stats behind it. The editor runs it on every keystroke for live
feedback; the save route runs the same module again and stores *that* result,
because a score arriving in the request body is a number the client chose. A
post with no focus keyword scores honestly — the keyword checks report as
unset and still count, rather than being skipped.

The panel covers what Rank Math covers: focus keyword, SEO title and meta
description with a Google preview, OpenGraph and Twitter overrides, canonical,
`index`/`follow`/`noarchive`/`nosnippet`/`noimageindex`, schema type and
breadcrumb title.

### Images

Uploads go straight to the B2 bucket and are served from
`img.vinylwraptoronto.com` like every other image, needing no special case
anywhere. The declared MIME type is checked against the file's actual magic
bytes — a `.png` that begins with `<svg` is refused, as is any type outside
JPEG, PNG, GIF, WebP and AVIF. The limit is 12MB.

**The bucket key has no `/wp-content/uploads/` prefix.** That prefix lives only
in the database and the ported markup; when the images were copied off
WordPress they went to the bucket root, so the live files are at keys like
`2019/02/cropped-gallery-6.jpg` and the image host serves that root directly.
`src/lib/img.ts` maps between the two. Getting this wrong does not fail loudly:
the upload succeeds, every status code says so, and the public URL 404s because
the file is at a key nothing reads.

| | |
|---|---|
| bucket key | `2026/09/name-a1b2c3.png` |
| stored in `media.path` | `/wp-content/uploads/2026/09/name-a1b2c3.png` |
| public URL | `https://img.vinylwraptoronto.com/2026/09/name-a1b2c3.png` |

Five Worker secrets, and until they are set the editor says so rather than
failing oddly: `B2_ENDPOINT`, `B2_REGION`, `B2_BUCKET`, `B2_KEY_ID` and
`B2_APPLICATION_KEY` (`B2_APP_KEY` is accepted too). Currently set to
`vinylwraptoronto-img` in `us-east-005`.

**Scope the key to this one bucket.** The account-wide key sitting in the build
environment can read, write and delete every bucket on the Backblaze account —
including other clients' and the private ones — so it must not be the value in
this Worker. The key in use is `vwt-admin-uploads`, restricted to
`vinylwraptoronto-img` with `listBuckets, listFiles, readFiles, writeFiles` and
no delete or key-management rights. Replacing it means creating another scoped
key and running `npx wrangler secret put B2_KEY_ID` / `B2_APPLICATION_KEY`.

### Publishing

The site is 1,620 prerendered pages, so a saved post is not live until the site
is rebuilt. `/admin/deploy/` triggers `.github/workflows/deploy.yml`, which
pulls from D1, rebuilds, gates on the link and image sweep, and deploys —
the same path a code change takes. Needs `GITHUB_DEPLOY_TOKEN` (a GitHub token
with `actions: write` on this repository) as a Worker secret.

`/admin/posts/<id>/preview/` renders a draft through the real layout and
renderer beforehand, so nothing has to be deployed to be read.

### Getting a new post into the listings

Nearly every archive on this site, `/blog/` included, carries **zero**
`members` and renders its listing from Elementor markup ported off the
original. A newly written post would therefore be live at its own address and
linked from nowhere. `scripts/pull-posts.mjs` writes
`src/data/post-additions.json` — summaries and `/blog/` membership for posts
written here only — which `ArchiveList.astro` and `[...slug].astro` merge in.
It is empty until the first post is written here, so no existing page changes.

## The blog index

`/blog/` was ported as a **frozen snapshot**: the Elementor cards block as it
stood on cloning day, thirteen entries, and no pagination at all, because the
original renders the page links from WordPress rather than in the layout. The
effect was that 460 of the site's 478 posts were reachable only by knowing
their address — not from the blog, and not by a crawler following links.

`scripts/pull-posts.mjs` now also writes `src/data/blog-index.json`: every
published post whose slug has no `/` in it, newest first, with the author, the
featured image and the one category the card badge shows.
`src/lib/bloglist.ts` refills the cards block from it and inserts a pagination
control, and `[...slug].astro` emits `/blog/page/2/` … `/blog/page/34/`
alongside `/blog/`. Everything else on the page — the heading, the category
list, the "Why Choose Us?" panel, the column widths — is left exactly as
ported, because only the listing was ever wrong.

Two details are matched to the original rather than invented, both verified by
crawling all 34 of its pages (403 card slots, 402 distinct posts):

- **Ordering is by `published_at` with NULLs last** — *not*
  `COALESCE(published_at, created_at)`. `created_at` is when the row was seeded
  into D1 and is identical for all 478, so coalescing floated every undated
  post above every dated one and put a 2020 post at the top of the blog.
- **Sticky posts.** The original pins one post to the top of page 1 without
  dropping anything: page 1 carries thirteen cards and page 2 still starts at
  the thirteenth post. `posts.sticky` (migration 0010) records that, and the
  pinned post keeps its natural date position further down, so it appears
  twice across the 34 pages — exactly as the original serves it.

Migration 0010 also restores four publication dates that were lost in seeding.
They came in NULL, which sorted those posts to the end of the index; the dates
are read off each post's own byline on the original, which is the only place
they are published (these four carry no article schema). Noon is used for the
time of day, which is safe because each date sits unambiguously between its
neighbours with no same-day tie to break. With 0010 applied, all 403 card slots
are in the original's order.

Pages 2 and beyond are `noindex, follow` and titled "— Page N of M", and their
ported Yoast graph is dropped rather than left claiming to be `/blog/`. Every
post is still linked, so every post is still crawled.

### The category dropdown

The sidebar beside the listing is WordPress's categories widget in **dropdown**
mode — a `<select>` of 43 nested options, not a list of links. Ours had been a
flat alphabetical `<ul>`, which differed in control type, in ordering, and in
seven of the numbers.

The numbers were the substantive part. WordPress counts a hierarchical term
with `pad_counts`: a parent's figure is the **distinct** posts in it or any of
its descendants, so Car Wrap reads 92 where the posts filed directly against it
number 79. `terms` had no parent link to compute that from; migration 0011 adds
`parent_id` and `href`, recovered from the archive addresses the site already
serves (a child category lives under its parent's path). `pull-posts` then
derives the whole dropdown from D1 — union of post ids down each subtree, so a
post filed under both a parent and its child counts once — and reproduces all
43 of the original's numbers exactly. Deriving rather than copying is the point:
the counts stay true as posts are written.

Empty categories are dropped, which is what `hide_empty` does and why neither
dropdown lists "Tinting". Ordering is plain code-unit comparison, **not**
`localeCompare`: en collation ignores the space in "Go Cart Wraps" and sorts it
after "Golf Cart Wraps", which is not the order the original uses.

The original's widget submits its form to `?cat=<term id>`; there is no query
handler on a static site, so each option's value is the archive address and a
small handler navigates to it. Same control, same options, same destination —
and the original's is JS-driven too.

## SEO for the site's own pages

`/admin/pages/` covers the 60 pages that are not blog posts — `/car-wraps/`,
`/contact/`, the location pages. Migrations 0008 and 0009.

**Content is not editable there, and cannot be.** These pages are ported
Elementor layouts with no `body_html`; there is nothing to edit that would not
mean regenerating the design. Only the metadata is editable.

Two tables, and the split is the point:

| | |
|---|---|
| `page_seo` | what an editor set. Sparse — a row exists only for an edited page, a null column means "keep what the page has". |
| `page_index` | derived: each page's title, description and an HTML rendering of its content, so the list has something to show and the analyser something to score. Safe to drop and regenerate. |

`scripts/index-pages.mjs` fills `page_index`. Run it after porting or changing
page content; it is not part of the build, because the build consumes the
overrides rather than the index.

`src/lib/pageseo.ts` merges the overrides over the head tags each page was
ported with. It rewrites the existing `meta` entries **in place, by key** —
adding tags beside them would leave the old `description` rendering next to the
new one. Everything not overridden (og:locale, the article dates, the Yoast
JSON-LD graph, the image dimensions) is left exactly as ported, which is the
whole reason for having preserved it. An empty `page_seo` renders the site
byte-for-byte as it is today; clearing a field is a real revert.

Note `page_index.body_html` holds **markup, not stripped text**. It held text
first, and the score was meaningless: the analyser looks for subheadings,
links, images and lists, and stripped text has none by construction, so every
page scored badly and no edit could move it. `/car-wraps/` scored 40 with
nothing wrong with it; with structure preserved the same inputs score 56 and
the remaining failures are real facts about the page.

The editor is addressed as `?slug=car-wraps` rather than a path segment,
because the homepage's slug is the empty string.

## Settings and team

`/admin/settings/` edits the business details rendered into every page — name,
phone, email, address, map link — plus the defaults a new post starts with.
They are stored in the `settings` table (migration 0007) and validated against
`src/lib/settings.ts`, which declares every key the site knows about; a row
with an undeclared key is ignored rather than trusted.

`src/data/site.ts` now holds **defaults**. `scripts/pull-posts.mjs` writes
whatever is stored into `src/data/site-settings.json` before the build, and
site.ts merges it over them. So:

- nothing is seeded, and an empty table means the site builds exactly as before
- clearing a field in the admin deletes the row, which restores the default
  rather than publishing an empty footer line on 1,620 pages
- the site address is deliberately **not** settable: every canonical URL and
  the whole JSON-LD graph is built from it, so changing it is a domain move
- `phoneHref` is derived but kept verbatim, hyphens and all — the original
  serves `tel:416-746-1381`, and normalising it would change every page

The Connections panel on that page reports whether the Worker secrets behind
the quote form, image uploads and publishing are present. Presence only: a
secret's value is never read into a page.

`/admin/team/` adds and manages accounts, which was command-line only before.
A generated password is returned in the response body and shown once in the
page — never in a redirect URL, which would leave a live credential in browser
history and in the next request's referrer. Two rules stop the screen locking
everyone out: you cannot disable your own account, and you cannot disable the
last enabled one. It also lists failed sign-ins from the last seven days.

## Notes for the authoring feature

- `media.path` is the bucket key, not a URL. The public address is that path on
  `img.vinylwraptoronto.com`, so the image host can change without rewriting
  every row. New uploads go to the B2 bucket and get a row here.
- `posts.status` is one of draft / scheduled / published / archived. Every
  migrated post is `published`.
- `title`, `seo_title` and `headline` are three different strings on this site
  and are stored separately, so editing one does not silently change another.
- `head_json` holds the original's own meta tags and JSON-LD. Keep it on
  migrated posts or they lose the metadata they currently rank on; new posts
  can leave it null and have it generated.
- 41 migrated posts have an empty `body_html`. Their pages are built entirely
  from Elementor widgets with no rich-text block, so there was no body to
  take — they are not a load failure.
- One tag reads `[artial vehicle wrap` (slug `artial-vehicle-wrap`). That typo
  is in the live site's own data and was carried across rather than corrected.
