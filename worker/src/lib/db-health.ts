export const REQUIRED_TABLES = [
  'clients',
  'services',
  'invoices',
  'invoice_items',
  'tasks',
  'user_profile',
  'login_attempts',
] as const;

export interface DbHealthResult {
  ok: boolean;
  tablesFound: number;
  tablesExpected: number;
  missing: string[];
}

export async function checkDbHealth(db: D1Database): Promise<DbHealthResult> {
  const missing: string[] = [];

  for (const table of REQUIRED_TABLES) {
    try {
      await db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).first();
    } catch {
      missing.push(table);
    }
  }

  return {
    ok: missing.length === 0,
    tablesFound: REQUIRED_TABLES.length - missing.length,
    tablesExpected: REQUIRED_TABLES.length,
    missing,
  };
}
