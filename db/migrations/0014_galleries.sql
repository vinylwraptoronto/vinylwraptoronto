-- The galleries, so the third kind of content on this site lives where the
-- other two already do.
--
-- Applied 2026-09-14, after 0013.
--
-- Posts have been in D1 since 0001 and quote submissions since 0013. The
-- galleries were the one thing still frozen in the page JSON the build is
-- compiled from, which meant 970 photographs -- including the 341 on the
-- portfolio, the page the business is judged on -- could only be changed by
-- editing a data file and redeploying.
--
-- SCOPE. This covers galleries on PAGES. Galleries inside posts are already in
-- this database, stored in posts.sections_json, and are edited with their post;
-- pulling them out into here would give the same gallery two owners.
--
-- WHAT IS AND IS NOT HERE. The pictures, their alt text, their captions, their
-- filter tag and their order -- the things someone edits. The layout (masonry
-- or grid, column counts, gaps) stays on the block in the page data, because it
-- is design rather than content, and it is the same split the posts already
-- use: D1 holds what a post says, the components decide how it looks.
--
-- IDENTITY. A gallery is identified by the page it sits on and the Elementor
-- widget id of the block, because the widget id alone is not unique -- 64f41a0
-- is the id of a gallery on four different pages. The pair is, and the UNIQUE
-- below is what will say so out loud if that ever stops being true.

CREATE TABLE galleries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  page_slug  TEXT    NOT NULL,
  eid        TEXT    NOT NULL,
  -- What to call it in /admin, since "e548c3e" tells nobody anything.
  label      TEXT,
  -- The filter tabs, as the block already stores them: [{index,label}, ...].
  filters    TEXT    NOT NULL DEFAULT '[]',
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (page_slug, eid)
);

CREATE TABLE gallery_images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  gallery_id  INTEGER NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,

  -- The upload path, exactly as the block stores it: /wp-content/uploads/...
  -- The image host rewrite and the thumbnail choice both happen at render, so
  -- what is kept here is the file, not one particular way of serving it.
  src         TEXT    NOT NULL,
  title       TEXT,
  alt         TEXT,
  -- Which filter tab it belongs to; matches a `filters[].index` on the gallery.
  tag         TEXT,

  position    INTEGER NOT NULL,
  -- Take a picture off the site without losing its alt text and its place.
  hidden      INTEGER NOT NULL DEFAULT 0,

  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Every read is "one gallery, in order".
CREATE INDEX gallery_images_gallery ON gallery_images (gallery_id, position);
