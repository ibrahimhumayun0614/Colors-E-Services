import QRCode from 'qrcode';
import { api, type Invoice } from '@/lib/api';
import { getUserProfile, setUserProfile } from '@/lib/auth';
import { pickInvoicePaymentAccounts } from '@/lib/bank-accounts';
import { stripCatalogSerialPrefix } from '@/lib/product-catalog';
import { formatCurrency, formatDate } from '@/lib/utils';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function addressLine(src: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string {
  return [src.address, [src.city, src.state, src.zip].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(', ');
}

function buildInvoiceHtml(
  invoice: Invoice,
  qrDataUrl: string | null,
  profile = getUserProfile(),
  client?: {
    name?: string | null;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  } | null
): string {
  const currency = invoice.currency?.trim() || profile.default_currency || 'USD';
  const companyName = profile.company_name?.trim() || 'Your Company';
  const method = profile.payment_method?.trim() || 'EFT Bank Transfer';
  const billName = client?.company?.trim() || client?.name || invoice.client_name || '—';
  const accounts = pickInvoicePaymentAccounts(invoice, profile);

  const items = invoice.items ?? [];
  const subtotal = invoice.subtotal ?? items.reduce((sum, i) => sum + i.quantity * i.rate, 0);
  const taxRate = invoice.tax_rate ?? 0;
  const taxAmount = subtotal * (taxRate / 100);
  const total = invoice.total ?? subtotal + taxAmount;

  const numberLabel = invoice.invoice_number.startsWith('#')
    ? invoice.invoice_number
    : `#${invoice.invoice_number}`;

  const fromAddress = addressLine(profile);
  const toAddress = addressLine(client ?? {});

  const fromDetails = [
    fromAddress ? `<p>${escapeHtml(fromAddress)}</p>` : '',
    profile.tax_id ? `<p>ABN ${escapeHtml(profile.tax_id)}</p>` : '',
    profile.email ? `<p>${escapeHtml(profile.email)}</p>` : '',
    profile.phone ? `<p>${escapeHtml(profile.phone)}</p>` : '',
    profile.website ? `<p>${escapeHtml(profile.website)}</p>` : '',
  ].join('');

  const toDetails = [
    toAddress ? `<p>${escapeHtml(toAddress)}</p>` : '',
    client?.email ? `<p>${escapeHtml(client.email)}</p>` : '',
    client?.phone ? `<p>${escapeHtml(client.phone)}</p>` : '',
  ].join('');

  const paymentDetails = accounts.length
    ? accounts
        .map((account, index) => {
          const accountName = account.bank_account_name.trim() || companyName;
          const label =
            account.label.trim() || (accounts.length > 1 ? `Account ${index + 1}` : '');
          return [
            `<div class="bank-account"${index > 0 ? ' style="margin-top:12px"' : ''}>`,
            label ? `<p><strong>${escapeHtml(label)}</strong></p>` : '',
            index === 0 ? `<p>${escapeHtml(method)}</p>` : '',
            `<p>Account Name: ${escapeHtml(accountName)}</p>`,
            account.bank_ifsc ? `<p>Code: ${escapeHtml(account.bank_ifsc)}</p>` : '',
            account.bank_account
              ? `<p>Account Number: ${escapeHtml(account.bank_account)}</p>`
              : '',
            account.bank_name ? `<p>Bank: ${escapeHtml(account.bank_name)}</p>` : '',
            account.upi_id ? `<p>UPI: ${escapeHtml(account.upi_id)}</p>` : '',
            `</div>`,
          ].join('');
        })
        .join('')
    : `<p>${escapeHtml(method)}</p>`;

  const logoBlock = profile.logo_data
    ? `<img class="logo" src="${escapeHtml(profile.logo_data)}" alt="" />`
    : '';

  const rows = items
    .map((item) => {
      const line = item.quantity * item.rate;
      const lineTax = line * (taxRate / 100);
      return `
        <tr>
          <td class="desc">${escapeHtml(stripCatalogSerialPrefix(item.description))}</td>
          <td class="num">${escapeHtml(item.quantity)}</td>
          <td class="num">${escapeHtml(formatCurrency(item.rate, currency))}</td>
          <td class="num">${escapeHtml(formatCurrency(lineTax, currency))}</td>
          <td class="num amount">${escapeHtml(formatCurrency(line, currency))}</td>
        </tr>`;
    })
    .join('');

  const noteText = invoice.notes?.trim() || '';

  const qrBlock = qrDataUrl
    ? `<img class="qr" src="${qrDataUrl}" alt="Scan to view invoice" />`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(invoice.invoice_number)}</title>
  <style>
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171717;font-size:13px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page{max-width:760px;margin:0 auto;padding:44px 40px}
    .head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}
    .title{font-size:40px;font-weight:700;margin:0;letter-spacing:-.03em;line-height:1}
    .inv-no{margin:10px 0 0;color:#737373;font-size:14px;font-weight:500}
    .brand{font-size:26px;font-weight:700;letter-spacing:-.02em}
    .logo{max-height:40px;max-width:160px;object-fit:contain;filter:grayscale(1)}
    .divider{border:0;border-top:1px solid #e5e5e5;margin:28px 0 0}
    .meta{display:flex;justify-content:flex-end;gap:24px;margin-top:28px}
    .muted{color:#a3a3a3;font-size:11px;margin:0 0 4px}
    .dates{display:flex;gap:40px;text-align:right}
    .dates strong{display:block;margin-top:2px;font-size:13px}
    .parties{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:36px}
    .parties .name{font-weight:600;margin:8px 0 4px;font-size:13px}
    .parties p{margin:1px 0;color:#525252;font-size:12px}
    table{width:100%;border-collapse:collapse;margin-top:36px;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden}
    thead th{background:#f5f5f5;text-align:left;padding:12px 14px;font-size:11px;font-weight:500;color:#737373}
    th.num,td.num{text-align:right}
    td{padding:14px;border-top:1px solid #e5e5e5;vertical-align:top}
    td.desc{font-weight:500}
    td.amount{font-weight:500}
    .total-row td{border-top:1px solid #d4d4d4;font-size:15px;font-weight:700;padding:16px 14px}
    .note{margin-top:22px;padding:12px 14px;border:1px solid #e5e5e5;border-radius:8px;background:#fafafa;color:#525252;font-size:12px}
    .foot{display:grid;grid-template-columns:1.2fr auto;gap:40px;margin-top:36px;align-items:end}
    .pay h4{margin:0 0 8px;font-size:14px}
    .pay p{margin:1px 0;color:#525252;font-size:12px}
    .sign{text-align:right}
    .qr{width:80px;height:80px;border:1px solid #d4d4d4;display:block;margin:0 0 0 auto}
    @page{margin:12mm}
    @media print{.page{padding:0}}
  </style>
</head>
<body>
  <div class="page">
    <div class="head">
      <div>
        <h1 class="title">Invoice</h1>
        <p class="inv-no">${escapeHtml(numberLabel)}</p>
      </div>
      ${logoBlock}
    </div>
    <hr class="divider" />

    <div class="meta">
      <div class="dates">
        <div>
          <p class="muted">Issued Date</p>
          <strong>${escapeHtml(formatDate(invoice.issue_date))}</strong>
        </div>
        <div>
          <p class="muted">Due Date</p>
          <strong>${escapeHtml(formatDate(invoice.due_date))}</strong>
        </div>
      </div>
    </div>

    <div class="parties">
      <div>
        <p class="muted">From</p>
        <p class="name">${escapeHtml(companyName)}</p>
        ${fromDetails}
      </div>
      <div>
        <p class="muted">To</p>
        <p class="name">${escapeHtml(billName)}</p>
        ${toDetails}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th class="num">Units</th>
          <th class="num">Price</th>
          <th class="num">GST</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="5">No line items</td></tr>'}
        <tr class="total-row">
          <td colspan="4">Total Amount</td>
          <td class="num">${escapeHtml(formatCurrency(total, currency))}</td>
        </tr>
      </tbody>
    </table>

    ${noteText ? `<div class="note">${escapeHtml(noteText)}</div>` : ''}

    <div class="foot">
      <div class="pay">
        <h4>Payment Method</h4>
        ${paymentDetails}
      </div>
      <div class="sign">
        ${qrBlock}
      </div>
    </div>
  </div>
</body>
</html>`;
}

function printHtml(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 1000);
  };

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    cleanup();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const triggerPrint = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    win.focus();
    win.print();
    cleanup();
  };

  if (iframe.contentWindow?.document.readyState === 'complete') {
    setTimeout(triggerPrint, 50);
  } else {
    iframe.onload = () => setTimeout(triggerPrint, 50);
  }
}

export async function downloadInvoicePdf(invoice: Invoice): Promise<void> {
  let qrDataUrl: string | null = null;
  let profile = getUserProfile();
  let client: Awaited<ReturnType<typeof api.clients.get>> | null = null;

  try {
    const [share, serverProfile, clientRow] = await Promise.all([
      api.invoices.share(invoice.id),
      api.profile.get(),
      invoice.client_id ? api.clients.get(invoice.client_id) : Promise.resolve(null),
    ]);
    profile = serverProfile;
    setUserProfile(serverProfile);
    client = clientRow;
    qrDataUrl = await QRCode.toDataURL(share.url, {
      width: 200,
      margin: 1,
      color: { dark: '#111111', light: '#ffffff' },
    });
  } catch {
    try {
      const { url } = await api.invoices.share(invoice.id);
      qrDataUrl = await QRCode.toDataURL(url, {
        width: 200,
        margin: 1,
        color: { dark: '#111111', light: '#ffffff' },
      });
    } catch {
      qrDataUrl = null;
    }
    try {
      if (invoice.client_id) client = await api.clients.get(invoice.client_id);
    } catch {
      client = null;
    }
  }

  printHtml(buildInvoiceHtml(invoice, qrDataUrl, profile, client));
}
