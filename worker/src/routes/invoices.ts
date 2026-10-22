import { Hono } from 'hono';
import type { Env, Invoice, InvoiceItem } from '../types';
import { nextInvoiceNumber, syncOverdueInvoices } from '../lib/invoices';
import { activateLeadClient } from '../lib/service-actions';
import { invoiceShareToken } from '../lib/share';
import { getWorkspaceDefaultCurrency, normalizeCurrency } from '../lib/currency';
import { normalizeBankAccount, type BankAccount } from '../lib/bank-accounts';

function calcTotals(items: InvoiceItem[], taxRate: number) {
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.rate, 0);
  const total = subtotal + subtotal * (taxRate / 100);
  return { subtotal, total };
}

function normalizeBankIndex(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function serializePaymentAccount(value: unknown): string | null {
  const account = normalizeBankAccount(value);
  return account ? JSON.stringify(account) : null;
}

function mapInvoiceRow(row: Invoice): Invoice {
  return {
    ...row,
    bank_account_index: normalizeBankIndex(row.bank_account_index, 0),
    payment_account: row.payment_account ?? null,
  };
}

async function attachItems(db: D1Database, invoice: Invoice): Promise<Invoice> {
  const { results: items } = await db
    .prepare('SELECT * FROM invoice_items WHERE invoice_id = ?')
    .bind(invoice.id)
    .all<InvoiceItem>();

  const { subtotal, total } = calcTotals(items, invoice.tax_rate);
  return { ...mapInvoiceRow(invoice), items, subtotal, total };
}

export const invoices = new Hono<{ Bindings: Env }>();

invoices.get('/', async (c) => {
  await syncOverdueInvoices(c.env.DB);

  const status = c.req.query('status');
  const clientId = c.req.query('client_id');

  let query = `SELECT i.*, c.name as client_name FROM invoices i
               JOIN clients c ON c.id = i.client_id WHERE 1=1`;
  const params: string[] = [];

  if (status === 'overdue') {
    query += " AND i.status = 'overdue'";
  } else if (status) {
    query += ' AND i.status = ?';
    params.push(status);
  }

  if (clientId) {
    query += ' AND i.client_id = ?';
    params.push(clientId);
  }

  query += ' ORDER BY i.issue_date DESC';

  const { results } = await c.env.DB.prepare(query).bind(...params).all<Invoice>();

  const enriched = await Promise.all(results.map((inv) => attachItems(c.env.DB, inv)));
  return c.json(enriched);
});

invoices.get('/next-number', async (c) => {
  const invoice_number = await nextInvoiceNumber(c.env.DB);
  return c.json({ invoice_number });
});

invoices.get('/:id', async (c) => {
  const id = c.req.param('id');
  const invoice = await c.env.DB.prepare(
    `SELECT i.*, c.name as client_name FROM invoices i
     JOIN clients c ON c.id = i.client_id WHERE i.id = ?`
  )
    .bind(id)
    .first<Invoice>();

  if (!invoice) return c.json({ error: 'Invoice not found' }, 404);
  return c.json(await attachItems(c.env.DB, invoice));
});

invoices.get('/:id/share', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'Invalid invoice id' }, 400);

  const invoice = await c.env.DB.prepare('SELECT id FROM invoices WHERE id = ?')
    .bind(id)
    .first<{ id: number }>();
  if (!invoice) return c.json({ error: 'Invoice not found' }, 404);

  const token = await invoiceShareToken(c.env.API_SECRET, id);
  const origin = new URL(c.req.url).origin;
  const url = `${origin}/api/public/invoices/${id}?t=${token}`;
  return c.json({ url, token });
});

invoices.post('/', async (c) => {
  const body = await c.req.json<{
    client_id: number;
    invoice_number?: string;
    issue_date: string;
    due_date: string;
    status?: string;
    tax_rate?: number;
    currency?: string;
    notes?: string;
    bank_account_index?: number;
    payment_account?: BankAccount | null;
    items: { description: string; quantity: number; rate: number; service_id?: number | null }[];
  }>();

  if (!body.client_id || !body.issue_date || !body.due_date || !body.items?.length) {
    return c.json({ error: 'client_id, dates, and at least one item are required' }, 400);
  }

  let invoiceNumber = body.invoice_number?.trim().replace(/^#/, '') || '';
  if (invoiceNumber) {
    const taken = await c.env.DB.prepare(
      'SELECT id FROM invoices WHERE invoice_number = ? LIMIT 1'
    )
      .bind(invoiceNumber)
      .first();
    if (taken) {
      invoiceNumber = await nextInvoiceNumber(c.env.DB);
    }
  } else {
    invoiceNumber = await nextInvoiceNumber(c.env.DB);
  }

  const currency = normalizeCurrency(
    body.currency,
    await getWorkspaceDefaultCurrency(c.env.DB)
  );
  const bank_account_index = normalizeBankIndex(body.bank_account_index, 0);
  const payment_account = serializePaymentAccount(body.payment_account);

  let invoiceId: number;
  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO invoices (client_id, invoice_number, issue_date, due_date, status, tax_rate, currency, notes, bank_account_index, payment_account)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        body.client_id,
        invoiceNumber,
        body.issue_date,
        body.due_date,
        body.status ?? 'draft',
        body.tax_rate ?? 0,
        currency,
        body.notes ?? null,
        bank_account_index,
        payment_account
      )
      .run();
    invoiceId = result.meta.last_row_id!;
  } catch {
    const result = await c.env.DB.prepare(
      `INSERT INTO invoices (client_id, invoice_number, issue_date, due_date, status, tax_rate, currency, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        body.client_id,
        invoiceNumber,
        body.issue_date,
        body.due_date,
        body.status ?? 'draft',
        body.tax_rate ?? 0,
        currency,
        body.notes ?? null
      )
      .run();
    invoiceId = result.meta.last_row_id!;
  }

  for (const item of body.items) {
    await c.env.DB.prepare(
      `INSERT INTO invoice_items (invoice_id, service_id, description, quantity, rate)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(invoiceId, item.service_id ?? null, item.description, item.quantity, item.rate)
      .run();
  }

  const invoice = await c.env.DB.prepare('SELECT * FROM invoices WHERE id = ?')
    .bind(invoiceId)
    .first<Invoice>();

  return c.json(await attachItems(c.env.DB, invoice!), 201);
});

invoices.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    issue_date?: string;
    due_date?: string;
    tax_rate?: number;
    currency?: string;
    notes?: string | null;
    bank_account_index?: number;
    payment_account?: BankAccount | null;
    items?: { description: string; quantity: number; rate: number; service_id?: number | null }[];
  }>();

  const existing = await c.env.DB.prepare('SELECT * FROM invoices WHERE id = ?')
    .bind(id)
    .first<Invoice>();

  if (!existing) return c.json({ error: 'Invoice not found' }, 404);

  if (!body.issue_date || !body.due_date || !body.items?.length) {
    return c.json({ error: 'issue_date, due_date, and at least one item are required' }, 400);
  }

  const currency =
    body.currency !== undefined
      ? normalizeCurrency(body.currency, existing.currency ?? 'USD')
      : normalizeCurrency(existing.currency, 'USD');

  const bank_account_index =
    body.bank_account_index !== undefined
      ? normalizeBankIndex(body.bank_account_index, 0)
      : normalizeBankIndex(existing.bank_account_index, 0);
  const payment_account =
    body.payment_account !== undefined
      ? serializePaymentAccount(body.payment_account)
      : existing.payment_account ?? null;

  try {
    await c.env.DB.prepare(
      `UPDATE invoices SET
        issue_date = ?,
        due_date = ?,
        tax_rate = ?,
        currency = ?,
        notes = ?,
        bank_account_index = ?,
        payment_account = ?,
        updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(
        body.issue_date,
        body.due_date,
        body.tax_rate ?? existing.tax_rate,
        currency,
        body.notes ?? null,
        bank_account_index,
        payment_account,
        id
      )
      .run();
  } catch {
    await c.env.DB.prepare(
      `UPDATE invoices SET
        issue_date = ?,
        due_date = ?,
        tax_rate = ?,
        currency = ?,
        notes = ?,
        updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(
        body.issue_date,
        body.due_date,
        body.tax_rate ?? existing.tax_rate,
        currency,
        body.notes ?? null,
        id
      )
      .run();
  }

  await c.env.DB.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').bind(id).run();

  for (const item of body.items) {
    await c.env.DB.prepare(
      `INSERT INTO invoice_items (invoice_id, service_id, description, quantity, rate)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(id, item.service_id ?? null, item.description, item.quantity, item.rate)
      .run();
  }

  const invoice = await c.env.DB.prepare('SELECT * FROM invoices WHERE id = ?')
    .bind(id)
    .first<Invoice>();

  return c.json(await attachItems(c.env.DB, invoice!));
});

invoices.patch('/:id/status', async (c) => {
  const id = c.req.param('id');
  const { status } = await c.req.json<{ status: string }>();

  const existing = await c.env.DB.prepare('SELECT * FROM invoices WHERE id = ?')
    .bind(id)
    .first<Invoice>();

  if (!existing) return c.json({ error: 'Invoice not found' }, 404);

  const allowed: Record<string, string[]> = {
    draft: ['sent', 'cancelled'],
    sent: ['paid', 'cancelled'],
    overdue: ['paid', 'cancelled'],
    paid: [],
    cancelled: [],
  };

  if (!allowed[existing.status]?.includes(status)) {
    return c.json({ error: `Cannot change status from ${existing.status} to ${status}` }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE invoices SET status = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(status, id)
    .run();

  if (status === 'paid') {
    await activateLeadClient(c.env.DB, existing.client_id);
  }

  const updated = await c.env.DB.prepare('SELECT * FROM invoices WHERE id = ?')
    .bind(id)
    .first<Invoice>();

  return c.json(await attachItems(c.env.DB, updated!));
});

invoices.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM invoices WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
