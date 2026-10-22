import type { ClientStatus, InvoiceStatus, TaskPriority } from '@/lib/api';

export const clientStatusVariant: Record<ClientStatus, 'success' | 'secondary' | 'warning'> = {
  active: 'success',
  inactive: 'secondary',
  lead: 'warning',
};

export const invoiceStatusVariant: Record<
  InvoiceStatus,
  'secondary' | 'warning' | 'success' | 'destructive'
> = {
  draft: 'secondary',
  sent: 'warning',
  paid: 'success',
  overdue: 'destructive',
  cancelled: 'secondary',
};

export function formatClientStatus(status: ClientStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function formatInvoiceStatus(status: InvoiceStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export const taskPriorityVariant: Record<TaskPriority, 'secondary' | 'warning' | 'destructive'> = {
  low: 'secondary',
  medium: 'warning',
  high: 'destructive',
};
