-- Workspace default currency for new documents (does not rewrite existing records)
ALTER TABLE user_profile ADD COLUMN default_currency TEXT NOT NULL DEFAULT 'USD';

-- Persist currency on invoices so historical amounts keep their currency
ALTER TABLE invoices ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';
