import { Hono } from 'hono';
import type { Env, Client } from '../types';
import { syncClientArchiveServices } from '../lib/service-actions';

export const clients = new Hono<{ Bindings: Env }>();

clients.get('/', async (c) => {
  const status = c.req.query('status');
  const search = c.req.query('search');

  let query = 'SELECT * FROM clients WHERE 1=1';
  const params: string[] = [];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (search) {
    query += ' AND (name LIKE ? OR company LIKE ? OR email LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  query += ' ORDER BY name ASC';

  const { results } = await c.env.DB.prepare(query).bind(...params).all<Client>();
  return c.json(results);
});

clients.get('/:id', async (c) => {
  const id = c.req.param('id');
  const client = await c.env.DB.prepare('SELECT * FROM clients WHERE id = ?')
    .bind(id)
    .first<Client>();

  if (!client) return c.json({ error: 'Client not found' }, 404);
  return c.json(client);
});

clients.post('/', async (c) => {
  const body = await c.req.json<Partial<Client>>();

  if (!body.name?.trim()) {
    return c.json({ error: 'Name is required' }, 400);
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO clients (name, company, email, phone, address, city, state, zip, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      body.name.trim(),
      body.company ?? null,
      body.email ?? null,
      body.phone ?? null,
      body.address ?? null,
      body.city ?? null,
      body.state ?? null,
      body.zip ?? null,
      body.status ?? 'active',
      body.notes ?? null
    )
    .run();

  const client = await c.env.DB.prepare('SELECT * FROM clients WHERE id = ?')
    .bind(result.meta.last_row_id)
    .first<Client>();

  return c.json(client, 201);
});

clients.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Partial<Client>>();

  const existing = await c.env.DB.prepare('SELECT id FROM clients WHERE id = ?')
    .bind(id)
    .first();

  if (!existing) return c.json({ error: 'Client not found' }, 404);

  await c.env.DB.prepare(
    `UPDATE clients SET
      name = COALESCE(?, name),
      company = COALESCE(?, company),
      email = COALESCE(?, email),
      phone = COALESCE(?, phone),
      address = COALESCE(?, address),
      city = COALESCE(?, city),
      state = COALESCE(?, state),
      zip = COALESCE(?, zip),
      status = COALESCE(?, status),
      notes = COALESCE(?, notes),
      updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(
      body.name !== undefined ? body.name.trim() || null : null,
      body.company !== undefined ? body.company || null : null,
      body.email !== undefined ? body.email || null : null,
      body.phone !== undefined ? body.phone || null : null,
      body.address !== undefined ? body.address || null : null,
      body.city !== undefined ? body.city || null : null,
      body.state !== undefined ? body.state || null : null,
      body.zip !== undefined ? body.zip || null : null,
      body.status ?? null,
      body.notes !== undefined ? body.notes || null : null,
      id
    )
    .run();

  if (body.status) {
    await syncClientArchiveServices(c.env.DB, Number(id), body.status);
  }

  const client = await c.env.DB.prepare('SELECT * FROM clients WHERE id = ?')
    .bind(id)
    .first<Client>();

  return c.json(client);
});

clients.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM clients WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
