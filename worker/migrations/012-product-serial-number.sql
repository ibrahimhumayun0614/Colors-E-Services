ALTER TABLE products ADD COLUMN serial_number TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_serial ON products(serial_number);
