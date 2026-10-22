import type { Env } from '../types';

const DEFAULT_ORIGINS = 'http://localhost:5173,https://ccs-invoice.pages.dev';

export function getAllowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? DEFAULT_ORIGINS)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function resolveCorsOrigin(origin: string | undefined, env: Env): string {
  const allowed = getAllowedOrigins(env);
  if (!origin) return allowed[0] ?? '';
  return allowed.includes(origin) ? origin : '';
}
