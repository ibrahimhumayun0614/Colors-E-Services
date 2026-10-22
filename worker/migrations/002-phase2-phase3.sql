-- One-time migration for existing databases (run via workflow_dispatch or wrangler d1 execute)
-- Adds service links and removes legacy websites table.

ALTER TABLE tasks ADD COLUMN service_id INTEGER REFERENCES services(id) ON DELETE SET NULL;
ALTER TABLE invoice_items ADD COLUMN service_id INTEGER REFERENCES services(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_service ON tasks(service_id);
DROP TABLE IF EXISTS websites;
