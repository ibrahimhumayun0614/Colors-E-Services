import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react';
import { api, type Client, type ClientStatus } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { useDebounce } from '@/hooks/useDebounce';
import { clientStatusVariant, formatClientStatus } from '@/lib/status';
import { cn, getInitials } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { listStaggerStyle } from '@/components/layout/AnimatedPage';
import { MotionLift } from '@/components/layout/Motion';
import { EmptyState } from '@/components/layout/EmptyState';
import { SearchInput } from '@/components/SearchInput';
import { TableSkeleton } from '@/components/layout/Skeletons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type StatusFilter = 'all' | ClientStatus;
type SortKey = 'name' | 'company' | 'email' | 'phone' | 'status';

const PAGE_SIZE = 10;

export const clientDialogClass =
  'flex max-h-[min(92vh,720px)] max-w-lg flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-lg';

const fieldClass =
  'bg-background shadow-none focus-visible:ring-1 focus-visible:ring-ring/30';

const statusOptions: { value: ClientStatus; label: string; activeClass: string }[] = [
  {
    value: 'active',
    label: 'Active',
    activeClass:
      'border-emerald-300 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300',
  },
  {
    value: 'lead',
    label: 'Lead',
    activeClass:
      'border-amber-300 bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300',
  },
  {
    value: 'inactive',
    label: 'Inactive',
    activeClass:
      'border-slate-300 bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
];

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'lead', label: 'Lead' },
  { value: 'inactive', label: 'Inactive' },
];

function SortableHead({
  label,
  column,
  sortKey,
  sortAsc,
  onSort,
  className,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortAsc: boolean;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === column;

  return (
    <TableHead className={cn('sticky top-0 z-10 bg-card', className)}>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => onSort(column)}
      >
        {label}
        {active ? (
          sortAsc ? (
            <ArrowUp className="h-3.5 w-3.5 text-foreground" aria-hidden />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 text-foreground" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden />
        )}
        <span className="sr-only">
          Sort by {label} {active ? (sortAsc ? 'ascending' : 'descending') : ''}
        </span>
      </button>
    </TableHead>
  );
}

function ClientStatCard({
  label,
  value,
  total,
  filter,
  active,
  onSelect,
  icon: Icon,
  styles,
}: {
  label: string;
  value: number;
  total: number;
  filter: StatusFilter;
  active: boolean;
  onSelect: (filter: StatusFilter) => void;
  icon: React.ElementType;
  styles: {
    bar: string;
    icon: string;
    active: string;
  };
}) {
  const share = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <MotionLift>
      <button
        type="button"
        onClick={() => onSelect(filter)}
        className={cn(
          'group relative w-full overflow-hidden rounded-xl border bg-card text-left transition-all duration-200',
          'premium-hover-lift',
          active ? cn('shadow-md ring-2 ring-offset-2 ring-offset-background', styles.active) : 'hover:border-border/80'
        )}
      >
        <div className={cn('absolute inset-y-0 left-0 w-1', styles.bar)} />
        <div className="flex items-center gap-3 p-4 pl-5">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105',
              styles.icon
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums tracking-tight">{value}</span>
              {filter !== 'all' && total > 0 && (
                <span className="text-xs text-muted-foreground/80">{share}%</span>
              )}
            </div>
          </div>
        </div>
      </button>
    </MotionLift>
  );
}

function ClientForm({
  initial,
  onSubmit,
  onCancel,
  loading,
  submitLabel = 'Save Client',
}: {
  initial?: Partial<Client>;
  onSubmit: (data: Partial<Client>) => void;
  onCancel?: () => void;
  loading?: boolean;
  submitLabel?: string;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    company: initial?.company ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    address: initial?.address ?? '',
    city: initial?.city ?? '',
    state: initial?.state ?? '',
    zip: initial?.zip ?? '',
    status: (initial?.status ?? 'active') as ClientStatus,
    notes: initial?.notes ?? '',
  });

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
        {form.name.trim() && (
          <div className="preview-expand flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {getInitials(form.name)}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium">{form.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {form.company.trim() || 'No company yet'}
              </p>
            </div>
            <Badge variant={clientStatusVariant[form.status]} className="ml-auto shrink-0">
              {formatClientStatus(form.status)}
            </Badge>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profile</p>
          <div className="space-y-2">
            <Label htmlFor="name">
              Full name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              className={fieldClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Sarah Mitchell"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company">Company</Label>
            <Input
              id="company"
              className={fieldClass}
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              placeholder="Acme Corp"
            />
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                className={fieldClass}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                className={fieldClass}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+1 555-0100"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              className={fieldClass}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Street address"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                className={fieldClass}
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                className={fieldClass}
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zip">ZIP</Label>
              <Input
                id="zip"
                className={fieldClass}
                value={form.zip}
                onChange={(e) => setForm({ ...form, zip: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account</p>
          <div className="space-y-2">
            <Label>Status</Label>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((option) => {
                const active = form.status === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setForm({ ...form, status: option.value })}
                    className={cn(
                      'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200',
                      active
                        ? option.activeClass
                        : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              className={cn(fieldClass, 'min-h-[88px] resize-y')}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Retainer details, preferences, or project context…"
            />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 gap-2 border-t bg-muted/20 px-6 py-4">
        {onCancel && (
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={loading || !form.name.trim()} className={cn('flex-1', !onCancel && 'w-full')}>
          {loading ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function AddClientDialog({
  open,
  onOpenChange,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Partial<Client>) => void;
  loading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="shrink-0">
          <Plus className="h-4 w-4" />
          Add Client
        </Button>
      </DialogTrigger>
      <DialogContent className={clientDialogClass}>
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-muted-foreground" />
            New Client
          </DialogTitle>
          <DialogDescription>
            Add a contact to track websites, invoices, and tasks.
          </DialogDescription>
        </DialogHeader>
        <ClientForm
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
          loading={loading}
          submitLabel="Create Client"
        />
      </DialogContent>
    </Dialog>
  );
}

export function ClientsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const debouncedSearch = useDebounce(search);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data: clients = [], isLoading, isFetching } = useQuery({
    queryKey: ['clients', debouncedSearch],
    queryFn: () => api.clients.list(debouncedSearch ? { search: debouncedSearch } : undefined),
  });

  const createMutation = useMutation({
    mutationFn: api.clients.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setOpen(false);
      toast.success('Client added successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const stats = useMemo(
    () => ({
      total: clients.length,
      active: clients.filter((c) => c.status === 'active').length,
      lead: clients.filter((c) => c.status === 'lead').length,
      inactive: clients.filter((c) => c.status === 'inactive').length,
    }),
    [clients]
  );

  const summaryCards = [
    {
      label: 'Total clients',
      value: stats.total,
      filter: 'all' as StatusFilter,
      icon: Users,
      styles: {
        bar: 'bg-foreground/80',
        icon: 'bg-muted text-foreground',
        active: 'ring-foreground/20',
      },
    },
    {
      label: 'Active',
      value: stats.active,
      filter: 'active' as StatusFilter,
      icon: UserCheck,
      styles: {
        bar: 'bg-emerald-500',
        icon: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        active: 'ring-emerald-500/30',
      },
    },
    {
      label: 'Leads',
      value: stats.lead,
      filter: 'lead' as StatusFilter,
      icon: UserPlus,
      styles: {
        bar: 'bg-amber-500',
        icon: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
        active: 'ring-amber-500/30',
      },
    },
    {
      label: 'Inactive',
      value: stats.inactive,
      filter: 'inactive' as StatusFilter,
      icon: UserX,
      styles: {
        bar: 'bg-slate-400',
        icon: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
        active: 'ring-slate-400/30',
      },
    },
  ];

  const filteredClients = useMemo(() => {
    let list = statusFilter === 'all' ? clients : clients.filter((c) => c.status === statusFilter);

    list = [...list].sort((a, b) => {
      const av = (a[sortKey] ?? '').toString().toLowerCase();
      const bv = (b[sortKey] ?? '').toString().toLowerCase();
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });

    return list;
  }, [clients, statusFilter, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, sortKey, sortAsc]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageStart = (page - 1) * PAGE_SIZE;
  const pagedClients = filteredClients.slice(pageStart, pageStart + PAGE_SIZE);

  const searching = search !== debouncedSearch || (isFetching && !!debouncedSearch);
  const hasFilters = search.length > 0 || statusFilter !== 'all';

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  return (
    <div className="space-y-6 page-stagger">
      <PageHeader title="Clients" description="Manage your client contacts and accounts." />

      {!isLoading && clients.length > 0 && (
        <div className="page-stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <ClientStatCard
              key={card.filter}
              label={card.label}
              value={card.value}
              total={stats.total}
              filter={card.filter}
              active={statusFilter === card.filter}
              onSelect={setStatusFilter}
              icon={card.icon}
              styles={card.styles}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 lg:flex-row lg:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search clients..."
          loading={searching}
          className="max-w-none flex-1"
        />
        <div className="flex flex-wrap items-center gap-2">
          {statusFilters.map((item) => (
            <Button
              key={item.value}
              type="button"
              size="sm"
              variant={statusFilter === item.value ? 'default' : 'outline'}
              onClick={() => setStatusFilter(item.value)}
            >
              {item.label}
            </Button>
          ))}
          <AddClientDialog
            open={open}
            onOpenChange={setOpen}
            onSubmit={(data) => createMutation.mutate(data)}
            loading={createMutation.isPending}
          />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : clients.length === 0 && !search ? (
        <EmptyState
          icon={Users}
          title="No clients yet"
          description="Add your first client to start tracking contacts, websites, and invoices."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Add your first client
            </Button>
          }
        />
      ) : filteredClients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No clients found"
          description="Try adjusting your search or create a new client."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {hasFilters && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              )}
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                Add Client
              </Button>
            </div>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table containerClassName="max-h-[min(70vh,720px)]">
            <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="sticky top-0 z-10 w-12 bg-card text-right font-medium text-muted-foreground">
                    #
                  </TableHead>
                  <SortableHead
                    label="Name"
                    column="name"
                    sortKey={sortKey}
                    sortAsc={sortAsc}
                    onSort={toggleSort}
                  />
                  <SortableHead
                    label="Company"
                    column="company"
                    sortKey={sortKey}
                    sortAsc={sortAsc}
                    onSort={toggleSort}
                  />
                  <SortableHead
                    label="Email"
                    column="email"
                    sortKey={sortKey}
                    sortAsc={sortAsc}
                    onSort={toggleSort}
                  />
                  <SortableHead
                    label="Phone"
                    column="phone"
                    sortKey={sortKey}
                    sortAsc={sortAsc}
                    onSort={toggleSort}
                    className="hidden md:table-cell"
                  />
                  <SortableHead
                    label="Status"
                    column="status"
                    sortKey={sortKey}
                    sortAsc={sortAsc}
                    onSort={toggleSort}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedClients.map((client, index) => (
                  <TableRow
                    key={client.id}
                    style={listStaggerStyle(index)}
                    className="list-item-enter cursor-pointer transition-colors duration-200 hover:bg-slate-50 dark:hover:bg-muted/50"
                    onClick={() => navigate(`/clients/${client.id}`)}
                  >
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {pageStart + index + 1}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {getInitials(client.name)}
                        </div>
                        <span className="font-medium">{client.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>{client.company ?? '—'}</TableCell>
                    <TableCell>{client.email ?? '—'}</TableCell>
                    <TableCell className="hidden md:table-cell">{client.phone ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={clientStatusVariant[client.status]}>
                        {formatClientStatus(client.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          {filteredClients.length > PAGE_SIZE && (
            <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 sm:flex-row">
              <p className="text-sm text-muted-foreground">
                Showing{' '}
                <span className="font-medium text-foreground">{pageStart + 1}</span>
                {'–'}
                <span className="font-medium text-foreground">
                  {Math.min(pageStart + PAGE_SIZE, filteredClients.length)}
                </span>{' '}
                of <span className="font-medium text-foreground">{filteredClients.length}</span>
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Button
                    key={p}
                    variant={p === page ? 'default' : 'outline'}
                    size="sm"
                    className="min-w-9"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { ClientForm };
