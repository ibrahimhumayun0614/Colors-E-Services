-- Workspace profile (single admin user for this personal CRM)
CREATE TABLE IF NOT EXISTS user_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT 'Admin User',
  email TEXT NOT NULL DEFAULT 'admin@crm.local',
  role TEXT NOT NULL DEFAULT 'Admin',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO user_profile (id, name, email, role)
VALUES (1, 'Admin User', 'admin@crm.local', 'Admin');
