-- Demo data for optional load via Settings → Data (or manual CI seed).
-- Safe to re-run — only removes @demo.local clients and related records.
DELETE FROM invoice_items WHERE invoice_id IN (
  SELECT id FROM invoices WHERE client_id IN (SELECT id FROM clients WHERE email LIKE '%@demo.local')
);
DELETE FROM invoices WHERE client_id IN (SELECT id FROM clients WHERE email LIKE '%@demo.local');
DELETE FROM services WHERE client_id IN (SELECT id FROM clients WHERE email LIKE '%@demo.local');
DELETE FROM tasks WHERE client_id IN (SELECT id FROM clients WHERE email LIKE '%@demo.local') OR title LIKE '%[demo]%';
DELETE FROM clients WHERE email LIKE '%@demo.local';

-- Clients (10 demo accounts)
INSERT INTO clients (name, company, email, phone, status, notes) VALUES
  ('Sarah Mitchell', 'Acme Corp', 'sarah@demo.local', '+1 555-0101', 'active', 'Monthly retainer client. Prefers email contact.'),
  ('James Okonkwo', 'GreenLeaf Studio', 'james@demo.local', '+1 555-0102', 'active', 'E-commerce site + hosting managed.'),
  ('Priya Sharma', 'TechStart Ltd', 'priya@demo.local', '+1 555-0103', 'lead', 'Interested in website redesign quote.'),
  ('Michael Chen', 'Old Client Co', 'michael@demo.local', '+1 555-0104', 'inactive', 'Project completed 2024. No active work.'),
  ('Elena Rodriguez', 'Bella Vista Restaurant', 'elena@demo.local', '+1 555-0105', 'active', 'Menu updates monthly. Uses Square for POS.'),
  ('David Kim', 'FlowStack SaaS', 'david@demo.local', '+1 555-0106', 'active', 'Next.js app on Vercel. Quarterly security audits.'),
  ('Fatima Al-Hassan', 'Horizon Consulting', 'fatima@demo.local', '+1 555-0107', 'lead', 'Requested proposal for brand + website package.'),
  ('Robert Novak', 'Novak Legal Group', 'robert@demo.local', '+1 555-0108', 'active', 'Two firm sites. Strict uptime requirements.'),
  ('Aisha Patel', 'Bright Future Foundation', 'aisha@demo.local', '+1 555-0109', 'active', 'Nonprofit — discounted rate. Annual grant reporting site.'),
  ('Tom Williams', 'Williams Photography', 'tom@demo.local', '+1 555-0110', 'inactive', 'Portfolio archived. Domain transferred to client.');

-- Services (domain/hosting migrated from legacy websites)
INSERT INTO services (client_id, service_type, name, status, billing_cycle, amount, url, registrar, domain_expiry, hosting_provider, hosting_expiry, cms, notes)
SELECT id, 'domain_hosting', 'Acme Main Site', 'active', 'monthly', 25, 'https://acmecorp-demo.com', 'Namecheap', '2026-06-28', 'Cloudflare', '2026-09-15', 'WordPress', 'wp-admin credentials in vault'
FROM clients WHERE email = 'sarah@demo.local';

INSERT INTO services (client_id, service_type, name, status, billing_cycle, amount, url, registrar, domain_expiry, hosting_expiry, cms, notes)
SELECT id, 'domain_hosting', 'Acme Blog', 'active', 'monthly', 10, 'https://blog.acmecorp-demo.com', 'Namecheap', '2026-12-01', '2026-12-01', 'WordPress', NULL
FROM clients WHERE email = 'sarah@demo.local';

INSERT INTO services (client_id, service_type, name, status, billing_cycle, amount, url, registrar, domain_expiry, hosting_provider, hosting_expiry, cms, notes)
SELECT id, 'domain_hosting', 'GreenLeaf Shop', 'active', 'monthly', 45, 'https://greenleaf-demo.com', 'GoDaddy', '2026-07-05', 'Hostinger', '2026-07-05', 'Shopify', 'Shopify + custom theme'
FROM clients WHERE email = 'james@demo.local';

INSERT INTO services (client_id, service_type, name, status, billing_cycle, amount, url, registrar, domain_expiry, hosting_provider, hosting_expiry, cms, notes)
SELECT id, 'domain_hosting', 'TechStart Landing', 'lead', 'monthly', 0, 'https://techstart-demo.com', 'Google Domains', '2026-11-20', 'Vercel', '2026-11-20', 'Next.js', 'Lead — site not live yet'
FROM clients WHERE email = 'priya@demo.local';

INSERT INTO services (client_id, service_type, name, status, billing_cycle, amount, url, registrar, domain_expiry, hosting_provider, hosting_expiry, cms, notes)
SELECT id, 'domain_hosting', 'Bella Vista Menu Site', 'active', 'monthly', 35, 'https://bellavista-demo.com', 'GoDaddy', '2026-06-25', 'WP Engine', '2026-08-20', 'WordPress', 'Seasonal menu PDF downloads'
FROM clients WHERE email = 'elena@demo.local';

INSERT INTO services (client_id, service_type, name, status, billing_cycle, amount, url, registrar, domain_expiry, hosting_provider, hosting_expiry, cms, notes)
SELECT id, 'domain_hosting', 'FlowStack App', 'active', 'monthly', 20, 'https://app.flowstack-demo.com', 'Cloudflare', '2027-01-15', 'Vercel', '2027-01-15', 'Next.js', 'Production + staging environments'
FROM clients WHERE email = 'david@demo.local';

INSERT INTO services (client_id, service_type, name, status, billing_cycle, amount, url, registrar, domain_expiry, hosting_provider, hosting_expiry, cms, notes)
SELECT id, 'domain_hosting', 'FlowStack Marketing', 'active', 'none', 0, 'https://flowstack-demo.com', 'Cloudflare', '2026-09-01', 'Vercel', '2026-09-01', 'Next.js', 'Marketing landing page'
FROM clients WHERE email = 'david@demo.local';

INSERT INTO services (client_id, service_type, name, status, billing_cycle, amount, url, registrar, domain_expiry, hosting_provider, hosting_expiry, cms, notes)
SELECT id, 'domain_hosting', 'Horizon Consulting', 'lead', 'monthly', 15, 'https://horizon-demo.com', 'Namecheap', '2026-10-30', 'SiteGround', '2026-10-30', 'WordPress', 'Lead — staging only'
FROM clients WHERE email = 'fatima@demo.local';

INSERT INTO services (client_id, service_type, name, status, billing_cycle, amount, url, registrar, domain_expiry, hosting_provider, hosting_expiry, cms, notes)
SELECT id, 'domain_hosting', 'Novak Legal Main', 'active', 'monthly', 55, 'https://novaklegal-demo.com', 'Network Solutions', '2026-07-12', 'Kinsta', '2026-07-12', 'WordPress', 'Attorney bios + case results'
FROM clients WHERE email = 'robert@demo.local';

INSERT INTO services (client_id, service_type, name, status, billing_cycle, amount, url, registrar, domain_expiry, hosting_provider, hosting_expiry, cms, notes)
SELECT id, 'domain_hosting', 'Novak Client Portal', 'active', 'monthly', 30, 'https://portal.novaklegal-demo.com', 'Network Solutions', '2026-07-12', 'Kinsta', '2026-07-12', 'Custom', 'Secure client document upload'
FROM clients WHERE email = 'robert@demo.local';

INSERT INTO services (client_id, service_type, name, status, billing_cycle, amount, url, registrar, domain_expiry, hosting_provider, hosting_expiry, cms, notes)
SELECT id, 'domain_hosting', 'Bright Future Home', 'active', 'monthly', 18, 'https://brightfuture-demo.org', 'Google Domains', '2026-08-05', 'DreamHost', '2026-08-05', 'WordPress', 'Donation widget + event calendar'
FROM clients WHERE email = 'aisha@demo.local';

INSERT INTO services (client_id, service_type, name, status, billing_cycle, amount, url, registrar, domain_expiry, hosting_provider, hosting_expiry, cms, notes)
SELECT id, 'domain_hosting', 'Williams Portfolio', 'completed', 'none', 0, 'https://williamsphoto-demo.com', 'Namecheap', '2025-12-01', 'Bluehost', '2025-12-01', 'Squarespace', 'Archived — client self-hosts now'
FROM clients WHERE email = 'tom@demo.local';

-- Additional service types
INSERT INTO services (client_id, service_type, name, status, billing_cycle, amount, url, cms, next_due_date, notes)
SELECT id, 'website_maintenance', 'Acme Monthly Maintenance', 'active', 'monthly', 350, 'https://acmecorp-demo.com', 'WordPress', date('now', '+14 days'), 'Plugin updates + backups'
FROM clients WHERE email = 'sarah@demo.local';

INSERT INTO services (client_id, service_type, name, status, billing_cycle, amount, url, cms, next_due_date, notes)
SELECT id, 'website_maintenance', 'FlowStack Q2 Maintenance', 'active', 'quarterly', 900, 'https://app.flowstack-demo.com', 'Next.js', date('now', '+21 days'), 'Security audits + dependency updates'
FROM clients WHERE email = 'david@demo.local';

INSERT INTO services (client_id, service_type, name, status, billing_cycle, amount, deliverables, notes)
SELECT id, 'logo_design', 'Horizon Brand Package', 'lead', 'one_time', 2500, 'Primary logo, icon set, brand colors', 'Discovery phase — awaiting sign-off'
FROM clients WHERE email = 'fatima@demo.local';

INSERT INTO services (client_id, service_type, name, status, billing_cycle, amount, deliverables, notes)
SELECT id, 'content_writing', 'Bella Vista Seasonal Copy', 'active', 'one_time', 180, 'Summer menu descriptions + hero copy', 'Delivered for June menu launch'
FROM clients WHERE email = 'elena@demo.local';

INSERT INTO services (client_id, service_type, name, status, billing_cycle, amount, email_provider, email_accounts, notes)
SELECT id, 'email_configuration', 'Novak Google Workspace', 'active', 'annual', 720, 'Google Workspace', 'info@novaklegal-demo.com, intake@novaklegal-demo.com', 'MX + SPF/DKIM configured'
FROM clients WHERE email = 'robert@demo.local';

-- Invoices
INSERT INTO invoices (client_id, invoice_number, issue_date, due_date, status, tax_rate, notes)
SELECT id, 'INV-001', '2026-06-01', '2026-06-15', 'overdue', 0, 'June maintenance'
FROM clients WHERE email = 'sarah@demo.local';

INSERT INTO invoices (client_id, invoice_number, issue_date, due_date, status, tax_rate, notes)
SELECT id, 'INV-002', '2026-06-10', '2026-07-10', 'sent', 10, 'Hosting + support'
FROM clients WHERE email = 'james@demo.local';

INSERT INTO invoices (client_id, invoice_number, issue_date, due_date, status, tax_rate, notes)
SELECT id, 'INV-003', '2026-05-01', '2026-05-15', 'paid', 0, NULL
FROM clients WHERE email = 'sarah@demo.local';

INSERT INTO invoices (client_id, invoice_number, issue_date, due_date, status, tax_rate, notes)
SELECT id, 'INV-004', '2026-06-18', '2026-07-02', 'draft', 0, 'Pending review'
FROM clients WHERE email = 'james@demo.local';

INSERT INTO invoices (client_id, invoice_number, issue_date, due_date, status, tax_rate, notes)
SELECT id, 'INV-005', '2026-06-05', '2026-06-20', 'overdue', 0, 'Menu update + hosting'
FROM clients WHERE email = 'elena@demo.local';

INSERT INTO invoices (client_id, invoice_number, issue_date, due_date, status, tax_rate, notes)
SELECT id, 'INV-006', '2026-06-12', '2026-07-12', 'sent', 0, 'Q2 maintenance retainer'
FROM clients WHERE email = 'david@demo.local';

INSERT INTO invoices (client_id, invoice_number, issue_date, due_date, status, tax_rate, notes)
SELECT id, 'INV-007', '2026-06-01', '2026-06-30', 'paid', 0, 'May legal site updates'
FROM clients WHERE email = 'robert@demo.local';

INSERT INTO invoices (client_id, invoice_number, issue_date, due_date, status, tax_rate, notes)
SELECT id, 'INV-008', '2026-06-15', '2026-07-15', 'sent', 0, 'Nonprofit hosting + support'
FROM clients WHERE email = 'aisha@demo.local';

INSERT INTO invoices (client_id, invoice_number, issue_date, due_date, status, tax_rate, notes)
SELECT id, 'INV-009', '2026-06-20', '2026-07-04', 'draft', 0, 'Proposal deposit — pending signature'
FROM clients WHERE email = 'fatima@demo.local';

INSERT INTO invoices (client_id, invoice_number, issue_date, due_date, status, tax_rate, notes)
SELECT id, 'INV-010', '2026-04-01', '2026-04-15', 'paid', 0, 'Final project invoice'
FROM clients WHERE email = 'tom@demo.local';

-- Invoice line items
INSERT INTO invoice_items (invoice_id, description, quantity, rate)
SELECT i.id, 'Website maintenance — June', 1, 350
FROM invoices i JOIN clients c ON c.id = i.client_id WHERE c.email = 'sarah@demo.local' AND i.invoice_number = 'INV-001';

INSERT INTO invoice_items (invoice_id, description, quantity, rate)
SELECT i.id, 'Hosting management', 1, 120
FROM invoices i JOIN clients c ON c.id = i.client_id WHERE c.email = 'james@demo.local' AND i.invoice_number = 'INV-002';

INSERT INTO invoice_items (invoice_id, description, quantity, rate)
SELECT i.id, 'SSL renewal', 1, 50
FROM invoices i JOIN clients c ON c.id = i.client_id WHERE c.email = 'james@demo.local' AND i.invoice_number = 'INV-002';

INSERT INTO invoice_items (invoice_id, description, quantity, rate)
SELECT i.id, 'Website maintenance — May', 1, 350
FROM invoices i JOIN clients c ON c.id = i.client_id WHERE c.email = 'sarah@demo.local' AND i.invoice_number = 'INV-003';

INSERT INTO invoice_items (invoice_id, description, quantity, rate)
SELECT i.id, 'Plugin updates & backups', 1, 200
FROM invoices i JOIN clients c ON c.id = i.client_id WHERE c.email = 'james@demo.local' AND i.invoice_number = 'INV-004';

INSERT INTO invoice_items (invoice_id, description, quantity, rate)
SELECT i.id, 'Seasonal menu update', 1, 180
FROM invoices i JOIN clients c ON c.id = i.client_id WHERE c.email = 'elena@demo.local' AND i.invoice_number = 'INV-005';

INSERT INTO invoice_items (invoice_id, description, quantity, rate)
SELECT i.id, 'Hosting — June', 1, 35
FROM invoices i JOIN clients c ON c.id = i.client_id WHERE c.email = 'elena@demo.local' AND i.invoice_number = 'INV-005';

INSERT INTO invoice_items (invoice_id, description, quantity, rate)
SELECT i.id, 'Quarterly maintenance', 1, 900
FROM invoices i JOIN clients c ON c.id = i.client_id WHERE c.email = 'david@demo.local' AND i.invoice_number = 'INV-006';

INSERT INTO invoice_items (invoice_id, description, quantity, rate)
SELECT i.id, 'Security patch deployment', 1, 250
FROM invoices i JOIN clients c ON c.id = i.client_id WHERE c.email = 'david@demo.local' AND i.invoice_number = 'INV-006';

INSERT INTO invoice_items (invoice_id, description, quantity, rate)
SELECT i.id, 'Attorney profile updates', 1, 420
FROM invoices i JOIN clients c ON c.id = i.client_id WHERE c.email = 'robert@demo.local' AND i.invoice_number = 'INV-007';

INSERT INTO invoice_items (invoice_id, description, quantity, rate)
SELECT i.id, 'Portal uptime monitoring', 1, 85
FROM invoices i JOIN clients c ON c.id = i.client_id WHERE c.email = 'robert@demo.local' AND i.invoice_number = 'INV-007';

INSERT INTO invoice_items (invoice_id, description, quantity, rate)
SELECT i.id, 'Hosting & monthly support', 1, 120
FROM invoices i JOIN clients c ON c.id = i.client_id WHERE c.email = 'aisha@demo.local' AND i.invoice_number = 'INV-008';

INSERT INTO invoice_items (invoice_id, description, quantity, rate)
SELECT i.id, 'Event calendar setup', 1, 150
FROM invoices i JOIN clients c ON c.id = i.client_id WHERE c.email = 'aisha@demo.local' AND i.invoice_number = 'INV-008';

INSERT INTO invoice_items (invoice_id, description, quantity, rate)
SELECT i.id, 'Brand + website discovery', 1, 500
FROM invoices i JOIN clients c ON c.id = i.client_id WHERE c.email = 'fatima@demo.local' AND i.invoice_number = 'INV-009';

INSERT INTO invoice_items (invoice_id, description, quantity, rate)
SELECT i.id, 'Portfolio handoff & archive', 1, 275
FROM invoices i JOIN clients c ON c.id = i.client_id WHERE c.email = 'tom@demo.local' AND i.invoice_number = 'INV-010';

-- Tasks
INSERT INTO tasks (client_id, title, description, due_date, priority, status)
SELECT id, 'Follow up on renewal quote', 'Send domain renewal pricing before expiry.', date('now', '+2 days'), 'high', 'open'
FROM clients WHERE email = 'sarah@demo.local';

INSERT INTO tasks (client_id, title, description, due_date, priority, status)
SELECT id, 'Deploy plugin updates', NULL, date('now'), 'medium', 'open'
FROM clients WHERE email = 'james@demo.local';

INSERT INTO tasks (client_id, title, description, due_date, priority, status, completed_at)
SELECT id, 'Send proposal PDF', 'Brand + website package for Horizon.', date('now', '-3 days'), 'high', 'done', datetime('now', '-1 days')
FROM clients WHERE email = 'fatima@demo.local';

INSERT INTO tasks (client_id, title, description, due_date, priority, status)
SELECT id, 'Review overdue invoice', 'INV-001 is past due — follow up with Sarah.', date('now', '-2 days'), 'high', 'open'
FROM clients WHERE email = 'sarah@demo.local';

INSERT INTO tasks (client_id, title, description, due_date, priority, status)
SELECT id, 'Prepare Q3 maintenance report', NULL, date('now', '+7 days'), 'low', 'open'
FROM clients WHERE email = 'david@demo.local';

INSERT INTO tasks (client_id, title, description, due_date, priority, status)
SELECT id, 'Update seasonal menu', 'Bella Vista new summer menu live by Friday.', date('now', '+1 days'), 'medium', 'open'
FROM clients WHERE email = 'elena@demo.local';

INSERT INTO tasks (client_id, title, description, due_date, priority, status)
VALUES (NULL, '[demo] Review monthly hosting costs', 'Compare provider pricing across all clients.', date('now', '+5 days'), 'low', 'open');
