import { Hono } from 'hono';
import type { Env, Service } from '../types';
import { nextInvoiceNumber } from '../lib/invoices';
import {
  addToDate,
  bumpDate,
  bumpMaintenanceDate,
  completeRenewalTasks,
  invoiceLineFromService,
  renewalTaskTitle,
  todayISO,
  type RenewalTarget,
} from '../lib/service-actions';
import { getWorkspaceDefaultCurrency, normalizeCurrency } from '../lib/currency';

export const services = new Hono<{ Bindings: Env }>();

services.get('/', async (c) => {
  const clientId = c.req.query('client_id');
  const serviceType = c.req.query('service_type');
  const expiringDays = c.req.query('expiring_days');

  if (expiringDays) {
    const days = parseInt(expiringDays, 10);
    const { results } = await c.env.DB.prepare(
      `SELECT s.*, c.name as client_name FROM services s
       JOIN clients c ON c.id = s.client_id
       WHERE c.status = 'active' AND s.status = 'active' AND (
         (s.service_type = 'domain_hosting' AND (
           (s.domain_expiry IS NOT NULL AND date(s.domain_expiry) <= date('now', '+' || ? || ' days'))
           OR (s.hosting_expiry IS NOT NULL AND date(s.hosting_expiry) <= date('now', '+' || ? || ' days'))
         ))
         OR (s.service_type = 'website_maintenance' AND s.next_due_date IS NOT NULL
             AND date(s.next_due_date) <= date('now', '+' || ? || ' days'))
       )
       ORDER BY s.domain_expiry ASC, s.next_due_date ASC`
    )
      .bind(days, days, days)
      .all<Service & { client_name: string }>();

    return c.json(results);
  }

  let query = `SELECT s.*, c.name as client_name FROM services s
               JOIN clients c ON c.id = s.client_id WHERE c.status = 'active'`;
  const params: string[] = [];

  if (clientId) {
    query += ' AND s.client_id = ?';
    params.push(clientId);
  }

  if (serviceType) {
    query += ' AND s.service_type = ?';
    params.push(serviceType);
  }

  query += ` ORDER BY
    CASE s.service_type
      WHEN 'domain_hosting' THEN 0
      WHEN 'website_maintenance' THEN 1
      ELSE 2
    END,
    s.domain_expiry IS NULL, s.domain_expiry ASC,
    s.next_due_date IS NULL, s.next_due_date ASC,
    s.name ASC`;

  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  return c.json(results);
});

services.get('/:id', async (c) => {
  const id = c.req.param('id');
  const service = await c.env.DB.prepare(
    `SELECT s.*, c.name as client_name FROM services s
     JOIN clients c ON c.id = s.client_id WHERE s.id = ?`
  )
    .bind(id)
    .first();

  if (!service) return c.json({ error: 'Service not found' }, 404);
  return c.json(service);
});

const VALID_TYPES = [
  'domain_hosting',
  'website_maintenance',
  'logo_design',
  'content_writing',
  'email_configuration',
] as const;

services.post('/', async (c) => {
  const body = await c.req.json<Partial<Service>>();

  if (!body.client_id || !body.name?.trim()) {
    return c.json({ error: 'client_id and name are required' }, 400);
  }

  const serviceType = body.service_type ?? 'domain_hosting';
  if (!VALID_TYPES.includes(serviceType as (typeof VALID_TYPES)[number])) {
    return c.json({ error: 'Invalid service_type' }, 400);
  }

  const client = await c.env.DB.prepare('SELECT status FROM clients WHERE id = ?')
    .bind(body.client_id)
    .first<{ status: string }>();

  const defaultStatus = client?.status === 'lead' ? 'lead' : 'active';
  const currency = normalizeCurrency(
    body.currency,
    await getWorkspaceDefaultCurrency(c.env.DB)
  );

  const result = await c.env.DB.prepare(
    `INSERT INTO services (
      client_id, service_type, name, status, billing_cycle, amount, currency,
      start_date, end_date, next_due_date,
      url, registrar, domain_expiry, hosting_provider, hosting_expiry, cms,
      email_provider, email_accounts, deliverables, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      body.client_id,
      serviceType,
      body.name.trim(),
      body.status ?? defaultStatus,
      body.billing_cycle ?? (serviceType === 'domain_hosting' || serviceType === 'website_maintenance' ? 'monthly' : 'one_time'),
      body.amount ?? 0,
      currency,
      body.start_date ?? null,
      body.end_date ?? null,
      body.next_due_date ?? null,
      body.url ?? null,
      body.registrar ?? null,
      body.domain_expiry ?? null,
      body.hosting_provider ?? null,
      body.hosting_expiry ?? null,
      body.cms ?? null,
      body.email_provider ?? null,
      body.email_accounts ?? null,
      body.deliverables ?? null,
      body.notes ?? null
    )
    .run();

  const service = await c.env.DB.prepare(
    `SELECT s.*, c.name as client_name FROM services s
     JOIN clients c ON c.id = s.client_id WHERE s.id = ?`
  )
    .bind(result.meta.last_row_id)
    .first<Service>();

  return c.json(service, 201);
});

async function loadService(db: D1Database, id: string) {
  return db
    .prepare(
      `SELECT s.*, c.name as client_name FROM services s
       JOIN clients c ON c.id = s.client_id WHERE s.id = ?`
    )
    .bind(id)
    .first<Service & { client_name: string }>();
}

services.post('/:id/renew', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    target?: RenewalTarget;
    years?: number;
    complete_tasks?: boolean;
  }>().catch(() => ({} as { target?: RenewalTarget; years?: number; complete_tasks?: boolean }));

  const service = await loadService(c.env.DB, id);
  if (!service) return c.json({ error: 'Service not found' }, 404);

  const years = body.years ?? 1;
  const completeTasks = body.complete_tasks !== false;
  const updates: Partial<Service> = {};

  if (service.service_type === 'website_maintenance') {
    updates.next_due_date = bumpMaintenanceDate(service);
  } else if (service.service_type === 'domain_hosting') {
    const target = body.target ?? 'all';
    if (target === 'domain' || target === 'all') {
      updates.domain_expiry = bumpDate(service.domain_expiry, years);
    }
    if (target === 'hosting' || target === 'all') {
      updates.hosting_expiry = bumpDate(service.hosting_expiry, years);
    }
  } else {
    return c.json({ error: 'This service type does not support renewal dates' }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE services SET
      domain_expiry = COALESCE(?, domain_expiry),
      hosting_expiry = COALESCE(?, hosting_expiry),
      next_due_date = COALESCE(?, next_due_date),
      updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(
      updates.domain_expiry ?? null,
      updates.hosting_expiry ?? null,
      updates.next_due_date ?? null,
      id
    )
    .run();

  if (completeTasks) {
    await completeRenewalTasks(c.env.DB, Number(id));
  }

  const updated = await loadService(c.env.DB, id);
  return c.json(updated);
});

services.post('/:id/complete-maintenance', async (c) => {
  const id = c.req.param('id');
  const body = await c.req
    .json<{ complete_tasks?: boolean }>()
    .catch((): { complete_tasks?: boolean } => ({}));

  const service = await loadService(c.env.DB, id);
  if (!service) return c.json({ error: 'Service not found' }, 404);
  if (service.service_type !== 'website_maintenance') {
    return c.json({ error: 'Only maintenance services support this action' }, 400);
  }

  const nextDue = bumpMaintenanceDate(service);

  await c.env.DB.prepare(
    `UPDATE services SET next_due_date = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(nextDue, id)
    .run();

  if (body.complete_tasks !== false) {
    await completeRenewalTasks(c.env.DB, Number(id), '%Maintenance%');
  }

  const updated = await loadService(c.env.DB, id);
  return c.json(updated);
});

services.post('/:id/create-task', async (c) => {
  const id = c.req.param('id');
  type CreateTaskBody = {
    target?: RenewalTarget;
    title?: string;
    due_date?: string;
    priority?: string;
  };
  const body = await c.req.json<CreateTaskBody>().catch((): CreateTaskBody => ({}));

  const service = await loadService(c.env.DB, id);
  if (!service) return c.json({ error: 'Service not found' }, 404);

  const target: RenewalTarget =
    service.service_type === 'website_maintenance'
      ? 'maintenance'
      : body.target ?? 'all';

  const existing = await c.env.DB.prepare(
    `SELECT t.id FROM tasks t
     WHERE t.service_id = ? AND t.status = 'open' LIMIT 1`
  )
    .bind(id)
    .first<{ id: number }>();

  if (existing) {
    const task = await c.env.DB.prepare(
      `SELECT t.*, c.name as client_name FROM tasks t
       LEFT JOIN clients c ON c.id = t.client_id WHERE t.id = ?`
    )
      .bind(existing.id)
      .first();
    return c.json({ task, existing: true });
  }

  let dueDate = body.due_date ?? null;
  if (!dueDate) {
    if (service.service_type === 'website_maintenance') {
      dueDate = service.next_due_date ?? todayISO();
    } else if (target === 'domain') {
      dueDate = service.domain_expiry ?? todayISO();
    } else if (target === 'hosting') {
      dueDate = service.hosting_expiry ?? todayISO();
    } else {
      dueDate =
        service.domain_expiry ??
        service.hosting_expiry ??
        service.next_due_date ??
        todayISO();
    }
  }

  const priority = body.priority ?? 'high';
  if (!['low', 'medium', 'high'].includes(priority)) {
    return c.json({ error: 'Invalid priority' }, 400);
  }

  const title = body.title?.trim() || renewalTaskTitle(service, target);
  const description = `Follow up for ${service.name} (${service.client_name})`;

  const result = await c.env.DB.prepare(
    `INSERT INTO tasks (client_id, service_id, title, description, due_date, priority, status)
     VALUES (?, ?, ?, ?, ?, ?, 'open')`
  )
    .bind(service.client_id, service.id, title, description, dueDate, priority)
    .run();

  const task = await c.env.DB.prepare(
    `SELECT t.*, c.name as client_name FROM tasks t
     LEFT JOIN clients c ON c.id = t.client_id WHERE t.id = ?`
  )
    .bind(result.meta.last_row_id)
    .first();

  return c.json({ task, existing: false }, 201);
});

services.post('/:id/create-invoice', async (c) => {
  const id = c.req.param('id');
  const body = await c.req
    .json<{ due_days?: number; status?: string }>()
    .catch((): { due_days?: number; status?: string } => ({}));

  const service = await loadService(c.env.DB, id);
  if (!service) return c.json({ error: 'Service not found' }, 404);

  const existingDraft = await c.env.DB.prepare(
    `SELECT i.id FROM invoices i
     JOIN invoice_items ii ON ii.invoice_id = i.id
     WHERE ii.service_id = ? AND i.status = 'draft'
     ORDER BY i.id DESC LIMIT 1`
  )
    .bind(service.id)
    .first<{ id: number }>();

  if (existingDraft) {
    const invoice = await c.env.DB.prepare(
      `SELECT i.*, c.name as client_name FROM invoices i
       JOIN clients c ON c.id = i.client_id WHERE i.id = ?`
    )
      .bind(existingDraft.id)
      .first();

    const { results: items } = await c.env.DB.prepare(
      'SELECT * FROM invoice_items WHERE invoice_id = ?'
    )
      .bind(existingDraft.id)
      .all();

    const subtotal = (items as { quantity: number; rate: number }[]).reduce(
      (sum, i) => sum + i.quantity * i.rate,
      0
    );

    return c.json({ ...invoice, items, subtotal, total: subtotal, existing: true });
  }

  const issueDate = todayISO();
  const dueDays = body.due_days ?? 14;
  const dueDate = addToDate(issueDate, { days: dueDays });
  const line = invoiceLineFromService(service);
  const invoiceNumber = await nextInvoiceNumber(c.env.DB);
  const status = body.status ?? 'draft';

  const result = await c.env.DB.prepare(
    `INSERT INTO invoices (client_id, invoice_number, issue_date, due_date, status, tax_rate, currency, notes)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
  )
    .bind(
      service.client_id,
      invoiceNumber,
      issueDate,
      dueDate,
      status,
      normalizeCurrency(service.currency, await getWorkspaceDefaultCurrency(c.env.DB)),
      `Invoice for service: ${service.name}`
    )
    .run();

  const invoiceId = result.meta.last_row_id;

  await c.env.DB.prepare(
    `INSERT INTO invoice_items (invoice_id, service_id, description, quantity, rate)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(invoiceId, service.id, line.description, line.quantity, line.rate)
    .run();

  const invoice = await c.env.DB.prepare(
    `SELECT i.*, c.name as client_name FROM invoices i
     JOIN clients c ON c.id = i.client_id WHERE i.id = ?`
  )
    .bind(invoiceId)
    .first();

  const { results: items } = await c.env.DB.prepare(
    'SELECT * FROM invoice_items WHERE invoice_id = ?'
  )
    .bind(invoiceId)
    .all();

  const subtotal = (items as { quantity: number; rate: number }[]).reduce(
    (sum, i) => sum + i.quantity * i.rate,
    0
  );

  return c.json({ ...invoice, items, subtotal, total: subtotal, existing: false }, 201);
});

services.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Partial<Service>>();

  const existing = await c.env.DB.prepare('SELECT id FROM services WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ error: 'Service not found' }, 404);

  if (body.service_type && !VALID_TYPES.includes(body.service_type as (typeof VALID_TYPES)[number])) {
    return c.json({ error: 'Invalid service_type' }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE services SET
      service_type = COALESCE(?, service_type),
      name = COALESCE(?, name),
      status = COALESCE(?, status),
      billing_cycle = COALESCE(?, billing_cycle),
      amount = COALESCE(?, amount),
      currency = COALESCE(?, currency),
      start_date = ?,
      end_date = ?,
      next_due_date = ?,
      url = ?,
      registrar = ?,
      domain_expiry = ?,
      hosting_provider = ?,
      hosting_expiry = ?,
      cms = ?,
      email_provider = ?,
      email_accounts = ?,
      deliverables = ?,
      notes = ?,
      updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(
      body.service_type ?? null,
      body.name?.trim() ?? null,
      body.status ?? null,
      body.billing_cycle ?? null,
      body.amount ?? null,
      body.currency ?? null,
      body.start_date ?? null,
      body.end_date ?? null,
      body.next_due_date ?? null,
      body.url ?? null,
      body.registrar ?? null,
      body.domain_expiry ?? null,
      body.hosting_provider ?? null,
      body.hosting_expiry ?? null,
      body.cms ?? null,
      body.email_provider ?? null,
      body.email_accounts ?? null,
      body.deliverables ?? null,
      body.notes ?? null,
      id
    )
    .run();

  const service = await c.env.DB.prepare(
    `SELECT s.*, c.name as client_name FROM services s
     JOIN clients c ON c.id = s.client_id WHERE s.id = ?`
  )
    .bind(id)
    .first<Service>();

  return c.json(service);
});

services.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM services WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
