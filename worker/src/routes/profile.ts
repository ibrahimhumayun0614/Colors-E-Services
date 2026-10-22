import { Hono } from 'hono';
import type { Env, UserProfile } from '../types';
import { normalizeCurrency } from '../lib/currency';
import {
  primaryBankFields,
  resolveBankAccounts,
  sanitizeBankAccounts,
  type BankAccount,
} from '../lib/bank-accounts';
import { SHOP_BILLING_DEFAULTS } from '../lib/shop-defaults';

const PROFILE_ID = 1;

function str(row: Record<string, unknown> | null, key: string): string | null {
  const v = row?.[key];
  return v == null || v === '' ? null : String(v);
}

function mapProfile(row: Record<string, unknown> | null): UserProfile {
  const legacy = {
    bank_account: str(row, 'bank_account'),
    bank_name: str(row, 'bank_name'),
    bank_ifsc: str(row, 'bank_ifsc'),
    bank_account_name: str(row, 'bank_account_name'),
    upi_id: str(row, 'upi_id'),
  };
  const bank_accounts = resolveBankAccounts(row?.bank_accounts, legacy);
  const primary = primaryBankFields(bank_accounts);

  return {
    name: String(row?.name ?? SHOP_BILLING_DEFAULTS.name),
    email: String(row?.email ?? SHOP_BILLING_DEFAULTS.email),
    role: String(row?.role ?? 'Admin'),
    default_currency: normalizeCurrency(
      row?.default_currency as string | null | undefined,
      SHOP_BILLING_DEFAULTS.default_currency
    ),
    company_name: str(row, 'company_name') ?? SHOP_BILLING_DEFAULTS.company_name,
    phone: str(row, 'phone') ?? SHOP_BILLING_DEFAULTS.phone,
    address: str(row, 'address') ?? SHOP_BILLING_DEFAULTS.address,
    city: str(row, 'city') ?? SHOP_BILLING_DEFAULTS.city,
    state: str(row, 'state') ?? SHOP_BILLING_DEFAULTS.state,
    zip: str(row, 'zip') ?? SHOP_BILLING_DEFAULTS.zip,
    tax_id: str(row, 'tax_id'),
    logo_data: str(row, 'logo_data'),
    website: str(row, 'website'),
    bank_account: primary.bank_account ?? legacy.bank_account,
    bank_name: primary.bank_name ?? legacy.bank_name,
    bank_ifsc: primary.bank_ifsc ?? legacy.bank_ifsc,
    bank_account_name: primary.bank_account_name ?? legacy.bank_account_name,
    upi_id: primary.upi_id ?? legacy.upi_id,
    payment_method: str(row, 'payment_method'),
    bank_accounts,
  };
}

async function getOrCreateProfile(db: D1Database): Promise<UserProfile> {
  let row = await db.prepare('SELECT * FROM user_profile WHERE id = ?').bind(PROFILE_ID).first();

  if (!row) {
    await db
      .prepare(
        `INSERT INTO user_profile (
           id, name, email, role, default_currency,
           company_name, phone, address, city, state, zip
         ) VALUES (?, ?, ?, 'Admin', ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        PROFILE_ID,
        SHOP_BILLING_DEFAULTS.name,
        SHOP_BILLING_DEFAULTS.email,
        SHOP_BILLING_DEFAULTS.default_currency,
        SHOP_BILLING_DEFAULTS.company_name,
        SHOP_BILLING_DEFAULTS.phone,
        SHOP_BILLING_DEFAULTS.address,
        SHOP_BILLING_DEFAULTS.city,
        SHOP_BILLING_DEFAULTS.state,
        SHOP_BILLING_DEFAULTS.zip
      )
      .run();
    return mapProfile(null);
  }

  return mapProfile(row as Record<string, unknown>);
}

function pick(
  body: Partial<UserProfile>,
  existing: UserProfile,
  key: keyof UserProfile
): string | null {
  if (body[key] === undefined) return (existing[key] as string | null | undefined) ?? null;
  const value = body[key];
  if (value == null) return null;
  if (Array.isArray(value)) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function resolveAccountsForUpdate(
  body: Partial<UserProfile>,
  existing: UserProfile
): BankAccount[] {
  if (body.bank_accounts !== undefined) {
    return sanitizeBankAccounts(body.bank_accounts);
  }
  // If only legacy fields were sent (e.g. invoice builder), rebuild from primary + rest.
  const touchedLegacy =
    body.bank_account !== undefined ||
    body.bank_name !== undefined ||
    body.bank_ifsc !== undefined ||
    body.bank_account_name !== undefined ||
    body.upi_id !== undefined;

  if (!touchedLegacy) {
    return existing.bank_accounts?.length
      ? existing.bank_accounts
      : resolveBankAccounts(null, existing);
  }

  const primary: BankAccount = {
    label: existing.bank_accounts?.[0]?.label || 'Primary',
    bank_name: pick(body, existing, 'bank_name') || '',
    bank_account: pick(body, existing, 'bank_account') || '',
    bank_ifsc: pick(body, existing, 'bank_ifsc') || '',
    bank_account_name: pick(body, existing, 'bank_account_name') || '',
    upi_id: pick(body, existing, 'upi_id') || '',
  };
  const rest = (existing.bank_accounts ?? []).slice(1);
  return sanitizeBankAccounts([primary, ...rest]);
}

export const profile = new Hono<{ Bindings: Env }>();

profile.get('/', async (c) => {
  const data = await getOrCreateProfile(c.env.DB);
  return c.json(data);
});

profile.put('/', async (c) => {
  const body = await c.req.json<Partial<UserProfile>>();
  const existing = await getOrCreateProfile(c.env.DB);

  const name = body.name?.trim() || existing.name;
  const email = body.email?.trim() || existing.email;
  const default_currency =
    body.default_currency !== undefined
      ? normalizeCurrency(body.default_currency, existing.default_currency)
      : existing.default_currency;

  if (!name) return c.json({ error: 'Name is required' }, 400);
  if (!email) return c.json({ error: 'Email is required' }, 400);

  const bank_accounts = resolveAccountsForUpdate(body, existing);
  const primary = primaryBankFields(bank_accounts);

  const next = {
    company_name: pick(body, existing, 'company_name'),
    phone: pick(body, existing, 'phone'),
    address: pick(body, existing, 'address'),
    city: pick(body, existing, 'city'),
    state: pick(body, existing, 'state'),
    zip: pick(body, existing, 'zip'),
    tax_id: pick(body, existing, 'tax_id'),
    logo_data: body.logo_data !== undefined ? body.logo_data || null : existing.logo_data ?? null,
    website: pick(body, existing, 'website'),
    bank_account: primary.bank_account,
    bank_name: primary.bank_name,
    bank_ifsc: primary.bank_ifsc,
    bank_account_name: primary.bank_account_name,
    upi_id: primary.upi_id,
    payment_method: pick(body, existing, 'payment_method'),
    bank_accounts,
  };

  const bankAccountsJson = JSON.stringify(bank_accounts);

  // Prefer full letterhead + payment + multi-bank; fall back if migrations not applied yet.
  try {
    await c.env.DB.prepare(
      `UPDATE user_profile
       SET name = ?, email = ?, default_currency = ?,
           company_name = ?, phone = ?, address = ?, city = ?, state = ?, zip = ?, tax_id = ?, logo_data = ?,
           website = ?, bank_account = ?, bank_name = ?, bank_ifsc = ?, bank_account_name = ?, upi_id = ?, payment_method = ?,
           bank_accounts = ?,
           updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(
        name,
        email,
        default_currency,
        next.company_name,
        next.phone,
        next.address,
        next.city,
        next.state,
        next.zip,
        next.tax_id,
        next.logo_data,
        next.website,
        next.bank_account,
        next.bank_name,
        next.bank_ifsc,
        next.bank_account_name,
        next.upi_id,
        next.payment_method,
        bankAccountsJson,
        PROFILE_ID
      )
      .run();
  } catch {
    try {
      await c.env.DB.prepare(
        `UPDATE user_profile
         SET name = ?, email = ?, default_currency = ?,
             company_name = ?, phone = ?, address = ?, city = ?, state = ?, zip = ?, tax_id = ?, logo_data = ?,
             website = ?, bank_account = ?, bank_name = ?, bank_ifsc = ?, bank_account_name = ?, upi_id = ?, payment_method = ?,
             updated_at = datetime('now')
         WHERE id = ?`
      )
        .bind(
          name,
          email,
          default_currency,
          next.company_name,
          next.phone,
          next.address,
          next.city,
          next.state,
          next.zip,
          next.tax_id,
          next.logo_data,
          next.website,
          next.bank_account,
          next.bank_name,
          next.bank_ifsc,
          next.bank_account_name,
          next.upi_id,
          next.payment_method,
          PROFILE_ID
        )
        .run();
    } catch {
      try {
        await c.env.DB.prepare(
          `UPDATE user_profile
           SET name = ?, email = ?, default_currency = ?,
               company_name = ?, phone = ?, address = ?, city = ?, state = ?, zip = ?, tax_id = ?, logo_data = ?,
               updated_at = datetime('now')
           WHERE id = ?`
        )
          .bind(
            name,
            email,
            default_currency,
            next.company_name,
            next.phone,
            next.address,
            next.city,
            next.state,
            next.zip,
            next.tax_id,
            next.logo_data,
            PROFILE_ID
          )
          .run();
      } catch {
        await c.env.DB.prepare(
          `UPDATE user_profile
           SET name = ?, email = ?, default_currency = ?, updated_at = datetime('now')
           WHERE id = ?`
        )
          .bind(name, email, default_currency, PROFILE_ID)
          .run();
      }
    }
  }

  const updated = await getOrCreateProfile(c.env.DB);
  return c.json(updated);
});
