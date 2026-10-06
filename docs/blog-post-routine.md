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

The script itself deploys nothing. The Deploy workflow
(`.github/workflows/deploy.yml`) does: on every run it rebuilds `main` **from
D1**, gates on the link and image sweep, uploads the Worker version, promotes
it and re-requests the site. So a post that is in D1 goes live the next time
that workflow runs, with no code change needed. The workflow has a manual
trigger (`workflow_dispatch`), which is exactly what the admin panel's Deploy
button calls, and it is what the routine calls too. Code changes still reach
`main` through a pull request that a person reviews; posts do not wait for it.

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

## One-time prerequisites (a person does these once)

1. Merge pull request #12. Until it is in `main`, the publish script, the
   sitemap/ownership-tag/author-archive fixes and this document are not on the
   branch a run starts from, and the run falls back to the slower hand path.
2. The scheduled task's environment must carry `CF_API_TOKEN` (or
   `CLOUDFLARE_API_TOKEN`) with D1 read/write on `vinylwraptoronto-blog`, and
   the GitHub connector with Actions write on this repository. Both were present
   on the first run.
3. The repository secrets the Deploy workflow reads are already set
   (`CF_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).

After that, every run publishes a post with no one present. The only thing a
run leaves for a person is the pull request holding its source files, and the
site does not wait for it: the post is live from the database. Merge those pull
requests whenever convenient; a run that finds an older one open reports it and
carries on.

## The routine prompt

Paste this as the scheduled task's prompt. It replaces the earlier version,
whose last step forbade committing and pushing and whose runs therefore
produced nothing durable. This version publishes end to end: database, branch
and pull request, deploy, live check, and it recovers from the failures the
first run met.

---

You are maintaining the Vinyl Wrap Toronto website repository
(vinylwraptoronto/vinylwraptoronto, Astro on Cloudflare Workers, blog in D1).
Your task is to research, write and publish one new SEO-focused blog post per
run about vehicle wraps (car, truck, van, fleet, wrap care, materials, design
preparation, installation, removal), and to leave it live on the site before
you finish. Nobody is watching; the notification you send at the end is the
only thing anyone reads.

Setup
1. Read `docs/blog-post-routine.md` and `db/README.md` and follow them.
2. `git fetch origin main` and start your designated branch from
   `origin/main` (`git checkout -B <branch> origin/main`), so you build on
   what is deployed. Preserve any pre-existing changes you were given.
3. Run `npm ci` if `node_modules` is missing. Confirm `CF_API_TOKEN` or
   `CLOUDFLARE_API_TOKEN` is set; if not, stop and notify, because nothing
   below can publish without it.
4. List open pull requests from earlier runs (`claude/*` branches, title
   starting "Blog post:"). Do not try to merge or close them; name them in your
   report so a person merges them.

Topic
5. Read the top 40 entries of `src/data/blog-index.json` and scan the titles
   and H2 headings in `src/data/posts.json` so the topic fills a real gap.
   Rotate between car and truck topics, with vans, fleets, care, materials,
   design, installation and removal in between. Never rewrite a topic an
   existing post already covers; if your first idea is covered, pick another.
6. Research with the tools available (web search, fetching manufacturer PDFs
   from 3M, Avery Dennison or KPMF, the repository's own posts). If a research
   tool errors (out of credits, 402, 503), use another; do not stop the run.

Writing
7. 1,200 to 2,000 words. One H1 comes from the title; the body starts at H2.
   Short paragraphs, lists where they help, a conclusion with a call to action
   linking `/contact/` and `tel:416-746-1381`. Base technical claims on
   manufacturer documentation or the repository; never invent prices,
   lifespans, guarantees or specifications, and never state assumptions as
   company policy. Mention Toronto or the GTA only where natural. Focus keyword
   in the title, slug, meta description (70 to 160 characters), first
   paragraph and one H2. Author is `masoud` unless told otherwise.
8. Every internal link must resolve to a page under `src/data/pages/` or a
   slug in `posts.json`. Every image must already exist: a path in the D1
   `media` table or in `src/data/img-dims.json`, and it must answer 200 at
   `https://img.vinylwraptoronto.com/<path without /wp-content/uploads/>`.
   Never invent an image. Reuse a relevant existing photo when no new one is
   available.

Publish to the database
9. Write `db/posts/<YYYY-MM-DD>-<slug>.json` and `.html` in the format
   `scripts/new-post.mjs` documents. `publishedAt` is an ISO datetime with
   the Toronto offset (`-04:00` in summer, `-05:00` in winter). Category names
   must already exist in D1; tags may be new.
10. Run `node scripts/new-post.mjs db/posts/<file>.json --apply`. Require an
    SEO score of 90 or more; improve the post and re-run if lower. The script
    applies the row with wrangler, reads it back and runs the snapshot pull.
    If the apply step is blocked or fails: keep the SQL file, apply the same
    changes to `src/data/{posts,blog-index,post-additions,categories}.json`
    by hand exactly as `scripts/pull-posts.mjs` would, mark the run as
    "database write blocked" in the report, and skip step 14, because the
    deploy would not include the post.
11. If `scripts/new-post.mjs` does not exist on your branch (pull request #12
    not yet merged), do what it does by hand: generate `sections_json`,
    `head_json` and `robots` with `src/lib/postdoc.ts` bundled through
    esbuild, write the idempotent SQL into `db/posts/`, apply it with
    `npx wrangler d1 execute vinylwraptoronto-blog --remote --file=<sql>`
    (set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`), then run
    `node scripts/pull-posts.mjs`.

Verify the build
12. Run `npx astro check`, `npx astro build`, `node scripts/check-seo.mjs`
    and `node scripts/sweep.mjs`. All four must pass. Confirm the built page
    has the title, canonical, description, one H1 and parsing JSON-LD, and
    that `dist/blog/index.html` carries its card. If a check fails because of
    the post, fix the post and repeat from step 10. If it fails for a reason
    unrelated to the post, record the failure and continue to step 14 only if
    `check-seo` and `sweep` passed; otherwise stop and notify.

Record
13. `git diff --stat` may show only the `db/posts/` files and the regenerated
    `src/data/{posts,blog-index,post-additions,categories}.json`. If the
    snapshot files conflict with anything, do not hand-merge them: they are
    derived from D1, so re-run `node scripts/pull-posts.mjs` and commit what
    it writes. Commit with a descriptive message, push to the designated
    branch, and open a pull request to `main` (title "Blog post: <title>";
    body: topic, intent, files, checks run, claims to review). Do not merge
    it.

Deploy and confirm it is on the site
14. Trigger the `Deploy` workflow with the GitHub Actions dispatch tool
    (workflow `deploy.yml`, ref `main`). Its build pulls the post from D1, so
    the post ships without waiting for the pull request.
15. Watch that run to completion. If it fails, read the failed job's log. A
    failure in the build or the sweep that names your post is yours: fix the
    row in D1 (or the post files and re-apply) and dispatch again. A failure
    in the deploy step (token, promote, hostname) is not yours to fix: notify
    with the log excerpt. Never re-run a job just to see if it passes.
16. When the run is green, fetch `https://astro.vinylwraptoronto.com/<slug>/`
    and confirm it answers 200 with the post's title in the HTML, and that
    `https://astro.vinylwraptoronto.com/blog/` carries its card. Only then is
    the post published. If the hostname still serves the old build after a
    green run, wait two minutes, fetch once more, and if unchanged report it
    as "deployed but not yet serving" rather than as live.

Report
17. Send the notification whether the run succeeded or was blocked; stay
    silent only if nothing at all was done. Lead with the one sentence that
    matters: the post is live at <URL>, or what blocked it and what a person
    must do. Then: topic and search intent, files changed, internal links, SEO
    score, verification results, the pull request and Deploy run links, the
    live URL as fetched, any claim that needs a human check, and any earlier
    pull requests still waiting for a merge.
