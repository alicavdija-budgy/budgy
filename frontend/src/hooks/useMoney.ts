/**
 * BUDGY - useMoney hook
 * Reactive currency formatter that uses preferences.currency.
 *
 * Usage:
 *   const m = useMoney();
 *   <Text>{m.format(1250)}</Text>          // CHF 1'250 / 1 312 € / $1413
 *   <Text>{m.compact(2_500_000)}</Text>    // CHF 2.5M / 2.6M €
 *   <Text>{m.symbol}</Text>                 // CHF / € / $
 *   <Text>{m.code}</Text>                   // CHF / EUR / USD
 */

import { useCallback } from 'react';
import { useStore } from '../stores/useStore';
import { formatMoney, convertFromCHF, convertToCHF, CURRENCY_SYMBOL, type Currency } from '../utils/currency';

export function useMoney() {
  const currency = useStore((s) => s.preferences.currency) as Currency;
  const code: Currency = ['CHF', 'EUR', 'USD'].includes(currency) ? currency : 'CHF';

  const format = useCallback(
    (amount: number = 0, decimals: number = 0) => formatMoney(amount, code, { decimals }),
    [code]
  );

  const compact = useCallback(
    (amount: number = 0) => formatMoney(amount, code, { compact: true }),
    [code]
  );

  const convert = useCallback((amount: number) => convertFromCHF(amount, code), [code]);
  const toCHF = useCallback((amount: number) => convertToCHF(amount, code), [code]);

  return {
    code,
    symbol: CURRENCY_SYMBOL[code],
    format,
    compact,
    convert,
    toCHF,
  };
}
