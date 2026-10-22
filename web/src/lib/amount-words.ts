/** Convert a money amount into English words for invoice "In Words" lines. */
const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const CURRENCY_WORDS: Record<string, { major: string; minor: string }> = {
  USD: { major: 'Dollars', minor: 'Cents' },
  AED: { major: 'Dirhams', minor: 'Fils' },
  EUR: { major: 'Euros', minor: 'Cents' },
  GBP: { major: 'Pounds', minor: 'Pence' },
  INR: { major: 'Rupees', minor: 'Paise' },
  SAR: { major: 'Riyals', minor: 'Halalas' },
};

function underThousand(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return `${TENS[t]}${o ? ` ${ONES[o]}` : ''}`.trim();
  }
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return `${ONES[h]} Hundred${rest ? ` ${underThousand(rest)}` : ''}`.trim();
}

function indianIntegerToWords(n: number): string {
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;

  if (crore) parts.push(`${integerToWords(crore, true)} Crore`);
  if (lakh) parts.push(`${underThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${underThousand(thousand)} Thousand`);
  if (rest) parts.push(underThousand(rest));
  return parts.join(' ').trim();
}

function integerToWords(n: number, indian = false): string {
  if (n === 0) return 'Zero';
  if (n < 1000) return underThousand(n);
  if (indian) return indianIntegerToWords(n);

  const parts: string[] = [];
  const billion = Math.floor(n / 1_000_000_000);
  const million = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousand = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;

  if (billion) parts.push(`${underThousand(billion)} Billion`);
  if (million) parts.push(`${underThousand(million)} Million`);
  if (thousand) parts.push(`${underThousand(thousand)} Thousand`);
  if (rest) parts.push(underThousand(rest));
  return parts.join(' ').trim();
}

export function amountInWords(amount: number, currency = 'USD'): string {
  const code = (currency || 'USD').toUpperCase();
  const words = CURRENCY_WORDS[code] ?? { major: code, minor: 'Cents' };
  const safe = Number.isFinite(amount) ? Math.abs(amount) : 0;
  const major = Math.floor(safe);
  const minor = Math.round((safe - major) * 100);

  let text = `${integerToWords(major, code === 'INR')} ${words.major}`;
  if (minor > 0) {
    text += ` and ${integerToWords(minor)} ${words.minor}`;
  }
  return `${text} Only`;
}

export function currencySymbol(currency = 'USD'): string {
  const code = (currency || 'USD').toUpperCase();
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? code;
  } catch {
    return code;
  }
}
