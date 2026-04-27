export const COMMON_CURRENCIES: readonly string[] = [
  'EUR',
  'USD',
  'GBP',
  'CHF',
  'CZK',
  'PLN',
  'HUF',
  'JPY',
  'CNY',
  'THB',
  'VND',
  'INR',
  'AUD',
  'CAD',
  'NZD',
  'MXN',
  'BRL',
  'ZAR',
  'TRY',
  'AED',
];

const SYMBOL_TO_CODE: Record<string, string> = {
  '€': 'EUR',
  $: 'USD',
  'US$': 'USD',
  '£': 'GBP',
  '¥': 'JPY',
  '₹': 'INR',
  '฿': 'THB',
  '₫': 'VND',
  Kč: 'CZK',
  KČ: 'CZK',
  KC: 'CZK',
};

export function normalizeCurrencyCode(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (SYMBOL_TO_CODE[trimmed]) return SYMBOL_TO_CODE[trimmed];
  const upper = trimmed.toUpperCase();
  if (SYMBOL_TO_CODE[upper]) return SYMBOL_TO_CODE[upper];
  return upper.replace(/[^A-Z]/g, '').slice(0, 3);
}

export function suggestCurrencies(query: string, defaultCurrency?: string | null): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const push = (code: string) => {
    if (!code || seen.has(code)) return;
    seen.add(code);
    ordered.push(code);
  };

  const defaultCode = normalizeCurrencyCode(defaultCurrency);
  if (defaultCode) push(defaultCode);
  for (const code of COMMON_CURRENCIES) push(code);

  const needle = query.trim().toUpperCase();
  if (!needle) return ordered;
  return ordered.filter((code) => code.includes(needle));
}
