-- Invoice letterhead: website + bank / UPI payment details
ALTER TABLE user_profile ADD COLUMN website TEXT;
ALTER TABLE user_profile ADD COLUMN bank_account TEXT;
ALTER TABLE user_profile ADD COLUMN bank_name TEXT;
ALTER TABLE user_profile ADD COLUMN bank_ifsc TEXT;
ALTER TABLE user_profile ADD COLUMN bank_account_name TEXT;
ALTER TABLE user_profile ADD COLUMN upi_id TEXT;
ALTER TABLE user_profile ADD COLUMN payment_method TEXT;
