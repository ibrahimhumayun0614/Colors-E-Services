import type { BillingCycle, Service, ServiceStatus, ServiceType } from '@/lib/api';
import { getUserProfile } from '@/lib/auth';
import { formatCurrency } from '@/lib/utils';

export const SERVICE_TYPE_OPTIONS: { value: ServiceType; label: string; description: string }[] = [
  { value: 'domain_hosting', label: 'Domain & Hosting', description: 'Track domains, hosting, and renewals' },
  { value: 'website_maintenance', label: 'Website Maintenance', description: 'Recurring maintenance with due dates' },
  { value: 'logo_design', label: 'Logo Design', description: 'Brand and logo deliverables' },
  { value: 'content_writing', label: 'Content Writing', description: 'Copy and content projects' },
  { value: 'email_configuration', label: 'Email Configuration', description: 'Email setup and accounts' },
];

export const SERVICE_STATUS_OPTIONS: { value: ServiceStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'lead', label: 'Lead' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
];

export const BILLING_CYCLE_OPTIONS: { value: BillingCycle; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
  { value: 'one_time', label: 'One-time' },
  { value: 'none', label: 'None' },
];

export const CURRENCY_OPTIONS = [{ value: 'INR', label: 'INR (₹)', symbol: '₹' }] as const;

export type ServiceCurrency = (typeof CURRENCY_OPTIONS)[number]['value'];

export function currencyLabel(code: string | null | undefined) {
  return CURRENCY_OPTIONS.find((c) => c.value === code)?.label ?? code ?? 'INR';
}

/** Workspace default currency from the synced profile (falls back to INR). */
export function getDefaultCurrency(): ServiceCurrency {
  const code = getUserProfile().default_currency?.trim().toUpperCase() || 'INR';
  return (CURRENCY_OPTIONS.some((c) => c.value === code) ? code : 'INR') as ServiceCurrency;
}

export function resolveCurrency(code: string | null | undefined): string {
  const trimmed = code?.trim().toUpperCase();
  if (trimmed && CURRENCY_OPTIONS.some((c) => c.value === trimmed)) return trimmed;
  return getDefaultCurrency();
}

export function serviceTypeLabel(type: ServiceType): string {
  return SERVICE_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

export function serviceTypeBadgeClass(type: ServiceType): string {
  const map: Record<ServiceType, string> = {
    domain_hosting: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300',
    website_maintenance: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/40 dark:bg-violet-900/20 dark:text-violet-300',
    logo_design: 'border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-900/40 dark:bg-pink-900/20 dark:text-pink-300',
    content_writing: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300',
    email_configuration: 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-900/40 dark:bg-cyan-900/20 dark:text-cyan-300',
  };
  return map[type];
}

export function hasRenewalTracking(service: Service): boolean {
  return service.service_type === 'domain_hosting' || service.service_type === 'website_maintenance';
}

/** One-time / project work — managed on client detail, not the global Services page. */
export const CLIENT_ONLY_SERVICE_TYPES: ServiceType[] = [
  'logo_design',
  'content_writing',
  'email_configuration',
];

export const TRACKED_SERVICE_TYPES: ServiceType[] = ['domain_hosting', 'website_maintenance'];

export function isClientOnlyService(service: Pick<Service, 'service_type'>): boolean {
  return CLIENT_ONLY_SERVICE_TYPES.includes(service.service_type);
}

export const TRACKED_SERVICE_TYPE_OPTIONS = SERVICE_TYPE_OPTIONS.filter((o) =>
  TRACKED_SERVICE_TYPES.includes(o.value)
);

export function billingCycleLabel(cycle: BillingCycle | null | undefined): string {
  return BILLING_CYCLE_OPTIONS.find((o) => o.value === cycle)?.label ?? 'None';
}

/** Recurring fees that can renew (excludes one-time projects and "none"). */
export function isRecurringBilling(cycle: BillingCycle | null | undefined): boolean {
  return cycle === 'monthly' || cycle === 'quarterly' || cycle === 'annual';
}

/**
 * Human-readable fee for lists/cards, e.g. "₹1,500/year" or "₹20,000 · One-time".
 * Returns null when there is no charge to show.
 */
export function formatServiceFeeLabel(service: Pick<Service, 'amount' | 'billing_cycle' | 'currency'>): string | null {
  const amount = service.amount ?? 0;
  if (amount <= 0) return null;

  const money = formatCurrency(amount, resolveCurrency(service.currency));
  switch (service.billing_cycle) {
    case 'monthly':
      return `${money}/mo`;
    case 'quarterly':
      return `${money}/quarter`;
    case 'annual':
      return `${money}/year`;
    case 'one_time':
      return `${money} · One-time`;
    default:
      return money;
  }
}

/** Same line-item shape the API uses when creating an invoice from a service. */
export function invoiceLineFromService(service: Pick<Service, 'id' | 'name' | 'service_type' | 'billing_cycle' | 'amount' | 'currency'>): {
  description: string;
  quantity: number;
  rate: number;
  service_id: number;
  currency: string;
} {
  const cycle =
    service.billing_cycle !== 'none' && service.billing_cycle !== 'one_time'
      ? ` (${service.billing_cycle})`
      : '';
  return {
    description: `${serviceTypeLabel(service.service_type)} — ${service.name}${cycle}`,
    quantity: 1,
    rate: service.amount ?? 0,
    service_id: service.id,
    currency: resolveCurrency(service.currency),
  };
}

/** Active/lead services with a charge — used to auto-build invoice line items. */
export function billableServicesForInvoice(services: Service[]): Service[] {
  return services.filter(
    (s) => (s.status === 'active' || s.status === 'lead') && (s.amount ?? 0) > 0
  );
}

/** Short cycle badge text for UI chips. */
export function billingCycleShortLabel(cycle: BillingCycle | null | undefined): string {
  switch (cycle) {
    case 'monthly':
      return 'Monthly';
    case 'quarterly':
      return 'Quarterly';
    case 'annual':
      return 'Annual';
    case 'one_time':
      return 'One-time';
    default:
      return 'No billing';
  }
}

export function monthlyEquivalent(service: Service): number {
  const amount = service.amount ?? 0;
  switch (service.billing_cycle) {
    case 'monthly':
      return amount;
    case 'quarterly':
      return amount / 3;
    case 'annual':
      return amount / 12;
    default:
      return 0;
  }
}
