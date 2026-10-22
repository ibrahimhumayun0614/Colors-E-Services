-- Which profile bank account is used on this invoice + snapshot for PDF/history
ALTER TABLE invoices ADD COLUMN bank_account_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN payment_account TEXT;
