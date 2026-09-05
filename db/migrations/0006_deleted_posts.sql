-- Applied 2026-09-05, after 0005.
--
-- Where a deleted post goes.
--
-- post_revisions cascades away with the post, so on its own it is no help
-- after a delete: the moment you need the history most is the moment it would
-- be gone. This table does not reference posts(id), deliberately, so the row
-- survives the delete that created it.
--
-- The admin offers no undo -- restoring is a deliberate act by someone with
-- database access -- but deleting one of the 478 imported pages should never
-- be silent and unrecoverable.

CREATE TABLE deleted_posts (
  id            INTEGER PRIMARY KEY,
  post_id       INTEGER NOT NULL,
  slug          TEXT NOT NULL,
  title         TEXT,
  snapshot_json TEXT NOT NULL,
  deleted_by    INTEGER,
  deleted_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_deleted_posts_slug ON deleted_posts(slug);
