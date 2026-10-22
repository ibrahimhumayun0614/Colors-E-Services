import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, ExternalLink, FileText, Globe, ListTodo, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2, User } from 'lucide-react';
import { api, type Invoice, type InvoiceStatus, type Service, type UpdateInvoicePayload } from '@/lib/api';
import { formatCurrency, formatDate, relativeDueText, websiteHref } from '@/lib/utils';
import { getServiceSoonestRenewal, needsRenewalAttention } from '@/lib/renewals';
import {
  billingCycleShortLabel,
  formatServiceFeeLabel,
  hasRenewalTracking,
  isRecurringBilling,
  resolveCurrency,
  serviceTypeLabel,
} from '@/lib/services';
import { duplicateInvoicePayload, effectiveInvoiceStatus, isInvoiceOverdue } from '@/lib/invoices';
import { invoiceStatusVariant, formatInvoiceStatus } from '@/lib/status';
import { useToast } from '@/context/ToastContext';
import { ClientForm, clientDialogClass } from '@/pages/Clients';
import { InvoiceBuilder } from '@/components/InvoiceBuilder';
import { InvoicePreviewDialog } from '@/components/InvoiceDocumentPreview';
import { downloadInvoicePdf } from '@/lib/invoice-pdf';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ServiceForm } from '@/components/ServiceForm';
import { ScrollReveal } from '@/components/layout/ScrollReveal';
import { ServiceRenewDialog } from '@/components/ServiceWorkflow';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ActivityTimeline,
  buildActivityTimeline,
  ClientKpiCards,
  ClientProfileHeader,
  OutstandingBalanceCard,
  RenewalStatusCard,
  ServicePreviewCard,
  TabBadge,
} from '@/components/client-detail/ClientDetailSections';
import { EmptyState } from '@/components/layout/EmptyState';
import { ClientDetailSkeleton } from '@/components/layout/Skeletons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const detailCard = 'rounded-2xl border bg-card shadow-sm';

const serviceDialogClass =
  'flex max-h-[min(92vh,720px)] max-w-lg flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg';

function NotesCard({ notes }: { notes: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = notes.length > 280;

  return (
    <Card className={detailCard}>
      <CardHeader>
        <CardTitle className="text-base">Notes</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-sm text-muted-foreground whitespace-pre-wrap ${!expanded && long ? 'line-clamp-4' : ''}`}>
          {notes}
        </p>
        {long && (
          <Button variant="link" className="mt-2 h-auto p-0" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show less' : 'Show more'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const clientId = Number(id);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [renewingService, setRenewingService] = useState<Service | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [pdfId, setPdfId] = useState<number | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | null>(null);
  const [deleteService, setDeleteService] = useState<Service | null>(null);
  const [deleteClientOpen, setDeleteClientOpen] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();

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

  const { data: client, isLoading } = useQuery({
    queryKey: ['client', clientId],
    queryFn: () => api.clients.get(clientId),
    enabled: !!clientId,
  });

  const { data: services = [] } = useQuery({
    queryKey: ['services', clientId],
    queryFn: () => api.services.list({ client_id: clientId }),
    enabled: !!clientId,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', clientId],
    queryFn: () => api.invoices.list({ client_id: clientId }),
    enabled: !!clientId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.clients.update>[1]) =>
      api.clients.update(clientId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['client', clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['services', clientId] });
      setEditOpen(false);

      const changedFields = Object.keys(variables);
      const statusOnly = changedFields.length === 1 && changedFields[0] === 'status';

      if (statusOnly && variables.status === 'inactive') {
        toast.success('Client archived — services paused and hidden from dashboard alerts');
      } else if (statusOnly && variables.status === 'active') {
        toast.success('Client restored — paused services reactivated');
      } else {
        toast.success('Client updated');
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteClientMutation = useMutation({
    mutationFn: () => api.clients.delete(clientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Client deleted');
      navigate('/clients');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const serviceMutation = useMutation({
    mutationFn: api.services.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services', clientId] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setServiceOpen(false);
      toast.success('Service added');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateServiceMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Service> }) =>
      api.services.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services', clientId] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setEditingService(null);
      toast.success('Service updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteServiceMutation = useMutation({
    mutationFn: api.services.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services', clientId] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setDeleteService(null);
      toast.success('Service removed');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const serviceTaskMutation = useMutation({
    mutationFn: (id: number) => api.services.createTask(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(data.existing ? 'Open task already linked' : 'Task created');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const serviceInvoiceMutation = useMutation({
    mutationFn: (id: number) => api.services.createInvoice(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['invoices', clientId] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(data.existing ? 'Draft invoice already exists for this service' : 'Draft invoice created from service');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createInvoiceMutation = useMutation({
    mutationFn: api.invoices.create,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['invoices', clientId] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setInvoiceOpen(false);
      setPreviewInvoice(created);
      toast.success('Invoice created — preview includes a scan QR code');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const duplicateInvoiceMutation = useMutation({
    mutationFn: async (source: Invoice) => {
      const full = source.items?.length ? source : await api.invoices.get(source.id);
      const payload = duplicateInvoicePayload(full);
      if (!payload.items.length) throw new Error('This invoice has no line items to copy');
      return api.invoices.create(payload);
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['invoices', clientId] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setPreviewInvoice(null);
      setEditingInvoice(created);
      toast.success(`Copied as draft ${created.invoice_number} — edit now or close and edit later`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateInvoiceMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateInvoicePayload }) =>
      api.invoices.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices', clientId] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setEditingInvoice(null);
      toast.success('Invoice updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: InvoiceStatus }) =>
      api.invoices.updateStatus(id, status),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['invoices', clientId] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['client', clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['services', clientId] });
      if (status === 'paid' && client?.status === 'lead') {
        toast.success('Invoice paid — client and lead services activated');
      } else {
        toast.success(`Invoice marked as ${status}`);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: (id: number) => api.invoices.delete(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['invoices', clientId] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      if (previewInvoice?.id === id) setPreviewInvoice(null);
      if (editingInvoice?.id === id) setEditingInvoice(null);
      setDeletingInvoice(null);
      toast.success('Invoice deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const outstanding = useMemo(
    () =>
      invoices
        .filter((i) => {
          const status = effectiveInvoiceStatus(i);
          return status === 'sent' || status === 'overdue';
        })
        .reduce((sum, i) => sum + (i.total ?? 0), 0),
    [invoices]
  );

  const unpaidCount = useMemo(
    () =>
      invoices.filter((i) => {
        const status = effectiveInvoiceStatus(i);
        return status === 'sent' || status === 'overdue';
      }).length,
    [invoices]
  );

  const overdueCount = useMemo(
    () => invoices.filter((i) => isInvoiceOverdue(i)).length,
    [invoices]
  );

  const renewalsDue = useMemo(
    () =>
      services.filter((service) => hasRenewalTracking(service) && needsRenewalAttention(service))
        .length,
    [services]
  );

  const nextRenewal = useMemo(() => {
    let best: { service: Service; renewal: NonNullable<ReturnType<typeof getServiceSoonestRenewal>> } | null =
      null;

    for (const service of services) {
      if (!hasRenewalTracking(service)) continue;
      const renewal = getServiceSoonestRenewal(service);
      if (!renewal || renewal.state.bucket === 'ok' || renewal.state.bucket === 'missing') continue;
      if (
        !best ||
        (renewal.state.days !== null &&
          best.renewal.state.days !== null &&
          renewal.state.days < best.renewal.state.days)
      ) {
        best = { service, renewal };
      }
    }

    return best;
  }, [services]);

  const primaryService = useMemo(() => {
    if (nextRenewal) return nextRenewal.service;
    const activeRenewing = services.find(
      (s) => s.status === 'active' && isRecurringBilling(s.billing_cycle) && hasRenewalTracking(s)
    );
    if (activeRenewing) return activeRenewing;
    const anyRenewing = services.find((s) => isRecurringBilling(s.billing_cycle));
    if (anyRenewing) return anyRenewing;
    return services[0] ?? null;
  }, [services, nextRenewal]);

  const primaryUnpaidInvoice = useMemo(
    () =>
      invoices.find((i) => isInvoiceOverdue(i)) ??
      invoices.find((i) => effectiveInvoiceStatus(i) === 'sent'),
    [invoices]
  );

  const activity = useMemo(
    () => (client ? buildActivityTimeline(client, services, invoices) : []),
    [client, services, invoices]
  );

  const notesCount = client?.notes?.trim() ? 1 : 0;
  const hasOverdue = overdueCount > 0;
  const renewalsLabel = renewalsDue > 0 ? String(renewalsDue) : nextRenewal ? 'Soon' : 'None';

  function handleSendEmail() {
    if (!client?.email) {
      toast.error('No email address on file');
      return;
    }
    window.location.href = `mailto:${client.email}`;
  }

  function handleExport() {
    if (!client) return;
    const blob = new Blob([JSON.stringify({ client, services, invoices }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${client.name.replace(/\s+/g, '-').toLowerCase()}-export.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success('Client data exported');
  }

  function handleArchiveToggle() {
    if (!client) return;

    if (client.status === 'inactive') {
      updateMutation.mutate({ status: 'active' });
      return;
    }

    updateMutation.mutate({ status: 'inactive' });
  }

  if (isLoading) return <ClientDetailSkeleton />;

  if (!client) {
    return (
      <EmptyState
        icon={Globe}
        title="Client not found"
        description="This client may have been deleted or the link is incorrect."
        action={
          <Button asChild variant="outline">
            <Link to="/clients">Back to clients</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6 page-stagger">
      <div className="flex items-center gap-2 md:hidden">
        <Button variant="ghost" size="icon" onClick={() => navigate('/clients')} aria-label="Back to clients">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="truncate font-semibold">{client.name}</span>
      </div>

      <ClientProfileHeader
        client={client}
        onEdit={() => setEditOpen(true)}
        onSendEmail={handleSendEmail}
        onCreateInvoice={() => setInvoiceOpen(true)}
        onAddService={() => setServiceOpen(true)}
        onDelete={() => setDeleteClientOpen(true)}
        onExport={handleExport}
        onArchive={handleArchiveToggle}
      />

      <ClientKpiCards
        servicesCount={services.length}
        invoicesCount={invoices.length}
        outstanding={outstanding}
        renewalsLabel={renewalsLabel}
        hasOverdue={hasOverdue}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent p-0">
          {[
            { value: 'overview', label: 'Overview' },
            { value: 'services', label: 'Services', count: services.length },
            { value: 'invoices', label: 'Invoices', count: invoices.length },
            { value: 'notes', label: 'Notes', count: notesCount },
            { value: 'activity', label: 'Activity' },
            { value: 'documents', label: 'Documents' },
          ].map(({ value, label, count }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="relative rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              {label}
              {count !== undefined && <TabBadge count={count} />}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="tabs-panel-enter mt-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6">
              <ScrollReveal>
                <ActivityTimeline events={activity} />
              </ScrollReveal>
              <ScrollReveal delayMs={60}>
                <ServicePreviewCard
                  service={primaryService}
                  onEdit={(service) => setEditingService(service)}
                  onViewAll={() => setActiveTab('services')}
                  onAdd={() => setServiceOpen(true)}
                />
              </ScrollReveal>
              {client.notes && (
                <ScrollReveal delayMs={100}>
                  <NotesCard notes={client.notes} />
                </ScrollReveal>
              )}
            </div>

            <div className="space-y-4">
              <ScrollReveal delayMs={80}>
                <OutstandingBalanceCard
                  outstanding={outstanding}
                  unpaidCount={unpaidCount}
                  hasOverdue={hasOverdue}
                  primaryInvoiceId={primaryUnpaidInvoice?.id}
                  onViewInvoice={() => setActiveTab('invoices')}
                />
              </ScrollReveal>
              <ScrollReveal delayMs={120}>
                <RenewalStatusCard nextRenewal={nextRenewal} />
              </ScrollReveal>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="services" className="tabs-panel-enter mt-6">
          <Card className={detailCard}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Services</CardTitle>
              <Button size="sm" onClick={() => setServiceOpen(true)}>
                <Plus className="h-4 w-4" />
                Add Service
              </Button>
            </CardHeader>
            <CardContent>
              {services.length === 0 ? (
                <EmptyState
                  icon={Globe}
                  title="No services tracked"
                  description="Add a service to track domains, maintenance, or deliverables."
                  action={
                    <Button size="sm" onClick={() => setServiceOpen(true)}>
                      <Plus className="h-4 w-4" />
                      Add service
                    </Button>
                  }
                  className="border-0 bg-transparent py-6"
                />
              ) : (
                <div className="space-y-3">
                  {services.map((service) => {
                    const soonest = hasRenewalTracking(service) ? getServiceSoonestRenewal(service) : null;
                    const feeLabel = formatServiceFeeLabel(service);
                    const renews = isRecurringBilling(service.billing_cycle);
                    return (
                      <div
                        key={service.id}
                        className="flex items-start justify-between rounded-2xl border p-4 transition-colors hover:bg-slate-50 dark:hover:bg-muted/50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{service.name}</p>
                            <Badge variant="secondary" className="text-[10px]">
                              {serviceTypeLabel(service.service_type)}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {billingCycleShortLabel(service.billing_cycle)}
                            </Badge>
                          </div>
                          {feeLabel && (
                            <p className="mt-1 text-sm font-semibold tabular-nums">{feeLabel}</p>
                          )}
                          {service.url && (
                            <a
                              href={websiteHref(service.url)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {service.url}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                            {renews ? (
                              <>
                                {service.domain_expiry && <span>Domain: {formatDate(service.domain_expiry)}</span>}
                                {service.hosting_expiry && <span>Hosting: {formatDate(service.hosting_expiry)}</span>}
                                {service.next_due_date && <span>Due: {formatDate(service.next_due_date)}</span>}
                                {!service.domain_expiry && !service.hosting_expiry && !service.next_due_date && (
                                  <span>No renewal date set</span>
                                )}
                              </>
                            ) : (
                              <span>No yearly renewal — one-time / project fee</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {soonest && soonest.state.bucket !== 'ok' && (
                            <Badge variant={soonest.state.variant}>
                              {soonest.type} · {soonest.state.label}
                            </Badge>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingService(service);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {hasRenewalTracking(service) && (
                                <DropdownMenuItem onClick={() => setRenewingService(service)} className="gap-2">
                                  <RefreshCw className="h-4 w-4" />
                                  Renew / update
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => serviceTaskMutation.mutate(service.id)}
                                className="gap-2"
                                disabled={serviceTaskMutation.isPending}
                              >
                                <ListTodo className="h-4 w-4" />
                                Create task
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => serviceInvoiceMutation.mutate(service.id)}
                                className="gap-2"
                                disabled={serviceInvoiceMutation.isPending}
                              >
                                <FileText className="h-4 w-4" />
                                Create invoice
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                destructive
                                onClick={() => setDeleteService(service)}
                                className="gap-2"
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="tabs-panel-enter mt-6">
          <Card className={detailCard}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Invoices</CardTitle>
              <Button size="sm" onClick={() => setInvoiceOpen(true)}>
                <Plus className="h-4 w-4" />
                New Invoice
              </Button>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No invoices yet"
                  description="Create an invoice to track billing for this client."
                  action={
                    <Button size="sm" onClick={() => setInvoiceOpen(true)}>
                      <Plus className="h-4 w-4" />
                      Create invoice
                    </Button>
                  }
                  className="border-0 bg-transparent py-6"
                />
              ) : (
                <div className="space-y-3">
                  {invoices.map((inv) => {
                    const status = effectiveInvoiceStatus(inv);
                    return (
                    <div
                      key={inv.id}
                      className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${status === 'draft' ? 'opacity-70' : ''}`}
                    >
                      <div>
                        <p className="font-semibold">{formatCurrency(inv.total ?? 0, resolveCurrency(inv.currency))}</p>
                        <p className="text-sm text-muted-foreground">
                          {inv.invoice_number} · Due {formatDate(inv.due_date)}
                        </p>
                        {relativeDueText(inv.due_date, status) && (
                          <p className="text-xs text-muted-foreground">
                            {relativeDueText(inv.due_date, status)}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={invoiceStatusVariant[status]}>
                          {formatInvoiceStatus(status)}
                        </Badge>
                        {status === 'draft' && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => setEditingInvoice(inv)}>
                              Edit
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id: inv.id, status: 'sent' })}>
                              Mark Sent
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id: inv.id, status: 'cancelled' })}>
                              Cancel
                            </Button>
                          </>
                        )}
                        {(status === 'sent' || status === 'overdue') && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id: inv.id, status: 'paid' })}>
                              Mark Paid
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id: inv.id, status: 'cancelled' })}>
                              Cancel
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1"
                          onClick={() => duplicateInvoiceMutation.mutate(inv)}
                          disabled={duplicateInvoiceMutation.isPending}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Duplicate
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-destructive hover:text-destructive"
                          onClick={() => setDeletingInvoice(inv)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="tabs-panel-enter mt-6">
          {client.notes ? (
            <NotesCard notes={client.notes} />
          ) : (
            <EmptyState
              icon={FileText}
              title="No notes yet"
              description="Add notes to keep important context about this client."
              action={
                <Button size="sm" onClick={() => setEditOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Add note
                </Button>
              }
            />
          )}
        </TabsContent>

        <TabsContent value="activity" className="tabs-panel-enter mt-6">
          <ActivityTimeline events={activity} />
        </TabsContent>

        <TabsContent value="documents" className="tabs-panel-enter mt-6">
          <EmptyState
            icon={FileText}
            title="No documents yet"
            description="Contracts, proposals, and files will appear here in a future update."
            action={
              <Button variant="outline" size="sm" onClick={handleExport}>
                Export client data
              </Button>
            }
          />
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className={clientDialogClass}>
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-muted-foreground" />
              Edit Client
            </DialogTitle>
            <DialogDescription>Update contact details and account status.</DialogDescription>
          </DialogHeader>
          <ClientForm
            initial={client}
            onSubmit={(data) => updateMutation.mutate(data)}
            onCancel={() => setEditOpen(false)}
            loading={updateMutation.isPending}
            submitLabel="Save changes"
          />
        </DialogContent>
      </Dialog>

      <Dialog open={serviceOpen} onOpenChange={setServiceOpen}>
        <DialogContent
          className={serviceDialogClass}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
            <DialogTitle>Add Service</DialogTitle>
            <DialogDescription>Add a service for this client — domain, maintenance, or deliverables.</DialogDescription>
          </DialogHeader>
          <div className="px-6 py-4">
            <ServiceForm
              key="create-service"
              clientId={clientId}
              mode="create"
              onSubmit={(data) => serviceMutation.mutate(data)}
              loading={serviceMutation.isPending}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingService} onOpenChange={(open) => !open && setEditingService(null)}>
        <DialogContent
          className={serviceDialogClass}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
            <DialogTitle>Edit Service</DialogTitle>
            <DialogDescription>
              Update {editingService?.name ?? 'service'} details and billing.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-4">
            {editingService && (
              <ServiceForm
                key={editingService.id}
                initial={editingService}
                mode="edit"
                onSubmit={(data) => updateServiceMutation.mutate({ id: editingService.id, data })}
                loading={updateServiceMutation.isPending}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
      >
        <DialogContent
          className="max-w-7xl max-h-[min(94vh,900px)] px-6 sm:px-8"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>New Invoice</DialogTitle>
          </DialogHeader>
          {client && (
            <InvoiceBuilder
              clients={[client]}
              defaultClientId={clientId}
              lockClient
              onSubmit={(data) => createInvoiceMutation.mutate(data)}
              loading={createInvoiceMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <InvoicePreviewDialog
        invoice={previewInvoice}
        open={!!previewInvoice}
        onOpenChange={(open) => !open && setPreviewInvoice(null)}
        onEdit={() => {
          if (!previewInvoice) return;
          setEditingInvoice(previewInvoice);
          setPreviewInvoice(null);
        }}
        onPdf={() => previewInvoice && handlePdf(previewInvoice)}
        pdfLoading={previewInvoice ? pdfId === previewInvoice.id : false}
      />

      <Dialog open={!!editingInvoice} onOpenChange={(open) => !open && setEditingInvoice(null)}>
        <DialogContent
          className="max-w-7xl max-h-[min(94vh,900px)] px-6 sm:px-8"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Edit {editingInvoice?.invoice_number}</DialogTitle>
          </DialogHeader>
          {editingInvoice && client && (
            <InvoiceBuilder
              key={editingInvoice.id}
              clients={[client]}
              defaultClientId={clientId}
              lockClient
              initial={editingInvoice}
              onSubmit={(data) =>
                updateInvoiceMutation.mutate({
                  id: editingInvoice.id,
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
              loading={updateInvoiceMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <ServiceRenewDialog
        service={renewingService}
        open={!!renewingService}
        onOpenChange={(open) => !open && setRenewingService(null)}
      />

      <ConfirmDialog
        open={!!deleteService}
        onOpenChange={(open) => !open && setDeleteService(null)}
        title="Delete service?"
        description={`Delete ${deleteService?.name}? This can't be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleteServiceMutation.isPending}
        onConfirm={() => deleteService && deleteServiceMutation.mutate(deleteService.id)}
      />

      <ConfirmDialog
        open={!!deletingInvoice}
        onOpenChange={(open) => !open && setDeletingInvoice(null)}
        title="Delete invoice?"
        description={
          deletingInvoice
            ? `Delete ${deletingInvoice.invoice_number}? This can't be undone.`
            : "This can't be undone."
        }
        confirmLabel="Delete"
        destructive
        loading={deleteInvoiceMutation.isPending}
        onConfirm={() => deletingInvoice && deleteInvoiceMutation.mutate(deletingInvoice.id)}
      />

      <ConfirmDialog
        open={deleteClientOpen}
        onOpenChange={setDeleteClientOpen}
        title="Delete client?"
        description={`Delete ${client.name} and all related data? This can't be undone.`}
        confirmLabel="Delete client"
        destructive
        loading={deleteClientMutation.isPending}
        onConfirm={() => deleteClientMutation.mutate()}
      />
    </div>
  );
}
