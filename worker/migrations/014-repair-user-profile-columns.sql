-- Repair: profile columns missing when 003 created user_profile before schema.sql on a fresh database
ALTER TABLE user_profile ADD COLUMN default_currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE user_profile ADD COLUMN company_name TEXT;
ALTER TABLE user_profile ADD COLUMN phone TEXT;
ALTER TABLE user_profile ADD COLUMN address TEXT;
ALTER TABLE user_profile ADD COLUMN city TEXT;
ALTER TABLE user_profile ADD COLUMN state TEXT;
ALTER TABLE user_profile ADD COLUMN zip TEXT;
ALTER TABLE user_profile ADD COLUMN tax_id TEXT;
ALTER TABLE user_profile ADD COLUMN logo_data TEXT;
ALTER TABLE user_profile ADD COLUMN website TEXT;
ALTER TABLE user_profile ADD COLUMN bank_account TEXT;
ALTER TABLE user_profile ADD COLUMN bank_name TEXT;
ALTER TABLE user_profile ADD COLUMN bank_ifsc TEXT;
ALTER TABLE user_profile ADD COLUMN bank_account_name TEXT;
ALTER TABLE user_profile ADD COLUMN upi_id TEXT;
ALTER TABLE user_profile ADD COLUMN payment_method TEXT;
