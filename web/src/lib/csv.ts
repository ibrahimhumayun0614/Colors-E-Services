import type { ExportFile, InvoiceItem } from '@/lib/api';

interface Column<T> {
  label: string;
  value: (row: T) => unknown;
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCsv<T>(rows: T[], columns: Column<T>[]): string {
  const header = columns.map((c) => escapeCell(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(','));
  return [header, ...body].join('\r\n');
}

export function downloadCsv(filename: string, csv: string) {
  // Prepend a BOM so Excel reads UTF-8 correctly.
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type CsvEntity = 'clients' | 'services' | 'invoices' | 'tasks';

export const CSV_ENTITY_LABELS: Record<CsvEntity, string> = {
  clients: 'Clients',
  services: 'Services',
  invoices: 'Invoices',
  tasks: 'Tasks',
};

function invoiceTotals(items: InvoiceItem[], taxRate: number) {
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.rate, 0);
  const total = subtotal + subtotal * (taxRate / 100);
  return { subtotal, total };
}

export function buildCsv(file: ExportFile, entity: CsvEntity): { csv: string; count: number } {
  const data = file.data;
  const clientName = new Map((data.clients ?? []).map((c) => [c.id, c.name] as const));
  const serviceName = new Map((data.services ?? []).map((s) => [s.id, s.name] as const));

  switch (entity) {
    case 'clients': {
      const rows = data.clients ?? [];
      return {
        count: rows.length,
        csv: toCsv(rows, [
          { label: 'ID', value: (r) => r.id },
          { label: 'Name', value: (r) => r.name },
          { label: 'Company', value: (r) => r.company },
          { label: 'Email', value: (r) => r.email },
          { label: 'Phone', value: (r) => r.phone },
          { label: 'Status', value: (r) => r.status },
          { label: 'Notes', value: (r) => r.notes },
          { label: 'Created', value: (r) => r.created_at },
        ]),
      };
    }
    case 'services': {
      const rows = data.services ?? [];
      return {
        count: rows.length,
        csv: toCsv(rows, [
          { label: 'ID', value: (r) => r.id },
          { label: 'Client', value: (r) => clientName.get(r.client_id) ?? '' },
          { label: 'Name', value: (r) => r.name },
          { label: 'Type', value: (r) => r.service_type },
          { label: 'Status', value: (r) => r.status },
          { label: 'Billing cycle', value: (r) => r.billing_cycle },
          { label: 'Amount', value: (r) => r.amount },
          { label: 'Currency', value: (r) => r.currency ?? 'USD' },
          { label: 'URL', value: (r) => r.url },
          { label: 'Registrar', value: (r) => r.registrar },
          { label: 'Domain expiry', value: (r) => r.domain_expiry },
          { label: 'Hosting provider', value: (r) => r.hosting_provider },
          { label: 'Hosting expiry', value: (r) => r.hosting_expiry },
          { label: 'Next due', value: (r) => r.next_due_date },
          { label: 'Notes', value: (r) => r.notes },
        ]),
      };
    }
    case 'invoices': {
      const itemsByInvoice = new Map<number, InvoiceItem[]>();
      for (const it of data.invoice_items ?? []) {
        const list = itemsByInvoice.get(it.invoice_id) ?? [];
        list.push(it);
        itemsByInvoice.set(it.invoice_id, list);
      }
      const rows = data.invoices ?? [];
      return {
        count: rows.length,
        csv: toCsv(rows, [
          { label: 'Invoice #', value: (r) => r.invoice_number },
          { label: 'Client', value: (r) => clientName.get(r.client_id) ?? '' },
          { label: 'Issue date', value: (r) => r.issue_date },
          { label: 'Due date', value: (r) => r.due_date },
          { label: 'Status', value: (r) => r.status },
          { label: 'Tax %', value: (r) => r.tax_rate },
          {
            label: 'Subtotal',
            value: (r) => invoiceTotals(itemsByInvoice.get(r.id) ?? [], r.tax_rate).subtotal.toFixed(2),
          },
          {
            label: 'Total',
            value: (r) => invoiceTotals(itemsByInvoice.get(r.id) ?? [], r.tax_rate).total.toFixed(2),
          },
          { label: 'Notes', value: (r) => r.notes },
        ]),
      };
    }
    case 'tasks': {
      const rows = data.tasks ?? [];
      return {
        count: rows.length,
        csv: toCsv(rows, [
          { label: 'ID', value: (r) => r.id },
          { label: 'Title', value: (r) => r.title },
          { label: 'Client', value: (r) => (r.client_id != null ? clientName.get(r.client_id) ?? '' : '') },
          { label: 'Service', value: (r) => (r.service_id != null ? serviceName.get(r.service_id) ?? '' : '') },
          { label: 'Priority', value: (r) => r.priority },
          { label: 'Status', value: (r) => r.status },
          { label: 'Due date', value: (r) => r.due_date },
          { label: 'Description', value: (r) => r.description },
          { label: 'Completed', value: (r) => r.completed_at },
        ]),
      };
    }
    default:
      return { csv: '', count: 0 };
  }
}
