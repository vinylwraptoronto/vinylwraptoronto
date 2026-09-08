-- SEO for the site's own pages, not just the blog.
--
-- Applied 2026-09-08, after 0007.
--
-- The 60 pages under src/data/pages with kind 'page' -- /car-wraps/,
-- /contact/, the location pages -- are the ones that actually convert, and
-- until now their metadata could only be changed by editing a JSON file and
-- pushing. This makes it editable in /admin, without touching their content.
--
-- Two tables, and the split matters:
--
--   page_seo    the overrides an editor sets. Sparse: a row exists only for a
--               page somebody has edited, and a null column means "keep what
--               the page already has". So an empty table renders the site
--               exactly as it is today.
--
--   page_index  a build-generated copy of each page's title, description and
--               body text. The admin needs these to list the pages and to run
--               the SEO analyser, and the alternative -- importing 1,620 page
--               JSON files into the Worker -- would bloat it for no reason.
--               It is derived data: safe to delete and regenerate with
--               scripts/index-pages.mjs.
--
-- Body content is deliberately NOT editable here. These pages are ported
-- Elementor layouts; there is no body_html to edit, and regenerating one from
-- text would destroy the design. SEO fields only.

CREATE TABLE page_seo (
  slug                TEXT PRIMARY KEY,
  seo_title           TEXT,
  meta_description    TEXT,
  focus_keyword       TEXT,
  seo_score           INTEGER,
  seo_checks_json     TEXT,
  canonical_url       TEXT,
  robots_index        INTEGER NOT NULL DEFAULT 1,
  robots_follow       INTEGER NOT NULL DEFAULT 1,
  robots_advanced     TEXT,
  og_title            TEXT,
  og_description      TEXT,
  og_image            TEXT,
  twitter_card        TEXT,
  twitter_title       TEXT,
  twitter_description TEXT,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by          INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
);

CREATE TABLE page_index (
  slug        TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  og_image    TEXT,
  words       INTEGER NOT NULL DEFAULT 0,
  -- Plain text, for the analyser. Not markup: nothing renders this.
  body_text   TEXT NOT NULL DEFAULT '',
  indexed_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
