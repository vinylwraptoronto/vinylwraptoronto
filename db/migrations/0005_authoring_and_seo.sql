-- Authoring and SEO, for writing posts in /admin.
--
-- Applied 2026-09-05, after 0004.
--
-- 0001-0003 stored posts that already existed. This is what it takes to make a
-- new one: the SEO fields an editor sets by hand (the same set Rank Math
-- exposes in WordPress), and a revision history so a bad edit is recoverable.
--
-- The rendering columns are NOT set by hand. `sections_json`, `head_json` and
-- `robots` are generated on save from the editorial fields below -- see
-- src/lib/postdoc.ts. That keeps one rule for how a post becomes a page,
-- whether it was imported from Elementor or typed into the editor, and means
-- the site's renderer needs no idea which is which.

PRAGMA foreign_keys = ON;

-- The focus keyword the score is measured against, and any secondary ones.
ALTER TABLE posts ADD COLUMN focus_keyword   TEXT;
ALTER TABLE posts ADD COLUMN extra_keywords  TEXT;   -- JSON array of strings

-- The last computed analysis. Stored because it is worth being able to sort by
-- it, and because the score shown in the post list must not require re-running
-- the analyser over every post on every page load.
ALTER TABLE posts ADD COLUMN seo_score       INTEGER;
ALTER TABLE posts ADD COLUMN seo_checks_json TEXT;

-- Social overrides. Null means "fall back to the SEO title / description /
-- featured image", which is what Rank Math does and what most posts want.
ALTER TABLE posts ADD COLUMN og_title            TEXT;
ALTER TABLE posts ADD COLUMN og_description      TEXT;
ALTER TABLE posts ADD COLUMN og_image_id         INTEGER REFERENCES media(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN twitter_card        TEXT;   -- summary | summary_large_image
ALTER TABLE posts ADD COLUMN twitter_title       TEXT;
ALTER TABLE posts ADD COLUMN twitter_description TEXT;
ALTER TABLE posts ADD COLUMN twitter_image_id    INTEGER REFERENCES media(id) ON DELETE SET NULL;

-- Structured data and breadcrumbs.
ALTER TABLE posts ADD COLUMN schema_type      TEXT;   -- BlogPosting | Article | NewsArticle
ALTER TABLE posts ADD COLUMN breadcrumb_title TEXT;

-- Robots, held as the flags the editor actually toggles. The `robots` column
-- from 0001 stays as the rendered string, generated from these on save, so the
-- imported posts that already carry a hand-written robots value are untouched.
ALTER TABLE posts ADD COLUMN robots_index    INTEGER NOT NULL DEFAULT 1;
ALTER TABLE posts ADD COLUMN robots_follow   INTEGER NOT NULL DEFAULT 1;
ALTER TABLE posts ADD COLUMN robots_advanced TEXT;   -- JSON array: noarchive, nosnippet, noimageindex

-- Which posts came from the original site and which were written here.
-- Imported posts keep the head tags and Elementor render tree they arrived
-- with; regenerating those from the editorial fields would throw away the
-- metadata 478 pages currently rank on.
ALTER TABLE posts ADD COLUMN origin TEXT NOT NULL DEFAULT 'imported';

ALTER TABLE posts ADD COLUMN updated_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL;

-- Every save keeps the previous state. WordPress does this and people rely on
-- it; without it the editor is one careless paste away from losing a post.
CREATE TABLE post_revisions (
  id            INTEGER PRIMARY KEY,
  post_id       INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  -- The whole editable row as JSON, so a restore does not depend on which
  -- columns existed when the revision was taken.
  snapshot_json TEXT NOT NULL,
  -- Denormalised for the revision list, so showing it costs one query.
  title         TEXT,
  words         INTEGER,
  note          TEXT,
  author_id     INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_post_revisions_post ON post_revisions(post_id, created_at DESC);

-- The post list sorts and filters on these.
CREATE INDEX idx_posts_updated ON posts(updated_at DESC);
CREATE INDEX idx_posts_origin  ON posts(origin);
