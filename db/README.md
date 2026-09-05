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

## What is deliberately not in it

The static pages mix the post an author wrote with the template Elementor
wrapped around it. Only the post is stored. The table of contents, the
related-posts grid, the quote form, the promo panel and the prev/next links are
template furniture, identical on every post, and are rendered by the template.

## Rebuilding the seed

    python3 db/blog_export.py     # static pages -> db/blog_rows.json
    python3 db/blog_sql.py        # rows -> blog_seed.sql
    npx wrangler d1 execute vinylwraptoronto-blog --remote --file=blog_seed.sql

Both scripts read from `src/data/pages/*.json` and the cached taxonomy exports.

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
