# Vinyl Wrap Toronto — Astro port

Astro static site on Cloudflare Workers, ported from the Elementor/WordPress site
at vinylwraptoronto.com. Pushes to `main` deploy via `.github/workflows/deploy.yml`.
Preview: https://astro.vinylwraptoronto.com

**Read `.claude/skills/site-build-standards/SKILL.md` before any layout work.**
It holds the header/nav standard and the Elementor port lessons learned here.

## Hard rules

- **Do not change the header/nav** (`src/components/Header.astro`, `src/data/nav.json`)
  unless asked to. Its labels, grouping and layout are decisions, not drift. They
  follow the standard in that skill: boxed to the 1400px content column with
  20px of white space either side, and items spread evenly between the logo and
  "I want to". Projects sits under Our Work and Tesla Wraps under Vehicle Wraps,
  in a one-column dropdown with flyouts.
- Never edit D1 for layout. Posts render from D1 (`src/data/posts.json` is a
  build-time snapshot). Layout fixes are render-time overlays:
  `src/lib/post-template.ts` (the single-post template, keyed by Elementor ids)
  and the harvested JSON in `src/data/`.
- Don't commit the snapshots the build regenerates (`posts.json`, `blog-index.json`,
  `categories.json`, `post-additions.json`). `git checkout` them first.
- Keep page JSON in its original compact serialisation:
  `json.dumps(d, ensure_ascii=False, separators=(", ", ": "))`.

## Where layout comes from

| Data | Harvester | What it carries |
|---|---|---|
| `src/data/section-css.json` | `scripts/pull-section-margins.py` | top-level section margins |
| `src/data/row-css.json` | `scripts/pull-row-margins.py` | inner-section (row) margins, keyed by the row's first widget |
| `src/data/col-css.json` | `scripts/pull-col-margins.py` | column vertical margins, keyed by the column's first widget |
| `src/data/list-space.json` | `scripts/pull-list-space.py` | icon-list Space Between per breakpoint |
| `src/data/icon-size.json` | `scripts/pull-icon-size.py` | icon-box icon size (the default is 50px) |
| `src/data/spacers.json` | `scripts/pull-spacers.py` | Gutenberg spacers in post/page content |
| `src/data/widget-css.json` | `scripts/pull-card-css.py` | posts-widget card CSS |
| `src/data/post-layout.json` | generated once from the seed pages (no script in the repo) | /locations-served/ layout ops |

Each harvester runs as `python3 scripts/pull-*.py --cache <dir of the original's HTML>`.
Rules are parsed with `rules()`, `bp()` and `decl()` from `scripts/pull-section-layers.py`.

## Checks before pushing

```
npx astro check
CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN:-$CF_API_TOKEN} npm run build   # includes the SEO lint
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/verify.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/behaviour.mjs
```

Local server for measurement: `node scripts/serve-dist-only.mjs 4399`.

## Known, accepted differences from the original

- Deliberate SEO divergences:
  - `/car-wraps/`: a 280px hero with an H1.
  - `/vehicle-paint-protection-film-toronto/`: a 40vh hero.
  - `/commercial-vehicle-wraps/`: different H1 copy.
- The original stretches photos with an inline `width:1200px;height:630px`; the
  port doesn't copy that. Affected posts:
  - `/box-truck-wrap-in-toronto-atm-systems/`
  - `/chevy-silverado-full-wrap-for-hungarock/`
  - `/nissan-nv2500-partial-wrap-rhodium-demolition/`
- No reCAPTCHA box. The original shows a 72px inline reCAPTCHA in every form.
- `/personal-branding/` is a Lorem Ipsum demo page.
