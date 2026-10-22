import type { HonoRequest } from 'hono';

export const MAX_LOGIN_ATTEMPTS = 3;
export const LOGIN_WINDOW_SECONDS = 15 * 60;
export const LOGIN_BLOCK_SECONDS = 15 * 60;

export function isLoginRateLimitEnabled(env: { DISABLE_LOGIN_RATE_LIMIT?: string }): boolean {
  return env.DISABLE_LOGIN_RATE_LIMIT !== 'true';
}

export function clientIp(req: HonoRequest): string {
  return (
    req.header('CF-Connecting-IP') ||
    req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export interface RateLimitState {
  blocked: boolean;
  retryAfter: number;
}

export async function checkLoginRateLimit(db: D1Database, ip: string): Promise<RateLimitState> {
  const row = await db
    .prepare(
      `SELECT CAST((julianday(blocked_until) - julianday('now')) * 86400 AS INTEGER) AS seconds_left
       FROM login_attempts
       WHERE ip = ? AND blocked_until IS NOT NULL AND blocked_until > datetime('now')`
    )
    .bind(ip)
    .first<{ seconds_left: number }>();

  if (!row) return { blocked: false, retryAfter: 0 };
  return { blocked: true, retryAfter: Math.max(row.seconds_left ?? LOGIN_BLOCK_SECONDS, 1) };
}

export interface LoginFailureResult {
  attempts: number;
  remaining: number;
  blocked: boolean;
}

export async function recordLoginFailure(db: D1Database, ip: string): Promise<LoginFailureResult> {
  await db
    .prepare(
      `INSERT INTO login_attempts (ip, attempts, first_attempt, blocked_until)
       VALUES (?, 1, datetime('now'), NULL)
       ON CONFLICT(ip) DO UPDATE SET
         attempts = CASE
           WHEN login_attempts.first_attempt <= datetime('now', ?) THEN 1
           ELSE login_attempts.attempts + 1
         END,
         first_attempt = CASE
           WHEN login_attempts.first_attempt <= datetime('now', ?) THEN datetime('now')
           ELSE login_attempts.first_attempt
         END`
    )
    .bind(ip, `-${LOGIN_WINDOW_SECONDS} seconds`, `-${LOGIN_WINDOW_SECONDS} seconds`)
    .run();

  await db
    .prepare(
      `UPDATE login_attempts
       SET blocked_until = datetime('now', ?)
       WHERE ip = ? AND attempts >= ?`
    )
    .bind(`+${LOGIN_BLOCK_SECONDS} seconds`, ip, MAX_LOGIN_ATTEMPTS)
    .run();

  const row = await db
    .prepare('SELECT attempts FROM login_attempts WHERE ip = ?')
    .bind(ip)
    .first<{ attempts: number }>();

  const attempts = row?.attempts ?? 1;
  const remaining = Math.max(MAX_LOGIN_ATTEMPTS - attempts, 0);

  return { attempts, remaining, blocked: remaining <= 0 };
}

export async function resetLoginAttempts(db: D1Database, ip: string): Promise<void> {
  await db.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run();
}
