import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import hybridAPI from '../api/offlineAPI';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useCurrency } from '../hooks/useCurrency';
import { useRegion } from '../hooks/useRegion';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import BillPreviewModal from '../components/POS/BillPreviewModal';
import { PrintService } from '../lib/PrintService';
import { Clock, Eye, Ban, Loader, ShoppingBag, IndianRupee, Receipt, RefreshCw, Search, ArrowUpDown, ArrowUp, ArrowDown, Calendar } from 'lucide-react';
import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { addToCart, clearCart } from '../store/slices/posSlice';

/**
 * Format a raw order number into a professional restaurant-style ID.
 * e.g. 42 → #ORD-00042   |   "1234" → #ORD-01234
 */
function formatOrderNo(num) {
  if (!num && num !== 0) return '—';
  return `#ORD-${String(num).padStart(5, '0')}`;
}

// Styles cover both the backend's accepted status enum AND legacy/derived
// statuses that may already exist on historical orders, so no order ever
// renders a blank badge.
const STATUS_STYLES = {
  pending: 'badge-info', created: 'badge-info', confirmed: 'badge-info',
  preparing: 'badge-warning', ready: 'badge-success', served: 'badge-success',
  picked_up: 'badge-success',
  delivered: 'badge-success', completed: 'badge-success', paid: 'badge-success',
  billed: 'badge-info', cancelled: 'badge-danger', voided: 'badge-danger',
  refunded: 'badge-danger',
};

// What to actually show on the badge. The backend's order.status has no "served"
// value (served is a KOT-level status), so a fully-served-but-unpaid order would
// otherwise display as "Ready" until payment lands. The list endpoint augments
// each order with `kitchen_stage` ('served' / 'picked_up' / 'ready' / 'paid' / …)
// which is the canonical display label — fall back to order.status if the field
// is missing (older API response or a not-yet-deployed backend).
const displayStatus = (order) => order?.kitchen_stage || order?.status;
const STATUS_LABEL = { picked_up: 'Picked Up', served: 'Served' };
const labelFor = (s) => STATUS_LABEL[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// The ONLY status values the backend accepts on PATCH /orders/:id/status
// (updateOrderStatusSchema). Sending anything else (created/confirmed/paid/
// voided) returns a 400. Order here doubles as the forward progression.
const ALLOWED_STATUSES = ['pending', 'preparing', 'ready', 'served', 'delivered', 'completed', 'cancelled'];

// Terminal statuses can't transition further from this screen.
const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'paid', 'voided', 'refunded']);

/**
 * Valid next-status targets to offer for a given current status.
 * Always returns only backend-accepted values; never the current status.
 */
function nextStatusTargets(current) {
  if (TERMINAL_STATUSES.has(current)) return [];
  const idx = ALLOWED_STATUSES.indexOf(current);
  // Unknown/legacy current status (e.g. 'created'): offer the full forward path.
  if (idx === -1) return ALLOWED_STATUSES;
  return ALLOWED_STATUSES.slice(idx + 1);
}

const titleCase = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electron;

export default function OrdersPage() {
  const { user } = useSelector((s) => s.auth);
  // Multi-outlet owners (and the seeded super_admin) have outlet_id=null on their
  // JWT, so fall back to their first bound outlet — same pattern used across the
  // app (AccountingPage, PaymentsPage, SettingsPage, …). We intentionally keep a
  // concrete outlet_id rather than omitting it: listOrders builds its Prisma
  // `where` as { outlet_id, … } unconditionally, so an undefined outletId would
  // make Prisma drop the filter and return EVERY tenant's orders. Resolving to
  // the owner's first outlet keeps the ledger populated AND tenant-scoped.
  const outletId = user?.outlet_id || user?.outlets?.[0]?.id;
  const { format, locale } = useCurrency();
  const region = useRegion();
  const isAU = region === 'AU';
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const [statusFilter, setStatusFilter] = useState('');
  const [dateRange,    setDateRange]    = useState('today');   // today|yesterday|7d|30d|all
  const [sortField,    setSortField]    = useState('time');     // time|amount|order|status
  const [sortDir,      setSortDir]      = useState('desc');     // asc|desc
  const [searchQ,      setSearchQ]      = useState('');
  const [page,         setPage]         = useState(1);
  const PAGE_LIMIT = 200;
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isVoidOpen, setIsVoidOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [managerPin, setManagerPin] = useState('');
  const [voidReason, setVoidReason] = useState('Voided from dashboard');
  const [voidError, setVoidError] = useState('');
  // Receipt/bill: holds the full order being previewed for print (any channel).
  const [receiptOrder, setReceiptOrder] = useState(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  /* Date-range bounds (local TZ). `fromStr`/`toStr` are date-only YYYY-MM-DD
     strings passed to the backend (listOrders supports query.from + query.to,
     both required together, and expands them to full-day UTC bounds). */
  const dateBounds = (() => {
    const now = new Date();
    const startOf = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
    const endOf   = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
    const ymd     = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; };
    if (dateRange === 'today') {
      return { from: startOf(now), to: endOf(now), fromStr: ymd(now), toStr: ymd(now), label: 'Today' };
    }
    if (dateRange === 'yesterday') {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { from: startOf(y), to: endOf(y), fromStr: ymd(y), toStr: ymd(y), label: 'Yesterday' };
    }
    if (dateRange === '7d') {
      const s = new Date(now); s.setDate(s.getDate() - 6); return { from: startOf(s), to: endOf(now), fromStr: ymd(s), toStr: ymd(now), label: 'Last 7 days' };
    }
    if (dateRange === '30d') {
      const s = new Date(now); s.setDate(s.getDate() - 29); return { from: startOf(s), to: endOf(now), fromStr: ymd(s), toStr: ymd(now), label: 'Last 30 days' };
    }
    return { from: null, to: null, fromStr: null, toStr: null, label: 'All time' };
  })();

  const handleReorder = async (order) => {
    try {
      const { data: fullOrder } = await api.get(`/orders/${order.id}`);
      dispatch(clearCart());
      const items = fullOrder.order_items || fullOrder.items || [];
      if (items.length === 0) {
        toast.error('No items found in this order to reorder');
        return;
      }
      items.forEach(item => {
        dispatch(addToCart({
          menu_item_id: item.menu_item_id,
          name: item.name,
          base_price: Number(item.unit_price || item.price || 0),
          variant_id: item.variant_id,
          variant_name: item.variant_name,
          variant_price: Number(item.variant_price || 0),
          addons: item.addons?.map(a => ({
            addon_id: a.addon_id || a.id,
            name: a.name,
            price: Number(a.price || 0),
            quantity: a.quantity
          })) || [],
          quantity: item.quantity
        }));
      });
      toast.success('Items added to cart for reorder');
      navigate('/pos');
    } catch (error) {
      toast.error('Failed to fetch order details for reorder');
      console.error(error);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['orders', outletId, statusFilter, dateRange, page, isOnline],
    queryFn: async () => {
      if (IS_ELECTRON && !isOnline) {
        return hybridAPI.getOrders(outletId, statusFilter ? { status: statusFilter } : {});
      }
      const params = new URLSearchParams({
        outlet_id: outletId,
        limit: String(PAGE_LIMIT),
        page: String(page),
        sort: 'created_at',
        order: 'desc',
      });
      if (statusFilter) params.set('status', statusFilter);
      // Server-side date filtering so older orders/revenue are no longer
      // silently truncated by a single 200-row page. from+to must be sent
      // together (listOrders only applies the window when both are present).
      if (dateBounds.fromStr && dateBounds.toStr) {
        params.set('from', dateBounds.fromStr);
        params.set('to', dateBounds.toStr);
      }
      return api.get(`/orders?${params.toString()}`);
    },
    enabled: !!outletId,
    keepPreviousData: true,
    refetchInterval: isOnline ? 10000 : false,
    staleTime: isOnline ? 5000 : Infinity,
  });

  const { data: orderDetail, isLoading: isDetailLoading, isError: isDetailError } = useQuery({
    queryKey: ['orderDetail', selectedOrder?.id],
    queryFn: async () => {
      if (IS_ELECTRON && !isOnline) {
        return hybridAPI.getOrder(selectedOrder.id);
      }
      return api.get(`/orders/${selectedOrder.id}`).then(r => r.data);
    },
    enabled: !!selectedOrder?.id && isDetailOpen,
  });

  // Compose a single-line outlet address from its parts (the receipt template reads
  // outlet.address) so both the in-app preview and the printed/thermal copy show it.
  const withComposedOutlet = (o) => {
    if (!o?.outlet || o.outlet.address) return o;
    const ot = o.outlet;
    const address = [ot.address_line1, ot.address_line2, ot.city, ot.state, ot.pincode].filter(Boolean).join(', ');
    return { ...o, outlet: { ...ot, address } };
  };

  // Open the bill receipt for ANY order (dine-in / takeaway / delivery, any status).
  // List rows lack payments + full outlet header, so fetch the complete order first
  // (reuse the already-loaded detail when it's the same order).
  const openReceipt = async (order) => {
    if (!order?.id) return;
    if (orderDetail?.id === order.id) { setReceiptOrder(withComposedOutlet({ ...orderDetail })); return; }
    const t = toast.loading('Loading receipt…');
    try {
      const full = (IS_ELECTRON && !isOnline)
        ? await hybridAPI.getOrder(order.id)
        : await api.get(`/orders/${order.id}`).then(r => r.data);
      setReceiptOrder(withComposedOutlet({ ...(full || order) }));
      toast.dismiss(t);
    } catch (e) {
      toast.error(e.message || 'Could not load receipt', { id: t });
    }
  };

  // Route the print through the shared PrintService (Electron thermal → Web-USB
  // ESC/POS → browser print, which also lets the OS "Save as PDF").
  const doPrintReceipt = (order) => {
    if (!order) return;
    try {
      PrintService.printBill(order, { ...(order.outlet || {}), region: isAU ? 'AU' : 'IN' }, { paperWidth: 80, region: isAU ? 'AU' : 'IN' });
    } catch {
      toast.error('Print failed — check the printer or allow pop-ups for this site');
    }
  };

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/orders/${id}/status`, { status }),
    onSuccess: () => {
      toast.success('Status updated');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orderDetail'] });
    },
    onError: (e) => toast.error(e.message || 'Failed to update status'),
  });

  const voidMutation = useMutation({
    mutationFn: ({ id, pin, reason }) => api.post(`/orders/${id}/void`, { reason, manager_pin: pin }),
    onSuccess: () => {
      toast.success('Order voided');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setIsVoidOpen(false);
      setManagerPin('');
      setVoidError('');
    },
    onError: (e) => {
      const msg = e.message || 'Failed to void order';
      setVoidError(msg);
      toast.error(msg);
    },
  });

  const rawOrders = Array.isArray(data) ? data : (data?.data || data?.items || []);
  const meta = (!Array.isArray(data) && data?.meta) || null;

  /* Filter by search only. The server already applies the authoritative date
     window (listOrders expands from/to to UTC day bounds). Re-filtering here
     against LOCAL-midnight bounds would drop rows that legitimately fall inside
     the server's UTC window for non-UTC tenants (IST/AU), under-reporting both
     the table and the KPI/revenue totals. Trust the server's date filtering. */
  const filtered = rawOrders.filter(o => {
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      const num = String(o.order_number || '').toLowerCase();
      const tbl = String(o.table?.table_number || '').toLowerCase();
      if (!num.includes(q) && !tbl.includes(q)) return false;
    }
    return true;
  });

  /* Sort */
  const orders = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortField === 'time')   return (new Date(a.created_at) - new Date(b.created_at)) * dir;
    if (sortField === 'amount') return ((Number(a.grand_total) || 0) - (Number(b.grand_total) || 0)) * dir;
    if (sortField === 'order')  return ((a.order_number || 0) - (b.order_number || 0)) * dir;
    if (sortField === 'status') return String(a.status).localeCompare(String(b.status)) * dir;
    return 0;
  });

  /* Aggregate stats for the visible set */
  const stats = orders.reduce((acc, o) => {
    acc.count += 1;
    acc.revenue += Number(o.grand_total || 0);
    if (o.is_paid)                                     acc.paid     += 1;
    else if (o.status === 'cancelled' || o.status === 'voided') acc.cancelled += 1;
    else                                                acc.open     += 1;
    return acc;
  }, { count: 0, revenue: 0, paid: 0, open: 0, cancelled: 0 });

  /* Smart time display */
  const formatRelative = (iso) => {
    const t = new Date(iso);
    const now = new Date();
    const diffMs = now - t;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1)  return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const today  = new Date(); today.setHours(0,0,0,0);
    const ymd    = new Date(t); ymd.setHours(0,0,0,0);
    const todayDiff = (today - ymd) / 86400000;
    const tStr = t.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    if (todayDiff === 0) return `${tStr}`;
    if (todayDiff === 1) return `Yesterday ${tStr}`;
    return `${t.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} · ${tStr}`;
  };

  /* Sortable header cell */
  const SortHeader = ({ field, label, align = 'left' }) => {
    const active = sortField === field;
    const Icon = !active ? ArrowUpDown : (sortDir === 'asc' ? ArrowUp : ArrowDown);
    return (
      <th className={`px-4 py-3 text-${align} cursor-pointer select-none transition-colors`}
        onClick={() => {
          if (active) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
          else { setSortField(field); setSortDir('desc'); }
        }}>
        <span className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors"
          style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
          {label}
          <Icon className="w-3 h-3" style={{ opacity: active ? 1 : 0.4 }} />
        </span>
      </th>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in relative">
      {/* ── Page header ── */}
      <div>
        <div className="flex items-center gap-2.5 mb-1.5">
          <Receipt className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--accent)' }}>
            Order Ledger
          </span>
          <span className="w-1 h-1 rounded-full" style={{ background: 'var(--text-secondary)', opacity: 0.5 }} />
          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {dateBounds.label} · {stats.count} order{stats.count !== 1 ? 's' : ''} · {format(stats.revenue)}
          </span>
        </div>
        <h1 className="text-2xl font-black tracking-tight leading-none"
          style={{ color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
          Order history
        </h1>
        <p className="text-sm mt-1.5" style={{ color: 'var(--text-secondary)' }}>
          Every order placed at this outlet — sort, filter, search and reopen.
        </p>
      </div>

      {/* ── KPI strip (paid / open / cancelled / revenue) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Revenue',   value: format(stats.revenue),       sub: `${stats.count} order${stats.count !== 1 ? 's' : ''}`, color: '#10b981' },
          { label: 'Paid',      value: stats.paid,                   sub: 'settled',                                              color: '#3b82f6' },
          { label: 'Open',      value: stats.open,                   sub: 'in progress',                                          color: '#f59e0b' },
          { label: 'Cancelled', value: stats.cancelled,              sub: 'voided / refunded',                                    color: '#ef4444' },
        ].map(s => (
          <div key={s.label} className="relative rounded-xl px-4 py-3"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r" style={{ background: s.color, opacity: 0.85 }} />
            <div className="text-[10.5px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
              {s.label}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-black tracking-tight" style={{ color: 'var(--text-primary)', letterSpacing: '-0.025em', fontFeatureSettings: '"tnum"' }}>
                {s.value}
              </span>
              <span className="text-[10.5px]" style={{ color: 'var(--text-secondary)' }}>{s.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filter / sort bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Date range pills */}
        <div className="inline-flex p-1 rounded-lg"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          {[
            { id: 'today',     label: 'Today'      },
            { id: 'yesterday', label: 'Yesterday'  },
            { id: '7d',        label: 'Last 7 days'},
            { id: '30d',       label: 'Last 30'    },
            { id: 'all',       label: 'All time'   },
          ].map(d => {
            const active = dateRange === d.id;
            return (
              <button key={d.id} onClick={() => { setDateRange(d.id); setPage(1); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
                style={{
                  background: active ? 'var(--bg-secondary)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  boxShadow: active ? '0 1px 3px rgba(15,23,42,0.05)' : 'none',
                }}>
                {d.id === 'today' && <Calendar className="w-3 h-3" />}
                {d.label}
              </button>
            );
          })}
        </div>

        {/* Status pills */}
        <div className="inline-flex p-1 rounded-lg"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          {[
            { id: '',          label: 'All' },
            { id: 'created',   label: 'Created' },
            { id: 'ready',     label: 'Ready' },
            { id: 'paid',      label: 'Paid' },
            { id: 'cancelled', label: 'Cancelled' },
          ].map(s => {
            const active = statusFilter === s.id;
            return (
              <button key={s.id || 'all'} onClick={() => { setStatusFilter(s.id); setPage(1); }}
                className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
                style={{
                  background: active ? 'var(--bg-secondary)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  boxShadow: active ? '0 1px 3px rgba(15,23,42,0.05)' : 'none',
                }}>
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[200px] flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-secondary)' }} />
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Search order # or table…"
            className="flex-1 bg-transparent text-xs outline-none placeholder:opacity-60"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead>
            <tr className="text-xs uppercase border-b" style={{ borderColor: "var(--border)" }}>
              <SortHeader field="order"  label="Order #" />
              <th className="px-4 py-3 text-left" style={{ color: 'var(--text-secondary)' }}>Type</th>
              <th className="px-4 py-3 text-left" style={{ color: 'var(--text-secondary)' }}>Table</th>
              <th className="px-4 py-3 text-left" style={{ color: 'var(--text-secondary)' }}>Items</th>
              <SortHeader field="amount" label="Amount" />
              <SortHeader field="status" label="Status" />
              <SortHeader field="time"   label="Time" />
              <th className="px-4 py-3 text-right" style={{ color: 'var(--text-secondary)' }}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-700/50">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse"><td colSpan={8} className="px-4 py-4"><div className="h-4 rounded w-full" /></td></tr>
              ))
            ) : orders.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center" style={{ color: 'var(--text-secondary)' }}>No orders found</td></tr>
            ) : (
              orders.map(order => (
                <tr key={order.id} className="transition-colors group cursor-pointer" style={{}} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = ''} onClick={() => { setSelectedOrder(order); setIsDetailOpen(true); }}>
                  <td className="px-4 py-3 font-mono text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--accent)' }}>{formatOrderNo(order.order_number)}</td>
                  <td className="px-4 py-3 text-sm capitalize" style={{ color: 'var(--text-secondary)' }}>{order.order_type?.replace('_', ' ')}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{order.table?.table_number || '—'}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{order._count?.order_items || 0}</td>
                  <td className="px-4 py-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{format(order.grand_total || 0)}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    {(() => {
                      const shown = displayStatus(order);
                      const targets = nextStatusTargets(order.status);
                      // Terminal / no valid transition → read-only badge (never blank).
                      if (targets.length === 0) {
                        return <span className={STATUS_STYLES[shown] || 'badge-neutral'}>{labelFor(shown)}</span>;
                      }
                      // Current status is always the (disabled) selected option, so the
                      // control renders correctly even for legacy statuses; the user can
                      // only pick a backend-accepted next state. The DROPDOWN value stays
                      // bound to the real order.status (the only thing PATCH accepts);
                      // only the visible label uses the derived kitchen_stage.
                      return (
                        <select
                          className={`${STATUS_STYLES[shown] || 'badge-neutral'} bg-transparent border-0 font-medium cursor-pointer focus:ring-0 appearance-none text-sm`}
                          value={order.status}
                          onChange={e => { if (e.target.value !== order.status) updateStatusMutation.mutate({ id: order.id, status: e.target.value }); }}
                        >
                          <option value={order.status} disabled>{labelFor(shown)}</option>
                          {targets.map(s => <option key={s} value={s}>{labelFor(s)}</option>)}
                        </select>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{formatRelative(order.created_at)}</td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); handleReorder(order); }}
                        className="p-1.5 rounded-lg btn-secondary" title="Reorder"><RefreshCw className="w-4 h-4" /></button>
                      <button onClick={(e) => { e.stopPropagation(); openReceipt(order); }}
                        className="p-1.5 rounded-lg btn-secondary" title="Print Receipt"><Receipt className="w-4 h-4" /></button>
                      <button onClick={() => { setSelectedOrder(order); setIsDetailOpen(true); }}
                        className="p-1.5 rounded-lg btn-secondary" title="View Order"><Eye className="w-4 h-4" /></button>
                      <button onClick={() => { setSelectedOrder(order); setIsVoidOpen(true); }}
                        className="p-1.5 rounded-lg btn-secondary" title="Void Order"><Ban className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination — driven by backend meta (total / totalPages / hasNextPage) */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Page {meta.page} of {meta.totalPages} · {meta.total} order{meta.total !== 1 ? 's' : ''} in {dateBounds.label.toLowerCase()}
          </span>
          <div className="flex gap-2">
            <button
              className="px-3 py-1.5 rounded-lg text-xs font-semibold btn-secondary disabled:opacity-40"
              disabled={!meta.hasPrevPage || isLoading}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >Previous</button>
            <button
              className="px-3 py-1.5 rounded-lg text-xs font-semibold btn-secondary disabled:opacity-40"
              disabled={!meta.hasNextPage || isLoading}
              onClick={() => setPage(p => p + 1)}
            >Next</button>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title={`Order ${formatOrderNo(selectedOrder?.order_number)}`} size="lg">
        {selectedOrder && (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Type: <span className="capitalize" style={{ color: 'var(--text-primary)' }}>{selectedOrder.order_type?.replace('_', ' ')}</span></p>
                {selectedOrder.table?.table_number && <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Table: <span style={{ color: 'var(--text-primary)' }}>T{selectedOrder.table.table_number}</span></p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => openReceipt(orderDetail || selectedOrder)} className="btn-secondary py-1.5 px-3 h-auto text-xs flex items-center gap-1.5">
                  <Receipt className="w-3 h-3"/> Print Receipt
                </button>
                <button onClick={() => handleReorder(orderDetail || selectedOrder)} className="btn-success py-1.5 px-3 h-auto text-xs flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3"/> Reorder Items
                </button>
                <span className={STATUS_STYLES[displayStatus(selectedOrder)] || 'badge-neutral'}>{labelFor(displayStatus(selectedOrder))}</span>
              </div>
            </div>

            {/* Items */}
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid var(--border)` }}>
              <div className="px-4 py-2 flex items-center gap-2" style={{ borderBottom: `1px solid var(--border)`, background: 'var(--bg-hover)' }}>
                <ShoppingBag className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Order Items</span>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {(() => {
                  const items = orderDetail?.order_items || orderDetail?.items || [];
                  if (items.length > 0) {
                    return items.map((item, i) => (
                      <div key={i} className="px-4 py-3 flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{item.menu_item?.name || item.name || 'Item'}</p>
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Qty: {item.quantity}</p>
                        </div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{format(item.item_total || item.total_price || item.price || 0)}</p>
                      </div>
                    ));
                  }
                  // Distinguish loading vs errored vs loaded-but-empty so the
                  // modal never shows a perpetual "Loading items..." for orders
                  // that genuinely have zero items.
                  if (isDetailLoading) {
                    return <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Loading items...</div>;
                  }
                  if (isDetailError) {
                    return <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--danger)' }}>Failed to load items</div>;
                  }
                  return <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>No items</div>;
                })()}
              </div>
            </div>

            {/* Totals */}
            <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--bg-hover)' }}>
              <div className="flex justify-between text-sm"><span style={{ color: 'var(--text-secondary)' }}>Subtotal</span><span style={{ color: 'var(--text-primary)' }}>{format(selectedOrder.subtotal || selectedOrder.sub_total || 0)}</span></div>
              <div className="flex justify-between text-sm"><span style={{ color: 'var(--text-secondary)' }}>{isAU ? 'GST (incl.)' : 'Tax'}</span><span style={{ color: 'var(--text-primary)' }}>{format(selectedOrder.total_tax || 0)}</span></div>
              {selectedOrder.discount_amount > 0 && <div className="flex justify-between text-sm"><span style={{ color: 'var(--text-secondary)' }}>Discount</span><span style={{ color: 'var(--success)' }}>-{format(selectedOrder.discount_amount)}</span></div>}
              <div className="flex justify-between text-base font-bold pt-2" style={{ borderTop: `1px solid var(--border)` }}>
                <span style={{ color: 'var(--text-primary)' }}>Grand Total</span><span style={{ color: 'var(--accent)' }}>{format(selectedOrder.grand_total || 0)}</span>
              </div>
            </div>

            {/* Quick Status Change — only backend-accepted next states */}
            {nextStatusTargets(selectedOrder.status).length > 0 && (
              <div>
                <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>Quick Status Update</p>
                <div className="flex gap-2 flex-wrap">
                  <span className={`${STATUS_STYLES[displayStatus(selectedOrder)] || 'badge-neutral'} self-center`}>{labelFor(displayStatus(selectedOrder))}</span>
                  {nextStatusTargets(selectedOrder.status).map(s => (
                    <button key={s} disabled={updateStatusMutation.isPending}
                      onClick={() => updateStatusMutation.mutate({ id: selectedOrder.id, status: s })}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all tab-btn"
                    >{labelFor(s)}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Bill receipt preview — reachable for any order/channel from the row action or detail modal */}
      <BillPreviewModal
        isOpen={!!receiptOrder}
        order={receiptOrder}
        onClose={() => setReceiptOrder(null)}
        onPrint={() => doPrintReceipt(receiptOrder)}
      />

      {/* Void Confirm */}
      <Modal isOpen={isVoidOpen} onClose={() => setIsVoidOpen(false)} title="Void Order Verification" size="sm">
         <div className="space-y-4">
            <div className="p-4 rounded-xl text-center" style={{ background: 'color-mix(in srgb, var(--danger) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)' }}>
               <Ban className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--danger)' }}/>
               <p className="text-sm" style={{ color: 'var(--text-primary)' }}>Are you sure you want to void order <strong>{formatOrderNo(selectedOrder?.order_number)}</strong>?</p>
            </div>
            
            <div>
               <label className="label">Manager PIN*</label>
               <input type="password" value={managerPin} onChange={e=>setManagerPin(e.target.value)} 
                  className="input text-center text-2xl tracking-[1em] py-3 h-14" maxLength={4} autoFocus placeholder="XXXX" />
            </div>

            <div>
               <label className="label">Reason for Void*</label>
               <textarea value={voidReason} onChange={e=>{ setVoidReason(e.target.value); if (voidError) setVoidError(''); }}
                  className="input h-20 text-sm py-2" placeholder="Explain why this order is being voided..." required />
               {voidReason.trim().length > 0 && voidReason.trim().length < 3 && (
                  <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>Reason must be at least 3 characters.</p>
               )}
            </div>

            {voidError && (
               <p className="text-xs" style={{ color: 'var(--danger)' }}>{voidError}</p>
            )}

            <div className="flex gap-3 pt-2">
               <button onClick={() => { setIsVoidOpen(false); setVoidError(''); }} className="btn-surface flex-1">Keep Order</button>
               <button
                  onClick={() => { setVoidError(''); voidMutation.mutate({ id: selectedOrder.id, pin: managerPin, reason: voidReason.trim() }); }}
                  disabled={!managerPin || voidReason.trim().length < 3 || voidMutation.isPending}
                  className="btn-danger flex-1"
               >
                  {voidMutation.isPending ? 'Voiding...' : 'Confirm Void'}
               </button>
            </div>
         </div>
      </Modal>
    </div>
  );
}
