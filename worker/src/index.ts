import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { resolveCorsOrigin } from './lib/cors';
import { isAuthorizedRequest } from './lib/session';
import { auth } from './routes/auth';
import { clients } from './routes/clients';
import { websites } from './routes/websites';
import { services } from './routes/services';
import { invoices } from './routes/invoices';
import { dashboard } from './routes/dashboard';
import { tasks } from './routes/tasks';
import { demo } from './routes/demo';
import { data } from './routes/data';
import { publicRoutes } from './routes/public';
import { profile } from './routes/profile';
import { products } from './routes/products';
import { checkDbHealth } from './lib/db-health';

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  const corsMiddleware = cors({
    origin: (origin) => resolveCorsOrigin(origin, c.env),
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  });
  return corsMiddleware(c, next);
});

const publicApiPaths = new Set(['/api/auth/login', '/api/health', '/api/health/db']);

app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname;

  if (publicApiPaths.has(path) || path.startsWith('/api/public/')) {
    await next();
    return;
  }

  const secret = c.env.API_SECRET;

  if (!secret) {
    return c.json({ error: 'Server misconfigured. Set API_SECRET in Cloudflare.' }, 503);
  }

  const authorized = await isAuthorizedRequest(c.req.header('Authorization'), secret);
  if (!authorized) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
});

app.route('/api/auth', auth);
app.route('/api/public', publicRoutes);
app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/health/db', async (c) => {
  try {
    const health = await checkDbHealth(c.env.DB);
    return c.json(health, health.ok ? 200 : 503);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database unreachable';
    return c.json({ ok: false, error: message }, 503);
  }
});

app.route('/api/clients', clients);
app.route('/api/websites', websites);
app.route('/api/services', services);
app.route('/api/invoices', invoices);
app.route('/api/tasks', tasks);
app.route('/api/demo', demo);
app.route('/api/data', data);
app.route('/api/dashboard', dashboard);
app.route('/api/profile', profile);
app.route('/api/products', products);

export default app;
