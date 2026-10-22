import { Hono } from 'hono';
import type { Env, Product } from '../types';

export const products = new Hono<{ Bindings: Env }>();

const ORDER_BY_SERIAL = `ORDER BY
  CASE WHEN serial_number GLOB '[0-9]*' THEN CAST(serial_number AS INTEGER) ELSE 999999 END,
  serial_number ASC,
  name ASC`;

async function nextSerialNumber(db: D1Database): Promise<string> {
  const row = await db
    .prepare(
      `SELECT COALESCE(MAX(CASE WHEN serial_number GLOB '[0-9]*' THEN CAST(serial_number AS INTEGER) ELSE 0 END), 0) + 1 AS next_sn
       FROM products`
    )
    .first<{ next_sn: number }>();
  return String(row?.next_sn ?? 1);
}

async function serialInUse(db: D1Database, serial: string, excludeId?: number): Promise<boolean> {
  const query =
    excludeId != null
      ? 'SELECT id FROM products WHERE serial_number = ? AND id != ? LIMIT 1'
      : 'SELECT id FROM products WHERE serial_number = ? LIMIT 1';
  const row =
    excludeId != null
      ? await db.prepare(query).bind(serial, excludeId).first()
      : await db.prepare(query).bind(serial).first();
  return !!row;
}

products.get('/', async (c) => {
  const search = c.req.query('search');
  const activeOnly = c.req.query('active') !== '0';

  let query = 'SELECT * FROM products WHERE 1=1';
  const params: (string | number)[] = [];

  if (activeOnly) {
    query += ' AND is_active = 1';
  }

  if (search?.trim()) {
    query += ' AND (name LIKE ? OR sku LIKE ? OR description LIKE ? OR serial_number LIKE ?)';
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term);
  }

  query += ` ${ORDER_BY_SERIAL}`;

  const { results } = await c.env.DB.prepare(query).bind(...params).all<Product>();
  return c.json(results);
});

products.get('/:id', async (c) => {
  const id = c.req.param('id');
  const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?')
    .bind(id)
    .first<Product>();

  if (!product) return c.json({ error: 'Product not found' }, 404);
  return c.json(product);
});

products.post('/', async (c) => {
  const body = await c.req.json<Partial<Product>>();

  if (!body.name?.trim()) {
    return c.json({ error: 'Product name is required' }, 400);
  }

  const unitPrice = Number(body.unit_price);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return c.json({ error: 'Unit price must be a non-negative number' }, 400);
  }

  let serialNumber = body.serial_number?.trim() || (await nextSerialNumber(c.env.DB));
  if (await serialInUse(c.env.DB, serialNumber)) {
    return c.json({ error: 'Serial number is already in use' }, 400);
  }

  const currency = (body.currency ?? 'INR').trim().toUpperCase() || 'INR';
  const isActive = body.is_active === 0 || body.is_active === false ? 0 : 1;

  const result = await c.env.DB.prepare(
    `INSERT INTO products (serial_number, name, description, sku, unit_price, currency, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      serialNumber,
      body.name.trim(),
      body.description?.trim() || null,
      body.sku?.trim() || null,
      unitPrice,
      currency,
      isActive
    )
    .run();

  const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?')
    .bind(result.meta.last_row_id)
    .first<Product>();

  return c.json(product, 201);
});

products.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Partial<Product>>();

  const existing = await c.env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ error: 'Product not found' }, 404);

  if (!body.name?.trim()) {
    return c.json({ error: 'Product name is required' }, 400);
  }

  const unitPrice = Number(body.unit_price);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return c.json({ error: 'Unit price must be a non-negative number' }, 400);
  }

  const serialNumber = body.serial_number?.trim();
  if (!serialNumber) {
    return c.json({ error: 'Serial number is required' }, 400);
  }
  if (await serialInUse(c.env.DB, serialNumber, Number(id))) {
    return c.json({ error: 'Serial number is already in use' }, 400);
  }

  const currency = (body.currency ?? 'INR').trim().toUpperCase() || 'INR';
  const isActive = body.is_active === 0 || body.is_active === false ? 0 : 1;

  await c.env.DB.prepare(
    `UPDATE products SET
       serial_number = ?,
       name = ?,
       description = ?,
       sku = ?,
       unit_price = ?,
       currency = ?,
       is_active = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(
      serialNumber,
      body.name.trim(),
      body.description?.trim() || null,
      body.sku?.trim() || null,
      unitPrice,
      currency,
      isActive,
      id
    )
    .run();

  const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first<Product>();
  return c.json(product);
});

products.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ error: 'Product not found' }, 404);

  await c.env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
