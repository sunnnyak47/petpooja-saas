/**
 * useCurrency — React hook that returns currency formatting helpers
 * bound to the logged-in user's outlet region (AU or IN).
 *
 * Usage:
 *   const { symbol, locale, region, fmt, fmtFull, fmtDate, isAU } = useCurrency();
 */
import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getCurrencyConfig,
  fmtCompact,
  fmtFull as _fmtFull,
  fmtDate as _fmtDate,
  fmtNumber,
} from '../utils/currency';

export function useCurrency() {
  const { user } = useAuth();
  const config = getCurrencyConfig(user);

  const fmt = useCallback((v) => fmtCompact(v, user), [user]);
  const fmtFull = useCallback((v) => _fmtFull(v, user), [user]);
  const fmtDate = useCallback((v, opts) => _fmtDate(v, user, opts), [user]);
  const fmtNum = useCallback((v) => fmtNumber(v, user), [user]);

  return {
    ...config,
    isAU: config.region === 'AU',
    isIN: config.region === 'IN',
    fmt,       // compact: $1.2k / ₹1.2k
    fmtFull,   // full:    $1,240 / ₹1,240
    fmtDate,   // date formatted to outlet locale
    fmtNum,    // number only, no symbol
  };
}
