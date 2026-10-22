-- Per-line service/date on invoice items (shown in invoice table).
ALTER TABLE invoice_items ADD COLUMN line_date TEXT;
