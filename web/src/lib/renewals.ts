import type { Service } from '@/lib/api';
import { daysUntil } from '@/lib/utils';

export type RenewalBucket = 'missing' | 'expired' | 'expiring' | 'ok';
export type RenewalType = 'Domain' | 'Hosting' | 'Maintenance';

export function renewalState(date: string | null | undefined) {
  const days = daysUntil(date);

  if (days === null) {
    return { label: 'No date', variant: 'secondary' as const, bucket: 'missing' as const, days: null };
  }

  if (days < 0) {
    return { label: 'Expired', variant: 'destructive' as const, bucket: 'expired' as const, days };
  }

  if (days <= 7) {
    return { label: `${days}d left`, variant: 'destructive' as const, bucket: 'expiring' as const, days };
  }

  if (days <= 10) {
    return { label: `${days}d left`, variant: 'warning' as const, bucket: 'expiring' as const, days };
  }

  return { label: 'OK', variant: 'success' as const, bucket: 'ok' as const, days };
}

function worstBucket(buckets: RenewalBucket[]): RenewalBucket {
  if (buckets.includes('expired')) return 'expired';
  if (buckets.includes('expiring')) return 'expiring';
  if (buckets.includes('missing')) return 'missing';
  return 'ok';
}

export function serviceState(service: Service): RenewalBucket {
  if (service.service_type === 'domain_hosting') {
    return worstBucket([
      renewalState(service.domain_expiry).bucket,
      renewalState(service.hosting_expiry).bucket,
    ]);
  }

  if (service.service_type === 'website_maintenance') {
    return renewalState(service.next_due_date).bucket;
  }

  return 'ok';
}

/** True when a tracked service is expired or expiring within 10 days. */
export function needsRenewalAttention(service: Service): boolean {
  const bucket = serviceState(service);
  return bucket === 'expired' || bucket === 'expiring';
}

/** Short label for how nearby an attention item is. */
export function nearbyDaysLabel(days: number | null | undefined): string | null {
  if (days === null || days === undefined) return null;
  if (days < 0) {
    const overdue = Math.abs(days);
    return `${overdue} day${overdue !== 1 ? 's' : ''} overdue`;
  }
  if (days === 0) return 'due today';
  if (days === 1) return 'in 1 day';
  return `in ${days} days`;
}

/** @deprecated Use serviceState */
export const siteState = serviceState;

export function getServiceSoonestRenewal(service: Service) {
  if (service.service_type === 'domain_hosting') {
    const items: { type: RenewalType; date: string | null | undefined }[] = [
      { type: 'Domain', date: service.domain_expiry },
      { type: 'Hosting', date: service.hosting_expiry },
    ];

    let best: { type: RenewalType; state: ReturnType<typeof renewalState> } | null = null;

    for (const item of items) {
      const state = renewalState(item.date);
      if (state.days === null || state.bucket === 'ok') continue;
      if (!best || (state.days !== null && best.state.days !== null && state.days < best.state.days)) {
        best = { type: item.type, state };
      }
    }

    return best;
  }

  if (service.service_type === 'website_maintenance' && service.next_due_date) {
    const state = renewalState(service.next_due_date);
    if (state.bucket !== 'ok') {
      return { type: 'Maintenance' as RenewalType, state };
    }
  }

  return null;
}

/** Soonest day-count among services that need renewal attention. */
export function nearestAttentionDays(services: Service[]): number | null {
  let nearest: number | null = null;

  for (const service of services) {
    if (!needsRenewalAttention(service)) continue;
    const soonest = getServiceSoonestRenewal(service);
    if (soonest?.state.days === null || soonest?.state.days === undefined) continue;
    if (nearest === null || soonest.state.days < nearest) {
      nearest = soonest.state.days;
    }
  }

  return nearest;
}

export function getRenewalDisplayDate(service: Service, type: RenewalType) {
  if (type === 'Domain') return service.domain_expiry;
  if (type === 'Hosting') return service.hosting_expiry;
  return service.next_due_date;
}

/** @deprecated Use getServiceSoonestRenewal */
export const getSoonestRenewal = getServiceSoonestRenewal;
