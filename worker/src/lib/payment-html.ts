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
  const method = from.payment_method?.trim() || 'EFT Bank Transfer';
  const accounts = resolveBankAccounts(from.bank_accounts, from);
  const companyName = from.company_name?.trim() || companyNameFallback;

  if (!accounts.length) {
    return `<p>${escapeHtml(method)}</p>`;
  }

  const blocks = accounts.map((account, index) => {
    const accountName = account.bank_account_name.trim() || companyName;
    const label =
      account.label.trim() || (accounts.length > 1 ? `Account ${index + 1}` : '');
    const lines = [
      label ? `<p><strong>${escapeHtml(label)}</strong></p>` : '',
      index === 0 ? `<p>${escapeHtml(method)}</p>` : '',
      `<p>Account Name: ${escapeHtml(accountName)}</p>`,
      account.bank_ifsc ? `<p>Code: ${escapeHtml(account.bank_ifsc)}</p>` : '',
      account.bank_account ? `<p>Account Number: ${escapeHtml(account.bank_account)}</p>` : '',
      account.bank_name ? `<p>Bank: ${escapeHtml(account.bank_name)}</p>` : '',
      account.upi_id ? `<p>UPI: ${escapeHtml(account.upi_id)}</p>` : '',
    ];
    return `<div class="bank-account"${index > 0 ? ' style="margin-top:12px"' : ''}>${lines.join('')}</div>`;
  });

  return blocks.join('');
}
