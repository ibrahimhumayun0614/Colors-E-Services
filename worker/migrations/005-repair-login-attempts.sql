-- Repair: login fails with 500 if this table is missing
CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt TEXT NOT NULL DEFAULT (datetime('now')),
  blocked_until TEXT
);
