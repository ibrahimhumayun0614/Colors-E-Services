const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret: string, data: string): Promise<string> {
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

/** Stable, unguessable token authorizing public read-only access to one invoice. */
export async function invoiceShareToken(secret: string, invoiceId: number): Promise<string> {
  return hmac(secret, `invoice-share:${invoiceId}`);
}

export async function verifyInvoiceShareToken(
  secret: string,
  invoiceId: number,
  token: string
): Promise<boolean> {
  const expected = await invoiceShareToken(secret, invoiceId);
  if (expected.length !== token.length) return false;
  return crypto.subtle.timingSafeEqual(encoder.encode(expected), encoder.encode(token));
}
