import { useState, useEffect, useRef } from 'react';
import { useCurrency } from '../../hooks/useCurrency';
import {
  Clock, Timer, Utensils, ShoppingBag, Globe, Plus, Receipt, Printer,
  CreditCard, Ban, ChefHat, CheckCircle2, Star, StickyNote, Tag,
  User, Users, ArrowLeftRight, GitMerge, Mail, UserPlus, History,
  ChevronDown, ChevronUp, MoreHorizontal, Zap, AlertTriangle, Eye
} from 'lucide-react';

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */

function getAgingMeta(minutes, urgencyThreshold) {
  if (minutes < 10) return { color: 'emerald', tailwind: 'text-emerald-400', bar: 'from-emerald-600 to-emerald-400', pulse: false };
  if (minutes < 20) return { color: 'amber',   tailwind: 'text-amber-400',   bar: 'from-amber-600 to-amber-400',   pulse: false };
  if (minutes < (urgencyThreshold || 30)) return { color: 'orange', tailwind: 'text-orange-400', bar: 'from-orange-600 to-orange-400', pulse: false };
  return { color: 'red', tailwind: 'text-red-400', bar: 'from-red-700 to-red-500', pulse: true };
}

function formatElapsed(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getOrderTypeIcon(type) {
  switch (type) {
    case 'dine_in':   return <Utensils size={13} />;
    case 'takeaway':  return <ShoppingBag size={13} />;
    case 'delivery':  return <Globe size={13} />;
    case 'online':    return <Globe size={13} />;
    default:          return <Utensils size={13} />;
  }
}

function getOrderTypeLabel(type) {
  switch (type) {
    case 'dine_in':   return 'Dine-In';
    case 'takeaway':  return 'Takeaway';
    case 'delivery':  return 'Delivery';
    case 'online':    return 'Online';
    default:          return type || 'Order';
  }
}

const STATUS_STYLES = {
  pending:    'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30',
  confirmed:  'bg-blue-500/15 text-blue-300 border border-blue-500/30',
  preparing:  'bg-orange-500/15 text-orange-300 border border-orange-500/30',
  ready:      'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  served:     'bg-purple-500/15 text-purple-300 border border-purple-500/30',
  billed:     'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30',
  paid:       'bg-green-500/15 text-green-300 border border-green-500/30',
  cancelled:  'bg-red-500/15 text-red-300 border border-red-500/30',
};

const ITEM_STATUS_DOT = {
  pending: 'bg-zinc-500',
  preparing: 'bg-orange-400',
  ready: 'bg-emerald-400',
  served: 'bg-purple-400',
  cancelled: 'bg-red-400',
};

/* ─────────────────────────────────────────────
   ElapsedTimer — also exported
───────────────────────────────────────────── */

export function ElapsedTimer({ createdAt, urgencyThreshold = 30 }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(createdAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [createdAt]);

  const minutes = Math.floor(elapsed / 60);
  const meta = getAgingMeta(minutes, urgencyThreshold);
  const isUrgent = meta.color === 'red';

  return { elapsed, minutes, isUrgent, agingColor: meta.color, meta, formatted: formatElapsed(elapsed) };
}

/* ─────────────────────────────────────────────
   Inline keyframes injected once
───────────────────────────────────────────── */

const STYLE_ID = 'eoc-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes eoc-slide-in {
      from { opacity: 0; transform: translateY(-10px) scale(0.98); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes eoc-pulse-ring {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.45; }
    }
    .eoc-new       { animation: eoc-slide-in 0.35s ease both; }
    .eoc-pulse-txt { animation: eoc-pulse-ring 1.2s ease-in-out infinite; }
  `;
  document.head.appendChild(s);
}

/* ─────────────────────────────────────────────
   EnhancedOrderCard
───────────────────────────────────────────── */

export default function EnhancedOrderCard({
  order,
  onAction,
  isSelected = false,
  onSelect,
  viewMode = 'grid',
  urgencyThreshold = 30,
  isPriority = false,
  isNew = false,
}) {
  const { format } = useCurrency();
  const [expanded, setExpanded] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [hovered, setHovered] = useState(false);

  /* --- elapsed timer ---- */
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(order.created_at).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [order.created_at]);

  const minutes = Math.floor(elapsed / 60);
  const agingMeta = getAgingMeta(minutes, urgencyThreshold);
  const isUrgent = agingMeta.color === 'red';

  /* --- derived values --- */
  const items = order.order_items || [];
  const payments = order.payments || [];
  const displayName = order.table?.table_number
    ? `T-${order.table.table_number}`
    : order.customer?.full_name || order.customer_name || '—';
  const waiterName = order.staff?.name || null;
  const waiterInitials = waiterName
    ? waiterName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : null;
  const loyaltyPoints = order.customer?.loyalty_points?.current_points ?? null;
  const isBilled = ['billed', 'paid'].includes(order.status);
  const isPaid = order.status === 'paid';

  const kotSentItems = items.filter(i => i.is_kot_sent);
  const readyItems   = kotSentItems.filter(i => i.status === 'ready');
  const kitchenPct   = kotSentItems.length > 0 ? (readyItems.length / kotSentItems.length) * 100 : 0;

  const visibleItems = expanded ? items : items.slice(0, 3);

  const act = (type) => onAction?.(type, order);

  /* ═══════════════════════════════════════════
     LIST VIEW
  ═══════════════════════════════════════════ */

  if (viewMode === 'list') {
    return (
      <div
        className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all duration-200 cursor-default
          ${isSelected ? 'border-[var(--accent)]/60' : 'border-[var(--border)]'}
          ${isNew ? 'eoc-new' : ''}
          ${isPriority ? 'border-l-2 border-l-yellow-400' : ''}
        `}
        style={{ background: 'var(--bg-card)' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Checkbox */}
        <div
          className={`w-4 h-4 flex-shrink-0 rounded border transition-all duration-200 flex items-center justify-center cursor-pointer
            ${isSelected ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border)]'}
            ${!isSelected && !hovered ? 'opacity-0' : 'opacity-100'}
          `}
          onClick={() => onSelect?.(order.id, !isSelected)}
        >
          {isSelected && <span className="text-white text-[9px] font-bold">✓</span>}
        </div>

        {/* Type icon */}
        <span className="text-[var(--text-secondary)] flex-shrink-0">{getOrderTypeIcon(order.order_type)}</span>

        {/* Order number */}
        <span className="font-mono text-xs text-white font-semibold w-20 flex-shrink-0">#{order.order_number || order.id?.slice(-6)}</span>

        {/* Table/customer */}
        <span className="text-xs text-[var(--text-secondary)] w-20 flex-shrink-0 truncate">{displayName}</span>

        {/* Status */}
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider flex-shrink-0 ${STATUS_STYLES[order.status] || STATUS_STYLES.pending}`}>
          {order.status}
        </span>

        {/* Items */}
        <span className="font-mono text-xs text-[var(--text-secondary)] w-12 flex-shrink-0 text-center">{items.length} items</span>

        {/* Amount */}
        <span className="font-mono text-xs text-white font-semibold flex-1 text-right">{format(order.grand_total)}</span>

        {/* Timer */}
        <span className={`font-mono text-xs flex-shrink-0 ${agingMeta.tailwind} ${isUrgent ? 'eoc-pulse-txt' : ''}`}>
          {formatElapsed(elapsed)}
        </span>

        {/* Icon actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            className="p-1 rounded text-orange-400 hover:bg-orange-500/15 transition-all duration-200"
            title="Add KOT"
            onClick={() => act('add_kot')}
          >
            <ChefHat size={14} />
          </button>
          {!isBilled ? (
            <button
              className="p-1 rounded text-cyan-400 hover:bg-cyan-500/15 transition-all duration-200"
              title="Generate Bill"
              onClick={() => act('generate_bill')}
            >
              <Receipt size={14} />
            </button>
          ) : (
            <button
              className="p-1 rounded text-blue-400 hover:bg-blue-500/15 transition-all duration-200"
              title="Print Bill"
              onClick={() => act('view_bill')}
            >
              <Printer size={14} />
            </button>
          )}
          {isBilled && (
            <button
              className="p-1 rounded text-emerald-400 hover:bg-emerald-500/15 transition-all duration-200"
              title="Pay"
              onClick={() => act('pay')}
            >
              <CreditCard size={14} />
            </button>
          )}
          <button
            className="p-1 rounded text-red-400 hover:bg-red-500/15 transition-all duration-200"
            title="Cancel"
            onClick={() => act('cancel')}
          >
            <Ban size={14} />
          </button>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     GRID VIEW
  ═══════════════════════════════════════════ */

  return (
    <div
      className={`relative rounded-xl border flex flex-col overflow-hidden transition-all duration-200
        ${isSelected ? 'border-[var(--accent)]/70 ring-1 ring-[var(--accent)]/30' : 'border-[var(--border)]'}
        ${isPriority ? 'border-l-[3px] border-l-yellow-400' : ''}
        ${isNew ? 'eoc-new' : ''}
        hover:border-[var(--accent)]/40
      `}
      style={{ background: 'var(--bg-card)' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >

      {/* ── Top color bar ── */}
      <div className={`h-[3px] w-full bg-gradient-to-r ${agingMeta.bar}`} />

      {/* ── Header row ── */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">

        {/* Checkbox */}
        <div
          className={`w-4 h-4 flex-shrink-0 rounded border transition-all duration-200 flex items-center justify-center cursor-pointer
            ${isSelected ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border)] hover:border-[var(--accent)]/60'}
            ${!isSelected && !hovered ? 'opacity-0 pointer-events-none' : 'opacity-100'}
          `}
          onClick={() => onSelect?.(order.id, !isSelected)}
        >
          {isSelected && <span className="text-white text-[9px] font-bold leading-none">✓</span>}
        </div>

        {/* Order type icon */}
        <span className="text-[var(--text-secondary)] flex-shrink-0">{getOrderTypeIcon(order.order_type)}</span>

        {/* Order number + type label */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-mono text-xs font-bold text-white truncate">
              #{order.order_number || order.id?.slice(-6)}
            </span>
            <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider flex-shrink-0">
              {getOrderTypeLabel(order.order_type)}
            </span>
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] truncate leading-tight">
            {displayName}
          </div>
        </div>

        {/* Right cluster: star + status + timer */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Priority star */}
          <button
            className={`p-0.5 rounded transition-all duration-200 ${
              isPriority
                ? 'text-yellow-400 hover:text-yellow-300'
                : 'text-[var(--text-secondary)] hover:text-yellow-400 opacity-0 group-hover:opacity-100'
            }`}
            style={{ opacity: isPriority || hovered ? 1 : 0 }}
            onClick={() => act('toggle_priority')}
            title={isPriority ? 'Unpin' : 'Pin order'}
          >
            <Star size={13} fill={isPriority ? 'currentColor' : 'none'} />
          </button>

          {/* Status badge */}
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider ${STATUS_STYLES[order.status] || STATUS_STYLES.pending}`}>
            {order.status}
          </span>

          {/* Elapsed timer */}
          <div
            className={`flex items-center gap-0.5 font-mono text-[11px] font-semibold ${agingMeta.tailwind} ${isUrgent ? 'eoc-pulse-txt' : ''}`}
            title="Time since order placed"
          >
            {isUrgent ? <AlertTriangle size={11} /> : <Clock size={11} />}
            {formatElapsed(elapsed)}
          </div>
        </div>
      </div>

      {/* ── Priority badge ── */}
      {isPriority && (
        <div className="mx-3 mb-1 px-2 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/25 flex items-center gap-1">
          <Star size={10} fill="currentColor" className="text-yellow-400" />
          <span className="text-[10px] text-yellow-300 uppercase tracking-wider font-semibold">Priority Order</span>
        </div>
      )}

      {/* ── Info pills row ── */}
      <div className="flex items-center gap-1.5 px-3 pb-1.5 flex-wrap">
        {/* Table / customer */}
        {order.table?.table_number && (
          <span className="flex items-center gap-0.5 text-[10px] text-[var(--text-secondary)] bg-[var(--bg-hover)] px-1.5 py-0.5 rounded-full">
            <Utensils size={9} />
            T-{order.table.table_number}
          </span>
        )}
        {!order.table?.table_number && (order.customer?.full_name || order.customer_name) && (
          <span className="flex items-center gap-0.5 text-[10px] text-[var(--text-secondary)] bg-[var(--bg-hover)] px-1.5 py-0.5 rounded-full">
            <User size={9} />
            {order.customer?.full_name || order.customer_name}
          </span>
        )}

        {/* Waiter initials */}
        {waiterInitials && (
          <span
            className="w-5 h-5 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-300 text-[9px] font-bold flex items-center justify-center flex-shrink-0"
            title={waiterName}
          >
            {waiterInitials}
          </span>
        )}

        {/* Loyalty points */}
        {loyaltyPoints != null && loyaltyPoints > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
            <Star size={9} fill="currentColor" />
            {loyaltyPoints} pts
          </span>
        )}

        {/* Notes */}
        {order.notes && (
          <span className="flex items-center gap-0.5 text-[10px] text-orange-300" title={order.notes}>
            <StickyNote size={10} />
          </span>
        )}

        {/* Discount */}
        {order.discount_amount > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
            <Tag size={9} />
            −{format(order.discount_amount)}
          </span>
        )}
      </div>

      {/* ── Item chips / list ── */}
      <div className="px-3 pb-1.5">
        <div className="flex flex-wrap gap-1 mb-1">
          {visibleItems.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-1 text-[10px] bg-[var(--bg-hover)] border border-[var(--border)] rounded px-1.5 py-0.5 transition-all duration-200 ${
                expanded ? 'w-full justify-between' : ''
              }`}
            >
              <div className="flex items-center gap-1 min-w-0">
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ITEM_STATUS_DOT[item.status] || ITEM_STATUS_DOT.pending}`}
                  title={item.status}
                />
                {!expanded && (
                  <span className="text-white font-mono font-semibold">{item.quantity}x</span>
                )}
                <span className="text-[var(--text-secondary)] truncate">{item.name}</span>
              </div>
              {expanded && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-mono text-white">{item.quantity}×</span>
                  <span className="font-mono text-[var(--text-secondary)]">{format(item.unit_price)}</span>
                  <span className="font-mono text-white font-semibold">{format(item.item_total)}</span>
                  {item.is_kot_sent && (
                    <ChefHat size={9} className="text-orange-400" title="KOT sent" />
                  )}
                  {item.kitchen_station && (
                    <span className="text-[9px] text-[var(--text-secondary)] bg-[var(--bg-card)] border border-[var(--border)] px-1 rounded">
                      {item.kitchen_station}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {items.length > 3 && (
          <button
            className="flex items-center gap-0.5 text-[10px] text-[var(--accent)] hover:text-white transition-all duration-200 uppercase tracking-wider"
            onClick={() => setExpanded(p => !p)}
          >
            {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            {expanded ? 'Collapse' : `View all ${items.length} items`}
          </button>
        )}
      </div>

      {/* ── Payment breakdown (expanded) ── */}
      {expanded && payments.length > 0 && (
        <div className="mx-3 mb-1.5 px-2 py-1.5 rounded-lg bg-[var(--bg-hover)] border border-[var(--border)]">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1">Payments</div>
          <div className="flex flex-wrap gap-2">
            {payments.map((p, i) => (
              <div key={i} className="flex items-center gap-1 text-[11px]">
                <CreditCard size={10} className="text-[var(--text-secondary)]" />
                <span className="text-[var(--text-secondary)] capitalize">{p.method}:</span>
                <span className="font-mono text-white font-semibold">{format(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Kitchen prep bar ── */}
      {kotSentItems.length > 0 && (
        <div className="px-3 pb-1.5">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">
              Kitchen: {readyItems.length}/{kotSentItems.length} ready
            </span>
            <span className="font-mono text-[10px] text-[var(--text-secondary)]">{Math.round(kitchenPct)}%</span>
          </div>
          <div className="h-1 rounded-full bg-[var(--bg-hover)] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                kitchenPct === 100 ? 'bg-emerald-400' : 'bg-orange-400'
              }`}
              style={{ width: `${kitchenPct}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Stats row ── */}
      <div className="grid grid-cols-3 gap-px mx-3 mb-2 rounded-lg overflow-hidden border border-[var(--border)]">
        <div className="flex flex-col items-center py-1.5 bg-[var(--bg-hover)]">
          <span className="font-mono text-xs font-bold text-white">{items.length}</span>
          <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">Items</span>
        </div>
        <div className="flex flex-col items-center py-1.5 bg-[var(--bg-hover)] border-x border-[var(--border)]">
          <span className={`font-mono text-xs font-bold ${(order._count?.kots || 0) > 0 ? 'text-orange-400' : 'text-white'}`}>
            {order._count?.kots || 0}
          </span>
          <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">KOTs</span>
        </div>
        <div className="flex flex-col items-center py-1.5 bg-[var(--bg-hover)]">
          <span className="font-mono text-xs font-bold text-white">{format(order.grand_total)}</span>
          <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">Total</span>
        </div>
      </div>

      {/* ── KOT / Billed badges ── */}
      <div className="flex items-center gap-1.5 px-3 mb-2">
        {(order._count?.kots || 0) > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-orange-300 bg-orange-500/10 border border-orange-500/25 px-1.5 py-0.5 rounded-full">
            <ChefHat size={9} />
            {order._count.kots} KOT{order._count.kots > 1 ? 's' : ''}
          </span>
        )}
        {isBilled && (
          <span className="flex items-center gap-0.5 text-[10px] text-cyan-300 bg-cyan-500/10 border border-cyan-500/25 px-1.5 py-0.5 rounded-full">
            <Receipt size={9} />
            Billed
          </span>
        )}
        {isPaid && (
          <span className="flex items-center gap-0.5 text-[10px] text-green-300 bg-green-500/10 border border-green-500/25 px-1.5 py-0.5 rounded-full">
            <CheckCircle2 size={9} />
            Paid
          </span>
        )}
      </div>

      {/* ── Primary action row ── */}
      <div className="flex items-center gap-1.5 px-3 pb-1.5">
        <button
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-orange-500/15 border border-orange-500/30 text-orange-300 text-xs font-semibold hover:bg-orange-500/25 hover:text-white transition-all duration-200"
          onClick={() => act('add_kot')}
        >
          <ChefHat size={13} />
          KOT
        </button>

        {!isBilled ? (
          <button
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/25 hover:text-white transition-all duration-200"
            onClick={() => act('generate_bill')}
          >
            <Receipt size={13} />
            Bill
          </button>
        ) : (
          <button
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs font-semibold hover:bg-blue-500/25 hover:text-white transition-all duration-200"
            onClick={() => act('view_bill')}
          >
            <Printer size={13} />
            Print
          </button>
        )}

        <button
          className="p-1.5 rounded-lg bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--accent)]/40 transition-all duration-200"
          onClick={() => setShowMore(p => !p)}
          title="More actions"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>

      {/* ── Secondary (more) actions ── */}
      {showMore && (
        <div className="px-3 pb-1.5 grid grid-cols-4 gap-1">
          {(order._count?.kots || 0) > 0 && (
            <ActionIconBtn icon={<Printer size={12} />} label="Reprint" onClick={() => act('reprint_kot')} />
          )}
          <ActionIconBtn icon={<Tag size={12} />}           label="Discount"   onClick={() => act('discount')} />
          <ActionIconBtn icon={<StickyNote size={12} />}    label="Notes"      onClick={() => act('notes')} />
          <ActionIconBtn icon={<Zap size={12} />}           label="Tip"        onClick={() => act('tip')} />
          {order.order_type === 'dine_in' && (
            <ActionIconBtn icon={<ArrowLeftRight size={12} />} label="Transfer" onClick={() => act('transfer_table')} />
          )}
          <ActionIconBtn icon={<GitMerge size={12} />}      label="Merge"      onClick={() => act('merge')} />
          <ActionIconBtn icon={<Mail size={12} />}          label="eBill"      onClick={() => act('ebill')} />
          <ActionIconBtn icon={<UserPlus size={12} />}      label="Customer"   onClick={() => act('assign_customer')} />
          <ActionIconBtn icon={<Users size={12} />}         label="Waiter"     onClick={() => act('assign_waiter')} />
          <ActionIconBtn icon={<History size={12} />}       label="Audit"      onClick={() => act('audit_log')} />
        </div>
      )}

      {/* ── Pay button (full width, if billed) ── */}
      {isBilled && !isPaid && (
        <div className="px-3 pb-2">
          <button
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold hover:bg-emerald-500/35 hover:text-white transition-all duration-200"
            onClick={() => act('pay')}
          >
            <CreditCard size={14} />
            Collect Payment · {format(order.grand_total)}
          </button>
        </div>
      )}

      {/* ── Cancel button ── */}
      {!isPaid && (
        <div className="px-3 pb-3">
          <button
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs hover:bg-red-500/20 hover:text-red-300 transition-all duration-200"
            onClick={() => act('cancel')}
          >
            <Ban size={12} />
            Cancel Order
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Helper: small icon+label button for secondary actions ── */
function ActionIconBtn({ icon, label, onClick }) {
  return (
    <button
      className="flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-lg bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--accent)]/40 hover:bg-[var(--bg-hover)] transition-all duration-200"
      onClick={onClick}
      title={label}
    >
      {icon}
      <span className="text-[9px] uppercase tracking-wider leading-none">{label}</span>
    </button>
  );
}
