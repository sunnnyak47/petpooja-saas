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

const STATUS_STYLES = {
  created: 'badge-info', confirmed: 'badge-info', preparing: 'badge-warning',
  ready: 'badge-success', served: 'badge-success', paid: 'badge-success',
  cancelled: 'badge-danger', voided: 'badge-danger',
};

const STATUS_FLOW = ['created', 'confirmed', 'preparing', 'ready', 'served', 'paid'];

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electron;

export default function OrdersPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id;
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
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isVoidOpen, setIsVoidOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [managerPin, setManagerPin] = useState('');
  const [voidReason, setVoidReason] = useState('Voided from dashboard');
  const dispatch = useDispatch();
  const navigate = useNavigate();

  /* Date-range bounds (local TZ) */
  const dateBounds = (() => {
    const now = new Date();
    const startOf = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
    const endOf   = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
    if (dateRange === 'today') {
      return { from: startOf(now), to: endOf(now), label: 'Today' };
    }
    if (dateRange === 'yesterday') {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { from: startOf(y), to: endOf(y), label: 'Yesterday' };
    }
    if (dateRange === '7d') {
      const s = new Date(now); s.setDate(s.getDate() - 6); return { from: startOf(s), to: endOf(now), label: 'Last 7 days' };
    }
    if (dateRange === '30d') {
      const s = new Date(now); s.setDate(s.getDate() - 29); return { from: startOf(s), to: endOf(now), label: 'Last 30 days' };
    }
    return { from: null, to: null, label: 'All time' };
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
    queryKey: ['orders', outletId, statusFilter, isOnline],
    queryFn: async () => {
      if (IS_ELECTRON && !isOnline) {
        return hybridAPI.getOrders(outletId, statusFilter ? { status: statusFilter } : {});
      }
      return api.get(`/orders?outlet_id=${outletId}&limit=200&sort=created_at&order=desc${statusFilter ? `&status=${statusFilter}` : ''}`).then(r => r.data);
    },
    enabled: !!outletId,
    refetchInterval: isOnline ? 10000 : false,
    staleTime: isOnline ? 5000 : Infinity,
  });

  const { data: orderDetail } = useQuery({
    queryKey: ['orderDetail', selectedOrder?.id],
    queryFn: async () => {
      if (IS_ELECTRON && !isOnline) {
        return hybridAPI.getOrder(selectedOrder.id);
      }
      return api.get(`/orders/${selectedOrder.id}`).then(r => r.data);
    },
    enabled: !!selectedOrder?.id && isDetailOpen,
  });

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
    },
    onError: (e) => toast.error(e.message || 'Failed to void order'),
  });

  const rawOrders = Array.isArray(data) ? data : (data?.data || data?.items || []);

  /* Filter by date + search */
  const filtered = rawOrders.filter(o => {
    if (dateBounds.from && dateBounds.to) {
      const t = new Date(o.created_at);
      if (t < dateBounds.from || t > dateBounds.to) return false;
    }
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
              <button key={d.id} onClick={() => setDateRange(d.id)}
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
              <button key={s.id || 'all'} onClick={() => setStatusFilter(s.id)}
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
                    <select
                      className={`${STATUS_STYLES[order.status] || 'badge-neutral'} bg-transparent border-0 font-medium cursor-pointer focus:ring-0 appearance-none text-sm`}
                      value={order.status}
                      onChange={e => updateStatusMutation.mutate({ id: order.id, status: e.target.value })}
                    >
                      {STATUS_FLOW.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{formatRelative(order.created_at)}</td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); handleReorder(order); }}
                        className="p-1.5 rounded-lg btn-secondary" title="Reorder"><RefreshCw className="w-4 h-4" /></button>
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
                <button onClick={() => handleReorder(orderDetail || selectedOrder)} className="btn-success py-1.5 px-3 h-auto text-xs flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3"/> Reorder Items
                </button>
                <span className={STATUS_STYLES[selectedOrder.status] || 'badge-neutral'}>{selectedOrder.status}</span>
              </div>
            </div>

            {/* Items */}
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid var(--border)` }}>
              <div className="px-4 py-2 flex items-center gap-2" style={{ borderBottom: `1px solid var(--border)`, background: 'var(--bg-hover)' }}>
                <ShoppingBag className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Order Items</span>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {(orderDetail?.order_items || orderDetail?.items || []).length > 0
                  ? (orderDetail?.order_items || orderDetail?.items || []).map((item, i) => (
                      <div key={i} className="px-4 py-3 flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{item.menu_item?.name || item.name || 'Item'}</p>
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Qty: {item.quantity}</p>
                        </div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{format(item.item_total || item.total_price || item.price || 0)}</p>
                      </div>
                    ))
                  : <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Loading items...</div>
                }
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

            {/* Quick Status Change */}
            <div>
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>Quick Status Update</p>
              <div className="flex gap-2 flex-wrap">
                {STATUS_FLOW.map(s => (
                  <button key={s} disabled={s === selectedOrder.status || updateStatusMutation.isPending}
                    onClick={() => updateStatusMutation.mutate({ id: selectedOrder.id, status: s })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${s === selectedOrder.status ? 'tab-btn-active' : 'tab-btn'}`}
                  >{s.charAt(0).toUpperCase() + s.slice(1)}</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

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
               <textarea value={voidReason} onChange={e=>setVoidReason(e.target.value)}
                  className="input h-20 text-sm py-2" placeholder="Explain why this order is being voided..." required />
            </div>

            <div className="flex gap-3 pt-2">
               <button onClick={() => setIsVoidOpen(false)} className="btn-surface flex-1">Keep Order</button>
               <button 
                  onClick={() => voidMutation.mutate({ id: selectedOrder.id, pin: managerPin, reason: voidReason })}
                  disabled={!managerPin || voidMutation.isPending}
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
