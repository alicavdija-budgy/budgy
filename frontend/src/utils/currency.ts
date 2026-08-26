/**
 * BUDGY - Currency conversion + formatting
 * Reactive to preferences.currency. All amounts stored in CHF base,
 * converted on display via the useMoney() hook.
 *
 * Static FX rates (mid-market, refreshable later via API).
 *
 * The `label` field on SUPPORTED_CURRENCIES is a translation key
 * (`currencies.<code>`) resolved by the UI via useTranslation.
 */

export type Currency = 'CHF' | 'EUR' | 'USD';

// Rates: 1 CHF = X target_currency
export const FX_RATES: Record<Currency, number> = {
  CHF: 1.0,
  EUR: 1.05,    // 1 CHF ≈ 1.05 EUR (Nov 2025 ~)
  USD: 1.13,    // 1 CHF ≈ 1.13 USD
};

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  CHF: 'CHF',
  EUR: '€',
  USD: '$',
};

export const CURRENCY_FLAG: Record<Currency, string> = {
  CHF: '🇨🇭',
  EUR: '🇪🇺',
  USD: '🇺🇸',
};

export const SUPPORTED_CURRENCIES: { code: Currency; flag: string; label: string; symbol: string }[] = [
  { code: 'CHF', flag: '🇨🇭', label: 'currencies.CHF', symbol: 'CHF' },
  { code: 'EUR', flag: '🇪🇺', label: 'currencies.EUR', symbol: '€' },
  { code: 'USD', flag: '🇺🇸', label: 'currencies.USD', symbol: '$' },
];

/** Convert from CHF base to target currency */
export function convertFromCHF(amount: number, target: Currency): number {
  const rate = FX_RATES[target] ?? 1;
  return amount * rate;
}

/** Convert any source currency to CHF (for storage) */
export function convertToCHF(amount: number, source: Currency): number {
  const rate = FX_RATES[source] ?? 1;
  return amount / rate;
}

/** Format amount in the target currency with symbol */
export function formatMoney(
  amount: number = 0,
  currency: Currency = 'CHF',
  options: { decimals?: number; compact?: boolean; symbolFirst?: boolean } = {}
): string {
  const { decimals = 0, compact = false, symbolFirst = false } = options;
  const converted = convertFromCHF(amount, currency);
  const symbol = CURRENCY_SYMBOL[currency];

  let formatted: string;
  if (compact && Math.abs(converted) >= 1000) {
    if (Math.abs(converted) >= 1_000_000) {
      formatted = (converted / 1_000_000).toFixed(1) + 'M';
    } else {
      formatted = (converted / 1000).toFixed(1) + 'k';
    }
  } else {
    formatted = converted.toLocaleString('fr-CH', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  if (symbolFirst) return `${symbol} ${formatted}`;
  // For CHF Swiss style: "CHF 1'250" ; for EUR/USD: "1 250 €"
  if (currency === 'CHF') return `CHF ${formatted}`;
  return `${formatted} ${symbol}`;
}
