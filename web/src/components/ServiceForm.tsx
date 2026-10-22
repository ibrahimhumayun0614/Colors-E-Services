import { useState } from 'react';
import type { BillingCycle, Client, Service, ServiceStatus, ServiceType } from '@/lib/api';
import {
  BILLING_CYCLE_OPTIONS,
  CURRENCY_OPTIONS,
  getDefaultCurrency,
  SERVICE_STATUS_OPTIONS,
  SERVICE_TYPE_OPTIONS,
} from '@/lib/services';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

function defaultBillingCycle(type: ServiceType) {
  if (type === 'domain_hosting' || type === 'website_maintenance') return 'monthly';
  if (type === 'logo_design' || type === 'content_writing') return 'one_time';
  return 'none';
}

function FormSelect({
  id,
  label,
  value,
  onValueChange,
  options,
  disabled,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || undefined} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder ?? 'Select…'} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ServiceForm({
  clientId,
  initial,
  clients,
  onSubmit,
  loading,
  mode = 'create',
  allowedTypes,
}: {
  clientId?: number;
  initial?: Partial<Service>;
  clients?: Client[];
  onSubmit: (data: Partial<Service>) => void;
  loading?: boolean;
  mode?: 'create' | 'edit';
  /** Limit which service types can be chosen (e.g. renewal-only on Services page). */
  allowedTypes?: ServiceType[];
}) {
  const typeOptions = allowedTypes?.length
    ? SERVICE_TYPE_OPTIONS.filter((o) => allowedTypes.includes(o.value))
    : SERVICE_TYPE_OPTIONS;

  const initialType =
    initial?.service_type ??
    (typeOptions[0]?.value as ServiceType | undefined) ??
    'domain_hosting';

  const [form, setForm] = useState({
    client_id: initial?.client_id ? String(initial.client_id) : clientId ? String(clientId) : '',
    service_type: initialType,
    name: initial?.name ?? '',
    status: initial?.status ?? 'active',
    billing_cycle: initial?.billing_cycle ?? defaultBillingCycle(initialType),
    amount: String(initial?.amount ?? 0),
    currency: initial?.currency ?? getDefaultCurrency(),
    start_date: initial?.start_date ?? '',
    end_date: initial?.end_date ?? '',
    next_due_date: initial?.next_due_date ?? '',
    url: initial?.url ?? '',
    registrar: initial?.registrar ?? '',
    domain_expiry: initial?.domain_expiry ?? '',
    hosting_provider: initial?.hosting_provider ?? '',
    hosting_expiry: initial?.hosting_expiry ?? '',
    cms: initial?.cms ?? '',
    email_provider: initial?.email_provider ?? '',
    email_accounts: initial?.email_accounts ?? '',
    deliverables: initial?.deliverables ?? '',
    notes: initial?.notes ?? '',
  });

  const type = form.service_type as ServiceType;
  const showClientSelect = !!clients && mode === 'create';

  function onTypeChange(nextType: ServiceType) {
    setForm((prev) => ({
      ...prev,
      service_type: nextType,
      billing_cycle: mode === 'create' ? defaultBillingCycle(nextType) : prev.billing_cycle,
    }));
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (showClientSelect && !form.client_id) return;

        const payload: Partial<Service> = {
          service_type: type,
          name: form.name.trim(),
          status: form.status as Service['status'],
          billing_cycle: form.billing_cycle as Service['billing_cycle'],
          amount: parseFloat(form.amount) || 0,
          currency: form.currency,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          next_due_date: form.next_due_date || null,
          url: form.url || null,
          registrar: form.registrar || null,
          domain_expiry: form.domain_expiry || null,
          hosting_provider: form.hosting_provider || null,
          hosting_expiry: form.hosting_expiry || null,
          cms: form.cms || null,
          email_provider: form.email_provider || null,
          email_accounts: form.email_accounts || null,
          deliverables: form.deliverables || null,
          notes: form.notes || null,
        };

        if (showClientSelect) payload.client_id = Number(form.client_id);
        else if (clientId) payload.client_id = clientId;

        onSubmit(payload);
      }}
    >
      {showClientSelect && (
        <FormSelect
          id="service-client"
          label="Client *"
          value={form.client_id}
          placeholder="Select a client"
          options={clients!.map((c) => ({
            value: String(c.id),
            label: `${c.name}${c.company ? ` — ${c.company}` : ''}`,
          }))}
          onValueChange={(client_id) => setForm({ ...form, client_id })}
        />
      )}

      <FormSelect
        id="service-type"
        label="Service Type *"
        value={form.service_type}
        disabled={mode === 'edit'}
        options={typeOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
        onValueChange={(value) => onTypeChange(value as ServiceType)}
      />

      <p className="text-xs font-medium text-muted-foreground">Basics</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="service-name">Name *</Label>
          <Input
            id="service-name"
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <FormSelect
          id="service-status"
          label="Status"
          value={form.status}
          options={SERVICE_STATUS_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
          onValueChange={(status) => setForm({ ...form, status: status as ServiceStatus })}
        />
        <FormSelect
          id="service-billing"
          label="Billing Cycle"
          value={form.billing_cycle}
          options={BILLING_CYCLE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
          onValueChange={(billing_cycle) =>
            setForm({ ...form, billing_cycle: billing_cycle as BillingCycle })
          }
        />
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="service-amount">Amount</Label>
          <div className="grid grid-cols-[7.5rem_1fr] gap-2">
            <Select
              value={form.currency}
              onValueChange={(currency) => setForm({ ...form, currency })}
            >
              <SelectTrigger id="service-currency" aria-label="Currency">
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                {CURRENCY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id="service-amount"
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0.00"
            />
          </div>
        </div>
      </div>

      {type === 'domain_hosting' && (
        <>
          <p className="pt-2 text-xs font-medium text-muted-foreground">Domain & hosting</p>
          <div className="space-y-2">
            <Label htmlFor="service-url">URL</Label>
            <Input
              id="service-url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://example.com"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="service-registrar">Registrar</Label>
              <Input
                id="service-registrar"
                value={form.registrar}
                onChange={(e) => setForm({ ...form, registrar: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-domain-expiry">Domain Expiry</Label>
              <Input
                id="service-domain-expiry"
                type="date"
                value={form.domain_expiry}
                onChange={(e) => setForm({ ...form, domain_expiry: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-hosting-provider">Hosting Provider</Label>
              <Input
                id="service-hosting-provider"
                value={form.hosting_provider}
                onChange={(e) => setForm({ ...form, hosting_provider: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-hosting-expiry">Hosting Expiry</Label>
              <Input
                id="service-hosting-expiry"
                type="date"
                value={form.hosting_expiry}
                onChange={(e) => setForm({ ...form, hosting_expiry: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-cms">CMS / Stack</Label>
              <Input
                id="service-cms"
                value={form.cms}
                onChange={(e) => setForm({ ...form, cms: e.target.value })}
              />
            </div>
          </div>
        </>
      )}

      {type === 'website_maintenance' && (
        <>
          <p className="pt-2 text-xs font-medium text-muted-foreground">Maintenance</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="service-url-maint">Site URL</Label>
              <Input
                id="service-url-maint"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-next-due">Next Due Date</Label>
              <Input
                id="service-next-due"
                type="date"
                value={form.next_due_date}
                onChange={(e) => setForm({ ...form, next_due_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-cms-maint">CMS / Stack</Label>
              <Input
                id="service-cms-maint"
                value={form.cms}
                onChange={(e) => setForm({ ...form, cms: e.target.value })}
              />
            </div>
          </div>
        </>
      )}

      {type === 'email_configuration' && (
        <>
          <p className="pt-2 text-xs font-medium text-muted-foreground">Email</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="service-email-provider">Email Provider</Label>
              <Input
                id="service-email-provider"
                value={form.email_provider}
                onChange={(e) => setForm({ ...form, email_provider: e.target.value })}
                placeholder="Google Workspace, Microsoft 365…"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="service-email-accounts">Accounts</Label>
              <Textarea
                id="service-email-accounts"
                value={form.email_accounts}
                onChange={(e) => setForm({ ...form, email_accounts: e.target.value })}
                placeholder="info@example.com, support@example.com"
              />
            </div>
          </div>
        </>
      )}

      {(type === 'logo_design' || type === 'content_writing') && (
        <>
          <p className="pt-2 text-xs font-medium text-muted-foreground">Project</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="service-start">Start Date</Label>
              <Input
                id="service-start"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-end">End Date</Label>
              <Input
                id="service-end"
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="service-deliverables">Deliverables</Label>
              <Textarea
                id="service-deliverables"
                value={form.deliverables}
                onChange={(e) => setForm({ ...form, deliverables: e.target.value })}
                placeholder="Logo files, brand guide, blog posts…"
              />
            </div>
          </div>
        </>
      )}

      <p className="pt-2 text-xs font-medium text-muted-foreground">Notes</p>
      <div className="space-y-2">
        <Textarea
          id="service-notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Saving...' : mode === 'edit' ? 'Save Changes' : 'Add Service'}
      </Button>
    </form>
  );
}
