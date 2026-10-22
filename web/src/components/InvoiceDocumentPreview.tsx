import { useEffect, useState } from 'react';
import { Download, Eye, Loader2, Plus, Trash2 } from 'lucide-react';
import QRCode from 'qrcode';
import { api, type Client, type Invoice, type Product, type UserProfile } from '@/lib/api';
import { ProductLineDescriptionInput } from '@/components/ProductLineDescriptionInput';
import { stripCatalogSerialPrefix } from '@/lib/product-catalog';
import { getUserProfile, setUserProfile } from '@/lib/auth';
import { resolveBankAccounts, pickInvoicePaymentAccounts, type BankAccount } from '@/lib/bank-accounts';
import { resolveCurrency } from '@/lib/services';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type CompanyInfo = {
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

export type ClientInfo = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
};

export type PreviewLineItem = {
  description: string;
  quantity: number;
  rate: number;
};

export function profileToCompany(profile: UserProfile): CompanyInfo {
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

export function clientToInfo(client: Client | null | undefined, fallbackName?: string | null): ClientInfo {
  if (!client) {
    return {
      name: fallbackName || '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zip: '',
    };
  }
  return {
    name: client.company?.trim() || client.name || fallbackName || '',
    email: client.email || '',
    phone: client.phone || '',
    address: client.address || '',
    city: client.city || '',
    state: client.state || '',
    zip: client.zip || '',
  };
}

function GhostInput({
  className,
  readOnly,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      readOnly={readOnly}
      className={cn(
        'w-full min-w-0 bg-transparent px-0 py-0.5 text-inherit outline-none',
        'border-0 border-b border-transparent rounded-none shadow-none',
        !readOnly && 'hover:border-neutral-200 focus:border-neutral-400',
        readOnly && 'cursor-default',
        className
      )}
    />
  );
}

function GhostTextarea({
  className,
  readOnly,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      readOnly={readOnly}
      className={cn(
        'w-full min-w-0 resize-none bg-transparent px-0 py-0.5 text-inherit outline-none',
        'border-0 border-b border-transparent rounded-none shadow-none',
        !readOnly && 'hover:border-neutral-200 focus:border-neutral-400',
        readOnly && 'cursor-default',
        className
      )}
    />
  );
}

export type InvoicePreviewHandlers = {
  onInvoiceLabelChange?: (value: string) => void;
  onIssueDateChange?: (value: string) => void;
  onDueDateChange?: (value: string) => void;
  onTaxRateChange?: (value: number) => void;
  onNotesChange?: (value: string) => void;
  onCompanyChange?: (patch: Partial<CompanyInfo>) => void;
  onClientChange?: (patch: Partial<ClientInfo>) => void;
  onItemChange?: (index: number, patch: Partial<PreviewLineItem>) => void;
  onAddItem?: () => void;
  onRemoveItem?: (index: number) => void;
  onProductPick?: (index: number, product: Product) => void;
};

/** Clorio-style invoice preview — editable when handlers are provided. */
export function InvoiceDocumentPreview({
  invoiceLabel,
  issueDate,
  dueDate,
  currency,
  company,
  client,
  items,
  taxRate,
  notes,
  paymentMethod,
  subtitle = 'Preview how your invoice will look.',
  qrDataUrl,
  editable = false,
  catalogProducts = [],
  ...handlers
}: {
  invoiceLabel: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  company: CompanyInfo;
  client: ClientInfo;
  items: PreviewLineItem[];
  taxRate: number;
  notes?: string | null;
  paymentMethod?: string;
  subtitle?: string;
  qrDataUrl?: string | null;
  editable?: boolean;
  catalogProducts?: Product[];
} & InvoicePreviewHandlers) {
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.rate, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  const money = (n: number) => formatCurrency(n, currency);
  const method = paymentMethod || company.payment_method || 'EFT Bank Transfer';
  const bankAccounts =
    company.bank_accounts?.length > 0
      ? company.bank_accounts
      : resolveBankAccounts(company);
  const displayItems = items.length ? items : [{ description: '', quantity: 1, rate: 0 }];
  const canEdit = editable;
  const ro = !canEdit;

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-100 p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-500">
        <Eye className="h-4 w-4" />
        {canEdit ? 'Editable Invoice' : 'Invoice Preview'}
        <span className="font-normal">· {subtitle}</span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[680px] bg-white px-10 py-10 text-[13px] leading-relaxed text-neutral-900 sm:px-12 sm:py-12">
          {/* Header — logo only, no name brand */}
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <h1 className="text-[40px] font-bold leading-none tracking-tight">Invoice</h1>
              <div className="mt-2 flex items-center gap-1 text-sm font-medium text-neutral-500">
                <span>#</span>
                <GhostInput
                  readOnly={ro}
                  value={invoiceLabel.replace(/^#/, '')}
                  onChange={(e) => handlers.onInvoiceLabelChange?.(e.target.value)}
                  placeholder="Invoice number"
                  className="text-sm font-medium text-neutral-500"
                />
              </div>
            </div>
            {company.logo_data ? (
              <img
                src={company.logo_data}
                alt=""
                className="h-10 max-w-[160px] object-contain grayscale"
              />
            ) : null}
          </div>

          <div className="mt-7 border-t border-neutral-200" />

          {/* Dates */}
          <div className="mt-7 flex justify-end">
            <div className="flex shrink-0 gap-8 text-right">
              <div>
                <p className="text-[11px] text-neutral-400">Issued Date</p>
                {canEdit ? (
                  <GhostInput
                    type="date"
                    value={issueDate}
                    onChange={(e) => handlers.onIssueDateChange?.(e.target.value)}
                    className="mt-1 text-right font-semibold"
                  />
                ) : (
                  <p className="mt-1 font-semibold">{formatDate(issueDate)}</p>
                )}
              </div>
              <div>
                <p className="text-[11px] text-neutral-400">Due Date</p>
                {canEdit ? (
                  <GhostInput
                    type="date"
                    value={dueDate}
                    onChange={(e) => handlers.onDueDateChange?.(e.target.value)}
                    className="mt-1 text-right font-semibold"
                  />
                ) : (
                  <p className="mt-1 font-semibold">{formatDate(dueDate)}</p>
                )}
              </div>
            </div>
          </div>

          {/* From / To */}
          <div className="mt-9 grid grid-cols-2 gap-10">
            <div>
              <p className="text-[11px] text-neutral-400">From</p>
              <GhostInput
                readOnly={ro}
                value={company.company_name}
                onChange={(e) => handlers.onCompanyChange?.({ company_name: e.target.value })}
                placeholder="Your company"
                className="mt-2 font-semibold"
              />
              <div className="mt-1 space-y-0.5 text-[12px] text-neutral-600">
                <GhostInput
                  readOnly={ro}
                  value={company.address}
                  onChange={(e) => handlers.onCompanyChange?.({ address: e.target.value })}
                  placeholder="Address"
                  className="text-[12px] text-neutral-600"
                />
                <div className="flex gap-1">
                  <GhostInput
                    readOnly={ro}
                    value={company.city}
                    onChange={(e) => handlers.onCompanyChange?.({ city: e.target.value })}
                    placeholder="City"
                    className="text-[12px] text-neutral-600"
                  />
                  <GhostInput
                    readOnly={ro}
                    value={company.state}
                    onChange={(e) => handlers.onCompanyChange?.({ state: e.target.value })}
                    placeholder="State"
                    className="text-[12px] text-neutral-600"
                  />
                  <GhostInput
                    readOnly={ro}
                    value={company.zip}
                    onChange={(e) => handlers.onCompanyChange?.({ zip: e.target.value })}
                    placeholder="ZIP"
                    className="w-20 text-[12px] text-neutral-600"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="shrink-0">ABN</span>
                  <GhostInput
                    readOnly={ro}
                    value={company.tax_id}
                    onChange={(e) => handlers.onCompanyChange?.({ tax_id: e.target.value })}
                    placeholder="Tax ID"
                    className="text-[12px] text-neutral-600"
                  />
                </div>
                <GhostInput
                  readOnly={ro}
                  value={company.email}
                  onChange={(e) => handlers.onCompanyChange?.({ email: e.target.value })}
                  placeholder="Email"
                  className="text-[12px] text-neutral-600"
                />
                <GhostInput
                  readOnly={ro}
                  value={company.phone}
                  onChange={(e) => handlers.onCompanyChange?.({ phone: e.target.value })}
                  placeholder="Phone"
                  className="text-[12px] text-neutral-600"
                />
                <GhostInput
                  readOnly={ro}
                  value={company.website}
                  onChange={(e) => handlers.onCompanyChange?.({ website: e.target.value })}
                  placeholder="Website"
                  className="text-[12px] text-neutral-600"
                />
              </div>
            </div>
            <div>
              <p className="text-[11px] text-neutral-400">To</p>
              <GhostInput
                readOnly={ro}
                value={client.name}
                onChange={(e) => handlers.onClientChange?.({ name: e.target.value })}
                placeholder="Client name"
                className="mt-2 font-semibold"
              />
              <div className="mt-1 space-y-0.5 text-[12px] text-neutral-600">
                <GhostInput
                  readOnly={ro}
                  value={client.address}
                  onChange={(e) => handlers.onClientChange?.({ address: e.target.value })}
                  placeholder="Address"
                  className="text-[12px] text-neutral-600"
                />
                <div className="flex gap-1">
                  <GhostInput
                    readOnly={ro}
                    value={client.city}
                    onChange={(e) => handlers.onClientChange?.({ city: e.target.value })}
                    placeholder="City"
                    className="text-[12px] text-neutral-600"
                  />
                  <GhostInput
                    readOnly={ro}
                    value={client.state}
                    onChange={(e) => handlers.onClientChange?.({ state: e.target.value })}
                    placeholder="State"
                    className="text-[12px] text-neutral-600"
                  />
                  <GhostInput
                    readOnly={ro}
                    value={client.zip}
                    onChange={(e) => handlers.onClientChange?.({ zip: e.target.value })}
                    placeholder="ZIP"
                    className="w-20 text-[12px] text-neutral-600"
                  />
                </div>
                <GhostInput
                  readOnly={ro}
                  value={client.email}
                  onChange={(e) => handlers.onClientChange?.({ email: e.target.value })}
                  placeholder="Email"
                  className="text-[12px] text-neutral-600"
                />
                <GhostInput
                  readOnly={ro}
                  value={client.phone}
                  onChange={(e) => handlers.onClientChange?.({ phone: e.target.value })}
                  placeholder="Phone"
                  className="text-[12px] text-neutral-600"
                />
              </div>
            </div>
          </div>

          {/* Items table */}
          <div className="mt-10 overflow-hidden rounded-lg border border-neutral-200">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className={canEdit ? 'w-[34%]' : 'w-[38%]'} />
                <col className="w-[11%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                {canEdit ? <col className="w-[7%]" /> : null}
              </colgroup>
              <thead>
                <tr className="bg-neutral-100 text-[11px] font-medium text-neutral-500">
                  <th className="px-4 py-3 text-left font-medium">Description</th>
                  <th className="px-3 py-3 text-right font-medium">Units</th>
                  <th className="px-3 py-3 text-right font-medium">Price</th>
                  <th className="px-3 py-3 text-right font-medium">GST</th>
                  <th className="px-3 py-3 text-right font-medium">Amount</th>
                  {canEdit ? <th className="px-2 py-3" aria-hidden /> : null}
                </tr>
              </thead>
              <tbody>
                {displayItems.map((item, index) => {
                  const line = item.quantity * item.rate;
                  const lineTax = line * (taxRate / 100);
                  const descriptionDisplay = stripCatalogSerialPrefix(item.description);
                  return (
                    <tr key={index} className="border-t border-neutral-200">
                      <td className="px-4 py-2.5 align-middle">
                        {canEdit && catalogProducts.length > 0 ? (
                          <ProductLineDescriptionInput
                            value={item.description}
                            products={catalogProducts}
                            placeholder="Type product name…"
                            inputClassName="font-medium"
                            onValueChange={(text) =>
                              handlers.onItemChange?.(index, { description: text })
                            }
                            onProductPick={(product) => handlers.onProductPick?.(index, product)}
                          />
                        ) : ro ? (
                          <span className="font-medium">{descriptionDisplay || '—'}</span>
                        ) : (
                          <GhostInput
                            readOnly={ro}
                            value={item.description}
                            onChange={(e) =>
                              handlers.onItemChange?.(index, { description: e.target.value })
                            }
                            placeholder="Description"
                            className="font-medium"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <GhostInput
                          readOnly={ro}
                          type="number"
                          min="0"
                          step="1"
                          value={item.quantity || ''}
                          onChange={(e) =>
                            handlers.onItemChange?.(index, {
                              quantity: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-full text-right tabular-nums text-neutral-600"
                        />
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <GhostInput
                          readOnly={ro}
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.rate || ''}
                          onChange={(e) =>
                            handlers.onItemChange?.(index, {
                              rate: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-full text-right tabular-nums text-neutral-600"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right align-middle tabular-nums text-neutral-600">
                        {money(lineTax)}
                      </td>
                      <td className="px-3 py-2.5 text-right align-middle tabular-nums font-medium">
                        {money(line)}
                      </td>
                      {canEdit ? (
                        <td className="px-2 py-2.5 align-middle">
                          <button
                            type="button"
                            className="flex h-7 w-7 items-center justify-center text-neutral-400 hover:text-red-600"
                            disabled={displayItems.length <= 1}
                            onClick={() => handlers.onRemoveItem?.(index)}
                            aria-label="Remove item"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
              {canEdit ? (
                <tfoot>
                  <tr className="border-t border-neutral-200">
                    <td colSpan={6} className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => handlers.onAddItem?.()}
                        className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-900"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add line item
                      </button>
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
            <div className="flex items-center justify-between border-t border-neutral-300 bg-white px-4 py-4">
              <div className="flex items-center gap-2 text-base font-bold">
                <span>Total Amount</span>
                {canEdit ? (
                  <span className="text-xs font-normal text-neutral-400">
                    (Tax{' '}
                    <GhostInput
                      type="number"
                      min="0"
                      step="0.01"
                      value={taxRate}
                      onChange={(e) =>
                        handlers.onTaxRateChange?.(parseFloat(e.target.value) || 0)
                      }
                      className="inline-block w-12 text-center text-xs font-normal text-neutral-600"
                    />
                    %)
                  </span>
                ) : null}
              </div>
              <span className="text-base font-bold tabular-nums">{money(total)}</span>
            </div>
          </div>

          {/* Note box — only show default placeholder while editing; never force text onto saved/print views */}
          {(canEdit || notes?.trim()) && (
            <div className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
              <GhostTextarea
                readOnly={ro}
                value={notes ?? ''}
                onChange={(e) => handlers.onNotesChange?.(e.target.value)}
                rows={2}
                placeholder="Optional note (leave blank to hide on the invoice)"
                className="text-[12px] text-neutral-600"
              />
            </div>
          )}

          {/* Payment + QR */}
          <div className="mt-10 grid grid-cols-[1.2fr_auto] gap-10">
            <div>
              <p className="text-sm font-bold">Payment Method</p>
              <div className="mt-2 space-y-4 text-[12px] text-neutral-600">
                <GhostInput
                  readOnly={ro}
                  value={method}
                  onChange={(e) =>
                    handlers.onCompanyChange?.({ payment_method: e.target.value })
                  }
                  placeholder="Payment method"
                  className="text-[12px] text-neutral-600"
                />
                {(bankAccounts.length
                  ? bankAccounts
                  : [
                      {
                        label: '',
                        bank_name: company.bank_name,
                        bank_account: company.bank_account,
                        bank_ifsc: company.bank_ifsc,
                        bank_account_name: company.bank_account_name || company.company_name,
                        upi_id: company.upi_id,
                      },
                    ]
                ).map((account, index) => {
                  const isPrimary = index === 0;
                  const label =
                    account.label || (bankAccounts.length > 1 ? `Account ${index + 1}` : '');
                  return (
                    <div key={index} className="space-y-0.5">
                      {label ? (
                        <p className="font-semibold text-neutral-800">{label}</p>
                      ) : null}
                      <div className="flex items-center gap-1">
                        <span className="shrink-0">Account Name:</span>
                        <GhostInput
                          readOnly={ro || !isPrimary}
                          value={account.bank_account_name || company.company_name}
                          onChange={(e) =>
                            handlers.onCompanyChange?.({ bank_account_name: e.target.value })
                          }
                          className="text-[12px] text-neutral-600"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="shrink-0">Code:</span>
                        <GhostInput
                          readOnly={ro || !isPrimary}
                          value={account.bank_ifsc}
                          onChange={(e) =>
                            handlers.onCompanyChange?.({ bank_ifsc: e.target.value })
                          }
                          placeholder="IFSC / code"
                          className="text-[12px] text-neutral-600"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="shrink-0">Account Number:</span>
                        <GhostInput
                          readOnly={ro || !isPrimary}
                          value={account.bank_account}
                          onChange={(e) =>
                            handlers.onCompanyChange?.({ bank_account: e.target.value })
                          }
                          placeholder="Account number"
                          className="text-[12px] text-neutral-600"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="shrink-0">Bank:</span>
                        <GhostInput
                          readOnly={ro || !isPrimary}
                          value={account.bank_name}
                          onChange={(e) =>
                            handlers.onCompanyChange?.({ bank_name: e.target.value })
                          }
                          placeholder="Bank name"
                          className="text-[12px] text-neutral-600"
                        />
                      </div>
                      {account.upi_id ? (
                        <p>UPI: {account.upi_id}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col items-end justify-end">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Scan to view and download invoice"
                  className="h-20 w-20 border border-neutral-300"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center border border-dashed border-neutral-300 text-center text-[10px] text-neutral-400">
                  QR after save
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InvoicePreviewDialog({
  invoice,
  open,
  onOpenChange,
  onEdit,
  onPdf,
  pdfLoading,
}: {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
  onPdf?: () => void;
  pdfLoading?: boolean;
}) {
  const [company, setCompany] = useState<CompanyInfo>(() => profileToCompany(getUserProfile()));
  const [client, setClient] = useState<ClientInfo>(() =>
    clientToInfo(null, invoice?.client_name)
  );
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !invoice) return;

    let cancelled = false;
    setLoading(true);
    setQrDataUrl(null);
    setClient(clientToInfo(null, invoice.client_name));

    Promise.all([
      api.profile.get().catch(() => getUserProfile()),
      invoice.client_id ? api.clients.get(invoice.client_id).catch(() => null) : Promise.resolve(null),
      api.invoices.share(invoice.id).catch(() => null),
    ])
      .then(async ([profile, clientRow, share]) => {
        if (cancelled) return;
        setUserProfile(profile);
        const base = profileToCompany(profile);
        const selected = pickInvoicePaymentAccounts(invoice, profile);
        setCompany({
          ...base,
          bank_accounts: selected.length ? selected : base.bank_accounts,
          bank_account: selected[0]?.bank_account || base.bank_account,
          bank_name: selected[0]?.bank_name || base.bank_name,
          bank_ifsc: selected[0]?.bank_ifsc || base.bank_ifsc,
          bank_account_name: selected[0]?.bank_account_name || base.bank_account_name,
          upi_id: selected[0]?.upi_id || base.upi_id,
        });
        setClient(clientToInfo(clientRow, invoice.client_name));
        if (share?.url) {
          try {
            const dataUrl = await QRCode.toDataURL(share.url, {
              width: 200,
              margin: 1,
              color: { dark: '#111111', light: '#ffffff' },
            });
            if (!cancelled) setQrDataUrl(dataUrl);
          } catch {
            if (!cancelled) setQrDataUrl(null);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, invoice]);

  if (!invoice) return null;

  const items = (invoice.items ?? []).map((item) => ({
    description: stripCatalogSerialPrefix(item.description),
    quantity: item.quantity,
    rate: item.rate,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Preview · {invoice.invoice_number}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading preview…
          </div>
        ) : (
          <InvoiceDocumentPreview
            invoiceLabel={invoice.invoice_number}
            issueDate={invoice.issue_date}
            dueDate={invoice.due_date}
            currency={resolveCurrency(invoice.currency)}
            company={company}
            client={client}
            items={items}
            taxRate={invoice.tax_rate ?? 0}
            notes={invoice.notes}
            subtitle="Scan the QR to view & download"
            qrDataUrl={qrDataUrl}
            editable={false}
          />
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {onEdit && (
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onEdit();
              }}
            >
              Edit
            </Button>
          )}
          {onPdf && (
            <Button variant="outline" className="gap-1" onClick={onPdf} disabled={pdfLoading}>
              {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download PDF
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
