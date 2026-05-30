/**
 * Currency / locale utilities for PetPooja mobile.
 *
 * The user's region is resolved from the API login response:
 *   user.head_office.region  →  'AU' | 'IN'
 *   user.outlet.currency     →  'AUD' | 'INR'
 *   user.outlet.country      →  'Australia' | 'India'
 *
 * All components should call useCurrency() (hook) rather than
 * instantiating getCurrencyConfig() directly.
 */

/**
 * Derives currency config from the user object returned by AuthContext.
 * Safe to call outside React (e.g. in printer.js, exportReport.js).
 */
export function getCurrencyConfig(user) {
  const currency =
    user?.outlet?.currency ||
    user?.head_office?.currency ||
    'INR';

  const region =
    user?.head_office?.region ||
    (currency === 'AUD' ? 'AU' : null) ||
    (user?.outlet?.country === 'Australia' ? 'AU' : null) ||
    'IN';

  if (region === 'AU' || currency === 'AUD') {
    return {
      symbol: '$',
      currency: 'AUD',
      locale: 'en-AU',
      region: 'AU',
      dateLocale: 'en-AU',
    };
  }

  return {
    symbol: '₹',
    currency: 'INR',
    locale: 'en-IN',
    region: 'IN',
    dateLocale: 'en-IN',
  };
}

/**
 * Compact format: $1.2k, $24.5k, $1.2M  (or ₹ equivalents).
 * Accepts the user object so it can be used outside hooks.
 */
export function fmtCompact(value, user) {
  const { symbol } = getCurrencyConfig(user);
  const n = parseFloat(value);
  if (!n || isNaN(n)) return `${symbol}0`;
  if (n >= 1_000_000) return `${symbol}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 100_000)   return `${symbol}${(n / 1_000).toFixed(0)}k`;
  if (n >= 1_000)     return `${symbol}${(n / 1_000).toFixed(1)}k`;
  return `${symbol}${Math.round(n)}`;
}

/**
 * Full format with locale-aware separators: $1,24,500 / $1,240.50
 */
export function fmtFull(value, user) {
  const { symbol, locale } = getCurrencyConfig(user);
  const n = parseFloat(value);
  if (!n || isNaN(n)) return `${symbol}0`;
  return `${symbol}${n.toLocaleString(locale)}`;
}

/**
 * Short — no symbol, just locale-formatted number.
 */
export function fmtNumber(value, user) {
  const { locale } = getCurrencyConfig(user);
  const n = parseFloat(value);
  if (!n || isNaN(n)) return '0';
  return n.toLocaleString(locale);
}

/**
 * Format a date string / Date object using the outlet's locale.
 */
export function fmtDate(value, user, options = {}) {
  const { dateLocale } = getCurrencyConfig(user);
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '—';
  const defaultOpts = { day: 'numeric', month: 'short', year: 'numeric' };
  return d.toLocaleDateString(dateLocale, { ...defaultOpts, ...options });
}
