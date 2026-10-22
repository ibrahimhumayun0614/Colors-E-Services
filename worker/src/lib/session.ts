const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const SESSION_TTL_DEFAULT = 60 * 60 * 24;
export const SESSION_TTL_REMEMBER = 60 * 60 * 24 * 30;

export function sessionTtl(remember: boolean): number {
  return remember ? SESSION_TTL_REMEMBER : SESSION_TTL_DEFAULT;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + '='.repeat(padLen));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return base64UrlEncode(new Uint8Array(signature));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.byteLength !== bBytes.byteLength) return false;
  return crypto.subtle.timingSafeEqual(aBytes, bBytes);
}

export function extractBearer(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

export async function createSessionToken(secret: string, ttlSeconds: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify({ exp })));
  const signature = await hmacSign(secret, payloadB64);
  return `${payloadB64}.${signature}`;
}

export async function verifySessionToken(token: string, secret: string): Promise<boolean> {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;

  const payloadB64 = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = await hmacSign(secret, payloadB64);

  if (!timingSafeEqual(signature, expected)) return false;

  try {
    const payload = JSON.parse(decoder.decode(base64UrlDecode(payloadB64))) as { exp?: number };
    return typeof payload.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function isAuthorizedRequest(
  authHeader: string | undefined,
  secret: string
): Promise<boolean> {
  const token = extractBearer(authHeader);
  if (!token) return false;
  return verifySessionToken(token, secret);
}

export async function verifyPassword(provided: string, secret: string): Promise<boolean> {
  const providedBytes = encoder.encode(provided);
  const secretBytes = encoder.encode(secret);
  if (providedBytes.byteLength !== secretBytes.byteLength) return false;
  return crypto.subtle.timingSafeEqual(providedBytes, secretBytes);
}
