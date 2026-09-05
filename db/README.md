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
0005 adds the SEO columns and `post_revisions`; 0006 adds `deleted_posts`.

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

Uploads go straight to the B2 bucket under `wp-content/uploads/YYYY/MM/`, so
they are served from `img.vinylwraptoronto.com` like every other image and need
no special case anywhere. The declared MIME type is checked against the file's
actual magic bytes — a `.png` that begins with `<svg` is refused.

Needs five Worker secrets, and until they are set the editor says so rather
than failing oddly: `B2_ENDPOINT`, `B2_REGION`, `B2_BUCKET`, `B2_KEY_ID`,
`B2_APPLICATION_KEY`. Scope the application key to this bucket only.

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
