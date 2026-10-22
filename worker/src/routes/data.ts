import { Hono } from 'hono';
import type { Env, Client, Service, Invoice, InvoiceItem, Task } from '../types';
import { nextInvoiceNumber } from '../lib/invoices';

export const data = new Hono<{ Bindings: Env }>();

export const EXPORT_VERSION = 1;

interface ExportPayload {
  version: number;
  exported_at: string;
  app: string;
  counts: Record<string, number>;
  data: {
    clients: Client[];
    services: Service[];
    invoices: Invoice[];
    invoice_items: InvoiceItem[];
    tasks: Task[];
  };
}

async function selectAll<T>(db: D1Database, table: string): Promise<T[]> {
  const { results } = await db.prepare(`SELECT * FROM ${table} ORDER BY id ASC`).all<T>();
  return results;
}

data.get('/export', async (c) => {
  const [clients, services, invoices, invoice_items, tasks] = await Promise.all([
    selectAll<Client>(c.env.DB, 'clients'),
    selectAll<Service>(c.env.DB, 'services'),
    selectAll<Invoice>(c.env.DB, 'invoices'),
    selectAll<InvoiceItem>(c.env.DB, 'invoice_items'),
    selectAll<Task>(c.env.DB, 'tasks'),
  ]);

  const payload: ExportPayload = {
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    app: 'client-crm',
    counts: {
      clients: clients.length,
      services: services.length,
      invoices: invoices.length,
      invoice_items: invoice_items.length,
      tasks: tasks.length,
    },
    data: { clients, services, invoices, invoice_items, tasks },
  };

  return c.json(payload);
});

type ImportMode = 'merge' | 'replace';

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

data.post('/import', async (c) => {
  const body = await c.req
    .json<{ mode?: ImportMode; version?: number; data?: ExportPayload['data'] }>()
    .catch(() => null);

  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Invalid import file: could not parse JSON.' }, 400);
  }

  const source = body.data ?? (body as unknown as ExportPayload['data']);
  const clients = asArray<Client>(source?.clients);
  const services = asArray<Service>(source?.services);
  const invoices = asArray<Invoice>(source?.invoices);
  const invoiceItems = asArray<InvoiceItem>(source?.invoice_items);
  const tasks = asArray<Task>(source?.tasks);

  if (
    clients.length === 0 &&
    services.length === 0 &&
    invoices.length === 0 &&
    invoiceItems.length === 0 &&
    tasks.length === 0
  ) {
    return c.json({ error: 'Import file contains no records.' }, 400);
  }

  const mode: ImportMode = body.mode === 'replace' ? 'replace' : 'merge';
  const db = c.env.DB;

  try {
    if (mode === 'replace') {
      await importReplace(db, { clients, services, invoices, invoiceItems, tasks });
    } else {
      await importMerge(db, { clients, services, invoices, invoiceItems, tasks });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import failed.';
    return c.json({ error: `Import failed: ${message}` }, 500);
  }

  return c.json({
    ok: true,
    mode,
    imported: {
      clients: clients.length,
      services: services.length,
      invoices: invoices.length,
      invoice_items: invoiceItems.length,
      tasks: tasks.length,
    },
  });
});

interface ImportData {
  clients: Client[];
  services: Service[];
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
  tasks: Task[];
}

/** Wipe all data and restore the export exactly, preserving original IDs. Runs atomically. */
async function importReplace(db: D1Database, d: ImportData): Promise<void> {
  const statements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM invoice_items'),
    db.prepare('DELETE FROM tasks'),
    db.prepare('DELETE FROM invoices'),
    db.prepare('DELETE FROM services'),
    db.prepare('DELETE FROM clients'),
  ];

  for (const cl of d.clients) {
    statements.push(
      db
        .prepare(
          `INSERT INTO clients (id, name, company, email, phone, status, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          cl.id,
          cl.name,
          cl.company ?? null,
          cl.email ?? null,
          cl.phone ?? null,
          cl.status ?? 'active',
          cl.notes ?? null,
          cl.created_at ?? new Date().toISOString(),
          cl.updated_at ?? new Date().toISOString()
        )
    );
  }

  for (const s of d.services) {
    statements.push(
      db
        .prepare(
          `INSERT INTO services (
            id, client_id, service_type, name, status, billing_cycle, amount, currency,
            start_date, end_date, next_due_date, url, registrar, domain_expiry,
            hosting_provider, hosting_expiry, cms, email_provider, email_accounts,
            deliverables, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          s.id,
          s.client_id,
          s.service_type,
          s.name,
          s.status ?? 'active',
          s.billing_cycle ?? 'none',
          s.amount ?? 0,
          s.currency ?? 'USD',
          s.start_date ?? null,
          s.end_date ?? null,
          s.next_due_date ?? null,
          s.url ?? null,
          s.registrar ?? null,
          s.domain_expiry ?? null,
          s.hosting_provider ?? null,
          s.hosting_expiry ?? null,
          s.cms ?? null,
          s.email_provider ?? null,
          s.email_accounts ?? null,
          s.deliverables ?? null,
          s.notes ?? null,
          s.created_at ?? new Date().toISOString(),
          s.updated_at ?? new Date().toISOString()
        )
    );
  }

  for (const inv of d.invoices) {
    statements.push(
      db
        .prepare(
          `INSERT INTO invoices (id, client_id, invoice_number, issue_date, due_date, status, tax_rate, currency, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          inv.id,
          inv.client_id,
          inv.invoice_number,
          inv.issue_date,
          inv.due_date,
          inv.status ?? 'draft',
          inv.tax_rate ?? 0,
          inv.currency ?? 'USD',
          inv.notes ?? null,
          inv.created_at ?? new Date().toISOString(),
          inv.updated_at ?? new Date().toISOString()
        )
    );
  }

  for (const it of d.invoiceItems) {
    statements.push(
      db
        .prepare(
          `INSERT INTO invoice_items (id, invoice_id, service_id, description, quantity, rate)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          it.id,
          it.invoice_id,
          it.service_id ?? null,
          it.description,
          it.quantity ?? 1,
          it.rate ?? 0
        )
    );
  }

  for (const t of d.tasks) {
    statements.push(
      db
        .prepare(
          `INSERT INTO tasks (id, client_id, service_id, title, description, due_date, priority, status, created_at, updated_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          t.id,
          t.client_id ?? null,
          t.service_id ?? null,
          t.title,
          t.description ?? null,
          t.due_date ?? null,
          t.priority ?? 'medium',
          t.status ?? 'open',
          t.created_at ?? new Date().toISOString(),
          t.updated_at ?? new Date().toISOString(),
          t.completed_at ?? null
        )
    );
  }

  await db.batch(statements);
}

/** Append imported records with fresh IDs, remapping all foreign keys. */
async function importMerge(db: D1Database, d: ImportData): Promise<void> {
  const clientIdMap = new Map<number, number>();
  const serviceIdMap = new Map<number, number>();
  const invoiceIdMap = new Map<number, number>();

  for (const cl of d.clients) {
    const res = await db
      .prepare(
        `INSERT INTO clients (name, company, email, phone, status, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        cl.name,
        cl.company ?? null,
        cl.email ?? null,
        cl.phone ?? null,
        cl.status ?? 'active',
        cl.notes ?? null,
        cl.created_at ?? new Date().toISOString(),
        cl.updated_at ?? new Date().toISOString()
      )
      .run();
    clientIdMap.set(cl.id, Number(res.meta.last_row_id));
  }

  for (const s of d.services) {
    const newClientId = clientIdMap.get(s.client_id);
    if (!newClientId) continue;
    const res = await db
      .prepare(
        `INSERT INTO services (
          client_id, service_type, name, status, billing_cycle, amount, currency,
          start_date, end_date, next_due_date, url, registrar, domain_expiry,
          hosting_provider, hosting_expiry, cms, email_provider, email_accounts,
          deliverables, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        newClientId,
        s.service_type,
        s.name,
        s.status ?? 'active',
        s.billing_cycle ?? 'none',
        s.amount ?? 0,
        s.currency ?? 'USD',
        s.start_date ?? null,
        s.end_date ?? null,
        s.next_due_date ?? null,
        s.url ?? null,
        s.registrar ?? null,
        s.domain_expiry ?? null,
        s.hosting_provider ?? null,
        s.hosting_expiry ?? null,
        s.cms ?? null,
        s.email_provider ?? null,
        s.email_accounts ?? null,
        s.deliverables ?? null,
        s.notes ?? null,
        s.created_at ?? new Date().toISOString(),
        s.updated_at ?? new Date().toISOString()
      )
      .run();
    serviceIdMap.set(s.id, Number(res.meta.last_row_id));
  }

  for (const inv of d.invoices) {
    const newClientId = clientIdMap.get(inv.client_id);
    if (!newClientId) continue;
    // Regenerate numbers to avoid colliding with existing invoices.
    const invoiceNumber = await nextInvoiceNumber(db);
    const res = await db
      .prepare(
        `INSERT INTO invoices (client_id, invoice_number, issue_date, due_date, status, tax_rate, currency, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        newClientId,
        invoiceNumber,
        inv.issue_date,
        inv.due_date,
        inv.status ?? 'draft',
        inv.tax_rate ?? 0,
        inv.currency ?? 'USD',
        inv.notes ?? null,
        inv.created_at ?? new Date().toISOString(),
        inv.updated_at ?? new Date().toISOString()
      )
      .run();
    invoiceIdMap.set(inv.id, Number(res.meta.last_row_id));
  }

  for (const it of d.invoiceItems) {
    const newInvoiceId = invoiceIdMap.get(it.invoice_id);
    if (!newInvoiceId) continue;
    const newServiceId = it.service_id != null ? serviceIdMap.get(it.service_id) ?? null : null;
    await db
      .prepare(
        `INSERT INTO invoice_items (invoice_id, service_id, description, quantity, rate)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(newInvoiceId, newServiceId, it.description, it.quantity ?? 1, it.rate ?? 0)
      .run();
  }

  for (const t of d.tasks) {
    const newClientId = t.client_id != null ? clientIdMap.get(t.client_id) ?? null : null;
    const newServiceId = t.service_id != null ? serviceIdMap.get(t.service_id) ?? null : null;
    await db
      .prepare(
        `INSERT INTO tasks (client_id, service_id, title, description, due_date, priority, status, created_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        newClientId,
        newServiceId,
        t.title,
        t.description ?? null,
        t.due_date ?? null,
        t.priority ?? 'medium',
        t.status ?? 'open',
        t.created_at ?? new Date().toISOString(),
        t.updated_at ?? new Date().toISOString(),
        t.completed_at ?? null
      )
      .run();
  }
}
