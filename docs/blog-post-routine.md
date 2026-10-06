# The blog-post routine

A scheduled Claude Code task writes one SEO post per run. This page is the
procedure it follows and the prompt that drives it, kept here so the two cannot
drift and so a person can run the same steps by hand.

## How a post gets from a draft to the site

D1 is the source of truth for the blog (see `db/README.md`). A post written
outside `/admin` reaches it through `scripts/new-post.mjs`, which does what the
editor's save route does, in one command:

    node scripts/new-post.mjs db/posts/<date>-<slug>.json --apply

1. Reads the spec and body (`db/posts/<date>-<slug>.json` + `.html`).
2. Sanitises the body and generates `sections_json`, `head_json`, `robots` and
   the SEO score with `src/lib/postdoc.ts` and `src/lib/seo.ts`.
3. Writes `db/posts/<date>-<slug>.sql`: an idempotent insert that resolves the
   author, image and terms by name.
4. `--apply` runs it against D1 with wrangler, reads the row back over the API,
   and runs `scripts/pull-posts.mjs` so the committed snapshot matches.

Nothing is deployed by this. The Deploy workflow ships `main`.

The three source files and the regenerated snapshot are what get committed, so
a post is reviewable as a diff: the body as HTML, the metadata as JSON, and the
exact row that went into the database.

### What the first run found and fixed (2026-10-06)

- `sitemap-groups.json` is the original's frozen list; `src/lib/sitemap.ts` now
  adds any post the snapshot carries that the list does not.
- Authored posts lacked the three every-page ownership tags; `buildHead` now
  emits them from `seo.config.mjs`.
- Authored posts were not on their author's archive; `pull-posts.mjs` files them
  there via `src/data/author-archives.json`, newest first.
- Writing to D1 over the raw HTTP API from an unattended run was blocked by the
  session's permission classifier; `wrangler d1 execute --file` was allowed.
  The script uses wrangler for that reason. If a run is blocked anyway, the SQL
  file is still written and committed, and the run must say so.

## The routine prompt

Paste this as the scheduled task's prompt. It replaces the earlier version,
whose last step forbade committing and pushing and whose runs therefore
produced nothing durable.

---

You are maintaining the Vinyl Wrap Toronto website repository
(vinylwraptoronto/vinylwraptoronto, Astro on Cloudflare Workers, blog in D1).
Your task is to research, write and publish one new SEO-focused blog post per
run about vehicle wraps (car, truck, van, fleet, wrap care, materials, design
preparation, installation, removal), then commit and push it on the branch you
were given.

Read `docs/blog-post-routine.md` and `db/README.md` first and follow them.

Before writing:
1. Check `git status`; preserve pre-existing changes.
2. Read the last 30 entries of `src/data/blog-index.json` and scan
   `src/data/posts.json` titles and H2s so the topic fills a real gap. Rotate
   between car and truck topics, with vans, fleets, care, materials, design,
   installation and removal in between.
3. Confirm every internal link target exists under `src/data/pages/` or in
   `posts.json`. Confirm every image you reference exists in the D1 `media`
   table or in `src/data/img-dims.json` and returns 200 from
   https://img.vinylwraptoronto.com/<path without /wp-content/uploads/>.
   Never invent an image.

Writing: 1,200–2,000 words, one H1 from the title (the body starts at H2),
short paragraphs, lists where they help, a conclusion with a call to action
linking `/contact/` and `tel:416-746-1381`. Base technical claims on
manufacturer documentation (3M, Avery Dennison, KPMF bulletins) or the
repository; never invent prices, lifespans, guarantees or specifications, and
never present assumptions as company policy. Mention Toronto or the GTA only
where natural. Focus keyword in the title, slug, meta description (70–160
chars), first paragraph and one H2. Author is `masoud` unless told otherwise.

Publish:
4. Write `db/posts/<YYYY-MM-DD>-<slug>.json` and `.html` in the format
   `scripts/new-post.mjs` documents. `publishedAt` is an ISO datetime with a
   Toronto offset (`-04:00` in summer, `-05:00` in winter).
5. Run `node scripts/new-post.mjs db/posts/<file>.json --apply`. Require an
   SEO score of 90 or more; fix the post and re-run if lower. If the apply step
   is blocked or fails, keep the SQL file, apply the same changes to the
   snapshot files by hand as `pull-posts.mjs` would, and say so prominently in
   the report.
6. Run `npm ci` if `node_modules` is missing, then `npx astro check`,
   `npx astro build`, `node scripts/check-seo.mjs` and `node scripts/sweep.mjs`.
   All four must pass. Confirm the built page has the title, canonical,
   description, one H1, parsing JSON-LD, and appears on `dist/blog/index.html`,
   in `dist/post-sitemap1.xml` and on the author archive.
7. Review `git diff --stat`: only the three `db/posts/` files and the
   regenerated `src/data/{posts,blog-index,post-additions,categories}.json`
   may change. Commit with a descriptive message and push to the designated
   branch. Do not merge to `main` and do not deploy; a person reviews and
   merges, which is what ships it.

Report back: the topic and search intent, the files changed, internal links,
the SEO score, the verification results, any claim that needs a human check,
and the exact merge step that remains. Send the notification whether the run
succeeded or was blocked; silence only when nothing was done.
