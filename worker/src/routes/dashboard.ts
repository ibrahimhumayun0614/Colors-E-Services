import { Hono } from 'hono';
import type { Env, InvoiceItem } from '../types';
import { MONTHLY_RECURRING_SQL, syncOverdueInvoices } from '../lib/invoices';

function calcTotal(items: InvoiceItem[], taxRate: number) {
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.rate, 0);
  return subtotal + subtotal * (taxRate / 100);
}

const ACTIVE_CLIENT_SQL = `c.status = 'active'`;

const RENEWAL_ATTENTION_SQL = `
  s.status = 'active' AND ${ACTIVE_CLIENT_SQL} AND (
    (s.service_type = 'domain_hosting' AND (
      (s.domain_expiry IS NOT NULL AND date(s.domain_expiry) <= date('now', '+' || ? || ' days'))
      OR (s.hosting_expiry IS NOT NULL AND date(s.hosting_expiry) <= date('now', '+' || ? || ' days'))
    ))
    OR (s.service_type = 'website_maintenance' AND s.next_due_date IS NOT NULL
        AND date(s.next_due_date) <= date('now', '+' || ? || ' days'))
  )
`;

export const dashboard = new Hono<{ Bindings: Env }>();

dashboard.get('/', async (c) => {
  const days = parseInt(c.req.query('expiring_days') ?? '10', 10);

  await syncOverdueInvoices(c.env.DB);

  const [
    clients,
    services,
    invoices,
    renewalAttention,
    expiring,
    overdueInvoiceCountRow,
    overdueTaskCountRow,
    overdueTasksList,
    overdueList,
    clientStatuses,
    invoiceStatuses,
    renewalBuckets,
    monthlyRecurring,
    unpaidInvoices,
  ] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) as count FROM clients WHERE status = 'active'").first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM services s JOIN clients c ON c.id = s.client_id WHERE s.status = 'active' AND c.status = 'active'").first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM invoices WHERE status IN ('sent', 'overdue')").first<{ count: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM services s
       JOIN clients c ON c.id = s.client_id
       WHERE ${RENEWAL_ATTENTION_SQL}`
    )
      .bind(days, days, days)
      .first<{ count: number }>(),
    c.env.DB.prepare(
      `SELECT s.id, s.client_id, s.name, s.url, s.domain_expiry, s.hosting_expiry, s.service_type, s.next_due_date, c.name as client_name
       FROM services s JOIN clients c ON c.id = s.client_id
       WHERE ${RENEWAL_ATTENTION_SQL}
       ORDER BY COALESCE(s.domain_expiry, s.hosting_expiry, s.next_due_date) ASC LIMIT 10`
    )
      .bind(days, days, days)
      .all(),
    c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM invoices i WHERE i.status = 'overdue'`
    ).first<{ count: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM tasks t
       LEFT JOIN clients c ON c.id = t.client_id
       WHERE t.status = 'open' AND t.due_date IS NOT NULL AND date(t.due_date) < date('now')
         AND (t.client_id IS NULL OR c.status = 'active')`
    ).first<{ count: number }>(),
    c.env.DB.prepare(
      `SELECT t.id, t.title, t.due_date, t.client_id, c.name as client_name
       FROM tasks t LEFT JOIN clients c ON c.id = t.client_id
       WHERE t.status = 'open' AND t.due_date IS NOT NULL AND date(t.due_date) < date('now')
         AND (t.client_id IS NULL OR c.status = 'active')
       ORDER BY t.due_date ASC LIMIT 10`
    ).all(),
    c.env.DB.prepare(
      `SELECT i.id, i.invoice_number, i.due_date, i.status, i.tax_rate, c.name as client_name
       FROM invoices i JOIN clients c ON c.id = i.client_id
       WHERE i.status = 'overdue'
       ORDER BY i.due_date ASC LIMIT 10`
    ).all(),
    c.env.DB.prepare("SELECT status, COUNT(*) as count FROM clients GROUP BY status").all<{ status: string; count: number }>(),
    c.env.DB.prepare("SELECT status, COUNT(*) as count FROM invoices GROUP BY status").all<{ status: string; count: number }>(),
    c.env.DB.prepare(
      `       WITH renewal_dates AS (
         SELECT domain_expiry AS d FROM services s
         JOIN clients c ON c.id = s.client_id
         WHERE ${ACTIVE_CLIENT_SQL} AND s.status = 'active'
           AND s.service_type = 'domain_hosting' AND domain_expiry IS NOT NULL
         UNION ALL
         SELECT hosting_expiry FROM services s
         JOIN clients c ON c.id = s.client_id
         WHERE ${ACTIVE_CLIENT_SQL} AND s.status = 'active'
           AND s.service_type = 'domain_hosting' AND hosting_expiry IS NOT NULL
         UNION ALL
         SELECT next_due_date FROM services s
         JOIN clients c ON c.id = s.client_id
         WHERE ${ACTIVE_CLIENT_SQL} AND s.status = 'active'
           AND s.service_type = 'website_maintenance' AND next_due_date IS NOT NULL
       )
       SELECT
         SUM(CASE WHEN julianday(d) - julianday('now') < 0 OR julianday(d) - julianday('now') <= 3 THEN 1 ELSE 0 END) AS week1,
         SUM(CASE WHEN julianday(d) - julianday('now') > 3 AND julianday(d) - julianday('now') <= 7 THEN 1 ELSE 0 END) AS week2,
         SUM(CASE WHEN julianday(d) - julianday('now') > 7 AND julianday(d) - julianday('now') <= 10 THEN 1 ELSE 0 END) AS week3
       FROM renewal_dates
       WHERE julianday(d) - julianday('now') <= 10 OR julianday(d) - julianday('now') < 0`
    ).first<{ week1: number; week2: number; week3: number }>(),
    c.env.DB.prepare(MONTHLY_RECURRING_SQL).first<{ total: number }>(),
    c.env.DB.prepare("SELECT id, tax_rate FROM invoices WHERE status IN ('sent', 'overdue')").all<{ id: number; tax_rate: number }>(),
  ]);

  const overdueWithTotals = await Promise.all(
    (overdueList.results as { id: number; invoice_number: string; due_date: string; status: string; tax_rate: number; client_name: string }[]).map(async (inv) => {
      const { results: items } = await c.env.DB.prepare(
        'SELECT * FROM invoice_items WHERE invoice_id = ?'
      )
        .bind(inv.id)
        .all<InvoiceItem>();
      return { ...inv, total: calcTotal(items, inv.tax_rate ?? 0) };
    })
  );

  const outstandingAmount = (
    await Promise.all(
      (unpaidInvoices.results ?? []).map(async (inv) => {
        const { results: items } = await c.env.DB.prepare(
          'SELECT * FROM invoice_items WHERE invoice_id = ?'
        )
          .bind(inv.id)
          .all<InvoiceItem>();
        return calcTotal(items, inv.tax_rate ?? 0);
      })
    )
  ).reduce((sum, n) => sum + n, 0);

  const clientsByStatus = { active: 0, lead: 0, inactive: 0 };
  for (const row of clientStatuses.results ?? []) {
    if (row.status in clientsByStatus) {
      clientsByStatus[row.status as keyof typeof clientsByStatus] = row.count;
    }
  }

  const invoicesByStatus = { draft: 0, sent: 0, paid: 0, overdue: 0, cancelled: 0 };
  for (const row of invoiceStatuses.results ?? []) {
    if (row.status in invoicesByStatus) {
      invoicesByStatus[row.status as keyof typeof invoicesByStatus] = row.count;
    }
  }

  const renewalCount = renewalAttention?.count ?? 0;
  const overdueInvoiceCount = overdueInvoiceCountRow?.count ?? 0;
  const overdueTaskCount = overdueTaskCountRow?.count ?? 0;

  return c.json({
    stats: {
      activeClients: clients?.count ?? 0,
      totalServices: services?.count ?? 0,
      totalWebsites: services?.count ?? 0,
      unpaidInvoices: invoices?.count ?? 0,
      outstandingAmount,
      monthlyHosting: monthlyRecurring?.total ?? 0,
    },
    charts: {
      clientsByStatus,
      invoicesByStatus,
      renewalBuckets: [
        { label: '0–3 days', count: renewalBuckets?.week1 ?? 0 },
        { label: '4–7 days', count: renewalBuckets?.week2 ?? 0 },
        { label: '8–10 days', count: renewalBuckets?.week3 ?? 0 },
      ],
      attention: {
        renewals: renewalCount,
        overdue: overdueInvoiceCount,
        tasks: overdueTaskCount,
      },
    },
    expiringSoon: expiring.results,
    overdueInvoices: overdueWithTotals,
    overdueTasks: overdueTasksList.results,
  });
});
