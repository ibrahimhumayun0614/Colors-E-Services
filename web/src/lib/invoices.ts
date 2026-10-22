import type { CreateInvoicePayload, Invoice } from '@/lib/api';
import { parsePaymentAccount } from '@/lib/bank-accounts';
import { resolveCurrency } from '@/lib/services';
import { daysUntil } from '@/lib/utils';

/** New draft from an existing invoice — next number, today's dates, same lines and bank. */
export function duplicateInvoicePayload(source: Invoice): CreateInvoicePayload {
  const today = new Date().toISOString().split('T')[0];
  const due = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
  const items = (source.items ?? [])
    .filter((item) => item.description?.trim())
    .map((item) => ({
      description: item.description,
      quantity: item.quantity,
      rate: item.rate,
      service_id: item.service_id ?? null,
    }));

  return {
    client_id: source.client_id,
    issue_date: today,
    due_date: due,
    status: 'draft',
    tax_rate: source.tax_rate,
    currency: resolveCurrency(source.currency),
    notes: source.notes?.trim() || undefined,
    bank_account_index: source.bank_account_index ?? 0,
    payment_account: parsePaymentAccount(source.payment_account),
    items,
  };
}

/** True when invoice is unpaid and past due (matches server sync rules). */
export function isInvoiceOverdue(invoice: Pick<Invoice, 'status' | 'due_date'>) {
  if (invoice.status === 'paid' || invoice.status === 'cancelled' || invoice.status === 'draft') {
    return false;
  }
  const days = daysUntil(invoice.due_date);
  return days !== null && days < 0;
}

export function effectiveInvoiceStatus(invoice: Pick<Invoice, 'status' | 'due_date'>): Invoice['status'] {
  if (isInvoiceOverdue(invoice) && invoice.status === 'sent') return 'overdue';
  return invoice.status;
}
