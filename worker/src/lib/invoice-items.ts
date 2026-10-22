export type InvoiceItemInsert = {
  description: string;
  quantity: number;
  rate: number;
  service_id?: number | null;
  line_date?: string | null;
};

export async function insertInvoiceItem(
  db: D1Database,
  invoiceId: number,
  item: InvoiceItemInsert
): Promise<void> {
  const lineDate = item.line_date?.trim() || null;
  try {
    await db
      .prepare(
        `INSERT INTO invoice_items (invoice_id, service_id, description, quantity, rate, line_date)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(invoiceId, item.service_id ?? null, item.description, item.quantity, item.rate, lineDate)
      .run();
  } catch {
    await db
      .prepare(
        `INSERT INTO invoice_items (invoice_id, service_id, description, quantity, rate)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(invoiceId, item.service_id ?? null, item.description, item.quantity, item.rate)
      .run();
  }
}
