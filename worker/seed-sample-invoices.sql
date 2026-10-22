-- Five sample clients with one invoice each (Colors Common Services products, INR).
-- Safe to re-run: removes prior seed invoices and seed clients only.

DELETE FROM invoice_items WHERE invoice_id IN (
  SELECT id FROM invoices WHERE invoice_number IN ('INV-001', 'INV-002', 'INV-003', 'INV-004', 'INV-005')
);
DELETE FROM invoices WHERE invoice_number IN ('INV-001', 'INV-002', 'INV-003', 'INV-004', 'INV-005');

DELETE FROM clients WHERE email LIKE '%@sample.local';

INSERT INTO clients (name, company, email, phone, status) VALUES
  ('Manager', 'Main counter', 'manager@sample.local', '+917530051393', 'active'),
  ('Anitha R', NULL, 'anitha@sample.local', '+919800000001', 'active'),
  ('Balaji Traders', 'Balaji Traders', 'balaji@sample.local', '+919800000002', 'active'),
  ('Madukkur School', 'School office', 'school@sample.local', '+919800000003', 'active'),
  ('Vijay', NULL, 'vijay@sample.local', '+919800000004', 'active');

INSERT INTO invoices (client_id, invoice_number, issue_date, due_date, status, tax_rate, currency, notes)
SELECT c.id, 'INV-001', date('now', '-12 days'), date('now', '-5 days'), 'paid', 0, 'INR', 'Photo copies — paid at counter'
FROM clients c WHERE c.email = 'manager@sample.local';

INSERT INTO invoices (client_id, invoice_number, issue_date, due_date, status, tax_rate, currency, notes)
SELECT c.id, 'INV-002', date('now', '-7 days'), date('now', '+7 days'), 'sent', 0, 'INR', 'Printout job'
FROM clients c WHERE c.email = 'anitha@sample.local';

INSERT INTO invoices (client_id, invoice_number, issue_date, due_date, status, tax_rate, currency, notes)
SELECT c.id, 'INV-003', date('now', '-3 days'), date('now', '+11 days'), 'sent', 0, 'INR', 'Double photo copies'
FROM clients c WHERE c.email = 'balaji@sample.local';

INSERT INTO invoices (client_id, invoice_number, issue_date, due_date, status, tax_rate, currency, notes)
SELECT c.id, 'INV-004', date('now', '-1 days'), date('now', '+13 days'), 'draft', 0, 'INR', 'CITTA printouts — draft'
FROM clients c WHERE c.email = 'school@sample.local';

INSERT INTO invoices (client_id, invoice_number, issue_date, due_date, status, tax_rate, currency, notes)
SELECT c.id, 'INV-005', date('now', '-20 days'), date('now', '-2 days'), 'sent', 0, 'INR', 'Mixed services — follow up payment'
FROM clients c WHERE c.email = 'vijay@sample.local';

INSERT INTO invoice_items (invoice_id, description, quantity, rate)
SELECT i.id, 'A4 Photo Copy', 20, 2.50 FROM invoices i WHERE i.invoice_number = 'INV-001';

INSERT INTO invoice_items (invoice_id, description, quantity, rate)
SELECT i.id, 'A4 Printout', 8, 7.00 FROM invoices i WHERE i.invoice_number = 'INV-002';

INSERT INTO invoice_items (invoice_id, description, quantity, rate)
SELECT i.id, 'A4 Double Photo Copy', 15, 5.00 FROM invoices i WHERE i.invoice_number = 'INV-003';

INSERT INTO invoice_items (invoice_id, description, quantity, rate)
SELECT i.id, 'A4 Printout CITTA', 6, 15.00 FROM invoices i WHERE i.invoice_number = 'INV-004';

INSERT INTO invoice_items (invoice_id, description, quantity, rate)
SELECT i.id, 'A4 Photo Copy', 10, 2.50 FROM invoices i WHERE i.invoice_number = 'INV-005';
INSERT INTO invoice_items (invoice_id, description, quantity, rate)
SELECT i.id, 'A4 Printout', 4, 7.00 FROM invoices i WHERE i.invoice_number = 'INV-005';
