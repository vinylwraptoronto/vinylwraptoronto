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
