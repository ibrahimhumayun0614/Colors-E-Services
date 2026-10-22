export type BankAccount = {
  label: string;
  bank_name: string;
  bank_account: string;
  bank_ifsc: string;
  bank_account_name: string;
  upi_id: string;
};

export function emptyBankAccount(): BankAccount {
  return {
    label: '',
    bank_name: '',
    bank_account: '',
    bank_ifsc: '',
    bank_account_name: '',
    upi_id: '',
  };
}

function trimStr(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

export function normalizeBankAccount(raw: unknown): BankAccount | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const account: BankAccount = {
    label: trimStr(o.label),
    bank_name: trimStr(o.bank_name),
    bank_account: trimStr(o.bank_account),
    bank_ifsc: trimStr(o.bank_ifsc),
    bank_account_name: trimStr(o.bank_account_name),
    upi_id: trimStr(o.upi_id),
  };
  const hasAny =
    account.label ||
    account.bank_name ||
    account.bank_account ||
    account.bank_ifsc ||
    account.bank_account_name ||
    account.upi_id;
  return hasAny ? account : null;
}

export function sanitizeBankAccounts(raw: unknown): BankAccount[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeBankAccount).filter((a): a is BankAccount => a != null);
}

export function parseBankAccountsJson(raw: unknown): BankAccount[] {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return sanitizeBankAccounts(raw);
  if (typeof raw === 'string') {
    try {
      return sanitizeBankAccounts(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}

export function legacyAsBankAccounts(fields: {
  bank_account?: string | null;
  bank_name?: string | null;
  bank_ifsc?: string | null;
  bank_account_name?: string | null;
  upi_id?: string | null;
}): BankAccount[] {
  const account = normalizeBankAccount({
    label: 'Primary',
    bank_name: fields.bank_name,
    bank_account: fields.bank_account,
    bank_ifsc: fields.bank_ifsc,
    bank_account_name: fields.bank_account_name,
    upi_id: fields.upi_id,
  });
  return account ? [account] : [];
}

/** Prefer JSON list; fall back to legacy single-account columns. */
export function resolveBankAccounts(profile: {
  bank_accounts?: BankAccount[] | string | null;
  bank_account?: string | null;
  bank_name?: string | null;
  bank_ifsc?: string | null;
  bank_account_name?: string | null;
  upi_id?: string | null;
}): BankAccount[] {
  const fromJson = parseBankAccountsJson(profile.bank_accounts);
  if (fromJson.length) return fromJson;
  return legacyAsBankAccounts(profile);
}

export function primaryBankFields(accounts: BankAccount[]) {
  const first = accounts[0];
  return {
    bank_account: first?.bank_account || null,
    bank_name: first?.bank_name || null,
    bank_ifsc: first?.bank_ifsc || null,
    bank_account_name: first?.bank_account_name || null,
    upi_id: first?.upi_id || null,
  };
}

/** Display label for picker — defaults to Primary / Personal when unlabeled. */
export function bankAccountOptionLabel(account: BankAccount, index: number): string {
  const label = account.label.trim();
  if (label) return label;
  if (index === 0) return 'Primary';
  if (index === 1) return 'Personal';
  return `Account ${index + 1}`;
}

export function parsePaymentAccount(raw: unknown): BankAccount | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') {
    try {
      return normalizeBankAccount(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  return normalizeBankAccount(raw);
}

/** Account(s) to show on an invoice — snapshot first, else profile at saved index. */
export function pickInvoicePaymentAccounts(
  invoice: {
    payment_account?: BankAccount | string | null;
    bank_account_index?: number | null;
  },
  profile: {
    bank_accounts?: BankAccount[] | string | null;
    bank_account?: string | null;
    bank_name?: string | null;
    bank_ifsc?: string | null;
    bank_account_name?: string | null;
    upi_id?: string | null;
  }
): BankAccount[] {
  const snap = parsePaymentAccount(invoice.payment_account);
  if (snap) return [snap];
  const all = resolveBankAccounts(profile);
  if (!all.length) return [];
  const idx = Math.min(Math.max(0, Number(invoice.bank_account_index ?? 0) || 0), all.length - 1);
  return [all[idx]];
}
