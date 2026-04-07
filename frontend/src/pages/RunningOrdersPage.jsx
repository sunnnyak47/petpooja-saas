import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import CancelOrderModal from '../components/POS/CancelOrderModal';
import BillPreviewModal from '../components/POS/BillPreviewModal';
import { 
  Clock, Receipt, Ban, CreditCard, Plus, ArrowRight, 
  Utensils, ShoppingBag, Globe, Timer, AlertCircle 
} from 'lucide-react';
import { useState, useEffect } from 'react';

const STATUS_BADGES = {
  created: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  held: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  billed: 'bg-purple-500/10 text-purple-400 border-purple-500/20'
};

const TYPE_ICONS = {
  dine_in: Utensils,
  takeaway: ShoppingBag,
  delivery: Globe,
  online: Globe
};

export default function RunningOrdersPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [filter, setFilter] = useState('all');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Fetch active orders
  const { data: orders, isLoading } = useQuery({
    queryKey: ['running-orders', outletId],
    queryFn: () => api.get(`/orders?outlet_id=${outletId}&status=created,held,billed&limit=100`).then(r => r.data),
    enabled: !!outletId,
    refetchInterval: 5000, // Refresh every 5s for real-time feel
  });

  const activeOrders = Array.isArray(orders) ? orders : (orders?.items || []);

  const filteredOrders = activeOrders.filter(o => 
    filter === 'all' ? true : o.order_type === filter
  );

  const billMutation = useMutation({
    mutationFn: (id) => api.post(`/orders/${id}/bill`),
    onSuccess: (res) => {
      toast.success('Bill Generated Successfully');
      queryClient.invalidateQueries({ queryKey: ['running-orders'] });
      setSelectedOrder(res.data);
      setShowBillModal(true);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to generate bill')
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }) => api.post(`/orders/${id}/cancel`, { reason }),
    onSuccess: () => {
      toast.success('Order Cancelled');
      queryClient.invalidateQueries({ queryKey: ['running-orders'] });
      setShowCancelModal(false);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to cancel order')
  });

  const formatTime = (date) => {
    const diff = Math.floor((new Date() - new Date(date)) / 60000);
    if (diff < 1) return 'Just now';
    return `${diff}m ago`;
  };

  if (isLoading) return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-500"></div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Clock className="w-7 h-7 text-brand-400" />
            Running Orders
          </h1>
          <p className="text-surface-400 text-sm mt-1">Manage all active kitchen and dining sessions</p>
        </div>

        <div className="flex gap-1 bg-surface-800/50 p-1 rounded-xl border border-surface-700/50">
          {['all', 'dine_in', 'takeaway', 'delivery'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                filter === f ? 'bg-brand-500 text-white shadow-lg' : 'text-surface-400 hover:text-white'
              }`}
            >
              {f.replace('_', ' ').toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="h-[50vh] flex flex-col items-center justify-center bg-surface-800/20 rounded-3xl border border-dashed border-surface-700">
          <div className="w-16 h-16 bg-surface-800 rounded-2xl flex items-center justify-center mb-4">
            <ShoppingBag className="w-8 h-8 text-surface-500" />
          </div>
          <h3 className="text-white font-semibold">No Running Orders</h3>
          <p className="text-surface-500 text-sm mt-1">New orders will appear here automatically</p>
          <button onClick={() => navigate('/pos')} className="mt-6 btn-brand py-2.5 px-6 rounded-xl">
            Go to POS Terminal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredOrders.map(order => {
            const Icon = TYPE_ICONS[order.order_type] || ShoppingBag;
            return (
              <div 
                key={order.id} 
                className={`group relative bg-surface-800/40 border border-surface-700/50 rounded-2xl p-4 transition-all duration-300 hover:border-brand-500/50 hover:bg-surface-800/60 shadow-lg ${
                  order.status === 'billed' ? 'ring-1 ring-purple-500/30' : ''
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-surface-700/50 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-brand-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-bold font-mono tracking-tight text-sm">
                        #{order.order_number?.split('-').pop()}
                      </h3>
                      <p className="text-xs text-surface-400 font-medium">
                        {order.table ? `Table ${order.table.table_number}` : order.customer?.full_name || 'Walking Customer'}
                      </p>
                    </div>
                  </div>
                  <div className={`px-2 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${STATUS_BADGES[order.status]}`}>
                    {order.status}
                  </div>
                </div>

                {/* Body */}
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-xs">
                    <span className="text-surface-500">Items Count:</span>
                    <span className="text-surface-200 font-semibold">{order._count?.order_items || 0} items</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-surface-500">Wait Time:</span>
                    <span className="text-brand-400 flex items-center gap-1">
                      <Timer className="w-3 h-3" />
                      {formatTime(order.created_at)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-t border-surface-700/30 mt-2">
                    <span className="text-xs text-surface-500">Amount Due:</span>
                    <span className="text-lg font-bold text-white">₹{Number(order.grand_total).toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => navigate(`/pos?order_id=${order.id}`)}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-surface-700/50 text-surface-200 hover:bg-brand-500 hover:text-white transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" /> KOT
                  </button>
                  
                  {order.status !== 'billed' ? (
                    <button 
                      onClick={() => billMutation.mutate(order.id)}
                      disabled={billMutation.isPending}
                      className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-white text-black hover:bg-brand-400 transition-all"
                    >
                      <Receipt className="w-3.5 h-3.5" /> Bill
                    </button>
                  ) : (
                    <button 
                      onClick={() => { setSelectedOrder(order); setShowBillModal(true); }}
                      className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-purple-500 text-white hover:bg-purple-600 transition-all"
                    >
                      <Eye className="w-3.5 h-3.5" /> Settle
                    </button>
                  )}

                  <button 
                    onClick={() => { setSelectedOrder(order); setShowCancelModal(true); }}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all col-span-2"
                  >
                    <Ban className="w-3.5 h-3.5" /> Cancel Order
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {selectedOrder && (
        <>
          <CancelOrderModal 
            isOpen={showCancelModal}
            onClose={() => setShowCancelModal(false)}
            onConfirm={(reason) => cancelMutation.mutate({ id: selectedOrder.id, reason })}
            orderNumber={selectedOrder.order_number}
          />
          
          <BillPreviewModal 
            isOpen={showBillModal}
            onClose={() => setShowBillModal(false)}
            order={selectedOrder}
            onPrint={() => toast('Direct print not configured for browser')}
            onSettle={() => navigate(`/pos?order_id=${selectedOrder.id}&pay=true`)}
          />
        </>
      )}
    </div>
  );
}

// Simple Eye icon since lucide-react 'Eye' was missing in imports but described
function Eye({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
