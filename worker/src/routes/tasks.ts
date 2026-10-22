import { Hono } from 'hono';
import type { Env, Task } from '../types';
import { applyTaskCompletionToService } from '../lib/service-actions';

export const tasks = new Hono<{ Bindings: Env }>();

tasks.get('/', async (c) => {
  const status = c.req.query('status');
  const clientId = c.req.query('client_id');
  const overdue = c.req.query('overdue');
  const search = c.req.query('search');

  let query = `SELECT t.*, c.name as client_name FROM tasks t
               LEFT JOIN clients c ON c.id = t.client_id WHERE 1=1`;
  const params: string[] = [];

  if (status) {
    query += ' AND t.status = ?';
    params.push(status);
  }

  if (clientId) {
    query += ' AND t.client_id = ?';
    params.push(clientId);
  }

  if (overdue === '1') {
    query += ` AND t.status = 'open' AND t.due_date IS NOT NULL AND date(t.due_date) < date('now')`;
  }

  if (search) {
    query += ' AND (t.title LIKE ? OR t.description LIKE ? OR c.name LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  query += ` ORDER BY
    CASE WHEN t.status = 'done' THEN 1 ELSE 0 END,
    CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,
    t.due_date ASC,
    t.created_at DESC`;

  const { results } = await c.env.DB.prepare(query).bind(...params).all<Task>();
  return c.json(results);
});

tasks.get('/:id', async (c) => {
  const id = c.req.param('id');
  const task = await c.env.DB.prepare(
    `SELECT t.*, c.name as client_name FROM tasks t
     LEFT JOIN clients c ON c.id = t.client_id WHERE t.id = ?`
  )
    .bind(id)
    .first<Task>();

  if (!task) return c.json({ error: 'Task not found' }, 404);
  return c.json(task);
});

tasks.post('/', async (c) => {
  const body = await c.req.json<Partial<Task>>();

  if (!body.title?.trim()) {
    return c.json({ error: 'Title is required' }, 400);
  }

  const priority = body.priority ?? 'medium';
  if (!['low', 'medium', 'high'].includes(priority)) {
    return c.json({ error: 'Invalid priority' }, 400);
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO tasks (client_id, service_id, title, description, due_date, priority, status)
     VALUES (?, ?, ?, ?, ?, ?, 'open')`
  )
    .bind(
      body.client_id ?? null,
      body.service_id ?? null,
      body.title.trim(),
      body.description?.trim() ?? null,
      body.due_date ?? null,
      priority
    )
    .run();

  const task = await c.env.DB.prepare(
    `SELECT t.*, c.name as client_name FROM tasks t
     LEFT JOIN clients c ON c.id = t.client_id WHERE t.id = ?`
  )
    .bind(result.meta.last_row_id)
    .first<Task>();

  return c.json(task, 201);
});

tasks.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Partial<Task>>();

  const existing = await c.env.DB.prepare('SELECT id FROM tasks WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ error: 'Task not found' }, 404);

  if (body.priority && !['low', 'medium', 'high'].includes(body.priority)) {
    return c.json({ error: 'Invalid priority' }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE tasks SET
      client_id = ?,
      title = COALESCE(?, title),
      description = ?,
      due_date = ?,
      priority = COALESCE(?, priority),
      status = COALESCE(?, status),
      completed_at = CASE
        WHEN ? = 'done' THEN COALESCE(completed_at, datetime('now'))
        WHEN ? = 'open' THEN NULL
        ELSE completed_at
      END,
      updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(
      body.client_id ?? null,
      body.title?.trim() ?? null,
      body.description ?? null,
      body.due_date ?? null,
      body.priority ?? null,
      body.status ?? null,
      body.status ?? null,
      body.status ?? null,
      id
    )
    .run();

  if (body.status === 'done') {
    await applyTaskCompletionToService(c.env.DB, Number(id));
  }

  const task = await c.env.DB.prepare(
    `SELECT t.*, c.name as client_name FROM tasks t
     LEFT JOIN clients c ON c.id = t.client_id WHERE t.id = ?`
  )
    .bind(id)
    .first<Task>();

  return c.json(task);
});

tasks.patch('/:id/status', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ status: 'open' | 'done' }>();

  if (!body.status || !['open', 'done'].includes(body.status)) {
    return c.json({ error: 'Invalid status' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM tasks WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ error: 'Task not found' }, 404);

  await c.env.DB.prepare(
    `UPDATE tasks SET
      status = ?,
      completed_at = CASE WHEN ? = 'done' THEN datetime('now') ELSE NULL END,
      updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(body.status, body.status, id)
    .run();

  if (body.status === 'done') {
    await applyTaskCompletionToService(c.env.DB, Number(id));
  }

  const task = await c.env.DB.prepare(
    `SELECT t.*, c.name as client_name FROM tasks t
     LEFT JOIN clients c ON c.id = t.client_id WHERE t.id = ?`
  )
    .bind(id)
    .first<Task>();

  return c.json(task);
});

tasks.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
