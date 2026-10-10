-- Before/after pairs added from /admin/before-after/.
--
-- Applied 2026-10-10, after 0015.
--
-- /our-work/ shows 69 before/after sliders, each a card with the pair, a title
-- linking to its project page and, on most, a View Pictures button. Those 69
-- stay in the page data they were ported in. Pairs added from the admin live
-- here, and the build puts them in front of the 69, drawn as the same cards
-- (src/lib/before-after.ts).
--
-- `href` is optional: a pair added without a project page shows its title
-- unlinked and no button. Sizes are read from the files at upload, so each
-- picture reserves its box before it arrives, as the 69 do from img-dims.json.

CREATE TABLE before_after (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  page_slug   TEXT    NOT NULL DEFAULT 'our-work',
  title       TEXT    NOT NULL,
  href        TEXT,
  before_src  TEXT    NOT NULL,
  before_alt  TEXT,
  before_w    INTEGER,
  before_h    INTEGER,
  after_src   TEXT    NOT NULL,
  after_alt   TEXT,
  after_w     INTEGER,
  after_h     INTEGER,
  position    INTEGER NOT NULL,
  hidden      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_before_after_page ON before_after (page_slug, position);
