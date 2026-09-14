-- Quote form submissions.
--
-- Applied 2026-09-14, after 0012.
--
-- Until now a submission existed only as an email. If Resend was unreachable,
-- or its two secrets were not set, the endpoint returned 503 and told the
-- visitor to phone instead -- and the enquiry was gone. For a business whose
-- entire site exists to collect these, losing one to a third party's bad
-- afternoon is the expensive failure. The row is now written first, and the
-- email becomes a notification about a record that already exists rather than
-- the only copy of it.
--
-- This lives in the same database as the blog because it is the site's one
-- database; the `-blog` in its name is historic. It already holds admin_users
-- and admin_sessions, so personal data is not new to it.
--
-- Photographs are NOT stored here. D1 is SQLite with a 1MB ceiling per row,
-- and these uploads run to several megabytes; the files stay on the email as
-- attachments and only their names and sizes are recorded, so the row says
-- what was sent without pretending to hold it. Retaining the files themselves
-- needs R2, which is a separate decision.
--
-- Everything the form can send has a column, including `product`, which is the
-- field the Limited Time Offer variant sends instead of a vehicle type.

CREATE TABLE quote_submissions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),

  name           TEXT    NOT NULL,
  email          TEXT    NOT NULL,
  phone          TEXT    NOT NULL,
  wrap_type      TEXT,
  vehicle_type   TEXT,
  product        TEXT,
  message        TEXT,

  -- JSON array of {name, size, type}. See the note above: names only.
  photos         TEXT    NOT NULL DEFAULT '[]',
  photo_count    INTEGER NOT NULL DEFAULT 0,

  -- Where it came from, which is what tells the client which page earns them
  -- work. Kept deliberately small: the page and the coarse request identity,
  -- nothing that amounts to tracking a person across the site.
  source_page    TEXT,
  ip             TEXT,
  user_agent     TEXT,

  -- Whether the notification email actually went out. A row with delivered = 0
  -- and an error is an enquiry nobody has been told about, which is exactly the
  -- case that used to vanish, so /admin/quotes/ leads with it.
  delivered      INTEGER NOT NULL DEFAULT 0,
  delivered_at   TEXT,
  delivery_error TEXT,

  -- Set when someone opens it in /admin. Null means nobody has looked yet.
  read_at        TEXT
);

-- The list is always newest-first, and the unread/undelivered filters are the
-- two that matter operationally.
CREATE INDEX quote_submissions_created ON quote_submissions (created_at DESC);
CREATE INDEX quote_submissions_delivered ON quote_submissions (delivered, created_at DESC);
CREATE INDEX quote_submissions_read ON quote_submissions (read_at, created_at DESC);
