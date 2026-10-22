import type { Product } from '@/lib/api';

/** Removes catalog serial prefix from saved line text (e.g. "1 — A4 Photo Copy"). */
export function stripCatalogSerialPrefix(description: string): string {
  const trimmed = description.trim();
  const without = trimmed.replace(/^\d+\s*[—–-]\s*/, '').trim();
  return without || trimmed;
}

export function productLineDescription(product: Product): string {
  const desc = product.description?.trim();
  return desc ? `${product.name} — ${desc}` : product.name;
}

/** Match typed text to a catalog product (exact name or serial). */
export function matchProductByTypedName(products: Product[], text: string): Product | undefined {
  const t = text.trim().toLowerCase();
  if (!t) return undefined;
  return products.find((p) => {
    const name = p.name.toLowerCase();
    const serial = String(p.serial_number ?? '').toLowerCase();
    return name === t || serial === t || `${serial}. ${name}` === t;
  });
}
