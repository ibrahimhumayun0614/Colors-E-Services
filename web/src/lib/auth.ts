import type { BankAccount } from './bank-accounts';
import { SHOP_BILLING_DEFAULTS } from './branding';

const SESSION_KEY = 'crm_session';
const LAST_LOGIN_KEY = 'crm_last_login';
const PROFILE_KEY = 'crm_user_profile';

/** Browser cache of the server-synced workspace profile. */
export type UserProfile = {
  name: string;
  email: string;
  role: string;
  default_currency: string;
  company_name?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  tax_id?: string | null;
  logo_data?: string | null;
  website?: string | null;
  bank_account?: string | null;
  bank_name?: string | null;
  bank_ifsc?: string | null;
  bank_account_name?: string | null;
  upi_id?: string | null;
  payment_method?: string | null;
  bank_accounts?: BankAccount[] | null;
};

const defaultProfile: UserProfile = {
  name: SHOP_BILLING_DEFAULTS.name,
  email: SHOP_BILLING_DEFAULTS.email,
  role: 'Admin',
  default_currency: SHOP_BILLING_DEFAULTS.default_currency,
  company_name: SHOP_BILLING_DEFAULTS.company_name,
  phone: SHOP_BILLING_DEFAULTS.phone,
  address: SHOP_BILLING_DEFAULTS.address,
  city: SHOP_BILLING_DEFAULTS.city,
  state: SHOP_BILLING_DEFAULTS.state,
  zip: SHOP_BILLING_DEFAULTS.zip,
  tax_id: null,
  logo_data: null,
  website: null,
  bank_account: null,
  bank_name: null,
  bank_ifsc: null,
  bank_account_name: null,
  upi_id: null,
  payment_method: null,
  bank_accounts: [],
};

export function getUserProfile(): UserProfile {
  try {
    const stored = localStorage.getItem(PROFILE_KEY);
    return stored ? { ...defaultProfile, ...JSON.parse(stored) } : defaultProfile;
  } catch {
    return defaultProfile;
  }
}

export function setUserProfile(profile: Partial<UserProfile>) {
  const next = { ...getUserProfile(), ...profile };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  return next;
}

export function setLastLogin(date = new Date()) {
  localStorage.setItem(LAST_LOGIN_KEY, date.toISOString());
}

export function getLastLogin(): Date | null {
  const value = localStorage.getItem(LAST_LOGIN_KEY);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getSessionToken(): string | null {
  // Legacy versions stored the raw API password — clear so users re-authenticate.
  localStorage.removeItem('crm_api_secret');
  return sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);
}

export function setSessionToken(token: string, remember: boolean) {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);

  if (remember) {
    localStorage.setItem(SESSION_KEY, token);
  } else {
    sessionStorage.setItem(SESSION_KEY, token);
  }
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
  // remove legacy key from old settings page
  localStorage.removeItem('crm_api_secret');
}

export function isLoggedIn(): boolean {
  return !!getSessionToken();
}
