import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import { useCurrency } from '../hooks/useCurrency';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { Clock, Eye, Ban, Loader, ShoppingBag, IndianRupee, Receipt, RefreshCw } from 'lucide-react';
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

export default function OrdersPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id;
  const { format, locale } = useCurrency();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isVoidOpen, setIsVoidOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [managerPin, setManagerPin] = useState('');
  const [voidReason, setVoidReason] = useState('Voided from dashboard');
  const dispatch = useDispatch();
  const navigate = useNavigate();

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
    queryKey: ['orders', outletId, statusFilter],
    queryFn: () => api.get(`/orders?outlet_id=${outletId}&limit=50${statusFilter ? `&status=${statusFilter}` : ''}`).then(r => r.data),
    enabled: !!outletId,
    refetchInterval: 10000,
  });

  const { data: orderDetail } = useQuery({
    queryKey: ['orderDetail', selectedOrder?.id],
    queryFn: () => api.get(`/orders/${selectedOrder.id}`).then(r => r.data),
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
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to void order'),
  });

  const orders = data?.items || data || [];

  return (
    <div className="space-y-4 animate-fade-in relative">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Orders</h1>
        <div className="flex gap-2">
          {['', 'created', 'confirmed', 'ready', 'paid', 'cancelled'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === s ? 'tab-btn-active' : 'tab-btn'}`}>
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead>
            <tr className="text-xs uppercase border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              <th className="px-4 py-3 text-left">Order #</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Table</th>
              <th className="px-4 py-3 text-left">Items</th>
              <th className="px-4 py-3 text-left">Amount</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Time</th>
              <th className="px-4 py-3 text-right">Actions</th>
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
                  <td className="px-4 py-3 font-mono text-sm font-semibold" style={{ color: 'var(--accent)' }}>{formatOrderNo(order.order_number)}</td>
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
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(order.created_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</td>
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
              <div className="flex justify-between text-sm"><span style={{ color: 'var(--text-secondary)' }}>Tax</span><span style={{ color: 'var(--text-primary)' }}>{format(selectedOrder.total_tax || 0)}</span></div>
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
