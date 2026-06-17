import { useMemo } from 'react';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Utensils,
  ShoppingBag,
  Globe,
  ArrowRight,
  Timer,
} from 'lucide-react';

/* ── Bucket definitions ───────────────────────────────────────────── */
const BUCKETS = {
  critical: { min: 45,  max: Infinity, label: 'Critical', color: '#ef4444', bg: '#ef444418' },
  warning:  { min: 30,  max: 45,       label: 'Warning',  color: '#f97316', bg: '#f9731618' },
  watch:    { min: 20,  max: 30,       label: 'Watch',    color: '#f59e0b', bg: '#f59e0b18' },
};

const ACTIVE_STATUSES = new Set(['created', 'confirmed', 'held', 'billed', 'ready']);

function getBucket(ageMinutes) {
  if (ageMinutes >= BUCKETS.critical.min) return 'critical';
  if (ageMinutes >= BUCKETS.warning.min)  return 'warning';
  if (ageMinutes >= BUCKETS.watch.min)    return 'watch';
  return null;
}

/* ── Format elapsed time ──────────────────────────────────────────── */
function formatElapsed(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/* ── Order-type icon ──────────────────────────────────────────────── */
function OrderTypeIcon({ type, color }) {
  const style = { width: 14, height: 14, color };
  if (type === 'delivery')  return <ShoppingBag style={style} />;
  if (type === 'online')    return <Globe style={style} />;
  return <Utensils style={style} />;
}

/* ── Status pill ──────────────────────────────────────────────────── */
const STATUS_META = {
  created:   { label: 'New',       color: '#6366f1' },
  confirmed: { label: 'Confirmed', color: '#3b82f6' },
  held:      { label: 'On Hold',   color: '#f59e0b' },
  billed:    { label: 'Billed',    color: '#10b981' },
};

function StatusPill({ status }) {
  const meta = STATUS_META[status] || { label: status, color: '#94a3b8' };
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 700,
      padding: '2px 7px',
      borderRadius: 99,
      background: meta.color + '20',
      color: meta.color,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}>
      {meta.label}
    </span>
  );
}

/* ── Main component ───────────────────────────────────────────────── */
export default function AgingOrdersAlert({ orders = [], onNavigateToRunning }) {
  const { agingOrders, avgWaitMinutes } = useMemo(() => {
    const now = Date.now();

    const active = orders.filter(
      (o) => ACTIVE_STATUSES.has(o.status) && o.is_paid !== true && o.created_at,
    );

    const withAge = active.map((o) => ({
      ...o,
      ageMinutes: Math.floor((now - new Date(o.created_at)) / 60000),
    }));

    // Average wait across ALL active orders (for the success state)
    const avg =
      withAge.length > 0
        ? Math.round(withAge.reduce((sum, o) => sum + o.ageMinutes, 0) / withAge.length)
        : 0;

    const aging = withAge
      .filter((o) => getBucket(o.ageMinutes) !== null)
      .sort((a, b) => b.ageMinutes - a.ageMinutes)
      .slice(0, 5);

    return { agingOrders: aging, avgWaitMinutes: avg };
  }, [orders]);

  const hasCritical = agingOrders.some((o) => getBucket(o.ageMinutes) === 'critical');

  /* ── Styles ─────────────────────────────────────────────────────── */
  const card = {
    background: 'var(--bg-card)',
    border: `1px solid ${hasCritical ? '#ef444430' : 'var(--border)'}`,
    borderRadius: 12,
    overflow: 'hidden',
    fontFamily: 'inherit',
  };

  const header = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px 12px',
    borderBottom: '1px solid var(--border)',
  };

  const headerLeft = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  const headerTitle = {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '0.01em',
  };

  const countBadge = {
    fontSize: 11,
    fontWeight: 800,
    padding: '2px 8px',
    borderRadius: 99,
    background: hasCritical ? '#ef444418' : '#f9731618',
    color: hasCritical ? '#ef4444' : '#f97316',
    letterSpacing: '0.03em',
  };

  /* ── Empty / success state ───────────────────────────────────────── */
  if (agingOrders.length === 0) {
    return (
      <div style={card}>
        <div style={header}>
          <div style={headerLeft}>
            <Timer size={16} color="#10b981" />
            <span style={{ ...headerTitle, color: '#10b981' }}>Order Timing</span>
          </div>
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '28px 16px',
          gap: 8,
        }}>
          <CheckCircle2 size={32} color="#10b981" />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>
            All orders moving well
          </span>
          {avgWaitMinutes > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Avg wait time today: {formatElapsed(avgWaitMinutes)}
            </span>
          )}
          {avgWaitMinutes === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              No active orders right now
            </span>
          )}
        </div>
      </div>
    );
  }

  /* ── Aging orders list ────────────────────────────────────────────── */
  return (
    <div style={card}>
      {/* Header */}
      <div style={header}>
        <div style={headerLeft}>
          <AlertTriangle size={15} color={hasCritical ? '#ef4444' : '#f97316'} />
          <span style={headerTitle}>Aging Orders</span>
        </div>
        <span style={countBadge}>{agingOrders.length} order{agingOrders.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Order rows */}
      <div style={{ padding: '8px 0' }}>
        {agingOrders.map((order) => {
          const bucketKey  = getBucket(order.ageMinutes);
          const bucket     = BUCKETS[bucketKey];
          const isCritical = bucketKey === 'critical';

          const label =
            order.table?.table_number
              ? `Table ${order.table.table_number}`
              : order.customer?.name || order.customer?.phone || 'Walk-in';

          return (
            <div
              key={order.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 16px',
                borderBottom: '1px solid var(--border)',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {/* Order type icon */}
              <div style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: bucket.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <OrderTypeIcon type={order.order_type} color={bucket.color} />
              </div>

              {/* Order info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {order.order_number ? `#${order.order_number}` : `Order ${order.id?.slice(-6)}`}
                  </span>
                  <StatusPill status={order.status} />
                </div>
                <span style={{
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'block',
                }}>
                  {label}
                </span>
              </div>

              {/* Elapsed time badge */}
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: bucket.color,
                  background: bucket.bg,
                  padding: '3px 10px',
                  borderRadius: 8,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  border: `1px solid ${bucket.color}30`,
                }}
                className={isCritical ? 'animate-pulse' : undefined}
              >
                {formatElapsed(order.ageMinutes)}
              </div>

              {/* View button */}
              <button
                onClick={onNavigateToRunning}
                title="View in Running Orders"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '4px 8px',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  fontSize: 11,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  flexShrink: 0,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = bucket.color;
                  e.currentTarget.style.color = bucket.color;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                View
                <ArrowRight size={10} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 16px' }}>
        <button
          onClick={onNavigateToRunning}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: 12,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: 0,
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          <Clock size={12} />
          View all in Running Orders
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}
