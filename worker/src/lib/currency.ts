export const ALLOWED_CURRENCIES = ['USD', 'AED', 'EUR', 'GBP', 'INR', 'SAR'] as const;

export type AllowedCurrency = (typeof ALLOWED_CURRENCIES)[number];

export function normalizeCurrency(value: string | null | undefined, fallback = 'USD'): string {
  const code = (value ?? fallback).trim().toUpperCase();
  return (ALLOWED_CURRENCIES as readonly string[]).includes(code) ? code : fallback;
}

export async function getWorkspaceDefaultCurrency(db: D1Database): Promise<string> {
  const row = await db
    .prepare('SELECT default_currency FROM user_profile WHERE id = 1')
    .first<{ default_currency: string | null }>();
  return normalizeCurrency(row?.default_currency, 'USD');
}
