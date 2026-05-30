import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useCurrency } from '../../hooks/useCurrency';
import { BarChart3, Clock } from 'lucide-react';

// ── helpers ──────────────────────────────────────────────────────────────────

/** "0" → "12A", "13" → "1P", etc. */
function shortLabel(hour) {
  if (hour === 0) return '12A';
  if (hour < 12) return `${hour}A`;
  if (hour === 12) return '12P';
  return `${hour - 12}P`;
}

/** hour 14 → "2:00 PM – 3:00 PM" */
function rangeLabel(hour) {
  const fmt = (h) => {
    const period = h < 12 ? 'AM' : 'PM';
    const display = h % 12 === 0 ? 12 : h % 12;
    return `${display}:00 ${period}`;
  };
  return `${fmt(hour)} – ${fmt((hour + 1) % 24)}`;
}

/** hour 14 → "2 PM" */
function shortAmPm(hour) {
  const period = hour < 12 ? 'AM' : 'PM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${period}`;
}

// ── sub-components ────────────────────────────────────────────────────────────

function SkeletonChart() {
  return (
    <div style={styles.barArea}>
      {Array.from({ length: 24 }).map((_, i) => (
        <div key={i} style={styles.barCol}>
          <div
            style={{
              ...styles.bar,
              height: `${20 + Math.random() * 50}px`,
              background: 'var(--bg-hover)',
              opacity: 0.5,
              animation: 'pulse 1.4s ease-in-out infinite',
            }}
          />
          <span style={styles.axisLabel}>{i % 3 === 0 ? shortLabel(i) : ''}</span>
        </div>
      ))}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function PeakHoursChart({ outletId }) {
  const [hoveredHour, setHoveredHour] = useState(null);
  const { format } = useCurrency();

  const today = new Date().toISOString().split('T')[0];
  const currentHour = new Date().getHours();

  const { data: hourlyData, isLoading } = useQuery({
    queryKey: ['hourly-breakdown', outletId, today],
    queryFn: () =>
      api
        .get(`/reports/hourly?outlet_id=${outletId}&date=${today}`)
        .then((r) => r.data?.data || r.data),
    enabled: !!outletId,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60000,
  });

  // ── derived state ──────────────────────────────────────────────────────────

  const hours = Array.isArray(hourlyData) && hourlyData.length === 24 ? hourlyData : null;

  const maxOrders = hours ? Math.max(...hours.map((h) => h.orders), 1) : 1;

  const allZero = hours ? hours.every((h) => h.orders === 0) : false;

  const peakEntry =
    hours && !allZero
      ? hours.reduce((best, cur) => (cur.orders > best.orders ? cur : best), hours[0])
      : null;

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div style={styles.card}>
      {/* pulse keyframe injected once */}
      <style>{`
        @keyframes peakPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        .peak-bar-current {
          box-shadow: 0 0 10px 2px rgba(99,102,241,0.55);
        }
      `}</style>

      {/* ── Header ── */}
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <BarChart3 size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={styles.title}>Peak Hours</span>
        </div>
        <div style={styles.badge}>
          <Clock size={13} />
          <span>{shortAmPm(currentHour)}</span>
        </div>
      </div>

      {/* ── Chart body ── */}
      {isLoading ? (
        <SkeletonChart />
      ) : !hours || allZero ? (
        <div style={styles.emptyState}>
          <BarChart3 size={32} style={{ opacity: 0.25 }} />
          <span style={styles.emptyText}>No orders yet today</span>
        </div>
      ) : (
        <div style={styles.barArea}>
          {hours.map((entry, i) => {
            const isCurrent = i === currentHour;
            const isPast = i < currentHour;
            const isFuture = i > currentHour;

            const barHeightPx = entry.orders > 0 ? Math.max(6, (entry.orders / maxOrders) * 80) : 3;

            let barColor = 'var(--accent)';
            let barOpacity = isCurrent ? 1 : isPast ? 0.5 : 0.15;

            const isHovered = hoveredHour === i;

            return (
              <div
                key={i}
                style={styles.barCol}
                onMouseEnter={() => setHoveredHour(i)}
                onMouseLeave={() => setHoveredHour(null)}
              >
                {/* Tooltip */}
                {isHovered && (
                  <div style={styles.tooltip}>
                    <span style={styles.tooltipTime}>{shortAmPm(i)}</span>
                    <span>{entry.orders} orders</span>
                    <span style={styles.tooltipRevenue}>{format(entry.revenue)}</span>
                  </div>
                )}

                {/* Bar */}
                <div style={styles.barTrack}>
                  <div
                    className={isCurrent ? 'peak-bar-current' : undefined}
                    style={{
                      ...styles.bar,
                      height: `${barHeightPx}px`,
                      background: barColor,
                      opacity: isHovered ? Math.min(barOpacity + 0.3, 1) : barOpacity,
                      transition: 'opacity 0.15s, height 0.2s',
                    }}
                  />
                </div>

                {/* Axis label — every 3 hours */}
                <span style={styles.axisLabel}>{i % 3 === 0 ? shortLabel(i) : ''}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Summary row ── */}
      {peakEntry && (
        <div style={styles.summary}>
          <Clock size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={styles.summaryLabel}>Peak Time</span>
          <span style={styles.summaryValue}>{rangeLabel(peakEntry.hour)}</span>
          <span style={styles.summaryOrders}>{peakEntry.orders} orders</span>
        </div>
      )}
    </div>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const styles = {
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    minWidth: 0,
    position: 'relative',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },

  title: {
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },

  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    background: 'rgba(99,102,241,0.15)',
    color: 'var(--accent)',
    border: '1px solid rgba(99,102,241,0.3)',
    borderRadius: '20px',
    padding: '3px 10px',
    fontSize: '12px',
    fontWeight: 500,
  },

  barArea: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '2px',
    height: '110px',       // 80px bars + ~30px label
    paddingBottom: '0px',
    width: '100%',
    position: 'relative',
  },

  barCol: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '4px',
    position: 'relative',
    cursor: 'default',
  },

  barTrack: {
    width: '100%',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: '80px',
  },

  bar: {
    width: '100%',
    borderRadius: '3px 3px 0 0',
    minHeight: '3px',
  },

  axisLabel: {
    fontSize: '9px',
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap',
    height: '14px',
    lineHeight: '14px',
    userSelect: 'none',
  },

  tooltip: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginBottom: '6px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    whiteSpace: 'nowrap',
    zIndex: 10,
    fontSize: '12px',
    color: 'var(--text-primary)',
    pointerEvents: 'none',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
  },

  tooltipTime: {
    fontWeight: 600,
    color: 'var(--accent)',
  },

  tooltipRevenue: {
    color: 'var(--text-secondary)',
    fontSize: '11px',
  },

  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    height: '110px',
    color: 'var(--text-secondary)',
  },

  emptyText: {
    fontSize: '13px',
  },

  summary: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderTop: '1px solid var(--border)',
    paddingTop: '12px',
    flexWrap: 'wrap',
  },

  summaryLabel: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },

  summaryValue: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    flex: 1,
  },

  summaryOrders: {
    fontSize: '12px',
    color: 'var(--accent)',
    fontWeight: 500,
  },
};
