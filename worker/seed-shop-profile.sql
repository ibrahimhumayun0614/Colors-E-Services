-- Invoice "bill from" defaults for Colors Common Services. Safe to re-run.
UPDATE user_profile SET
  name = 'Colors Common Services',
  company_name = 'Colors Common Services',
  email = 'ccsmkr@gmail.com',
  phone = '+917530051393',
  address = '331, Sameer Complex, Main Road',
  city = 'Madukkur',
  state = NULL,
  zip = NULL,
  default_currency = 'INR',
  updated_at = datetime('now')
WHERE id = 1;
