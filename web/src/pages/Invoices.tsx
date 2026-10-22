import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Eye,
  FileText,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type Invoice, type InvoiceStatus, type UpdateInvoicePayload } from '@/lib/api';
import { duplicateInvoicePayload, effectiveInvoiceStatus } from '@/lib/invoices';
import { downloadInvoicePdf } from '@/lib/invoice-pdf';
import { CURRENCY_OPTIONS, getDefaultCurrency, resolveCurrency } from '@/lib/services';
import { cn, formatDate, formatCurrency, relativeDueText } from '@/lib/utils';
import { useToast } from '@/context/ToastContext';
import { invoiceStatusVariant, formatInvoiceStatus } from '@/lib/status';
import { useDebounce } from '@/hooks/useDebounce';
import { SearchInput } from '@/components/SearchInput';
import { PageHeader } from '@/components/layout/PageHeader';
import { listStaggerStyle } from '@/components/layout/AnimatedPage';
import { EmptyState } from '@/components/layout/EmptyState';
import { TableSkeleton } from '@/components/layout/Skeletons';
import { ConfirmDialog } from '@/components/ConfirmDialog';
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InvoiceBuilder } from '@/components/InvoiceBuilder';
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from '@/lib/branding';
import { InvoicePreviewDialog } from '@/components/InvoiceDocumentPreview';

type StatusFilter = 'all' | InvoiceStatus;
type SortKey = 'invoice_number' | 'client_name' | 'due_date' | 'total';

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
];

/** YYYY-MM from an ISO date string (issue date). */
function monthKeyFromDate(iso: string | null | undefined): string {
  if (!iso || iso.length < 7) return '';
  return iso.slice(0, 7);
}

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

const statusChoices: InvoiceStatus[] = ['draft', 'sent', 'paid', 'cancelled'];

function InvoiceStatusMenu({
  invoice,
  disabled,
  onChange,
}: {
  invoice: Invoice;
  disabled?: boolean;
  onChange: (status: InvoiceStatus) => void;
}) {
  const shown = effectiveInvoiceStatus(invoice);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          title="Change status"
        >
          <Badge variant={invoiceStatusVariant[shown]} className="cursor-pointer gap-1 pr-1.5">
            {formatInvoiceStatus(shown)}
            <ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[9rem]">
        {statusChoices.map((status) => {
          const current = invoice.status === status || (status === 'sent' && invoice.status === 'overdue');
          return (
            <DropdownMenuItem
              key={status}
              disabled={current}
              onSelect={() => onChange(status)}
              className="justify-between gap-3"
            >
              {formatInvoiceStatus(status)}
              {current && <Check className="h-3.5 w-3.5" aria-hidden />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function InvoiceForm({
  clients,
  defaultClientId,
  initial,
  mode = 'create',
  onSubmit,
  onUpdate,
  loading,
}: {
  clients: { id: number; name: string }[];
  defaultClientId?: number;
  initial?: Invoice;
  mode?: 'create' | 'edit';
  onSubmit?: (data: Parameters<typeof api.invoices.create>[0]) => void;
  onUpdate?: (data: UpdateInvoicePayload) => void;
  loading?: boolean;
}) {
  const firstItem = initial?.items?.[0];
  const today = new Date().toISOString().split('T')[0];
  const due = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

  const [form, setForm] = useState({
    client_id: initial?.client_id ?? defaultClientId ?? clients[0]?.id ?? 0,
    issue_date: initial?.issue_date ?? today,
    due_date: initial?.due_date ?? due,
    tax_rate: String(initial?.tax_rate ?? 0),
    currency: resolveCurrency(initial?.currency),
    description: firstItem?.description ?? '',
    quantity: String(firstItem?.quantity ?? 1),
    rate: firstItem?.rate != null ? String(firstItem.rate) : '',
  });

  const isEdit = mode === 'edit' && !!initial;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const items = [
          {
            description: form.description,
            quantity: parseFloat(form.quantity) || 1,
            rate: parseFloat(form.rate) || 0,
            service_id: firstItem?.service_id ?? null,
          },
        ];

        if (isEdit && onUpdate) {
          onUpdate({
            issue_date: form.issue_date,
            due_date: form.due_date,
            tax_rate: parseFloat(form.tax_rate) || 0,
            currency: form.currency,
            items,
          });
          return;
        }

        onSubmit?.({
          client_id: form.client_id,
          issue_date: form.issue_date,
          due_date: form.due_date,
          tax_rate: parseFloat(form.tax_rate) || 0,
          currency: form.currency || getDefaultCurrency(),
          items,
        });
      }}
    >
      {!isEdit && (
      <div className="space-y-2">
        <Label>Client</Label>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          value={form.client_id}
          onChange={(e) => setForm({ ...form, client_id: Number(e.target.value) })}
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Issue Date</Label>
          <Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Due Date</Label>
          <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Line item description</Label>
        <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
        <p className="text-xs text-muted-foreground">Single line item for now — add more items in a future update.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Currency</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            aria-label="Currency"
          >
            {CURRENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Tax %</Label>
          <Input type="number" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Qty</Label>
          <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Rate</Label>
          <Input type="number" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} required />
        </div>
      </div>
      <Button type="submit" disabled={loading || (!isEdit && !clients.length)} className="w-full">
        {loading ? 'Saving...' : isEdit ? 'Save changes' : 'Create Invoice'}
      </Button>
    </form>
  );
}

export function InvoicesPage() {
  const [open, setOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [monthFilter, setMonthFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('due_date');
  const [sortAsc, setSortAsc] = useState(false);
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState<Invoice | null>(null);
  const [pdfId, setPdfId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const debouncedSearch = useDebounce(search);

  async function handlePdf(invoice: Invoice) {
    if (pdfId !== null) return;
    setPdfId(invoice.id);
    try {
      await downloadInvoicePdf(invoice);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate PDF');
    } finally {
      setPdfId(null);
    }
  }

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.invoices.list(),
  });

  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.clients.list(),
  });

  const createMutation = useMutation({
    mutationFn: api.invoices.create,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setOpen(false);
      setDetail(created);
      toast.success('Invoice created — preview includes a scan QR code');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateInvoicePayload }) =>
      api.invoices.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setEditing(null);
      toast.success('Invoice updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: InvoiceStatus }) =>
      api.invoices.updateStatus(id, status),
    onSuccess: (_, { id, status }) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      const inv = invoices.find((i) => i.id === id);
      if (status === 'paid' && inv) {
        queryClient.invalidateQueries({ queryKey: ['client', inv.client_id] });
        queryClient.invalidateQueries({ queryKey: ['services', inv.client_id] });
      }
      toast.success(`Invoice marked as ${status}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (source: Invoice) => {
      const full = source.items?.length ? source : await api.invoices.get(source.id);
      const payload = duplicateInvoicePayload(full);
      if (!payload.items.length) throw new Error('This invoice has no line items to copy');
      return api.invoices.create(payload);
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setDetail(null);
      setEditing(created);
      toast.success(`Copied as draft ${created.invoice_number} — edit now or close and edit later`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.invoices.delete(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      if (detail?.id === id) setDetail(null);
      if (editing?.id === id) setEditing(null);
      setDeleting(null);
      toast.success('Invoice deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const monthOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const inv of invoices) {
      const key = monthKeyFromDate(inv.issue_date);
      if (key) keys.add(key);
    }
    return [...keys].sort((a, b) => b.localeCompare(a)).map((value) => ({
      value,
      label: formatMonthLabel(value),
    }));
  }, [invoices]);

  const invoicesInMonth = useMemo(() => {
    if (!monthFilter) return invoices;
    return invoices.filter((inv) => monthKeyFromDate(inv.issue_date) === monthFilter);
  }, [invoices, monthFilter]);

  const totalsByCurrency = useMemo(() => {
    const map = new Map<string, { total: number; unpaid: number }>();
    for (const inv of invoicesInMonth) {
      const currency = resolveCurrency(inv.currency);
      const entry = map.get(currency) ?? { total: 0, unpaid: 0 };
      const amount = inv.total ?? 0;
      entry.total += amount;
      const status = effectiveInvoiceStatus(inv);
      if (status === 'sent' || status === 'overdue') entry.unpaid += amount;
      map.set(currency, entry);
    }
    return [...map.entries()];
  }, [invoicesInMonth]);

  const totalLabel = totalsByCurrency
    .map(([currency, { total }]) => formatCurrency(total, currency))
    .join(' · ');

  const unpaidLabel = totalsByCurrency
    .filter(([, { unpaid }]) => unpaid > 0)
    .map(([currency, { unpaid }]) => formatCurrency(unpaid, currency))
    .join(' · ');

  const unpaidTotal = totalsByCurrency.reduce((sum, [, { unpaid }]) => sum + unpaid, 0);

  const filteredInvoices = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();

    let list = invoicesInMonth.filter((inv) => {
      const status = effectiveInvoiceStatus(inv);
      const matchesStatus = statusFilter === 'all' || status === statusFilter;
      const matchesSearch =
        !term ||
        [inv.invoice_number, inv.client_name, String(inv.total ?? '')]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(term));
      return matchesStatus && matchesSearch;
    });

    list = [...list].sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      if (sortKey === 'total') {
        av = a.total ?? 0;
        bv = b.total ?? 0;
      } else {
        av = (a[sortKey] ?? '').toString().toLowerCase();
        bv = (b[sortKey] ?? '').toString().toLowerCase();
      }
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });

    return list;
  }, [invoicesInMonth, statusFilter, debouncedSearch, sortKey, sortAsc]);

  const statusCounts = useMemo(() => {
    return invoicesInMonth.reduce(
      (acc, inv) => {
        acc[effectiveInvoiceStatus(inv)] = (acc[effectiveInvoiceStatus(inv)] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }, [invoicesInMonth]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(key !== 'due_date');
    }
  }

  return (
    <div className="space-y-6 page-stagger">
      <PageHeader
        title={APP_TAGLINE}
        description={`${APP_NAME} — ${APP_DESCRIPTION}`}
        meta={
          !isLoading && invoices.length > 0
            ? (() => {
                const scope = monthFilter ? formatMonthLabel(monthFilter) : null;
                const count = invoicesInMonth.length;
                const countPart = scope
                  ? `${count} invoice${count !== 1 ? 's' : ''} in ${scope}`
                  : `${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}`;
                if (unpaidTotal > 0) {
                  return `${countPart} · ${totalLabel} total · ${unpaidLabel} outstanding`;
                }
                return `${countPart} · ${totalLabel} total · All paid up ✓`;
              })()
            : undefined
        }
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={clientsLoading || !clients.length}>
                <Plus className="h-4 w-4" />
                New Invoice
              </Button>
            </DialogTrigger>
            <DialogContent
              className="max-w-7xl max-h-[min(94vh,900px)] px-6 sm:px-8"
              onPointerDownOutside={(e) => e.preventDefault()}
              onInteractOutside={(e) => e.preventDefault()}
              onFocusOutside={(e) => e.preventDefault()}
            >
              <DialogHeader>
                <DialogTitle>New Invoice</DialogTitle>
              </DialogHeader>
              <InvoiceBuilder
                clients={clients}
                onSubmit={(data) => createMutation.mutate(data)}
                loading={createMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        }
      />

      {!isLoading && invoicesInMonth.length > 0 && unpaidTotal === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4" />
          {monthFilter
            ? `All paid up for ${formatMonthLabel(monthFilter)}`
            : 'All paid up — no outstanding invoices'}
        </div>
      )}

      {isLoading ? (
        <TableSkeleton rows={5} cols={7} />
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No invoices yet"
          description={
            clients.length === 0
              ? 'Add a client first, then create your first invoice.'
              : 'Create an invoice to track billing and payments.'
          }
          action={
            clients.length === 0 ? (
              <Button asChild>
                <Link to="/clients">Add a client</Link>
              </Button>
            ) : (
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                Create first invoice
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search invoice #, client, amount..."
                className="min-w-0 flex-1"
              />
              <Select
                value={monthFilter || 'all'}
                onValueChange={(v) => setMonthFilter(v === 'all' ? '' : v)}
              >
                <SelectTrigger className="h-9 w-full shrink-0 sm:w-[12rem]" aria-label="Filter by month">
                  <SelectValue placeholder="All months" />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="all">All months</SelectItem>
                  {monthOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              {statusFilters.map((item) => {
                const count =
                  item.value === 'all' ? invoicesInMonth.length : statusCounts[item.value] ?? 0;
                return (
                  <Button
                    key={item.value}
                    type="button"
                    size="sm"
                    variant={statusFilter === item.value ? 'default' : 'outline'}
                    onClick={() => setStatusFilter(item.value)}
                  >
                    {item.label}
                    {count > 0 ? ` (${count})` : ''}
                  </Button>
                );
              })}
            </div>
          </div>

          {invoicesInMonth.length === 0 && monthFilter ? (
            <EmptyState
              icon={FileText}
              title="No invoices this month"
              description={`Nothing issued in ${formatMonthLabel(monthFilter)}. Pick another month or view all.`}
              action={
                <Button variant="outline" onClick={() => setMonthFilter('')}>
                  Show all months
                </Button>
              }
            />
          ) : filteredInvoices.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No invoices match"
              description="Try a different search term, status, or month."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                    setMonthFilter('');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <>
              <div className="hidden rounded-xl border bg-card md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <button type="button" className="font-medium hover:underline" onClick={() => toggleSort('invoice_number')}>
                          Invoice # {sortKey === 'invoice_number' ? (sortAsc ? '↑' : '↓') : ''}
                        </button>
                      </TableHead>
                      <TableHead>
                        <button type="button" className="font-medium hover:underline" onClick={() => toggleSort('client_name')}>
                          Client {sortKey === 'client_name' ? (sortAsc ? '↑' : '↓') : ''}
                        </button>
                      </TableHead>
                      <TableHead>Issue Date</TableHead>
                      <TableHead>
                        <button type="button" className="font-medium hover:underline" onClick={() => toggleSort('due_date')}>
                          Due Date {sortKey === 'due_date' ? (sortAsc ? '↑' : '↓') : ''}
                        </button>
                      </TableHead>
                      <TableHead className="text-right">
                        <button type="button" className="font-medium hover:underline" onClick={() => toggleSort('total')}>
                          Total {sortKey === 'total' ? (sortAsc ? '↑' : '↓') : ''}
                        </button>
                      </TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((inv, index) => {
                      const status = effectiveInvoiceStatus(inv);
                      return (
                      <TableRow
                        key={inv.id}
                        style={listStaggerStyle(index)}
                        className={cn('list-item-enter', status === 'draft' && 'opacity-60')}
                      >
                        <TableCell>
                          <button
                            type="button"
                            className="font-medium hover:underline"
                            onClick={() => setDetail(inv)}
                          >
                            {inv.invoice_number}
                          </button>
                        </TableCell>
                        <TableCell>
                          <Link to={`/clients/${inv.client_id}`} className="hover:underline">
                            {inv.client_name}
                          </Link>
                        </TableCell>
                        <TableCell>{formatDate(inv.issue_date)}</TableCell>
                        <TableCell>
                          <div>{formatDate(inv.due_date)}</div>
                          {relativeDueText(inv.due_date, status) && (
                            <div className="text-xs text-muted-foreground">
                              {relativeDueText(inv.due_date, status)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(inv.total ?? 0, resolveCurrency(inv.currency))}
                        </TableCell>
                        <TableCell>
                          <InvoiceStatusMenu
                            invoice={inv}
                            disabled={statusMutation.isPending && statusMutation.variables?.id === inv.id}
                            onChange={(next) => statusMutation.mutate({ id: inv.id, status: next })}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() => setDetail(inv)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Preview
                            </Button>
                            {status === 'draft' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => statusMutation.mutate({ id: inv.id, status: 'sent' })}
                              >
                                Mark Sent
                              </Button>
                            )}
                            {(status === 'sent' || status === 'overdue') && (
                              <Button
                                size="sm"
                                onClick={() => statusMutation.mutate({ id: inv.id, status: 'paid' })}
                              >
                                Mark Paid
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => setEditing(inv)}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1"
                              onClick={() => duplicateMutation.mutate(inv)}
                              disabled={duplicateMutation.isPending}
                              title="Copy as a new draft"
                            >
                              {duplicateMutation.isPending && duplicateMutation.variables?.id === inv.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                              Duplicate
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1"
                              onClick={() => handlePdf(inv)}
                              disabled={pdfId === inv.id}
                              title="Download PDF"
                            >
                              {pdfId === inv.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                              PDF
                            </Button>
                            {status !== 'paid' && status !== 'cancelled' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => statusMutation.mutate({ id: inv.id, status: 'cancelled' })}
                              >
                                Cancel
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1 text-destructive hover:text-destructive"
                              onClick={() => setDeleting(inv)}
                              title="Delete invoice"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 md:hidden">
                {filteredInvoices.map((inv) => {
                  const status = effectiveInvoiceStatus(inv);
                  return (
                  <div
                    key={inv.id}
                    className={cn(
                      'rounded-xl border bg-card p-4',
                      status === 'draft' && 'opacity-60'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <button type="button" className="font-medium hover:underline" onClick={() => setDetail(inv)}>
                          {inv.invoice_number}
                        </button>
                        <p className="text-sm text-muted-foreground">
                          <Link to={`/clients/${inv.client_id}`} className="hover:underline">
                            {inv.client_name}
                          </Link>
                        </p>
                      </div>
                      <p className="font-semibold">{formatCurrency(inv.total ?? 0, resolveCurrency(inv.currency))}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <InvoiceStatusMenu
                        invoice={inv}
                        disabled={statusMutation.isPending && statusMutation.variables?.id === inv.id}
                        onChange={(next) => statusMutation.mutate({ id: inv.id, status: next })}
                      />
                      <span className="text-xs text-muted-foreground">
                        Due {formatDate(inv.due_date)}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => setDetail(inv)}>
                        <Eye className="h-3.5 w-3.5" />
                        Preview
                      </Button>
                      {status === 'draft' && (
                        <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id: inv.id, status: 'sent' })}>
                          Mark Sent
                        </Button>
                      )}
                      {(status === 'sent' || status === 'overdue') && (
                        <Button size="sm" onClick={() => statusMutation.mutate({ id: inv.id, status: 'paid' })}>
                          Mark Paid
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setEditing(inv)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => duplicateMutation.mutate(inv)}
                        disabled={duplicateMutation.isPending}
                      >
                        {duplicateMutation.isPending && duplicateMutation.variables?.id === inv.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        Duplicate
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => handlePdf(inv)}
                        disabled={pdfId === inv.id}
                      >
                        {pdfId === inv.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        PDF
                      </Button>
                      {status !== 'paid' && status !== 'cancelled' && (
                        <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id: inv.id, status: 'cancelled' })}>
                          Cancel
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-destructive hover:text-destructive"
                        onClick={() => setDeleting(inv)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                  );
                })}
              </div>
            </>
          )}

          <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
            <DialogContent
              className="max-w-7xl max-h-[min(94vh,900px)] px-6 sm:px-8"
              onPointerDownOutside={(e) => e.preventDefault()}
              onInteractOutside={(e) => e.preventDefault()}
              onFocusOutside={(e) => e.preventDefault()}
            >
              <DialogHeader>
                <DialogTitle>Edit {editing?.invoice_number}</DialogTitle>
              </DialogHeader>
              {editing && (
                <InvoiceBuilder
                  key={editing.id}
                  clients={clients}
                  defaultClientId={editing.client_id}
                  lockClient
                  initial={editing}
                  onSubmit={(data) =>
                    updateMutation.mutate({
                      id: editing.id,
                      data: {
                        issue_date: data.issue_date,
                        due_date: data.due_date,
                        tax_rate: data.tax_rate,
                        currency: data.currency,
                        notes: data.notes ?? null,
                        bank_account_index: data.bank_account_index,
                        payment_account: data.payment_account ?? null,
                        items: data.items,
                      },
                    })
                  }
                  loading={updateMutation.isPending}
                />
              )}
            </DialogContent>
          </Dialog>

          <InvoicePreviewDialog
            invoice={detail}
            open={!!detail}
            onOpenChange={(open) => !open && setDetail(null)}
            onEdit={() => {
              if (!detail) return;
              setEditing(detail);
              setDetail(null);
            }}
            onPdf={() => detail && handlePdf(detail)}
            pdfLoading={detail ? pdfId === detail.id : false}
          />

          <ConfirmDialog
            open={!!deleting}
            onOpenChange={(open) => !open && setDeleting(null)}
            title="Delete invoice?"
            description={
              deleting
                ? `Delete ${deleting.invoice_number}${deleting.client_name ? ` for ${deleting.client_name}` : ''}? This cannot be undone.`
                : 'This cannot be undone.'
            }
            confirmLabel="Delete"
            destructive
            loading={deleteMutation.isPending}
            onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
          />
        </>
      )}
    </div>
  );
}
