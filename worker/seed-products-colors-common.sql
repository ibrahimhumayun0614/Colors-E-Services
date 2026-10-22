-- Colors Common Services — standard copy/print products (INR). Safe to re-run.
DELETE FROM products;

INSERT INTO products (serial_number, name, unit_price, currency, is_active) VALUES
  ('1', 'A4 Photo Copy', 2.50, 'INR', 1),
  ('2', 'A4 Double Photo Copy', 5.00, 'INR', 1),
  ('3', 'A4 Printout', 7.00, 'INR', 1),
  ('4', 'A4 Printout CITTA', 15.00, 'INR', 1);

