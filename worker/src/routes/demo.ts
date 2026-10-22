import { Hono } from 'hono';
import type { Env } from '../types';
import { getDemoStatus, loadDemoData, removeDemoData } from '../demo-data';

export const demo = new Hono<{ Bindings: Env }>();

demo.get('/status', async (c) => {
  const status = await getDemoStatus(c.env.DB);
  return c.json(status);
});

demo.post('/load', async (c) => {
  try {
    const status = await loadDemoData(c.env.DB);
    return c.json({ ok: true, ...status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load demo data';
    return c.json({ error: message }, 500);
  }
});

demo.delete('/', async (c) => {
  try {
    const status = await removeDemoData(c.env.DB);
    return c.json({ ok: true, ...status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to remove demo data';
    return c.json({ error: message }, 500);
  }
});
