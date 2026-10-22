import QRCode from 'qrcode';
import { api, type Invoice } from '@/lib/api';
import { getUserProfile, setUserProfile } from '@/lib/auth';
import { pickInvoicePaymentAccounts } from '@/lib/bank-accounts';
import { stripCatalogSerialPrefix } from '@/lib/product-catalog';
import { formatCurrency, formatDate } from '@/lib/utils';
import { amountInWords } from '@/lib/amount-words';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function addressHtml(src: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string {
  const t = (v?: string | null) => v?.trim() || '';
  return [t(src.address), [t(src.city), t(src.state), t(src.zip)].filter(Boolean).join(', ')]
    .filter(Boolean)
    .map(escapeHtml)
    .join('<br />');
}

const PRINT_MARGIN_MM = 10;
const PRINT_WIDTH_MM = 210 - PRINT_MARGIN_MM * 2;
const PRINT_HEIGHT_MM = 297 - PRINT_MARGIN_MM * 2;
const PX_PER_MM = 96 / 25.4;

/** Scale the sheet down when it would spill onto a second A4 page. */
function fitToSinglePage(page: HTMLElement): void {
  page.style.zoom = '';
  const maxHeight = PRINT_HEIGHT_MM * PX_PER_MM - 4;
  const height = page.scrollHeight;
  if (height > maxHeight) page.style.zoom = String(maxHeight / height);
}

/** Print title, which browsers use as the saved PDF file name, e.g. "Colors Common Services - Invoice 2". */
function invoiceDocumentTitle(companyName: string, invoiceNumber: string): string {
  const digits = invoiceNumber.match(/\d+/)?.[0];
  return `${companyName} - Invoice ${digits ? Number(digits) : invoiceNumber.replace(/^#/, '')}`;
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

  const fromAddress = addressHtml(profile);
  const toAddress = addressHtml(client ?? {});

  const fromDetails = [
    fromAddress ? `<p>${fromAddress}</p>` : '',
    profile.tax_id ? `<p>ABN ${escapeHtml(profile.tax_id)}</p>` : '',
    profile.email ? `<p>${escapeHtml(profile.email)}</p>` : '',
    profile.phone ? `<p>${escapeHtml(profile.phone)}</p>` : '',
    profile.website ? `<p>${escapeHtml(profile.website)}</p>` : '',
  ].join('');

  const toDetails = [
    toAddress ? `<p>${toAddress}</p>` : '',
    client?.email ? `<p>${escapeHtml(client.email)}</p>` : '',
    client?.phone ? `<p>${escapeHtml(client.phone)}</p>` : '',
  ].join('');

  const paymentDetails = accounts.length
    ? accounts
        .map((account, index) => {
          const accountName = account.bank_account_name.trim() || companyName;
          return [
            `<div class="bank-account"${index > 0 ? ' style="margin-top:12px"' : ''}>`,
            `<p class="bank-detail">Account Name: ${escapeHtml(accountName)}</p>`,
            account.bank_ifsc
              ? `<p class="bank-detail">IFSC Code: ${escapeHtml(account.bank_ifsc)}</p>`
              : '',
            account.bank_account
              ? `<p class="bank-detail">Account Number: ${escapeHtml(account.bank_account)}</p>`
              : '',
            account.bank_name
              ? `<p class="bank-detail">Bank Name: ${escapeHtml(account.bank_name)}</p>`
              : '',
            account.upi_id ? `<p class="bank-detail">UPI ID: ${escapeHtml(account.upi_id)}</p>` : '',
            `</div>`,
          ].join('');
        })
        .join('')
    : '';

  const logoBlock = profile.logo_data
    ? `<img class="logo" src="${escapeHtml(profile.logo_data)}" alt="" />`
    : '';

  const rows = items
    .map((item, index) => {
      const line = item.quantity * item.rate;
      const lineTax = line * (taxRate / 100);
      const lineDate = formatDate(item.line_date?.trim() || invoice.issue_date);
      return `
        <tr>
          <td class="num sno">${index + 1}</td>
          <td class="line-date">${escapeHtml(lineDate)}</td>
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
  <title>${escapeHtml(invoiceDocumentTitle(companyName, invoice.invoice_number))}</title>
  <style>
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#000;font-size:12px;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page{width:${PRINT_WIDTH_MM}mm;margin:0;padding:0}
    .head{display:flex;justify-content:space-between;align-items:center;gap:24px}
    .head-title{margin-left:auto;text-align:right}
    .title{font-size:30px;font-weight:700;margin:0;letter-spacing:-.03em;line-height:1}
    .inv-no{margin:6px 0 0;color:#000;font-size:13px;font-weight:600}
    .logo{max-height:80px;max-width:240px;object-fit:contain}
    .divider{border:0;border-top:1px solid #555;margin:12px 0 0}
    .meta{display:flex;justify-content:flex-end;gap:24px;margin-top:12px}
    .muted{color:#000;font-size:10.5px;margin:0 0 2px}
    .dates{display:flex;gap:36px;text-align:right}
    .dates strong{display:block;font-size:12px}
    .parties{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:14px}
    .parties .name{font-weight:700;margin:4px 0 2px;font-size:12.5px}
    .parties p{margin:1px 0;color:#000;font-size:11.5px}
    table{width:100%;border-collapse:collapse;margin-top:16px;border:1px solid #555}
    thead th{background:#ececec;text-align:left;padding:7px 10px;font-size:10.5px;font-weight:700;color:#000;border-bottom:1px solid #555}
    th.num,td.num{text-align:right}
    th.sno,td.sno{text-align:center;width:32px}
    td.line-date{font-size:11px;white-space:nowrap}
    tr{break-inside:avoid}
    td{padding:6px 10px;border-top:1px solid #8c8c8c;vertical-align:top}
    td.desc{font-weight:500}
    td.amount{font-weight:600}
    .total-row td{border-top:1px solid #555;font-size:14px;font-weight:700;padding:9px 10px}
    .words-row td{border-top:0;padding:0 10px 9px;font-size:11.5px;font-weight:600;color:#000}
    .words-row span{color:#000;font-weight:400}
    .note{margin-top:12px;padding:8px 10px;border:1px solid #555;border-radius:6px;background:#fafafa;color:#000;font-size:11.5px}
    .foot{display:grid;grid-template-columns:1.2fr auto;gap:24px;margin-top:16px;align-items:end}
    .pay h4{margin:0 0 4px;font-size:13px}
    .pay p{margin:0;color:#000;font-size:11.5px}
    .pay .bank-detail{font-weight:700;color:#000}
    .sign{text-align:right}
    .qr{width:72px;height:72px;border:1px solid #555;display:block;margin:0 0 0 auto}
    @page{size:A4;margin:${PRINT_MARGIN_MM}mm}
  </style>
</head>
<body>
  <div class="page">
    <div class="head">
      ${logoBlock}
      <div class="head-title">
        <h1 class="title">Invoice</h1>
        <p class="inv-no">${escapeHtml(numberLabel)}</p>
      </div>
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
          <th class="sno">S.No</th>
          <th>Date</th>
          <th>Description</th>
          <th class="num">Units</th>
          <th class="num">Price</th>
          <th class="num">GST</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="7">No line items</td></tr>'}
        <tr class="total-row">
          <td colspan="6">Total Amount</td>
          <td class="num">${escapeHtml(formatCurrency(total, currency))}</td>
        </tr>
        <tr class="words-row">
          <td colspan="7"><span>Amount in words:</span> ${escapeHtml(amountInWords(total, currency))}</td>
        </tr>
      </tbody>
    </table>

    ${noteText ? `<div class="note">${escapeHtml(noteText)}</div>` : ''}

    <div class="foot">
      <div class="pay">
        <h4>Payment Method - ${escapeHtml(method)}</h4>
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
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = `${PRINT_WIDTH_MM}mm`;
  iframe.style.height = `${PRINT_HEIGHT_MM}mm`;
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

  const triggerPrint = async () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    await Promise.all(
      Array.from(win.document.images, (img) => img.decode().catch(() => undefined))
    );
    const page = win.document.querySelector<HTMLElement>('.page');
    if (page) fitToSinglePage(page);
    const appTitle = document.title;
    document.title = win.document.title;
    win.focus();
    win.print();
    document.title = appTitle;
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
  let fullInvoice = invoice;

  try {
    const [loaded, share, serverProfile, clientRow] = await Promise.all([
      api.invoices.get(invoice.id).catch(() => invoice),
      api.invoices.share(invoice.id),
      api.profile.get(),
      invoice.client_id ? api.clients.get(invoice.client_id) : Promise.resolve(null),
    ]);
    fullInvoice = loaded;
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

  printHtml(buildInvoiceHtml(fullInvoice, qrDataUrl, profile, client));
}
