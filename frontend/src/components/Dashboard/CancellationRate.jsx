/**
 * CancellationRate — Dashboard widget showing today's order cancellation rate.
 * Computed purely from the `orders` prop — no extra API call.
 */
import { useMemo } from 'react';
import { useCurrency } from '../../hooks/useCurrency';
import { Ban, CheckCircle2, TrendingDown, AlertCircle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRateBadge(rate) {
  if (rate > 10) {
    return {
      label: 'High',
      color: '#ef4444',
      bg: '#ef44441a',
      Icon: AlertCircle,
    };
  }
  if (rate >= 5) {
    return {
      label: 'Watch',
      color: '#f59e0b',
      bg: '#f59e0b1a',
      Icon: TrendingDown,
    };
  }
  return {
    label: 'Healthy',
    color: '#10b981',
    bg: '#10b9811a',
    Icon: CheckCircle2,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProportionBar({ cancelCount, totalCount }) {
  const cancelPct = totalCount > 0 ? (cancelCount / totalCount) * 100 : 0;
  const completedPct = 100 - cancelPct;

  return (
    <div style={{
      height: 6,
      borderRadius: 3,
      background: 'var(--bg-hover)',
      overflow: 'hidden',
      display: 'flex',
    }}>
      {/* Cancelled portion — red */}
      {cancelPct > 0 && (
        <div style={{
          width: `${cancelPct}%`,
          height: '100%',
          background: '#ef4444',
          borderRadius: cancelPct === 100 ? 3 : '3px 0 0 3px',
          transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
          flexShrink: 0,
        }} />
      )}
      {/* Completed portion — green */}
      {completedPct > 0 && (
        <div style={{
          flex: 1,
          height: '100%',
          background: '#10b981',
          borderRadius: cancelPct === 0 ? 3 : '0 3px 3px 0',
          transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      )}
    </div>
  );
}

function ReasonPill({ reason, count }) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 10px',
      borderRadius: 20,
      background: 'var(--bg-hover)',
      border: '1px solid var(--border)',
      fontSize: 11,
      fontWeight: 500,
      color: 'var(--text-secondary)',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ color: 'var(--text-primary)' }}>{reason}</span>
      <span style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>·</span>
      <span>{count}x</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CancellationRate({ orders = [], outletId }) {
  const { format } = useCurrency();

  const stats = useMemo(() => {
    const total = orders.length;
    const cancelled = orders.filter(
      o => o.status === 'cancelled' || o.status === 'voided'
    );
    const cancelCount = cancelled.length;
    const cancelRate = total > 0 ? (cancelCount / total) * 100 : 0;
    const cancelledRevenue = cancelled.reduce(
      (s, o) => s + Number(o.grand_total || 0),
      0
    );

    // Group and sort cancel reasons, take top 3
    const reasonGroups = cancelled.reduce((acc, o) => {
      const r = o.cancel_reason || 'No reason given';
      acc[r] = (acc[r] || 0) + 1;
      return acc;
    }, {});
    const topReasons = Object.entries(reasonGroups)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return { total, cancelCount, cancelRate, cancelledRevenue, topReasons };
  }, [orders]);

  const { total, cancelCount, cancelRate, cancelledRevenue, topReasons } = stats;
  const badge = getRateBadge(cancelRate);
  const BadgeIcon = badge.Icon;
  const noCancellations = cancelCount === 0;

  return (
    <>
      {/* Shimmer keyframes */}
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
        padding: '18px 20px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Ban size={16} strokeWidth={2} style={{ color: 'var(--accent)' }} />
            <span style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}>
              Cancellations
            </span>
          </div>
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--text-secondary)',
            background: 'var(--bg-hover)',
            borderRadius: 6,
            padding: '2px 8px',
          }}>
            Today
          </span>
        </div>

        {/* ── Divider ── */}
        <div style={{ height: 1, background: 'var(--border)', margin: '10px 0 14px' }} />

        {/* ── Zero-state ── */}
        {noCancellations ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 0 20px',
            gap: 8,
          }}>
            <CheckCircle2
              size={36}
              strokeWidth={1.5}
              style={{ color: '#10b981' }}
            />
            <span style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text-secondary)',
            }}>
              No cancellations today
            </span>
          </div>
        ) : (
          <>
            {/* ── Main metric row ── */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}>
              {/* Count + rate */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{
                  fontSize: 32,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: 'var(--text-primary)',
                }}>
                  {cancelCount}
                </span>
                <span style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: '#ef4444',
                }}>
                  {cancelRate.toFixed(1)}%
                </span>
              </div>

              {/* Rate badge */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                borderRadius: 20,
                background: badge.bg,
                border: `1px solid ${badge.color}33`,
              }}>
                <BadgeIcon size={12} strokeWidth={2.5} style={{ color: badge.color }} />
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: badge.color,
                }}>
                  {badge.label}
                </span>
              </div>
            </div>

            {/* ── Revenue lost ── */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 14,
            }}>
              <TrendingDown size={13} strokeWidth={2} style={{ color: '#ef444499' }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Revenue lost:
              </span>
              <span style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#ef4444cc',
              }}>
                {format(cancelledRevenue)}
              </span>
            </div>

            {/* ── Proportion bar ── */}
            <ProportionBar cancelCount={cancelCount} totalCount={total} />

            {/* Bar legend */}
            <div style={{
              display: 'flex',
              gap: 14,
              marginTop: 7,
              marginBottom: topReasons.length > 0 ? 14 : 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: 2,
                  background: '#ef4444', flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Cancelled
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: 2,
                  background: '#10b981', flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Completed
                </span>
              </div>
            </div>

            {/* ── Top cancel reasons ── */}
            {topReasons.length > 0 && (
              <>
                <div style={{ height: 1, background: 'var(--border)', marginBottom: 12 }} />
                <div style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  Top Reasons
                </div>
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                }}>
                  {topReasons.map(([reason, count]) => (
                    <ReasonPill key={reason} reason={reason} count={count} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
