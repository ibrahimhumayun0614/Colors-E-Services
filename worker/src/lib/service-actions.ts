import type { BillingCycle, Service, ServiceType } from '../types';

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addToDate(
  dateStr: string,
  opts: { years?: number; months?: number; days?: number }
): string {
  const d = parseDate(dateStr);
  if (opts.years) d.setFullYear(d.getFullYear() + opts.years);
  if (opts.months) d.setMonth(d.getMonth() + opts.months);
  if (opts.days) d.setDate(d.getDate() + opts.days);
  return formatDateISO(d);
}

export function todayISO(): string {
  return formatDateISO(new Date());
}

export type RenewalTarget = 'domain' | 'hosting' | 'maintenance' | 'all';

const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  domain_hosting: 'Domain & Hosting',
  website_maintenance: 'Website Maintenance',
  logo_design: 'Logo Design',
  content_writing: 'Content Writing',
  email_configuration: 'Email Configuration',
};

export function serviceTypeLabel(type: ServiceType): string {
  return SERVICE_TYPE_LABELS[type] ?? type;
}

export function maintenanceIntervalMonths(cycle: BillingCycle): number {
  switch (cycle) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'annual':
      return 12;
    default:
      return 1;
  }
}

export function bumpDate(current: string | null | undefined, years: number): string {
  const base = current && current >= todayISO() ? current : todayISO();
  return addToDate(base, { years });
}

export function bumpMaintenanceDate(service: Service): string {
  const base = service.next_due_date && service.next_due_date >= todayISO()
    ? service.next_due_date
    : todayISO();
  return addToDate(base, { months: maintenanceIntervalMonths(service.billing_cycle) });
}

export function renewalTaskTitle(service: Service, target: RenewalTarget): string {
  if (service.service_type === 'website_maintenance' || target === 'maintenance') {
    return `Maintenance due — ${service.name}`;
  }
  if (target === 'domain') return `Renew domain — ${service.name}`;
  if (target === 'hosting') return `Renew hosting — ${service.name}`;
  return `Renew service — ${service.name}`;
}

export function invoiceLineFromService(service: Service): {
  description: string;
  quantity: number;
  rate: number;
} {
  const label = serviceTypeLabel(service.service_type);
  const cycle =
    service.billing_cycle !== 'none' && service.billing_cycle !== 'one_time'
      ? ` (${service.billing_cycle})`
      : '';
  return {
    description: `${label} — ${service.name}${cycle}`,
    quantity: 1,
    rate: service.amount ?? 0,
  };
}

export async function completeRenewalTasks(
  db: D1Database,
  serviceId: number,
  titlePattern?: string
) {
  let query = `UPDATE tasks SET status = 'done', completed_at = datetime('now'), updated_at = datetime('now')
               WHERE service_id = ? AND status = 'open'`;
  const params: (number | string)[] = [serviceId];

  if (titlePattern) {
    query += ' AND title LIKE ?';
    params.push(titlePattern);
  }

  await db.prepare(query).bind(...params).run();
}

export async function activateLeadClient(db: D1Database, clientId: number) {
  const client = await db
    .prepare('SELECT status FROM clients WHERE id = ?')
    .bind(clientId)
    .first<{ status: string }>();

  if (client?.status !== 'lead') return false;

  await db
    .prepare(`UPDATE clients SET status = 'active', updated_at = datetime('now') WHERE id = ?`)
    .bind(clientId)
    .run();

  await db
    .prepare(
      `UPDATE services SET status = 'active', updated_at = datetime('now')
       WHERE client_id = ? AND status = 'lead'`
    )
    .bind(clientId)
    .run();

  return true;
}

export async function syncClientArchiveServices(
  db: D1Database,
  clientId: number,
  newStatus: string
) {
  if (newStatus === 'inactive') {
    await db
      .prepare(
        `UPDATE services SET status = 'paused', updated_at = datetime('now')
         WHERE client_id = ? AND status = 'active'`
      )
      .bind(clientId)
      .run();
  } else if (newStatus === 'active') {
    await db
      .prepare(
        `UPDATE services SET status = 'active', updated_at = datetime('now')
         WHERE client_id = ? AND status = 'paused'`
      )
      .bind(clientId)
      .run();
  }
}

/** When a linked renewal task is completed, advance the service dates. */
export async function applyTaskCompletionToService(db: D1Database, taskId: number) {
  const task = await db
    .prepare('SELECT service_id, title FROM tasks WHERE id = ?')
    .bind(taskId)
    .first<{ service_id: number | null; title: string }>();

  if (!task?.service_id) return;

  const service = await db
    .prepare('SELECT * FROM services WHERE id = ?')
    .bind(task.service_id)
    .first<Service>();

  if (!service) return;

  if (service.service_type === 'website_maintenance') {
    const nextDue = bumpMaintenanceDate(service);
    await db
      .prepare(`UPDATE services SET next_due_date = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(nextDue, service.id)
      .run();
    return;
  }

  if (service.service_type === 'domain_hosting') {
    const title = task.title.toLowerCase();
    const target: RenewalTarget = title.includes('domain')
      ? 'domain'
      : title.includes('hosting')
        ? 'hosting'
        : 'all';
    const updates: { domain_expiry?: string; hosting_expiry?: string } = {};
    if (target === 'domain' || target === 'all') {
      updates.domain_expiry = bumpDate(service.domain_expiry, 1);
    }
    if (target === 'hosting' || target === 'all') {
      updates.hosting_expiry = bumpDate(service.hosting_expiry, 1);
    }
    await db
      .prepare(
        `UPDATE services SET
          domain_expiry = COALESCE(?, domain_expiry),
          hosting_expiry = COALESCE(?, hosting_expiry),
          updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(updates.domain_expiry ?? null, updates.hosting_expiry ?? null, service.id)
      .run();
  }
}
