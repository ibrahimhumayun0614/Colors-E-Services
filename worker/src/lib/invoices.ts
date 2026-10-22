/** Promote sent invoices past due_date to overdue status. */
export async function syncOverdueInvoices(db: D1Database) {
  await db
    .prepare(
      `UPDATE invoices SET status = 'overdue', updated_at = datetime('now')
       WHERE status = 'sent' AND date(due_date) < date('now')`
    )
    .run();
}

export async function nextInvoiceNumber(db: D1Database): Promise<string> {
  const last = await db
    .prepare('SELECT invoice_number FROM invoices ORDER BY id DESC LIMIT 1')
    .first<{ invoice_number: string }>();

  if (!last) return 'INV-001';

  const num = parseInt(last.invoice_number.replace(/\D/g, ''), 10) + 1;
  return `INV-${String(num).padStart(3, '0')}`;
}

export const MONTHLY_RECURRING_SQL = `
  SELECT COALESCE(SUM(
    CASE s.billing_cycle
      WHEN 'monthly' THEN s.amount
      WHEN 'quarterly' THEN s.amount / 3.0
      WHEN 'annual' THEN s.amount / 12.0
      ELSE 0
    END
  ), 0) as total FROM services s
  JOIN clients c ON c.id = s.client_id
  WHERE s.status = 'active' AND c.status = 'active'
    AND s.billing_cycle IN ('monthly', 'quarterly', 'annual')
`;
