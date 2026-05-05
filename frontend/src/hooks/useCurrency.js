import { useSelector } from 'react-redux';

/**
 * Returns currency helpers based on the authenticated user's outlet/chain currency.
 * Falls back to INR for backward compatibility.
 */
export function useCurrency() {
  const { user } = useSelector(s => s.auth);
  const currency = user?.currency || user?.outlet?.currency || 'INR';
  const isAU = currency === 'AUD';

  const symbol = isAU ? 'A$' : '₹';
  const locale = isAU ? 'en-AU' : 'en-IN';

  const format = (amount) => {
    const num = Number(amount || 0);
    if (isAU) {
      return `A$${num.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  };

  const formatShort = (amount) => {
    const num = Number(amount || 0);
    if (isAU) {
      if (num >= 1000000) return `A$${(num / 1000000).toFixed(1)}M`;
      if (num >= 1000) return `A$${(num / 1000).toFixed(1)}k`;
      return `A$${num.toFixed(2)}`;
    }
    if (num >= 10000000) return `₹${(num / 10000000).toFixed(1)}Cr`;
    if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
    if (num >= 1000) return `₹${(num / 1000).toFixed(1)}k`;
    return `₹${Math.round(num).toLocaleString('en-IN')}`;
  };

  return { symbol, locale, format, formatShort, currency, isAU };
}

// Standalone utility (for use outside React components — e.g. in helpers called from JSX)
export function formatCurrencyStatic(amount, currency = 'INR') {
  const num = Number(amount || 0);
  if (currency === 'AUD') {
    return `A$${num.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}
