/**
 * PaymentBreakdown — Dashboard widget showing today's payment method breakdown.
 * Displays Cash / Card / UPI / Other with amounts, percentages, and proportion bars.
 */
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useCurrency } from '../../hooks/useCurrency';
import { Banknote, CreditCard, Smartphone, MoreHorizontal, Wallet } from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayRange() {
  const from = new Date(); from.setHours(0, 0, 0, 0);
  const to   = new Date(); to.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

function formatPct(amount, total) {
  if (!total || !amount) return '0%';
  const pct = (amount / total) * 100;
  if (pct > 0 && pct < 1) return '< 1%';
  return `${Math.round(pct)}%`;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const METHODS = [
  {
    key:   'cash',
    label: 'Cash',
    Icon:  Banknote,
    color: '#10b981',
  },
  {
    key:   'card',
    label: 'Card',
    Icon:  CreditCard,
    color: '#3b82f6',
  },
  {
    key:   'upi',
    label: 'UPI',
    Icon:  Smartphone,
    color: '#8b5cf6',
  },
  {
    key:   'other',
    label: 'Other',
    Icon:  MoreHorizontal,
    color: '#94a3b8',
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
      {/* Icon placeholder */}
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: 'var(--bg-hover)',
        animation: 'pp-shimmer 1.4s ease-in-out infinite',
        flexShrink: 0,
      }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Label + pct row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{
            width: 64, height: 12, borderRadius: 4,
            background: 'var(--bg-hover)',
            animation: 'pp-shimmer 1.4s ease-in-out infinite',
          }} />
          <div style={{
            width: 40, height: 12, borderRadius: 4,
            background: 'var(--bg-hover)',
            animation: 'pp-shimmer 1.4s ease-in-out infinite',
          }} />
        </div>
        {/* Bar */}
        <div style={{
          height: 6, borderRadius: 3,
          background: 'var(--bg-hover)',
          animation: 'pp-shimmer 1.4s ease-in-out infinite',
        }} />
      </div>
    </div>
  );
}

function MethodRow({ method, amount, total, format }) {
  const { key, label, Icon, color } = method;
  const barWidth = total > 0 ? (amount / total) * 100 : 0;
  // ensure a visible nub when there is any value
  const barStyle = amount > 0
    ? { width: `max(${barWidth}%, 2px)` }
    : { width: 0 };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
      {/* Icon badge */}
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${color}1a`,   /* 10% opacity tint */
        flexShrink: 0,
      }}>
        <Icon size={16} strokeWidth={2} style={{ color }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Label row */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginBottom: 5,
        }}>
          <span style={{
            fontSize: 13, fontWeight: 500,
            color: 'var(--text-primary)',
          }}>
            {label}
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{
              fontSize: 13, fontWeight: 600,
              color: 'var(--text-primary)',
            }}>
              {format(amount)}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 500,
              color: 'var(--text-secondary)',
              minWidth: 34, textAlign: 'right',
            }}>
              {formatPct(amount, total)}
            </span>
          </div>
        </div>

        {/* Proportion bar */}
        <div style={{
          height: 6, borderRadius: 3,
          background: 'var(--bg-hover)',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', borderRadius: 3,
            background: color,
            transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            ...barStyle,
          }} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PaymentBreakdown({ outletId }) {
  const { format } = useCurrency();
  const { from, to } = todayRange();

  const { data, isLoading } = useQuery({
    queryKey: ['payment-breakdown', outletId],
    queryFn: () =>
      api
        .get(`/reports/payment-breakdown?outlet_id=${outletId}&from=${from}&to=${to}`)
        .then(r => r.data?.data || r.data),
    enabled: !!outletId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const cash  = Number(data?.cash  || 0);
  const card  = Number(data?.card  || 0);
  const upi   = Number(data?.upi   || 0);
  const other = Number(data?.other || 0);
  const total = cash + card + upi + other;
  const allZero = !isLoading && total === 0;

  const amounts = { cash, card, upi, other };

  return (
    <>
      {/* Shimmer keyframes — injected once per render; browser dedupes identical rules */}
      <style>{`
        @keyframes pp-shimmer {
          0%   { opacity: 1; }
          50%  { opacity: 0.4; }
          100% { opacity: 1; }
        }
      `}</style>

      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '18px 20px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}>
        {/* ── Header ── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wallet size={16} strokeWidth={2} style={{ color: 'var(--accent)' }} />
            <span style={{
              fontSize: 14, fontWeight: 600,
              color: 'var(--text-primary)',
            }}>
              Payment Methods
            </span>
          </div>
          <span style={{
            fontSize: 11, fontWeight: 500,
            color: 'var(--text-secondary)',
            background: 'var(--bg-hover)',
            borderRadius: 6,
            padding: '2px 8px',
          }}>
            Today
          </span>
        </div>

        {/* ── Divider ── */}
        <div style={{ height: 1, background: 'var(--border)', margin: '10px 0 2px' }} />

        {/* ── Rows ── */}
        {isLoading ? (
          METHODS.map(m => <SkeletonRow key={m.key} />)
        ) : allZero ? (
          /* Empty state */
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '28px 0',
            gap: 8,
          }}>
            <Wallet size={32} strokeWidth={1.5} style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              No payments recorded today
            </span>
          </div>
        ) : (
          METHODS.map(method => (
            <MethodRow
              key={method.key}
              method={method}
              amount={amounts[method.key]}
              total={total}
              format={format}
            />
          ))
        )}

        {/* ── Total row ── */}
        {!isLoading && !allZero && (
          <>
            <div style={{ height: 1, background: 'var(--border)', margin: '6px 0 10px' }} />
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{
                fontSize: 13, fontWeight: 500,
                color: 'var(--text-secondary)',
              }}>
                Total Collected
              </span>
              <span style={{
                fontSize: 15, fontWeight: 700,
                color: 'var(--text-primary)',
              }}>
                {format(total)}
              </span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
