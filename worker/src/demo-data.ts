import seedSql from '../seed.sql';

const REMOVE_DEMO_STATEMENTS = [
  `DELETE FROM invoice_items WHERE invoice_id IN (
    SELECT id FROM invoices WHERE client_id IN (SELECT id FROM clients WHERE email LIKE '%@demo.local')
  )`,
  `DELETE FROM invoices WHERE client_id IN (SELECT id FROM clients WHERE email LIKE '%@demo.local')`,
  `DELETE FROM services WHERE client_id IN (SELECT id FROM clients WHERE email LIKE '%@demo.local')`,
  `DELETE FROM tasks WHERE client_id IN (SELECT id FROM clients WHERE email LIKE '%@demo.local') OR title LIKE '%[demo]%'`,
  `DELETE FROM clients WHERE email LIKE '%@demo.local'`,
];

function parseSqlStatements(sql: string): string[] {
  const withoutComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  return withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function runStatements(db: D1Database, statements: string[]) {
  for (const sql of statements) {
    await db.prepare(sql).run();
  }
}

export async function getDemoStatus(db: D1Database) {
  const row = await db
    .prepare(`SELECT COUNT(*) as count FROM clients WHERE email LIKE '%@demo.local'`)
    .first<{ count: number }>();

  const clientCount = row?.count ?? 0;

  return {
    loaded: clientCount > 0,
    clientCount,
  };
}

export async function removeDemoData(db: D1Database) {
  await runStatements(db, REMOVE_DEMO_STATEMENTS);
  return getDemoStatus(db);
}

export async function loadDemoData(db: D1Database) {
  const statements = parseSqlStatements(seedSql);
  await runStatements(db, statements);
  return getDemoStatus(db);
}
