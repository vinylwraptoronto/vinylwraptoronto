-- Site settings, editable from /admin/settings/.
--
-- Applied 2026-09-05, after 0006.
--
-- Key/value rather than a column per setting: these are read as a whole, all
-- at once, at build time, and a new setting should not need a migration.
-- Validation lives in src/lib/settings.ts, which declares every key it knows
-- about; a row with an unknown key is ignored rather than trusted.
--
-- Nothing is seeded. An absent row means "use the default in src/data/site.ts",
-- so the built site is byte-identical until someone actually changes something,
-- and a setting reset to blank goes back to the default rather than emptying
-- the footer on 1,620 pages.

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
);
