export const APP_NAME = 'Colors Common Services';
export const APP_TAGLINE = 'Invoice management';
export const APP_DESCRIPTION = 'Billing, payments, and customer invoices for the shop.';

/** Default “bill from” / letterhead on invoices and profile. */
export const SHOP_BILLING_DEFAULTS = {
  name: APP_NAME,
  company_name: APP_NAME,
  email: 'ccsmkr@gmail.com',
  phone: '+917530051393',
  address: '331, Sameer Complex, Main Road',
  city: 'Madukkur',
  state: null as string | null,
  zip: null as string | null,
  default_currency: 'INR' as const,
};
