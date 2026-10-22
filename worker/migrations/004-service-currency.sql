-- Per-service billing currency (ISO 4217)
ALTER TABLE services ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';
