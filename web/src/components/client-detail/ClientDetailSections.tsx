import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Calendar,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Shield,
  Trash2,
} from 'lucide-react';
import type { Client, ClientStatus, Invoice, Service } from '@/lib/api';
import { cn, formatCurrency, formatDate, getInitials, websiteHref } from '@/lib/utils';
import {
  billingCycleShortLabel,
  formatServiceFeeLabel,
  getDefaultCurrency,
  isRecurringBilling,
  serviceTypeLabel,
} from '@/lib/services';
import { getRenewalDisplayDate, getServiceSoonestRenewal, needsRenewalAttention } from '@/lib/renewals';
import { effectiveInvoiceStatus } from '@/lib/invoices';
import { clientStatusVariant, formatInvoiceStatus } from '@/lib/status';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const detailCard = 'rounded-2xl border bg-card shadow-sm';


export function relativeTimeAgo(date: string | null | undefined) {
  if (!date) return 'Unknown';
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return '1 month ago';
  return `${months} months ago`;
}

export function buildActivityTimeline(
  client: Client,
  services: Service[],
  invoices: Invoice[]
) {
  const events: { id: string; title: string; subtitle?: string; date: string; ts: number }[] = [
    {
      id: 'client-added',
      title: 'Client added',
      date: client.created_at,
      ts: new Date(client.created_at).getTime(),
    },
  ];

  for (const service of services) {
    const renewal = getServiceSoonestRenewal(service);
    if (renewal && needsRenewalAttention(service)) {
      const renewalDate = getRenewalDisplayDate(service, renewal.type);
      events.push({
        id: `renewal-${service.id}`,
        title: `${service.name} due`,
        subtitle: `${renewal.type} · ${renewal.state.label}`,
        date: renewalDate ?? client.updated_at,
        ts: new Date(renewalDate ?? client.updated_at).getTime(),
      });
    }
    events.push({
      id: `service-${service.id}`,
      title: `${serviceTypeLabel(service.service_type)} · ${service.name}`,
      date: client.updated_at,
      ts: new Date(client.updated_at).getTime() - service.id,
    });
  }

  for (const inv of invoices) {
    events.push({
      id: `inv-${inv.id}`,
      title: `Invoice ${inv.invoice_number} created`,
      subtitle: formatInvoiceActivitySubtitle(inv),
      date: inv.issue_date,
      ts: new Date(inv.issue_date).getTime(),
    });
  }

  return events.sort((a, b) => b.ts - a.ts).slice(0, 8);
}

function formatInvoiceActivitySubtitle(inv: Invoice) {
  const status = effectiveInvoiceStatus(inv);
  if (status === 'paid') return 'Paid';
  if (status === 'overdue') return 'Overdue';
  if (status === 'sent') return 'Awaiting payment';
  if (status === 'cancelled') return 'Cancelled';
  return formatInvoiceStatus(status);
}

function statusLabel(status: ClientStatus) {
  if (status === 'active') return 'Active Client';
  if (status === 'lead') return 'Lead';
  return 'Archived';
}

export function ClientProfileHeader({
  client,
  onEdit,
  onSendEmail,
  onCreateInvoice,
  onAddService,
  onDelete,
  onExport,
  onArchive,
}: {
  client: Client;
  onEdit: () => void;
  onSendEmail: () => void;
  onCreateInvoice: () => void;
  onAddService: () => void;
  onDelete: () => void;
  onExport: () => void;
  onArchive: () => void;
}) {
  const isArchived = client.status === 'inactive';

  return (
    <div className={cn(detailCard, 'overflow-hidden')}>
      <div className="border-b bg-muted/20 px-4 py-3 sm:px-6">
        <Breadcrumbs items={[{ label: 'Clients', href: '/clients' }, { label: client.name }]} />
      </div>
      <div className="p-4 sm:px-5 sm:py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-1 gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-base font-bold text-primary">
              {getInitials(client.name)}
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="text-lg font-bold tracking-tight sm:text-xl">{client.name}</h1>
                <Badge variant={clientStatusVariant[client.status]} className="gap-1.5 px-2.5 py-0.5">
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full',
                      client.status === 'active' && 'bg-emerald-500',
                      client.status === 'lead' && 'bg-amber-500',
                      client.status === 'inactive' && 'bg-slate-400'
                    )}
                  />
                  {statusLabel(client.status)}
                </Badge>
              </div>

              {(client.company || client.email || client.phone) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {client.company ? <span>{client.company}</span> : null}
                  {client.company && client.email ? (
                    <span className="hidden text-muted-foreground/50 sm:inline">·</span>
                  ) : null}
                  {client.email ? (
                    <a
                      href={`mailto:${client.email}`}
                      className="inline-flex items-center gap-1.5 transition-colors hover:text-primary"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{client.email}</span>
                    </a>
                  ) : null}
                  {(client.company || client.email) && client.phone ? (
                    <span className="hidden text-muted-foreground/50 sm:inline">·</span>
                  ) : null}
                  {client.phone ? (
                    <a
                      href={`tel:${client.phone}`}
                      className="inline-flex items-center gap-1.5 transition-colors hover:text-primary"
                    >
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{client.phone}</span>
                    </a>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 self-start lg:self-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <MoreHorizontal className="h-4 w-4" />
                  Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={onEdit} className="gap-2">
                  <Pencil className="h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onAddService} className="gap-2">
                  <Globe className="h-4 w-4" />
                  Add Service
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExport} className="gap-2">
                  <Download className="h-4 w-4" />
                  Export
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onSendEmail} className="gap-2">
                  <Mail className="h-4 w-4" />
                  Send Email
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onArchive} className="gap-2">
                  {isArchived ? (
                    <>
                      <ArchiveRestore className="h-4 w-4" />
                      Unarchive
                    </>
                  ) : (
                    <>
                      <Archive className="h-4 w-4" />
                      Archive
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onClick={onDelete} className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button size="sm" onClick={onCreateInvoice} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Invoice
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ClientKpiCards({
  servicesCount,
  invoicesCount,
  outstanding,
  renewalsLabel,
  hasOverdue,
}: {
  servicesCount: number;
  invoicesCount: number;
  outstanding: number;
  renewalsLabel: string;
  hasOverdue: boolean;
}) {
  const cards = [
    { label: 'Services', value: String(servicesCount), icon: Globe, tone: 'text-blue-600 bg-blue-500/10' },
    { label: 'Invoices', value: String(invoicesCount), icon: FileText, tone: 'text-violet-600 bg-violet-500/10' },
    {
      label: 'Balance',
      value: formatCurrency(outstanding, getDefaultCurrency()),
      icon: CreditCard,
      tone: hasOverdue ? 'text-red-600 bg-red-500/10' : outstanding > 0 ? 'text-amber-600 bg-amber-500/10' : 'text-emerald-600 bg-emerald-500/10',
    },
    { label: 'Renewals', value: renewalsLabel, icon: Calendar, tone: 'text-orange-600 bg-orange-500/10' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(({ label, value, icon: Icon, tone }) => (
        <Card key={label} className={detailCard}>
          <CardContent className="flex items-center gap-3 p-5">
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tone)}>
              <Icon className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <p className="truncate text-xl font-bold tabular-nums">{value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ActivityTimeline({ events }: { events: ReturnType<typeof buildActivityTimeline> }) {
  return (
    <Card className={detailCard}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <ul className="space-y-4">
            {events.map((event, index) => (
              <li key={event.id} className="relative flex gap-3 pl-1">
                {index < events.length - 1 && (
                  <span className="absolute left-[7px] top-5 h-[calc(100%+4px)] w-px bg-border" />
                )}
                <span className="relative mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-primary bg-background" />
                <div className="min-w-0 pb-1">
                  <p className="text-sm font-medium">{event.title}</p>
                  {event.subtitle && (
                    <p className="text-xs text-muted-foreground">{event.subtitle}</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground/70">{relativeTimeAgo(event.date)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ServicePreviewCard({
  service,
  onViewAll,
  onEdit,
  onAdd,
}: {
  service: Service | null;
  onViewAll: () => void;
  onEdit: (service: Service) => void;
  onAdd: () => void;
}) {
  if (!service) {
    return (
      <Card className={detailCard}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4 text-muted-foreground" />
            Services
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No services tracked for this client.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onAdd}>
            Add Service
          </Button>
        </CardContent>
      </Card>
    );
  }

  const renewalDate = service.domain_expiry ?? service.hosting_expiry ?? service.next_due_date;
  const displayUrl = service.url?.replace(/^https?:\/\//, '') ?? service.name;
  const feeLabel = formatServiceFeeLabel(service);
  const renews = isRecurringBilling(service.billing_cycle);

  return (
    <Card className={detailCard}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="h-4 w-4 text-muted-foreground" />
          {serviceTypeLabel(service.service_type)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="font-semibold">{service.name}</p>
          {service.url ? (
            <a
              href={websiteHref(service.url)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              {displayUrl}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">{displayUrl}</p>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border bg-muted/20 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
            <p className="mt-1 text-sm font-medium capitalize">{service.status}</p>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Amount</p>
            <p className="mt-1 text-sm font-medium tabular-nums">
              {feeLabel ?? '—'}
            </p>
            {!feeLabel && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">{billingCycleShortLabel(service.billing_cycle)}</p>
            )}
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {renews ? 'Next due' : 'Renewal'}
            </p>
            <p className="mt-1 text-sm font-medium">
              {renews
                ? renewalDate
                  ? formatDate(renewalDate)
                  : '—'
                : 'No renewal'}
            </p>
            {!renews && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">One-time / project</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="gap-2" onClick={() => onEdit(service)}>
            <Pencil className="h-4 w-4" />
            Edit Service
          </Button>
          <Button variant="outline" size="sm" onClick={onViewAll}>
            View all services
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** @deprecated Use ServicePreviewCard */
export const WebsitePreviewCard = ServicePreviewCard;

export function OutstandingBalanceCard({
  outstanding,
  unpaidCount,
  hasOverdue,
  primaryInvoiceId,
  onViewInvoice,
}: {
  outstanding: number;
  unpaidCount: number;
  hasOverdue: boolean;
  primaryInvoiceId?: number;
  onViewInvoice: () => void;
}) {
  const tone = hasOverdue
    ? 'border-red-500/30 bg-red-500/5'
    : outstanding > 0
      ? 'border-amber-500/30 bg-amber-500/5'
      : 'border-emerald-500/20 bg-emerald-500/5';

  return (
    <Card className={cn(detailCard, tone)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          {outstanding > 0 && <AlertTriangle className={cn('h-4 w-4', hasOverdue ? 'text-red-600' : 'text-amber-600')} />}
          Outstanding Balance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className={cn('text-3xl font-bold tabular-nums', hasOverdue ? 'text-red-700 dark:text-red-400' : outstanding > 0 ? 'text-amber-700 dark:text-amber-400' : '')}>
          {formatCurrency(outstanding, getDefaultCurrency())}
        </p>
        <p className="text-sm text-muted-foreground">
          {unpaidCount > 0
            ? `${unpaidCount} invoice${unpaidCount !== 1 ? 's' : ''} unpaid`
            : 'Invoice balance only · service fees shown on each service'}
        </p>
        {primaryInvoiceId && outstanding > 0 && (
          <Button variant="outline" size="sm" className="mt-2 w-full" onClick={onViewInvoice}>
            View Invoice
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function RenewalStatusCard({
  nextRenewal,
}: {
  nextRenewal: { service: Service; renewal: NonNullable<ReturnType<typeof getServiceSoonestRenewal>> } | null;
}) {
  return (
    <Card className={detailCard}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Shield className="h-4 w-4 text-muted-foreground" />
          Renewal Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        {nextRenewal ? (
          <div className="space-y-2">
            <p className="font-medium">{nextRenewal.service.name}</p>
            <p className="text-sm font-semibold tabular-nums text-foreground">
              {formatServiceFeeLabel(nextRenewal.service) ?? 'No fee set'}
            </p>
            <p className="text-sm text-muted-foreground">
              {nextRenewal.renewal.type} · {nextRenewal.renewal.state.label}
            </p>
            <Badge variant={nextRenewal.renewal.state.variant}>{nextRenewal.renewal.type}</Badge>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No upcoming renewals</p>
        )}
      </CardContent>
    </Card>
  );
}

export function TabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
      {count}
    </span>
  );
}
