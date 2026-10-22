import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api, type Client, type Invoice, type Product, type Service, type UserProfile } from '@/lib/api';
import { getUserProfile, setUserProfile } from '@/lib/auth';
import {
  bankAccountOptionLabel,
  normalizeBankAccount,
  parsePaymentAccount,
  resolveBankAccounts,
  type BankAccount,
} from '@/lib/bank-accounts';
import {
  billableServicesForInvoice,
  CURRENCY_OPTIONS,
  getDefaultCurrency,
  invoiceLineFromService,
  resolveCurrency,
} from '@/lib/services';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { InvoiceDocumentPreview } from '@/components/InvoiceDocumentPreview';
import { productLineDescription, matchProductByTypedName } from '@/lib/product-catalog';
import { ProductLineDescriptionInput } from '@/components/ProductLineDescriptionInput';
import { cn } from '@/lib/utils';

type LineItem = {
  description: string;
  quantity: string;
  rate: string;
  line_date: string;
  service_id?: number | null;
};

function emptyLine(lineDate = new Date().toISOString().split('T')[0]): LineItem {
  return { description: '', quantity: '1', rate: '', line_date: lineDate, service_id: null };
}

function linesFromInvoice(invoice: Invoice): LineItem[] {
  const items = invoice.items ?? [];
  if (!items.length) return [emptyLine()];
  return items.map((item) => ({
    description: item.description,
    quantity: String(item.quantity),
    rate: String(item.rate),
    line_date: item.line_date?.trim() || invoice.issue_date,
    service_id: item.service_id ?? null,
  }));
}

function linesFromServices(services: Service[]): LineItem[] {
  const billable = billableServicesForInvoice(services);
  if (!billable.length) return [emptyLine()];
  return billable.map((service) => {
    const line = invoiceLineFromService(service);
    return {
      description: line.description,
      quantity: String(line.quantity),
      rate: String(line.rate),
      line_date: new Date().toISOString().split('T')[0],
      service_id: line.service_id,
    };
  });
}

function pickCurrency(services: Service[], fallback: string): string {
  const billable = billableServicesForInvoice(services);
  if (!billable.length) return fallback;
  const counts = new Map<string, number>();
  for (const s of billable) {
    const code = resolveCurrency(s.currency);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let best = fallback;
  let bestCount = 0;
  for (const [code, count] of counts) {
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  return best;
}

const LOGO_MAX_WIDTH = 480;
const LOGO_MAX_HEIGHT = 240;

/** Downscale to invoice-header size so the data URL stays small enough to store on the profile. */
function resizeLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, LOGO_MAX_WIDTH / img.width, LOGO_MAX_HEIGHT / img.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas unavailable'));
        return;
      }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Invalid image'));
    };
    img.src = url;
  });
}

type CompanyDraft = {
  company_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  tax_id: string;
  logo_data: string;
  website: string;
  bank_account: string;
  bank_name: string;
  bank_ifsc: string;
  bank_account_name: string;
  upi_id: string;
  payment_method: string;
  bank_accounts: BankAccount[];
};

type ClientDraft = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
};

function profileToCompany(profile: UserProfile): CompanyDraft {
  const bank_accounts = resolveBankAccounts(profile);
  const primary = bank_accounts[0];
  return {
    company_name: profile.company_name?.trim() || '',
    email: profile.email || '',
    phone: profile.phone || '',
    address: profile.address || '',
    city: profile.city || '',
    state: profile.state || '',
    zip: profile.zip || '',
    tax_id: profile.tax_id || '',
    logo_data: profile.logo_data || '',
    website: profile.website || '',
    bank_account: primary?.bank_account || profile.bank_account || '',
    bank_name: primary?.bank_name || profile.bank_name || '',
    bank_ifsc: primary?.bank_ifsc || profile.bank_ifsc || '',
    bank_account_name: primary?.bank_account_name || profile.bank_account_name || '',
    upi_id: primary?.upi_id || profile.upi_id || '',
    payment_method: profile.payment_method || 'EFT Bank Transfer',
    bank_accounts,
  };
}

function withSelectedBank(
  company: CompanyDraft,
  index: number,
  patch: Partial<CompanyDraft>
): CompanyDraft {
  const next = { ...company, ...patch };
  const accounts = [...(company.bank_accounts ?? [])];
  const safeIndex = Math.min(Math.max(0, index), Math.max(0, accounts.length - 1));
  const current = accounts[safeIndex] ?? {
    label: safeIndex === 0 ? 'Primary' : safeIndex === 1 ? 'Personal' : `Account ${safeIndex + 1}`,
    bank_name: '',
    bank_account: '',
    bank_ifsc: '',
    bank_account_name: '',
    upi_id: '',
  };
  const updated: BankAccount = {
    label: current.label,
    bank_name: next.bank_name,
    bank_account: next.bank_account,
    bank_ifsc: next.bank_ifsc,
    bank_account_name: next.bank_account_name,
    upi_id: next.upi_id,
  };
  if (accounts.length === 0) {
    accounts.push(updated);
  } else {
    accounts[safeIndex] = updated;
  }
  return { ...next, bank_accounts: accounts };
}

function applyBankSelection(company: CompanyDraft, index: number): CompanyDraft {
  const accounts = company.bank_accounts ?? [];
  if (!accounts.length) return company;
  const safeIndex = Math.min(Math.max(0, index), accounts.length - 1);
  const selected = accounts[safeIndex];
  return {
    ...company,
    bank_account: selected.bank_account,
    bank_name: selected.bank_name,
    bank_ifsc: selected.bank_ifsc,
    bank_account_name: selected.bank_account_name,
    upi_id: selected.upi_id,
  };
}

function clientToDraft(client: Client | undefined): ClientDraft {
  if (!client) {
    return { name: '', email: '', phone: '', address: '', city: '', state: '', zip: '' };
  }
  return {
    name: client.company?.trim() || client.name || '',
    email: client.email || '',
    phone: client.phone || '',
    address: client.address || '',
    city: client.city || '',
    state: client.state || '',
    zip: client.zip || '',
  };
}

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? ' *' : ''}
      </Label>
      {children}
    </div>
  );
}

export function InvoiceBuilder({
  clients,
  defaultClientId,
  lockClient = false,
  initial,
  onSubmit,
  loading,
}: {
  clients: Client[];
  defaultClientId?: number;
  /** When true, client cannot be changed (e.g. creating from client detail). */
  lockClient?: boolean;
  /** When set, builder opens in edit mode with the full invoice preview. */
  initial?: Invoice | null;
  onSubmit: (data: Parameters<typeof api.invoices.create>[0]) => void;
  loading?: boolean;
}) {
  const toast = useToast();
  const isEdit = !!initial;
  const today = new Date().toISOString().split('T')[0];
  const due = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
  const cachedProfile = getUserProfile();

  const [clientId, setClientId] = useState(
    initial?.client_id ?? defaultClientId ?? clients[0]?.id ?? 0
  );
  const [invoiceLabel, setInvoiceLabel] = useState(initial?.invoice_number ?? '…');
  const [issueDate, setIssueDate] = useState(initial?.issue_date ?? today);
  const [dueDate, setDueDate] = useState(initial?.due_date ?? due);
  const [currency, setCurrency] = useState(
    resolveCurrency(initial?.currency || cachedProfile.default_currency)
  );
  const [taxRate, setTaxRate] = useState(String(initial?.tax_rate ?? 0));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saveCompany, setSaveCompany] = useState(true);
  const [company, setCompany] = useState<CompanyDraft>(() => profileToCompany(cachedProfile));
  const [selectedBankIndex, setSelectedBankIndex] = useState(() =>
    Math.max(0, Number(initial?.bank_account_index ?? 0) || 0)
  );
  const selectedBankIndexRef = useRef(selectedBankIndex);
  selectedBankIndexRef.current = selectedBankIndex;
  const paymentAccountRef = useRef<BankAccount | null>(
    parsePaymentAccount(initial?.payment_account) ?? null
  );
  const [clientDraft, setClientDraft] = useState<ClientDraft>(() =>
    clientToDraft(
      clients.find((c) => c.id === (initial?.client_id ?? defaultClientId ?? clients[0]?.id))
    )
  );
  const [clientLoading, setClientLoading] = useState(false);
  const [numberLoading, setNumberLoading] = useState(!isEdit);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(isEdit);
  const [clientServices, setClientServices] = useState<Service[]>([]);
  const [items, setItems] = useState<LineItem[]>(() =>
    initial ? linesFromInvoice(initial) : [emptyLine()]
  );
  const { data: catalogProducts = [], isLoading: productsLoading } = useQuery({
    queryKey: ['products', 'invoice-catalog'],
    queryFn: () => api.products.list(),
  });
  const [profileCurrency, setProfileCurrency] = useState(
    resolveCurrency(cachedProfile.default_currency)
  );
  const profileCurrencyRef = useRef(profileCurrency);
  profileCurrencyRef.current = profileCurrency;

  // Edit mode: always reload the saved draft so we never mix in other service data.
  useEffect(() => {
    if (!initial?.id) {
      setDraftLoading(false);
      return;
    }

    let cancelled = false;
    setDraftLoading(true);
    api.invoices
      .get(initial.id)
      .then((invoice) => {
        if (cancelled) return;
        setInvoiceLabel(invoice.invoice_number);
        setIssueDate(invoice.issue_date);
        setDueDate(invoice.due_date);
        setCurrency(resolveCurrency(invoice.currency));
        setTaxRate(String(invoice.tax_rate ?? 0));
        setNotes(invoice.notes ?? '');
        setItems(linesFromInvoice(invoice));
        setClientId(invoice.client_id);
        const idx = Math.max(0, Number(invoice.bank_account_index ?? 0) || 0);
        setSelectedBankIndex(idx);
        const snap = parsePaymentAccount(invoice.payment_account);
        paymentAccountRef.current = snap;
        if (snap) {
          setCompany((prev) => {
            const accounts = [...(prev.bank_accounts ?? [])];
            while (accounts.length <= idx) {
              accounts.push({
                label:
                  accounts.length === 0
                    ? 'Primary'
                    : accounts.length === 1
                      ? 'Personal'
                      : `Account ${accounts.length + 1}`,
                bank_name: '',
                bank_account: '',
                bank_ifsc: '',
                bank_account_name: '',
                upi_id: '',
              });
            }
            accounts[idx] = { ...accounts[idx], ...snap };
            return applyBankSelection({ ...prev, bank_accounts: accounts }, idx);
          });
        } else {
          setCompany((prev) => applyBankSelection(prev, idx));
        }
      })
      .catch(() => {
        /* keep initial snapshot */
      })
      .finally(() => {
        if (!cancelled) setDraftLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initial?.id]);

  useEffect(() => {
    let cancelled = false;

    function applyProfile(profile: UserProfile) {
      setUserProfile(profile);
      const fromProfile = profileToCompany(profile);
      const idx = selectedBankIndexRef.current;
      const snap = paymentAccountRef.current;
      if (snap && isEdit) {
        const accounts = [...fromProfile.bank_accounts];
        while (accounts.length <= idx) {
          accounts.push({
            label:
              accounts.length === 0
                ? 'Primary'
                : accounts.length === 1
                  ? 'Personal'
                  : `Account ${accounts.length + 1}`,
            bank_name: '',
            bank_account: '',
            bank_ifsc: '',
            bank_account_name: '',
            upi_id: '',
          });
        }
        accounts[idx] = { ...accounts[idx], ...snap };
        setCompany(applyBankSelection({ ...fromProfile, bank_accounts: accounts }, idx));
      } else {
        const safeIdx = Math.min(idx, Math.max(0, fromProfile.bank_accounts.length - 1));
        if (safeIdx !== idx) setSelectedBankIndex(safeIdx);
        setCompany(applyBankSelection(fromProfile, safeIdx));
      }
      setProfileCurrency(resolveCurrency(profile.default_currency || getDefaultCurrency()));
    }

    if (isEdit) {
      setNumberLoading(false);
      api.profile
        .get()
        .then((profile) => {
          if (cancelled) return;
          applyProfile(profile);
        })
        .catch(() => {
          /* keep cached */
        });
      return () => {
        cancelled = true;
      };
    }

    setNumberLoading(true);
    Promise.all([api.profile.get().catch(() => null), api.invoices.nextNumber().catch(() => null)])
      .then(([profile, next]) => {
        if (cancelled) return;
        if (profile) {
          applyProfile(profile);
          const cur = resolveCurrency(profile.default_currency || getDefaultCurrency());
          setCurrency((prev) =>
            prev === resolveCurrency(cachedProfile.default_currency) ? cur : prev
          );
        }
        if (next?.invoice_number) {
          setInvoiceLabel(next.invoice_number);
        } else {
          setInvoiceLabel('INV-001');
        }
      })
      .finally(() => {
        if (!cancelled) setNumberLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cachedProfile.default_currency, isEdit]);

  function applyClientServices(services: Service[]) {
    setClientServices(services);
    const billable = billableServicesForInvoice(services);
    setItems(linesFromServices(services));
    setCurrency(pickCurrency(services, profileCurrencyRef.current));
    if (billable.length === 1) {
      setNotes(
        `Note: Invoice for ${billable[0].name}. Late payment fee of 10% per annum may apply after the due date.`
      );
    } else if (billable.length > 1) {
      setNotes(
        `Note: Invoice covers ${billable.length} services for this client. Late payment fee of 10% per annum may apply after the due date.`
      );
    }
  }

  // Create: auto-fill from client services. Edit: only load Bill To — keep draft line items as saved.
  useEffect(() => {
    if (!clientId) {
      setClientDraft(clientToDraft(undefined));
      setClientServices([]);
      if (!isEdit) setItems([emptyLine()]);
      return;
    }

    const fromList = clients.find((c) => c.id === clientId);
    if (fromList) {
      setClientDraft(clientToDraft(fromList));
    }

    let cancelled = false;
    setClientLoading(true);
    setServicesLoading(true);

    Promise.all([
      api.clients.get(clientId).catch(() => fromList ?? null),
      api.services.list({ client_id: clientId }).catch(() => [] as Service[]),
    ])
      .then(([fresh, services]) => {
        if (cancelled) return;
        const client = fresh ?? fromList;
        if (client) setClientDraft(clientToDraft(client));
        setClientServices(services);
      })
      .finally(() => {
        if (!cancelled) {
          setClientLoading(false);
          setServicesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, isEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewItems = useMemo(
    () =>
      items.map((item) => ({
        description: item.description,
        quantity: parseFloat(item.quantity) || 0,
        rate: parseFloat(item.rate) || 0,
        line_date: item.line_date || issueDate,
        service_id: item.service_id ?? null,
      })),
    [items, issueDate]
  );

  const parsedItems = useMemo(
    () =>
      previewItems
        .map((item) => ({
          ...item,
          description: item.description.trim(),
        }))
        .filter((item) => item.description || item.rate > 0),
    [previewItems]
  );

  const billableCount = billableServicesForInvoice(clientServices).length;

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function refillFromServices() {
    applyClientServices(clientServices);
    toast.success(
      billableCount
        ? `Loaded ${billableCount} service${billableCount === 1 ? '' : 's'} into the invoice`
        : 'No billable services found for this client'
    );
  }

  function applyProductToLine(index: number, product: Product) {
    setItems((prev) =>
      prev.map((item, i) =>
        i !== index
          ? item
          : {
              description: productLineDescription(product),
              quantity: '1',
              rate: String(product.unit_price),
              line_date: item.line_date || issueDate,
              service_id: null,
            }
      )
    );
    setCurrency(resolveCurrency(product.currency));
  }

  function handleLineDescriptionChange(index: number, text: string) {
    updateItem(index, { description: text });
    const match = matchProductByTypedName(catalogProducts, text);
    if (match) applyProductToLine(index, match);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) {
      toast.error('Select a client');
      return;
    }
    const lineItems = parsedItems.filter((item) => item.description && item.rate >= 0);
    if (!lineItems.length) {
      toast.error('Add at least one line item with a description');
      return;
    }

    if (saveCompany) {
      try {
        const updated = await api.profile.update({
          company_name: company.company_name || null,
          email: company.email || undefined,
          phone: company.phone || null,
          address: company.address || null,
          city: company.city || null,
          state: company.state || null,
          zip: company.zip || null,
          tax_id: company.tax_id || null,
          logo_data: company.logo_data || null,
          website: company.website || null,
          payment_method: company.payment_method || null,
          bank_accounts: company.bank_accounts,
          default_currency: currency,
        });
        setUserProfile(updated);
      } catch {
        /* still create invoice even if profile save fails */
      }
    }

    const accounts = company.bank_accounts ?? [];
    const safeIdx = Math.min(
      selectedBankIndex,
      Math.max(0, accounts.length - 1)
    );
    const paymentAccount =
      normalizeBankAccount(accounts[safeIdx]) ??
      normalizeBankAccount({
        label: bankAccountOptionLabel(
          {
            label: '',
            bank_name: company.bank_name,
            bank_account: company.bank_account,
            bank_ifsc: company.bank_ifsc,
            bank_account_name: company.bank_account_name,
            upi_id: company.upi_id,
          },
          safeIdx
        ),
        bank_name: company.bank_name,
        bank_account: company.bank_account,
        bank_ifsc: company.bank_ifsc,
        bank_account_name: company.bank_account_name,
        upi_id: company.upi_id,
      });

    onSubmit({
      client_id: clientId,
      invoice_number: invoiceLabel.trim().replace(/^#/, '') || undefined,
      issue_date: issueDate,
      due_date: dueDate,
      tax_rate: parseFloat(taxRate) || 0,
      currency: currency || getDefaultCurrency(),
      notes: notes.trim() || undefined,
      bank_account_index: safeIdx,
      payment_account: paymentAccount,
      items: lineItems.map(({ description, quantity, rate, service_id, line_date }) => ({
        description,
        quantity,
        rate,
        service_id: service_id ?? null,
        line_date: line_date || issueDate,
      })),
    });
  }

  function selectBankAccount(index: number) {
    setSelectedBankIndex(index);
    paymentAccountRef.current = null;
    setCompany((c) => applyBankSelection(c, index));
  }

  const previewCompany = useMemo(() => {
    const accounts = company.bank_accounts ?? [];
    if (!accounts.length) {
      return {
        ...company,
        bank_accounts: resolveBankAccounts(company),
      };
    }
    const safeIdx = Math.min(selectedBankIndex, accounts.length - 1);
    const selected = accounts[safeIdx];
    return {
      ...company,
      bank_account: selected.bank_account,
      bank_name: selected.bank_name,
      bank_ifsc: selected.bank_ifsc,
      bank_account_name: selected.bank_account_name,
      upi_id: selected.upi_id,
      bank_accounts: [selected],
    };
  }, [company, selectedBankIndex]);

  async function onLogoChange(file: File | null) {
    if (!file) {
      setCompany((c) => ({ ...c, logo_data: '' }));
      return;
    }
    try {
      const logo_data = await resizeLogo(file);
      setCompany((c) => ({ ...c, logo_data }));
    } catch {
      toast.error('Could not read that image. Try a PNG or JPG.');
    }
  }

  const inputClass = 'h-9';

  return (
    <form onSubmit={handleSubmit} className="space-y-5 px-1 sm:px-2">
      <div className="grid gap-6 xl:grid-cols-2 xl:gap-8">
        <div className="space-y-5 xl:pr-2">
          <section className="rounded-xl border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold">Invoice Details</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Invoice Number">
                <Input
                  className={inputClass}
                  value={numberLoading ? 'Loading…' : invoiceLabel}
                  onChange={(e) => setInvoiceLabel(e.target.value)}
                  placeholder="INV-001"
                  disabled={numberLoading}
                />
                <p className="text-[11px] text-muted-foreground">
                  {isEdit
                    ? 'Existing invoice number — change only if needed.'
                    : numberLoading
                      ? 'Loading next number…'
                      : 'Auto-assigned in sequence — edit only if you need a custom number.'}
                </p>
              </Field>
              <Field label="Currency">
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {CURRENCY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Invoice Date">
                <Input
                  className={inputClass}
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </Field>
              <Field label="Due Date">
                <Input
                  className={inputClass}
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </Field>
              <Field label="Tax %" className="sm:col-span-2">
                <Input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.01"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                />
              </Field>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-xl border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold">Company Details</h3>
              <div className="space-y-3">
                <Field label="Company Logo">
                  <Input
                    type="file"
                    accept="image/*"
                    className="h-9 cursor-pointer pt-1.5 text-xs"
                    onChange={(e) => onLogoChange(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Optional. Shown in the top-right of the invoice when uploaded.
                  </p>
                </Field>
                <Field label="Company Name">
                  <Input
                    className={inputClass}
                    value={company.company_name}
                    onChange={(e) => setCompany({ ...company, company_name: e.target.value })}
                    placeholder="Your Company Name"
                  />
                </Field>
                <Field label="Email">
                  <Input
                    className={inputClass}
                    type="email"
                    value={company.email}
                    onChange={(e) => setCompany({ ...company, email: e.target.value })}
                  />
                </Field>
                <Field label="Address">
                  <Input
                    className={inputClass}
                    value={company.address}
                    onChange={(e) => setCompany({ ...company, address: e.target.value })}
                  />
                </Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="City">
                    <Input
                      className={inputClass}
                      value={company.city}
                      onChange={(e) => setCompany({ ...company, city: e.target.value })}
                    />
                  </Field>
                  <Field label="State">
                    <Input
                      className={inputClass}
                      value={company.state}
                      onChange={(e) => setCompany({ ...company, state: e.target.value })}
                    />
                  </Field>
                  <Field label="ZIP">
                    <Input
                      className={inputClass}
                      value={company.zip}
                      onChange={(e) => setCompany({ ...company, zip: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Phone">
                  <Input
                    className={inputClass}
                    value={company.phone}
                    onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                  />
                </Field>
                <Field label="Website">
                  <Input
                    className={inputClass}
                    value={company.website}
                    onChange={(e) => setCompany({ ...company, website: e.target.value })}
                    placeholder="www.example.com"
                  />
                </Field>
                <Field label="Tax ID">
                  <Input
                    className={inputClass}
                    value={company.tax_id}
                    onChange={(e) => setCompany({ ...company, tax_id: e.target.value })}
                  />
                </Field>
                <Field label="Payment Method">
                  <Input
                    className={inputClass}
                    value={company.payment_method}
                    onChange={(e) => setCompany({ ...company, payment_method: e.target.value })}
                    placeholder="EFT Bank Transfer / Cash / UPI"
                  />
                </Field>
                <div className="border-t pt-3">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">
                    Payment Info (on invoice)
                  </p>
                  {(company.bank_accounts?.length ?? 0) > 0 && (
                    <Field label="Bank account for this invoice" className="mb-3">
                      <div className="flex flex-wrap gap-2">
                        {company.bank_accounts.map((account, index) => {
                          const active = index === selectedBankIndex;
                          const label = bankAccountOptionLabel(account, index);
                          return (
                            <button
                              key={index}
                              type="button"
                              onClick={() => selectBankAccount(index)}
                              className={cn(
                                'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                                active
                                  ? 'border-primary bg-primary/5 font-medium text-foreground'
                                  : 'hover:bg-muted/40 text-muted-foreground'
                              )}
                            >
                              <span className="block">{label}</span>
                              {(account.bank_name || account.bank_account) && (
                                <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                                  {[account.bank_name, account.bank_account]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        Choose Primary, Personal, or another saved account — only the selected
                        one appears on this invoice.
                      </p>
                    </Field>
                  )}
                  <div className="space-y-3">
                    <Field label="Account Number">
                      <Input
                        className={inputClass}
                        value={company.bank_account}
                        onChange={(e) =>
                          setCompany(
                            withSelectedBank(company, selectedBankIndex, {
                              bank_account: e.target.value,
                            })
                          )
                        }
                      />
                    </Field>
                    <Field label="Account Name">
                      <Input
                        className={inputClass}
                        value={company.bank_account_name}
                        onChange={(e) =>
                          setCompany(
                            withSelectedBank(company, selectedBankIndex, { bank_account_name: e.target.value })
                          )
                        }
                      />
                    </Field>
                    <Field label="IFSC / Bank Code">
                      <Input
                        className={inputClass}
                        value={company.bank_ifsc}
                        onChange={(e) =>
                          setCompany(withSelectedBank(company, selectedBankIndex, { bank_ifsc: e.target.value }))
                        }
                      />
                    </Field>
                    <Field label="Bank Name">
                      <Input
                        className={inputClass}
                        value={company.bank_name}
                        onChange={(e) =>
                          setCompany(withSelectedBank(company, selectedBankIndex, { bank_name: e.target.value }))
                        }
                      />
                    </Field>
                    <Field label="UPI ID">
                      <Input
                        className={inputClass}
                        value={company.upi_id}
                        onChange={(e) =>
                          setCompany(withSelectedBank(company, selectedBankIndex, { upi_id: e.target.value }))
                        }
                        placeholder="name@bank"
                      />
                    </Field>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={saveCompany}
                    onChange={(e) => setSaveCompany(e.target.checked)}
                    className="rounded border-input"
                  />
                  Save company details to workspace profile
                </label>
              </div>
            </section>

            <section className="rounded-xl border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold">Client Details</h3>
              <div className="space-y-3">
                <Field label="Select Client" required>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={clientId}
                    onChange={(e) => setClientId(Number(e.target.value))}
                    required
                    disabled={lockClient || isEdit}
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.company ? ` — ${c.company}` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    {isEdit
                      ? 'Bill To from this invoice’s client — line items stay as saved on the draft.'
                      : clientLoading || servicesLoading
                        ? 'Loading client & services…'
                        : billableCount > 0
                          ? `Auto-filled ${billableCount} service${billableCount === 1 ? '' : 's'} — edit anything you need.`
                          : 'Bill To fills from the client. Add services with an amount to auto-fill line items.'}
                  </p>
                </Field>
                <Field label="Client Name" required>
                  <Input
                    className={inputClass}
                    value={clientDraft.name}
                    onChange={(e) => setClientDraft({ ...clientDraft, name: e.target.value })}
                  />
                </Field>
                <Field label="Email">
                  <Input
                    className={inputClass}
                    value={clientDraft.email}
                    onChange={(e) => setClientDraft({ ...clientDraft, email: e.target.value })}
                  />
                </Field>
                <Field label="Address">
                  <Input
                    className={inputClass}
                    value={clientDraft.address}
                    onChange={(e) => setClientDraft({ ...clientDraft, address: e.target.value })}
                  />
                </Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="City">
                    <Input
                      className={inputClass}
                      value={clientDraft.city}
                      onChange={(e) => setClientDraft({ ...clientDraft, city: e.target.value })}
                    />
                  </Field>
                  <Field label="State">
                    <Input
                      className={inputClass}
                      value={clientDraft.state}
                      onChange={(e) => setClientDraft({ ...clientDraft, state: e.target.value })}
                    />
                  </Field>
                  <Field label="ZIP">
                    <Input
                      className={inputClass}
                      value={clientDraft.zip}
                      onChange={(e) => setClientDraft({ ...clientDraft, zip: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Phone">
                  <Input
                    className={inputClass}
                    value={clientDraft.phone}
                    onChange={(e) => setClientDraft({ ...clientDraft, phone: e.target.value })}
                  />
                </Field>
              </div>
            </section>
          </div>

          <section className="rounded-xl border bg-card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Line Items</h3>
                <p className="text-[11px] text-muted-foreground">
                  {isEdit
                    ? draftLoading
                      ? 'Loading saved draft…'
                      : 'Showing this invoice’s saved line items only.'
                    : productsLoading
                      ? 'Loading product catalog…'
                      : catalogProducts.length
                        ? 'Type a product name in Description for suggestions and pricing.'
                        : 'Enter line items manually, or add products under Products.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!isEdit && billableCount > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!clientId || servicesLoading}
                    onClick={refillFromServices}
                    className="gap-1"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    From client services
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setItems((prev) => [...prev, emptyLine(issueDate)])}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add item
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              <div className="hidden gap-2 px-0.5 text-[11px] font-medium text-muted-foreground sm:grid sm:grid-cols-[2.25rem_8.5rem_1fr_4.5rem_6.5rem_2.25rem]">
                <span className="text-center">S.No</span>
                <span>Date</span>
                <span>Description</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Rate</span>
                <span aria-hidden />
              </div>
              {items.map((item, index) => (
                <div
                  key={index}
                  className="grid gap-2 sm:grid-cols-[2.25rem_8.5rem_1fr_4.5rem_6.5rem_2.25rem] sm:items-center"
                >
                  <span
                    className="flex h-9 items-center justify-center text-sm tabular-nums text-muted-foreground"
                    aria-hidden
                  >
                    {index + 1}
                  </span>
                  <Input
                    className={inputClass}
                    type="date"
                    value={item.line_date || issueDate}
                    onChange={(e) => updateItem(index, { line_date: e.target.value })}
                  />
                  {catalogProducts.length > 0 ? (
                    <ProductLineDescriptionInput
                      value={item.description}
                      products={catalogProducts}
                      placeholder="Type product name…"
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-none"
                      inputClassName="border-none hover:border-none focus:border-none font-normal"
                      onValueChange={(text) => handleLineDescriptionChange(index, text)}
                      onProductPick={(product) => applyProductToLine(index, product)}
                    />
                  ) : (
                    <Input
                      className={inputClass}
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateItem(index, { description: e.target.value })}
                      required={index === 0}
                    />
                  )}
                  <Input
                    className={inputClass}
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, { quantity: e.target.value })}
                  />
                  <Input
                    className={inputClass}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Rate"
                    value={item.rate}
                    onChange={(e) => updateItem(index, { rate: e.target.value })}
                    required={index === 0}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 shrink-0"
                    disabled={items.length === 1}
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                    aria-label="Remove item"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
            <Field label="Note (shown in box on invoice)" className="mt-4">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Late payment note…"
              />
            </Field>
          </section>
        </div>

        <div className="xl:pl-2">
        <InvoiceDocumentPreview
          invoiceLabel={invoiceLabel}
          issueDate={issueDate}
          dueDate={dueDate}
          currency={currency}
          company={previewCompany}
          client={clientDraft}
          items={previewItems}
          taxRate={parseFloat(taxRate) || 0}
          notes={notes}
          paymentMethod={company.payment_method}
          subtitle={
            isEdit
              ? 'Editing saved draft only — other client services are not added'
              : 'Auto-filled from client & services — edit anything · QR after save'
          }
          editable
          catalogProducts={catalogProducts}
          onProductPick={(index, product) => applyProductToLine(index, product)}
          onInvoiceLabelChange={setInvoiceLabel}
          onIssueDateChange={setIssueDate}
          onDueDateChange={setDueDate}
          onTaxRateChange={(value) => setTaxRate(String(value))}
          onNotesChange={setNotes}
          onCompanyChange={(patch) =>
            setCompany((c) => withSelectedBank(c, selectedBankIndex, patch))
          }
          onClientChange={(patch) => setClientDraft((c) => ({ ...c, ...patch }))}
          onItemChange={(index, patch) => {
            if (patch.description !== undefined) {
              handleLineDescriptionChange(index, patch.description);
              if (
                patch.quantity !== undefined ||
                patch.rate !== undefined ||
                patch.line_date !== undefined
              ) {
                setItems((prev) =>
                  prev.map((item, i) => {
                    if (i !== index) return item;
                    return {
                      ...item,
                      quantity:
                        patch.quantity !== undefined ? String(patch.quantity) : item.quantity,
                      rate: patch.rate !== undefined ? String(patch.rate) : item.rate,
                      line_date:
                        patch.line_date !== undefined
                          ? patch.line_date || issueDate
                          : item.line_date,
                    };
                  })
                );
              }
              return;
            }
            setItems((prev) =>
              prev.map((item, i) => {
                if (i !== index) return item;
                return {
                  ...item,
                  quantity:
                    patch.quantity !== undefined ? String(patch.quantity) : item.quantity,
                  rate: patch.rate !== undefined ? String(patch.rate) : item.rate,
                  line_date:
                    patch.line_date !== undefined ? patch.line_date || issueDate : item.line_date,
                };
              })
            );
          }}
          onAddItem={() => setItems((prev) => [...prev, emptyLine(issueDate)])}
          onRemoveItem={(index) =>
            setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
          }
        />
        </div>
      </div>

      <Button
        type="submit"
        disabled={loading || draftLoading || !clients.length}
        className="w-full sm:w-auto"
      >
        {loading
          ? isEdit
            ? 'Saving…'
            : 'Creating…'
          : draftLoading
            ? 'Loading draft…'
            : isEdit
              ? 'Save changes'
              : 'Create Invoice'}
      </Button>
    </form>
  );
}
