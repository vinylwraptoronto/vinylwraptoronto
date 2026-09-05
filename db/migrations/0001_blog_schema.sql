-- Blog schema for the D1 database `vinylwraptoronto-blog`.
--
-- Applied 2026-09-05. Seeded from the 478 posts already on the site; see
-- db/blog_export.py (static pages -> rows) and db/blog_sql.py (rows -> SQL).
--
-- The static pages mix the post an author wrote with the template Elementor
-- wrapped around it. Only the first is stored: the table of contents, the
-- related-posts grid, the quote form, the promo panel and the prev/next links
-- are template furniture and would otherwise be duplicated 478 times.

PRAGMA foreign_keys = ON;

CREATE TABLE authors (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  bio         TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per image. `path` is the key inside the bucket, e.g.
-- /wp-content/uploads/2019/05/car-wrap.webp; the public URL is that path on
-- img.vinylwraptoronto.com, so the host can change without rewriting rows.
CREATE TABLE media (
  id          INTEGER PRIMARY KEY,
  path        TEXT NOT NULL UNIQUE,
  alt         TEXT NOT NULL DEFAULT '',
  width       INTEGER,
  height      INTEGER,
  mime        TEXT,
  bytes       INTEGER,
  uploaded_by INTEGER REFERENCES authors(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Categories, vehicle brands and tags share a shape, so they share a table.
CREATE TABLE terms (
  id          INTEGER PRIMARY KEY,
  taxonomy    TEXT NOT NULL CHECK (taxonomy IN ('category','brand','tag')),
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  wp_id       INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (taxonomy, slug)
);

CREATE TABLE posts (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  -- The <title> tag, longer than the display title and carrying the brand
  -- suffix; kept apart so editing one does not silently change the other.
  seo_title     TEXT,
  -- The on-page H1, which is frequently neither of the above.
  headline      TEXT,
  excerpt       TEXT,
  body_html     TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','scheduled','published','archived')),
  featured_id   INTEGER REFERENCES media(id) ON DELETE SET NULL,
  author_id     INTEGER REFERENCES authors(id) ON DELETE SET NULL,
  published_at  TEXT,
  modified_at   TEXT,
  canonical_url TEXT,
  robots        TEXT,
  -- The original's own head tags and JSON-LD graph, kept whole so a migrated
  -- post keeps the metadata it ranks on today.
  head_json     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE post_terms (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  term_id INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, term_id)
);

-- Which images a post uses, and how. `featured` is the lead image; `body` is
-- referenced from body_html. Lets the editor show a post's images and stops a
-- delete from orphaning one that is still in use.
CREATE TABLE post_media (
  post_id  INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  role     TEXT NOT NULL CHECK (role IN ('featured','body','gallery')),
  PRIMARY KEY (post_id, media_id, role)
);

CREATE INDEX idx_posts_status_date ON posts(status, published_at DESC);
CREATE INDEX idx_posts_author      ON posts(author_id);
CREATE INDEX idx_posts_featured    ON posts(featured_id);
CREATE INDEX idx_terms_taxonomy    ON terms(taxonomy, slug);
CREATE INDEX idx_post_terms_term   ON post_terms(term_id);
CREATE INDEX idx_post_media_media  ON post_media(media_id);

CREATE TRIGGER posts_touch_updated_at
AFTER UPDATE ON posts FOR EACH ROW
BEGIN
  UPDATE posts SET updated_at = datetime('now') WHERE id = NEW.id;
END;
