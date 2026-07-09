/**
 * useCurrency — React hook that returns currency formatting helpers bound to the
 * SELECTED OUTLET's region (AU or IN). Currency must follow the outlet, not the
 * logged-in user: an owner's user row often carries no single outlet, so an AU
 * outlet would otherwise wrongly render ₹ instead of $.
 *
 * Usage:
 *   const { symbol, locale, region, fmt, fmtFull, fmtDate, isAU } = useCurrency();
 */
import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOutlet } from '../context/OutletContext';
import {
  getCurrencyConfigForOutlet,
  fmtCompact,
  fmtFull as _fmtFull,
  fmtDate as _fmtDate,
  fmtNumber,
} from '../utils/currency';

export function useCurrency() {
  const { user } = useAuth();
  const { currentOutlet } = useOutlet();
  const config = getCurrencyConfigForOutlet(currentOutlet, user);

  // Pass the RESOLVED config (not user) so all formatting follows the outlet.
  const fmt = useCallback((v) => fmtCompact(v, config), [config]);
  const fmtFull = useCallback((v) => _fmtFull(v, config), [config]);
  const fmtDate = useCallback((v, opts) => _fmtDate(v, config, opts), [config]);
  const fmtNum = useCallback((v) => fmtNumber(v, config), [config]);

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
