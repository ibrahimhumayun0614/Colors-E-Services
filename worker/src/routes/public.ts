import { Hono } from 'hono';
import QRCode from 'qrcode';
import type { Env, Invoice, InvoiceItem, UserProfile } from '../types';
import { paymentDetailsHtml, paymentMethodLabel } from '../lib/payment-html';
import { pickInvoicePaymentAccounts } from '../lib/bank-accounts';
import { verifyInvoiceShareToken } from '../lib/share';
import { DEFAULT_LOGO_DATA_URL } from '../lib/default-logo';
import { amountInWords } from '../lib/amount-words';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripCatalogSerialPrefix(description: string): string {
  const trimmed = description.trim();
  const without = trimmed.replace(/^\d+\s*[—–-]\s*/, '').trim();
  return without || trimmed;
}

function formatCurrency(amount: number, currency = 'USD'): string {
  const code = currency?.trim() || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(amount);
  } catch {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Print title, which browsers use as the saved PDF file name, e.g. "Colors Common Services - Invoice 2". */
function invoiceDocumentTitle(companyName: string, invoiceNumber: string): string {
  const digits = invoiceNumber.match(/\d+/)?.[0];
  return `${companyName} - Invoice ${digits ? Number(digits) : invoiceNumber.replace(/^#/, '')}`;
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

type PublicInvoice = Invoice & {
  client_name?: string;
  client_company?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  client_address?: string | null;
  client_city?: string | null;
  client_state?: string | null;
  client_zip?: string | null;
};

function renderInvoicePage(opts: {
  invoice: PublicInvoice;
  items: InvoiceItem[];
  from: UserProfile;
  qrDataUrl: string | null;
}): string {
  const { invoice, items, from, qrDataUrl } = opts;
  const currency = invoice.currency?.trim() || from.default_currency || 'USD';
  const companyName = from.company_name?.trim() || 'Your Company';
  const billName = invoice.client_company?.trim() || invoice.client_name || '—';
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.rate, 0);
  const taxRate = invoice.tax_rate ?? 0;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  const numberLabel = invoice.invoice_number.startsWith('#')
    ? invoice.invoice_number
    : `#${invoice.invoice_number}`;

  const fromAddress = addressHtml(from);
  const toAddress = addressHtml({
    address: invoice.client_address,
    city: invoice.client_city,
    state: invoice.client_state,
    zip: invoice.client_zip,
  });

  const fromDetails = [
    fromAddress ? `<p>${fromAddress}</p>` : '',
    from.tax_id ? `<p>ABN ${escapeHtml(from.tax_id)}</p>` : '',
    from.email ? `<p>${escapeHtml(from.email)}</p>` : '',
    from.phone ? `<p>${escapeHtml(from.phone)}</p>` : '',
  ].join('');

  const toDetails = [
    toAddress ? `<p>${toAddress}</p>` : '',
    invoice.client_email ? `<p>${escapeHtml(invoice.client_email)}</p>` : '',
    invoice.client_phone ? `<p>${escapeHtml(invoice.client_phone)}</p>` : '',
  ].join('');

  const paymentDetails = paymentDetailsHtml(
    {
      ...from,
      bank_accounts: pickInvoicePaymentAccounts(invoice, from),
    },
    companyName
  );

  const logoBlock = `<img class="logo" src="${escapeHtml(from.logo_data || DEFAULT_LOGO_DATA_URL)}" alt="" />`;

  const rows = items
    .map((item, index) => {
      const line = item.quantity * item.rate;
      const lineDate = formatDate(item.line_date?.trim() || invoice.issue_date);
      return `
        <tr>
          <td class="num sno">${index + 1}</td>
          <td class="line-date">${escapeHtml(lineDate)}</td>
          <td class="desc">${escapeHtml(stripCatalogSerialPrefix(item.description))}</td>
          <td class="num">${escapeHtml(item.quantity)}</td>
          <td class="num">${escapeHtml(formatCurrency(item.rate, currency))}</td>
          <td class="num amount">${escapeHtml(formatCurrency(line, currency))}</td>
        </tr>`;
    })
    .join('');

  const noteText = invoice.notes?.trim() || '';

  const qrBlock = qrDataUrl
    ? `<img class="qr" src="${escapeHtml(qrDataUrl)}" alt="Scan to view and download invoice" />`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(invoiceDocumentTitle(companyName, invoice.invoice_number))}</title>
  <style>
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#f5f5f5}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#000;font-size:13px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .toolbar{position:sticky;top:0;z-index:10;display:flex;justify-content:flex-end;padding:12px 16px;background:#171717}
    .btn{appearance:none;border:0;border-radius:6px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;background:#fff;color:#171717}
    .sheet{max-width:760px;margin:20px auto;background:#fff;padding:44px 40px}
    .head{display:flex;justify-content:space-between;align-items:center;gap:24px}
    .head-title{margin-left:auto;text-align:right}
    .title{font-size:40px;font-weight:700;margin:0;letter-spacing:-.03em;line-height:1}
    .inv-no{margin:10px 0 0;color:#000;font-size:14px;font-weight:600}
    .logo{max-height:96px;max-width:280px;object-fit:contain}
    .divider{border:0;border-top:1px solid #555;margin:24px 0 0}
    .meta{display:flex;justify-content:flex-end;gap:24px;margin-top:28px}
    .muted{color:#000;font-size:11px;margin:0 0 4px}
    .dates{display:flex;gap:40px;text-align:right}
    .dates strong{display:block;margin-top:2px;font-size:13px}
    .parties{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:36px}
    .parties .name{font-weight:700;margin:8px 0 4px;font-size:13px}
    .parties p{margin:1px 0;color:#000;font-size:12px}
    .parties .bill-to{text-align:right}
    table{width:100%;border-collapse:collapse;margin-top:36px;border:1px solid #555}
    thead th{background:#ececec;text-align:left;padding:12px 14px;font-size:11px;font-weight:700;color:#000;border-bottom:1px solid #555}
    th.num,td.num{text-align:right}
    th.sno,td.sno{text-align:center;width:32px}
    td.line-date{font-size:11px;white-space:nowrap}
    td{padding:14px;border-top:1px solid #8c8c8c;vertical-align:top}
    td.desc{font-weight:500}
    td.amount{font-weight:600}
    .total-row td{border-top:1px solid #555;font-size:15px;font-weight:700;padding:16px 14px}
    .words-row td{border-top:0;padding:0 14px 16px;font-size:12px;font-weight:600;color:#000}
    .words-row span{color:#000;font-weight:400}
    .note{margin-top:22px;padding:12px 14px;border:1px solid #555;border-radius:8px;background:#fafafa;color:#000;font-size:12px}
    .foot{display:grid;grid-template-columns:1.2fr auto;gap:40px;margin-top:36px;align-items:end}
    .pay h4{margin:0 0 8px;font-size:14px}
    .pay p{margin:1px 0;color:#000;font-size:12px}
    .pay .bank-detail{font-weight:700;color:#000}
    .sign{text-align:right}
    .qr{width:80px;height:80px;border:1px solid #555;display:block;margin:0 0 0 auto}
    @media (max-width:640px){.sheet{margin:12px;padding:28px 18px}.meta,.parties,.foot,.dates{display:block}.dates>div,.parties>div{margin-top:16px;text-align:left}}
    @media print{.toolbar{display:none}body{background:#fff}.sheet{margin:0;max-width:none}@page{size:A4;margin:10mm}}
    body.print-mode{background:#fff;font-size:12px;line-height:1.4}
    .print-mode .toolbar{display:none}
    .print-mode .sheet{width:190mm;max-width:none;margin:0;padding:0}
    .print-mode .title{font-size:30px}
    .print-mode .inv-no{margin-top:6px;font-size:13px}
    .print-mode .logo{max-height:80px;max-width:240px}
    .print-mode .divider{margin-top:12px}
    .print-mode .meta{display:flex;margin-top:12px}
    .print-mode .muted{font-size:10.5px;margin-bottom:2px}
    .print-mode .dates{display:flex;gap:36px}
    .print-mode .dates>div{margin-top:0;text-align:right}
    .print-mode .dates strong{margin-top:0;font-size:12px}
    .print-mode .parties{display:grid;gap:32px;margin-top:14px}
    .print-mode .parties>div{margin-top:0}
    .print-mode .parties .name{margin:4px 0 2px;font-size:12.5px}
    .print-mode .parties p{font-size:11.5px}
    .print-mode table{margin-top:16px}
    .print-mode thead th{padding:7px 10px;font-size:10.5px}
    .print-mode tr{break-inside:avoid}
    .print-mode td{padding:6px 10px}
    .print-mode .total-row td{font-size:14px;padding:9px 10px}
    .print-mode .words-row td{padding:0 10px 9px;font-size:11.5px}
    .print-mode .note{margin-top:12px;padding:8px 10px;font-size:11.5px}
    .print-mode .foot{display:grid;gap:24px;margin-top:16px}
    .print-mode .pay h4{margin-bottom:4px;font-size:13px}
    .print-mode .pay p{margin:0;font-size:11.5px}
    .print-mode .qr{width:72px;height:72px}
  </style>
  <script>
    (function () {
      var MAX_HEIGHT = (297 - 20) * 96 / 25.4 - 4;
      function sheet() { return document.querySelector('.sheet'); }
      window.addEventListener('beforeprint', function () {
        document.body.classList.add('print-mode');
        var s = sheet();
        if (!s) return;
        s.style.zoom = '';
        var h = s.scrollHeight;
        if (h > MAX_HEIGHT) s.style.zoom = String(MAX_HEIGHT / h);
      });
      window.addEventListener('afterprint', function () {
        document.body.classList.remove('print-mode');
        var s = sheet();
        if (s) s.style.zoom = '';
      });
    })();
  </script>
</head>
<body>
  <div class="toolbar">
    <button class="btn" onclick="window.print()">Download PDF</button>
  </div>
  <div class="sheet">
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
      <div class="bill-to">
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
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="6">No line items</td></tr>'}
        <tr class="total-row">
          <td colspan="5">Total Amount</td>
          <td class="num">${escapeHtml(formatCurrency(total, currency))}</td>
        </tr>
        <tr class="words-row">
          <td colspan="6"><span>Amount in words:</span> ${escapeHtml(amountInWords(total, currency))}</td>
        </tr>
      </tbody>
    </table>

    ${noteText ? `<div class="note">${escapeHtml(noteText)}</div>` : ''}

    <div class="foot">
      <div class="pay">
        <h4>Payment Method - ${escapeHtml(paymentMethodLabel(from))}</h4>
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

export const publicRoutes = new Hono<{ Bindings: Env }>();

publicRoutes.get('/invoices/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const token = c.req.query('t') ?? '';

  if (!Number.isFinite(id) || !token) {
    return c.html('<h1>Invalid invoice link</h1>', 400);
  }

  const secret = c.env.API_SECRET;
  if (!secret || !(await verifyInvoiceShareToken(secret, id, token))) {
    return c.html('<h1>This invoice link is invalid or has expired.</h1>', 403);
  }

  const invoice = await c.env.DB.prepare(
    `SELECT i.*, c.name as client_name, c.company as client_company,
            c.email as client_email, c.phone as client_phone,
            c.address as client_address, c.city as client_city,
            c.state as client_state, c.zip as client_zip
     FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.id = ?`
  )
    .bind(id)
    .first<PublicInvoice>();

  if (!invoice) return c.html('<h1>Invoice not found</h1>', 404);

  const { results: items } = await c.env.DB.prepare(
    'SELECT * FROM invoice_items WHERE invoice_id = ?'
  )
    .bind(id)
    .all<InvoiceItem>();

  const from =
    (await c.env.DB.prepare('SELECT * FROM user_profile WHERE id = 1').first<UserProfile>()) ?? {
      name: 'Client CRM',
      email: 'admin@crm.local',
      role: 'Admin',
      default_currency: 'USD',
    };

  let qrDataUrl: string | null = null;
  try {
    qrDataUrl = await QRCode.toDataURL(c.req.url, {
      width: 200,
      margin: 1,
      color: { dark: '#111111', light: '#ffffff' },
    });
  } catch {
    qrDataUrl = null;
  }

  return c.html(renderInvoicePage({ invoice, items, from, qrDataUrl }));
});
