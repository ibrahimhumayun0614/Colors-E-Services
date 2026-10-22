-- Company letterhead fields for invoices
ALTER TABLE user_profile ADD COLUMN company_name TEXT;
ALTER TABLE user_profile ADD COLUMN phone TEXT;
ALTER TABLE user_profile ADD COLUMN address TEXT;
ALTER TABLE user_profile ADD COLUMN city TEXT;
ALTER TABLE user_profile ADD COLUMN state TEXT;
ALTER TABLE user_profile ADD COLUMN zip TEXT;
ALTER TABLE user_profile ADD COLUMN tax_id TEXT;
ALTER TABLE user_profile ADD COLUMN logo_data TEXT;

-- Client mailing address for invoice "Bill To"
ALTER TABLE clients ADD COLUMN address TEXT;
ALTER TABLE clients ADD COLUMN city TEXT;
ALTER TABLE clients ADD COLUMN state TEXT;
ALTER TABLE clients ADD COLUMN zip TEXT;
