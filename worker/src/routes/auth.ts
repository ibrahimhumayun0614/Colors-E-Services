import { Hono } from 'hono';
import type { Env } from '../types';
import {
  createSessionToken,
  isAuthorizedRequest,
  sessionTtl,
  verifyPassword,
} from '../lib/session';
import {
  checkLoginRateLimit,
  clientIp,
  isLoginRateLimitEnabled,
  LOGIN_BLOCK_SECONDS,
  recordLoginFailure,
  resetLoginAttempts,
} from '../lib/rate-limit';

export const auth = new Hono<{ Bindings: Env }>();

auth.post('/login', async (c) => {
  try {
    const secret = c.env.API_SECRET;

    if (!secret) {
      return c.json({ error: 'Login is not configured. Set API_SECRET in Cloudflare.' }, 503);
    }

    const ip = clientIp(c.req);
    const rateLimit = isLoginRateLimitEnabled(c.env);

    if (rateLimit) {
      const limit = await checkLoginRateLimit(c.env.DB, ip);
      if (limit.blocked) {
        return c.json(
          { error: 'Too many login attempts. Please try again later.' },
          429,
          { 'Retry-After': String(limit.retryAfter) }
        );
      }
    }

    const body = await c.req.json<{ password?: string; remember?: boolean }>();
    const remember = body.remember === true;

    if (!body.password || !(await verifyPassword(body.password, secret))) {
      if (rateLimit) {
        const failure = await recordLoginFailure(c.env.DB, ip);

        if (failure.blocked) {
          return c.json(
            { error: 'Too many login attempts. Please try again later.' },
            429,
            { 'Retry-After': String(LOGIN_BLOCK_SECONDS) }
          );
        }

        const attemptWord = failure.remaining === 1 ? 'attempt' : 'attempts';
        return c.json(
          {
            error: `Incorrect password. ${failure.remaining} more ${attemptWord} before your account is locked.`,
            remaining: failure.remaining,
          },
          401
        );
      }

      return c.json({ error: 'Incorrect password. Please try again.' }, 401);
    }

    if (rateLimit) {
      await resetLoginAttempts(c.env.DB, ip);
    }

    const expiresIn = sessionTtl(remember);
    const token = await createSessionToken(secret, expiresIn);

    return c.json({ ok: true, token, expiresIn });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Login failed:', message);
    return c.json(
      { error: 'Sign-in is temporarily unavailable. Please try again later.' },
      503
    );
  }
});

auth.get('/check', async (c) => {
  const secret = c.env.API_SECRET;

  if (!secret) {
    return c.json({ error: 'Server misconfigured. Set API_SECRET in Cloudflare.' }, 503);
  }

  const authorized = await isAuthorizedRequest(c.req.header('Authorization'), secret);
  if (!authorized) {
    return c.json({ authenticated: false }, 401);
  }

  return c.json({ authenticated: true });
});
