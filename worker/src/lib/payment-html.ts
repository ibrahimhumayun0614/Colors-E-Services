import {
  resolveBankAccounts,
  type BankAccount,
} from './bank-accounts';

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function paymentMethodLabel(from: { payment_method?: string | null }): string {
  return from.payment_method?.trim() || 'EFT Bank Transfer';
}

/** Payment block HTML for one or more bank accounts. */
export function paymentDetailsHtml(
  from: {
    payment_method?: string | null;
    company_name?: string | null;
    bank_accounts?: BankAccount[] | null;
    bank_account?: string | null;
    bank_name?: string | null;
    bank_ifsc?: string | null;
    bank_account_name?: string | null;
    upi_id?: string | null;
  },
  companyNameFallback = 'Your Company'
): string {
  const accounts = resolveBankAccounts(from.bank_accounts, from);
  const companyName = from.company_name?.trim() || companyNameFallback;

  if (!accounts.length) return '';

  const blocks = accounts.map((account, index) => {
    const accountName = account.bank_account_name.trim() || companyName;
    const lines = [
      `<p class="bank-detail">Account Name: ${escapeHtml(accountName)}</p>`,
      account.bank_ifsc ? `<p class="bank-detail">IFSC Code: ${escapeHtml(account.bank_ifsc)}</p>` : '',
      account.bank_account
        ? `<p class="bank-detail">Account Number: ${escapeHtml(account.bank_account)}</p>`
        : '',
      account.bank_name ? `<p class="bank-detail">Bank Name: ${escapeHtml(account.bank_name)}</p>` : '',
      account.upi_id ? `<p class="bank-detail">UPI ID: ${escapeHtml(account.upi_id)}</p>` : '',
    ];
    return `<div class="bank-account"${index > 0 ? ' style="margin-top:12px"' : ''}>${lines.join('')}</div>`;
  });

  return blocks.join('');
}
