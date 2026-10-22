import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  FileText,
  ExternalLink,
  Globe,
  ListTodo,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { api, type Client, type Service, type ServiceType } from '@/lib/api';
import { cn, formatCurrency, formatDate, getInitials, websiteHref } from '@/lib/utils';
import { getServiceSoonestRenewal, nearbyDaysLabel, nearestAttentionDays, renewalState, serviceState, type RenewalType } from '@/lib/renewals';
import {
  getDefaultCurrency,
  hasRenewalTracking,
  isClientOnlyService,
  monthlyEquivalent,
  TRACKED_SERVICE_TYPES,
  TRACKED_SERVICE_TYPE_OPTIONS,
  serviceTypeBadgeClass,
  serviceTypeLabel,
} from '@/lib/services';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/context/ToastContext';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SearchInput } from '@/components/SearchInput';
import { ServiceForm } from '@/components/ServiceForm';
import { PageHeader } from '@/components/layout/PageHeader';
import { listStaggerStyle } from '@/components/layout/AnimatedPage';
import { EmptyState } from '@/components/layout/EmptyState';
import { TableSkeleton } from '@/components/layout/Skeletons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ServiceRenewDialog } from '@/components/ServiceWorkflow';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type ServiceFilter = 'all' | 'attention' | 'expired' | 'expiring' | 'missing' | 'ok';

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const statusChips: {
  value: ServiceFilter;
  label: string;
  dot: string;
  activeClass: string;
}[] = [
  { value: 'all', label: 'All', dot: 'bg-foreground/60', activeClass: 'border-foreground/30 bg-foreground/5 text-foreground' },
  { value: 'attention', label: 'Needs Attention', dot: 'bg-orange-500', activeClass: 'border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300' },
  { value: 'expired', label: 'Expired', dot: 'bg-red-500', activeClass: 'border-red-300 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' },
  { value: 'expiring', label: 'Expiring Soon', dot: 'bg-amber-500', activeClass: 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' },
  { value: 'missing', label: 'Missing Dates', dot: 'bg-slate-400', activeClass: 'border-slate-300 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  { value: 'ok', label: 'OK', dot: 'bg-emerald-500', activeClass: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' },
];

const rowTint: Record<ReturnType<typeof serviceState>, string> = {
  expired: 'bg-red-50/70 hover:bg-red-50 dark:bg-red-950/20 dark:hover:bg-red-950/30',
  expiring: 'bg-amber-50/60 hover:bg-amber-50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30',
  ok: 'bg-emerald-50/40 hover:bg-emerald-50 dark:bg-emerald-950/10 dark:hover:bg-emerald-950/20',
  missing: 'hover:bg-muted/50',
};

type Tone = 'red' | 'amber' | 'green' | 'muted';

function renewalTone(state: ReturnType<typeof renewalState>): Tone {
  if (state.bucket === 'missing') return 'muted';
  if (state.bucket === 'expired') return 'red';
  if (state.days !== null && state.days <= 7) return 'red';
  if (state.bucket === 'expiring') return 'amber';
  return 'green';
}

function RenewalProgress({ label, date }: { label: RenewalType; date: string | null | undefined }) {
  const state = renewalState(date);
  const tone = renewalTone(state);
  const pct =
    state.days === null ? 0 : state.days < 0 ? 100 : Math.max(5, Math.min(100, (state.days / 90) * 100));

  const barColor: Record<Tone, string> = {
    red: 'bg-red-500',
    amber: 'bg-amber-500',
    green: 'bg-emerald-500',
    muted: 'bg-muted-foreground/30',
  };
  const textColor: Record<Tone, string> = {
    red: 'text-red-600 dark:text-red-400',
    amber: 'text-amber-600 dark:text-amber-400',
    green: 'text-emerald-600 dark:text-emerald-400',
    muted: 'text-muted-foreground',
  };

  const detail =
    state.days === null
      ? 'No date'
      : state.days < 0
        ? `${Math.abs(state.days)}d ago`
        : `${state.days}d left`;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className={cn('font-medium tabular-nums', textColor[tone])}>{detail}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-all', barColor[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  tone: { bar: string; icon: string };
  hint?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card shadow-sm premium-hover-lift">
      <div className={cn('absolute inset-y-0 left-0 w-1', tone.bar)} />
      <div className="flex items-center gap-3 p-4 pl-5">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tone.icon)}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
          {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
    </div>
  );
}

function ServiceCell({ service }: { service: Service }) {
  const href = websiteHref(service.url);
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium leading-tight">{service.name}</p>
        <span
          className={cn(
            'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
            serviceTypeBadgeClass(service.service_type)
          )}
        >
          {serviceTypeLabel(service.service_type)}
        </span>
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          title={service.url ?? undefined}
          className="flex max-w-[15rem] items-center gap-1 truncate text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">{service.url}</span>
        </a>
      ) : service.service_type === 'domain_hosting' || service.service_type === 'website_maintenance' ? (
        <span className="text-xs text-muted-foreground">No URL</span>
      ) : null}
      <div className="flex flex-wrap items-center gap-1 pt-0.5">
        {service.hosting_provider && (
          <span className="inline-flex items-center rounded-md border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {service.hosting_provider}
          </span>
        )}
        {service.cms && (
          <span className="inline-flex items-center rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:border-violet-900/40 dark:bg-violet-900/20 dark:text-violet-300">
            {service.cms}
          </span>
        )}
        {service.email_provider && (
          <span className="inline-flex items-center rounded-md border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {service.email_provider}
          </span>
        )}
      </div>
    </div>
  );
}

function ClientCell({
  client,
  clientName,
  clientId,
  serviceCount,
}: {
  client?: Client;
  clientName?: string;
  clientId: number;
  serviceCount: number;
}) {
  const name = client?.name ?? clientName ?? 'Unknown';
  const status = client?.status;
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {getInitials(name)}
        </div>
        {status && (
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card',
              status === 'active' && 'bg-emerald-500',
              status === 'lead' && 'bg-amber-500',
              status === 'inactive' && 'bg-slate-400'
            )}
            title={status}
          />
        )}
      </div>
      <div className="min-w-0">
        <Link to={`/clients/${clientId}`} className="block truncate font-medium hover:underline">
          {name}
        </Link>
        <p className="text-xs text-muted-foreground">
          {serviceCount} service{serviceCount !== 1 ? 's' : ''}
          {client?.updated_at ? ` · ${formatDate(client.updated_at)}` : ''}
        </p>
      </div>
    </div>
  );
}

function ServiceActions({
  service,
  onEdit,
  onRenew,
  onCreateTask,
  onCreateInvoice,
  onDelete,
  workflowLoading,
}: {
  service: Service;
  onEdit: () => void;
  onRenew: () => void;
  onCreateTask: () => void;
  onCreateInvoice: () => void;
  onDelete: () => void;
  workflowLoading?: boolean;
}) {
  const href = websiteHref(service.url);
  return (
    <div className="flex items-center justify-end gap-1">
      {href ? (
        <Button asChild size="sm" variant="outline" className="h-8">
          <a href={href} target="_blank" rel="noreferrer">
            View
          </a>
        </Button>
      ) : (
        <Button size="sm" variant="outline" className="h-8" disabled>
          View
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Service actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onClick={onEdit} className="gap-2">
            <Pencil className="h-4 w-4" />
            Edit
          </DropdownMenuItem>
          {hasRenewalTracking(service) && (
            <DropdownMenuItem onClick={onRenew} className="gap-2" disabled={workflowLoading}>
              <RefreshCw className="h-4 w-4" />
              Renew / Update
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onCreateTask} className="gap-2" disabled={workflowLoading}>
            <ListTodo className="h-4 w-4" />
            Create task
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onCreateInvoice} className="gap-2" disabled={workflowLoading}>
            <FileText className="h-4 w-4" />
            Create invoice
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onClick={onDelete} className="gap-2">
            <Trash2 className="h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function RenewalCell({ service }: { service: Service }) {
  if (service.service_type === 'website_maintenance') {
    return <RenewalProgress label="Maintenance" date={service.next_due_date} />;
  }
  if (service.service_type === 'domain_hosting') {
    return (
      <div className="space-y-2">
        <RenewalProgress label="Domain" date={service.domain_expiry} />
        <RenewalProgress label="Hosting" date={service.hosting_expiry} />
      </div>
    );
  }
  return <span className="text-xs text-muted-foreground">No renewals</span>;
}

function PaginationBar({
  page,
  pageSize,
  total,
  totalPages,
  pageStart,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  pageStart: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 sm:flex-row">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>
          Showing <span className="font-medium text-foreground">{pageStart + 1}</span>–
          <span className="font-medium text-foreground">{Math.min(pageStart + pageSize, total)}</span> of{' '}
          <span className="font-medium text-foreground">{total}</span>
        </span>
        <label className="flex items-center gap-1.5">
          <span className="hidden sm:inline">Rows</span>
          <select
            className="h-8 rounded-md border border-input bg-card px-2 text-sm"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1}>
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size="sm"
              className="min-w-9"
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function ServicesPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = usePersistedState<ServiceFilter>('services-filter', 'all');
  const [typeFilter, setTypeFilter] = useState<ServiceType | 'all'>('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePersistedState<number>('services-page-size', 10);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [renewing, setRenewing] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState<Service | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const debouncedSearch = useDebounce(search);

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.services.list(),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.clients.list(),
  });

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const clientServiceCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const service of services) map.set(service.client_id, (map.get(service.client_id) ?? 0) + 1);
    return map;
  }, [services]);

  // Services page is for renewal tracking only; project work lives on client detail.
  const trackedServices = useMemo(
    () => services.filter((service) => !isClientOnlyService(service)),
    [services]
  );

  const providerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const service of trackedServices) if (service.hosting_provider) set.add(service.hosting_provider);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [trackedServices]);

  const clientOptions = useMemo(() => {
    const set = new Set<string>();
    for (const service of trackedServices) if (service.client_name) set.add(service.client_name);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [trackedServices]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<Service>) => api.services.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setAdding(false);
      toast.success('Service added');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Service> }) =>
      api.services.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setEditing(null);
      toast.success('Service updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: api.services.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setDeleting(null);
      toast.success('Service removed');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createTaskMutation = useMutation({
    mutationFn: (id: number) => api.services.createTask(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(data.existing ? 'Open task already linked to this service' : 'Task created');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createInvoiceMutation = useMutation({
    mutationFn: (id: number) => api.services.createInvoice(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(data.existing ? 'Draft invoice already exists for this service' : 'Draft invoice created from service');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const workflowLoading = createTaskMutation.isPending || createInvoiceMutation.isPending;

  function handleCreateTask(service: Service) {
    createTaskMutation.mutate(service.id);
  }

  function handleCreateInvoice(service: Service) {
    createInvoiceMutation.mutate(service.id);
  }

  const counts = useMemo(() => {
    const base = { attention: 0, expired: 0, expiring: 0, missing: 0, ok: 0, monthlyCost: 0 };
    return trackedServices.reduce((acc, service) => {
      if (!hasRenewalTracking(service)) {
        acc.ok += 1;
        acc.monthlyCost += monthlyEquivalent(service);
        return acc;
      }
      const state = serviceState(service);
      acc[state] += 1;
      if (state === 'expired' || state === 'expiring') acc.attention += 1;
      acc.monthlyCost += monthlyEquivalent(service);
      return acc;
    }, base);
  }, [trackedServices]);

  const expiringWithin10 = useMemo(
    () =>
      trackedServices.filter((service) => {
        if (!hasRenewalTracking(service)) return false;
        const soonest = getServiceSoonestRenewal(service);
        return soonest && soonest.state.days !== null && soonest.state.days >= 0 && soonest.state.days <= 10;
      }).length,
    [trackedServices]
  );

  const nearestAttentionLabel = useMemo(
    () => nearbyDaysLabel(nearestAttentionDays(trackedServices)),
    [trackedServices]
  );

  const filteredServices = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();

    return trackedServices.filter((service) => {
      const state = hasRenewalTracking(service) ? serviceState(service) : 'ok';

      let matchesFilter = false;
      if (filter === 'all') {
        matchesFilter = true;
      } else if (!hasRenewalTracking(service)) {
        matchesFilter = filter === 'ok';
      } else if (filter === 'attention') {
        matchesFilter = state === 'expired' || state === 'expiring';
      } else {
        matchesFilter = state === filter;
      }

      const matchesType = typeFilter === 'all' || service.service_type === typeFilter;
      const matchesProvider = providerFilter === 'all' || service.hosting_provider === providerFilter;
      const matchesClient = clientFilter === 'all' || service.client_name === clientFilter;

      const matchesSearch =
        !term ||
        [
          service.name,
          service.url,
          service.client_name,
          service.registrar,
          service.hosting_provider,
          service.cms,
          service.email_provider,
          serviceTypeLabel(service.service_type),
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(term));

      return matchesFilter && matchesType && matchesProvider && matchesClient && matchesSearch;
    });
  }, [filter, typeFilter, providerFilter, clientFilter, debouncedSearch, trackedServices]);

  const totalPages = Math.max(1, Math.ceil(filteredServices.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [filter, typeFilter, providerFilter, clientFilter, debouncedSearch, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageStart = (page - 1) * pageSize;
  const pagedServices = filteredServices.slice(pageStart, pageStart + pageSize);

  const searching = search !== debouncedSearch;
  const hasFilters =
    search.length > 0 ||
    filter !== 'all' ||
    typeFilter !== 'all' ||
    providerFilter !== 'all' ||
    clientFilter !== 'all';
  const showAlert = counts.expired > 0 || expiringWithin10 > 0;

  function resetFilters() {
    setSearch('');
    setFilter('all');
    setTypeFilter('all');
    setProviderFilter('all');
    setClientFilter('all');
  }

  const selectClass =
    'block h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <div className="space-y-6 page-stagger">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Services"
          description="Domains, hosting, and maintenance renewals. Project work (logo, content, email) is under each client."
          meta={
            !isLoading && trackedServices.length > 0
              ? counts.attention > 0 && nearestAttentionLabel
                ? `${trackedServices.length} service${trackedServices.length !== 1 ? 's' : ''} · ${counts.attention} need attention · nearest ${nearestAttentionLabel}`
                : `${trackedServices.length} service${trackedServices.length !== 1 ? 's' : ''} · ${counts.attention} need attention`
              : undefined
          }
        />
        <Button className="shrink-0" onClick={() => setAdding(true)} disabled={clients.length === 0}>
          <Plus className="h-4 w-4" />
          Add Service
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : trackedServices.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No renewal services yet"
          description="Add domain & hosting or website maintenance here. Logo, content, and email services are added from a client’s profile."
          action={
            clients.length > 0 ? (
              <Button onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" />
                Add Service
              </Button>
            ) : (
              <Button asChild>
                <Link to="/clients">Go to clients</Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="page-stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Total Services"
              value={String(trackedServices.length)}
              icon={Globe}
              tone={{ bar: 'bg-blue-500', icon: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' }}
            />
            <KpiCard
              label="Need Attention"
              value={String(counts.attention)}
              icon={AlertTriangle}
              tone={{ bar: 'bg-orange-500', icon: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' }}
              hint={
                counts.attention > 0 && nearestAttentionLabel
                  ? `Nearest ${nearestAttentionLabel}`
                  : undefined
              }
            />
            <KpiCard
              label="Recurring / mo"
              value={formatCurrency(counts.monthlyCost, getDefaultCurrency())}
              icon={DollarSign}
              tone={{ bar: 'bg-emerald-500', icon: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' }}
            />
            <KpiCard
              label="Expiring Soon"
              value={String(counts.expiring)}
              icon={CalendarClock}
              tone={{ bar: 'bg-amber-500', icon: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' }}
            />
          </div>

          {showAlert && (
            <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/20 sm:flex-row sm:items-center">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-red-800 dark:text-red-300">Immediate Action Required</p>
                <p className="text-sm text-red-700/90 dark:text-red-300/80">
                  {counts.expired > 0 && (
                    <span>
                      {counts.expired} service{counts.expired !== 1 ? 's' : ''} expired
                    </span>
                  )}
                  {counts.expired > 0 && expiringWithin10 > 0 && <span> · </span>}
                  {expiringWithin10 > 0 && (
                    <span>
                      {expiringWithin10} service{expiringWithin10 !== 1 ? 's' : ''} due within 10 days
                    </span>
                  )}
                </p>
              </div>
              <Button
                variant="outline"
                className="shrink-0 border-red-300 bg-white text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-transparent dark:text-red-300"
                onClick={() => setFilter('attention')}
              >
                Review Now
              </Button>
            </div>
          )}

          <div className="space-y-3 rounded-xl border bg-card p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search services, clients, providers..."
                loading={searching}
                className="max-w-none flex-1"
              />
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className={selectClass}
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as ServiceType | 'all')}
                  aria-label="Filter by service type"
                >
                  <option value="all">All types</option>
                  {TRACKED_SERVICE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <select
                  className={selectClass}
                  value={providerFilter}
                  onChange={(e) => setProviderFilter(e.target.value)}
                  aria-label="Filter by provider"
                >
                  <option value="all">All providers</option>
                  {providerOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <select
                  className={selectClass}
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  aria-label="Filter by client"
                >
                  <option value="all">All clients</option>
                  {clientOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {statusChips.map((chip) => {
                const count =
                  chip.value === 'all'
                    ? services.length
                    : chip.value === 'attention'
                      ? counts.attention
                      : counts[chip.value];
                const active = filter === chip.value;
                return (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => setFilter(chip.value)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      active ? chip.activeClass : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
                    )}
                  >
                    <span className={cn('h-2 w-2 rounded-full', chip.dot)} />
                    {chip.label}
                    <span className={cn('tabular-nums', active ? '' : 'text-muted-foreground/70')}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {filteredServices.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No services match"
              description="Try a different search term or filter."
              action={
                hasFilters ? (
                  <Button variant="outline" onClick={resetFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-4">
              <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm md:block">
                <Table containerClassName="max-h-[min(70vh,720px)]">
                  <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-12 text-right">#</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead className="min-w-[220px]">Due / Renewals</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedServices.map((service, index) => {
                      const state = hasRenewalTracking(service) ? serviceState(service) : 'ok';
                      const monthly = monthlyEquivalent(service);
                      return (
                        <TableRow
                          key={service.id}
                          style={listStaggerStyle(index)}
                          className={cn('list-item-enter align-top', rowTint[state])}
                        >
                          <TableCell className="pt-4 text-right text-sm tabular-nums text-muted-foreground">
                            {pageStart + index + 1}
                          </TableCell>
                          <TableCell className="pt-3">
                            <ServiceCell service={service} />
                          </TableCell>
                          <TableCell className="pt-3">
                            <ClientCell
                              client={clientMap.get(service.client_id)}
                              clientName={service.client_name}
                              clientId={service.client_id}
                              serviceCount={clientServiceCounts.get(service.client_id) ?? 1}
                            />
                          </TableCell>
                          <TableCell className="pt-3">
                            <RenewalCell service={service} />
                          </TableCell>
                          <TableCell className="pt-4 text-right font-medium tabular-nums">
                            {monthly > 0
                              ? `${formatCurrency(monthly, service.currency)}/mo`
                              : service.amount > 0
                                ? formatCurrency(service.amount, service.currency)
                                : '—'}
                          </TableCell>
                          <TableCell className="pt-3">
                            <ServiceActions
                              service={service}
                              onEdit={() => setEditing(service)}
                              onRenew={() => setRenewing(service)}
                              onCreateTask={() => handleCreateTask(service)}
                              onCreateInvoice={() => handleCreateInvoice(service)}
                              onDelete={() => setDeleting(service)}
                              workflowLoading={workflowLoading}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <PaginationBar
                page={page}
                pageSize={pageSize}
                total={filteredServices.length}
                totalPages={totalPages}
                pageStart={pageStart}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />

              <div className="space-y-3 md:hidden">
                {pagedServices.map((service) => {
                  const state = hasRenewalTracking(service) ? serviceState(service) : 'ok';
                  const monthly = monthlyEquivalent(service);
                  return (
                    <div
                      key={service.id}
                      className={cn('rounded-xl border bg-card p-4 shadow-sm', rowTint[state])}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <ServiceCell service={service} />
                        <p className="shrink-0 text-sm font-semibold tabular-nums">
                          {monthly > 0
                            ? `${formatCurrency(monthly, service.currency)}/mo`
                            : service.amount > 0
                              ? formatCurrency(service.amount, service.currency)
                              : '—'}
                        </p>
                      </div>
                      <div className="mt-3">
                        <ClientCell
                          client={clientMap.get(service.client_id)}
                          clientName={service.client_name}
                          clientId={service.client_id}
                          serviceCount={clientServiceCounts.get(service.client_id) ?? 1}
                        />
                      </div>
                      <div className="mt-3">
                        <RenewalCell service={service} />
                      </div>
                      <div className="mt-3 flex justify-end">
                        <ServiceActions
                          service={service}
                          onEdit={() => setEditing(service)}
                          onRenew={() => setRenewing(service)}
                          onCreateTask={() => handleCreateTask(service)}
                          onCreateInvoice={() => handleCreateInvoice(service)}
                          onDelete={() => setDeleting(service)}
                          workflowLoading={workflowLoading}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent
          className="max-w-lg"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Add Service</DialogTitle>
          </DialogHeader>
          <ServiceForm
            clients={clients}
            allowedTypes={TRACKED_SERVICE_TYPES}
            onSubmit={(data) => createMutation.mutate(data)}
            loading={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent
          className="max-w-lg"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Edit Service</DialogTitle>
          </DialogHeader>
          {editing && (
            <ServiceForm
              initial={editing}
              mode="edit"
              allowedTypes={TRACKED_SERVICE_TYPES}
              onSubmit={(data) => updateMutation.mutate({ id: editing.id, data })}
              loading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <ServiceRenewDialog
        service={renewing}
        open={!!renewing}
        onOpenChange={(open) => !open && setRenewing(null)}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete service?"
        description={`Delete ${deleting?.name}? This can't be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </div>
  );
}
