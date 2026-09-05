-- Admin authentication for /admin.
--
-- Applied 2026-09-05, after 0003.
--
-- Passwords are never stored. `password_hash` holds a self-describing PBKDF2
-- string:
--
--     pbkdf2$sha256$<iterations>$<salt-base64>$<derived-key-base64>
--
-- carrying its own cost parameter so the iteration count can be raised later
-- without invalidating existing hashes -- an old hash still verifies at its own
-- cost, and is rewritten at the new one on the next successful login.
--
-- Timestamps here are TEXT written and compared with SQLite's own
-- datetime('now'), the same convention as 0001. That matters more than usual:
-- session expiry is a security boundary, so every value is produced by one
-- clock in one format, and never assembled in JavaScript where a format or
-- timezone mismatch would compare lexicographically and silently pass.

PRAGMA foreign_keys = ON;

CREATE TABLE admin_users (
  id                   INTEGER PRIMARY KEY,
  -- NOCASE so "Paolo" and "paolo" are the same account and cannot both exist.
  username             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash        TEXT NOT NULL,
  -- Set on a seeded or reset account: the holder must choose a new password
  -- before anything else in /admin will answer.
  must_change_password INTEGER NOT NULL DEFAULT 0,
  disabled             INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  password_changed_at  TEXT,
  last_login_at        TEXT
);

-- The cookie carries a random token; this table stores only its SHA-256. A
-- leaked copy of the database therefore does not hand over live sessions.
CREATE TABLE admin_sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  -- Per-session CSRF token. Every state-changing POST must present it.
  csrf_token   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL,
  ip           TEXT,
  user_agent   TEXT
);

CREATE INDEX idx_admin_sessions_user   ON admin_sessions(user_id);
CREATE INDEX idx_admin_sessions_expiry ON admin_sessions(expires_at);

-- Every login attempt, successful or not. Two jobs: rate limiting, and an
-- audit trail of who signed in from where.
CREATE TABLE admin_login_attempts (
  id       INTEGER PRIMARY KEY,
  username TEXT,
  ip       TEXT,
  ok       INTEGER NOT NULL,
  reason   TEXT,
  at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_admin_attempts_user ON admin_login_attempts(username, at);
CREATE INDEX idx_admin_attempts_ip   ON admin_login_attempts(ip, at);
