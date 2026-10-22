import { Hono } from 'hono';
import type { Env, Service } from '../types';
import { getWorkspaceDefaultCurrency, normalizeCurrency } from '../lib/currency';

/** Legacy route — reads/writes domain_hosting services only. Prefer /api/services. */
export const websites = new Hono<{ Bindings: Env }>();

function mapRow(row: Service & { client_name?: string }) {
  return { ...row, monthly_cost: row.amount };
}

websites.get('/', async (c) => {
  const clientId = c.req.query('client_id');
  const expiringDays = c.req.query('expiring_days');

  if (expiringDays) {
    const days = parseInt(expiringDays, 10);
    const { results } = await c.env.DB.prepare(
      `SELECT s.*, c.name as client_name FROM services s
       JOIN clients c ON c.id = s.client_id
       WHERE s.service_type = 'domain_hosting' AND (
         (s.domain_expiry IS NOT NULL AND date(s.domain_expiry) <= date('now', '+' || ? || ' days'))
         OR (s.hosting_expiry IS NOT NULL AND date(s.hosting_expiry) <= date('now', '+' || ? || ' days'))
       )
       ORDER BY s.domain_expiry ASC`
    )
      .bind(days, days)
      .all<Service & { client_name: string }>();

    return c.json(results.map(mapRow));
  }

  let query = `SELECT s.*, c.name as client_name FROM services s
               JOIN clients c ON c.id = s.client_id
               WHERE s.service_type = 'domain_hosting'`;
  const params: string[] = [];

  if (clientId) {
    query += ' AND s.client_id = ?';
    params.push(clientId);
  }

  query += ' ORDER BY s.domain_expiry IS NULL, s.domain_expiry ASC';

  const { results } = await c.env.DB.prepare(query).bind(...params).all<Service & { client_name: string }>();
  return c.json(results.map(mapRow));
});

websites.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT s.*, c.name as client_name FROM services s
     JOIN clients c ON c.id = s.client_id
     WHERE s.id = ? AND s.service_type = 'domain_hosting'`
  )
    .bind(id)
    .first<Service & { client_name: string }>();

  if (!row) return c.json({ error: 'Website not found' }, 404);
  return c.json(mapRow(row));
});

websites.post('/', async (c) => {
  const body = await c.req.json<Partial<Service & { monthly_cost?: number }>>();

  if (!body.client_id || !body.name?.trim()) {
    return c.json({ error: 'client_id and name are required' }, 400);
  }

  const amount = body.amount ?? body.monthly_cost ?? 0;
  const currency = normalizeCurrency(
    body.currency,
    await getWorkspaceDefaultCurrency(c.env.DB)
  );

  const result = await c.env.DB.prepare(
    `INSERT INTO services (
      client_id, service_type, name, status, billing_cycle, amount, currency,
      url, registrar, domain_expiry, hosting_provider, hosting_expiry, cms, notes
    ) VALUES (?, 'domain_hosting', ?, 'active', 'monthly', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      body.client_id,
      body.name.trim(),
      amount,
      currency,
      body.url ?? null,
      body.registrar ?? null,
      body.domain_expiry ?? null,
      body.hosting_provider ?? null,
      body.hosting_expiry ?? null,
      body.cms ?? null,
      body.notes ?? null
    )
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM services WHERE id = ?')
    .bind(result.meta.last_row_id)
    .first<Service>();

  return c.json(mapRow(row!), 201);
});

websites.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Partial<Service & { monthly_cost?: number }>>();

  const existing = await c.env.DB.prepare(
    "SELECT id FROM services WHERE id = ? AND service_type = 'domain_hosting'"
  )
    .bind(id)
    .first();

  if (!existing) return c.json({ error: 'Website not found' }, 404);

  const amount = body.amount ?? body.monthly_cost ?? null;

  await c.env.DB.prepare(
    `UPDATE services SET
      name = COALESCE(?, name),
      url = ?, registrar = ?, domain_expiry = ?,
      hosting_provider = ?, hosting_expiry = ?, cms = ?,
      amount = COALESCE(?, amount),
      currency = COALESCE(?, currency),
      notes = ?, updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(
      body.name?.trim() ?? null,
      body.url ?? null,
      body.registrar ?? null,
      body.domain_expiry ?? null,
      body.hosting_provider ?? null,
      body.hosting_expiry ?? null,
      body.cms ?? null,
      amount,
      body.currency ?? null,
      body.notes ?? null,
      id
    )
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM services WHERE id = ?').bind(id).first<Service>();
  return c.json(mapRow(row!));
});

websites.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM services WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
