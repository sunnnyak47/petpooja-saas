import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { 
  ShoppingBag, Globe, CheckCircle2, XCircle, 
  Clock, MapPin, Phone, AlertCircle, 
  Volume2, VolumeX, Zap, ZapOff, 
  Download, History, Search, Filter,
  ChevronRight, Timer
} from 'lucide-react';
import { io } from 'socket.io-client';

export default function OnlineOrdersPage() {
  const { user, token } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id;
  const queryClient = useQueryClient();
  const socketRef = useRef(null);

  // Settings
  const [autoAccept, setAutoAccept] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [activeView, setActiveView] = useState('live'); // live | history
  const [platformFilter, setPlatformFilter] = useState('all'); // all | zomato | swiggy

  // Audio refs
  const notificationSound = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2861/2861-preview.mp3'));

  // Queries
  const { data: onlineOrders, isLoading } = useQuery({
    queryKey: ['online-orders', outletId],
    queryFn: () => api.get(`/integrations/online-orders/active?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId && activeView === 'live',
    refetchInterval: 30000 // fallback
  });

  const { data: stats } = useQuery({
    queryKey: ['online-orders-stats', outletId],
    queryFn: () => api.get(`/integrations/online-orders/stats?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId
  });

  // Socket.io Integration
  useEffect(() => {
    if (!outletId || !token) return;

    socketRef.current = io(import.meta.env.VITE_API_URL || 'http://localhost:5001', {
      auth: { token },
      path: '/socket.io'
    });

    const ordersNamespace = io(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/orders`, {
      auth: { token }
    });

    ordersNamespace.on('connect', () => {
       ordersNamespace.emit('join_outlet', outletId);
    });

    ordersNamespace.on('new_online_order', (data) => {
       if (soundEnabled) notificationSound.current.play().catch(() => {});
       toast.success(`New ${data.platform.toUpperCase()} Order Received!`, {
          icon: '🥡',
          duration: 5000
       });
       queryClient.invalidateQueries({ queryKey: ['online-orders'] });
       
       // Browser Notification
       if (Notification.permission === 'granted') {
          new Notification(`New Order from ${data.platform}`, {
             body: `Order #${data.order_number || data.external_id}`,
             icon: '/logo.png'
          });
       }
    });

    return () => {
      ordersNamespace.disconnect();
    };
  }, [outletId, token, soundEnabled]);

  // Mutations
  const acceptMutation = useMutation({
    mutationFn: ({ id, prepTime }) => api.post(`/integrations/online-orders/${id}/accept`, { prep_time: prepTime }),
    onSuccess: () => {
      toast.success('Order Accepted');
      queryClient.invalidateQueries({ queryKey: ['online-orders'] });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) => api.post(`/integrations/online-orders/${id}/reject`, { reason }),
    onSuccess: () => {
      toast.error('Order Rejected');
      queryClient.invalidateQueries({ queryKey: ['online-orders'] });
    }
  });

  const readyMutation = useMutation({
    mutationFn: (id) => api.post(`/integrations/online-orders/${id}/ready`),
    onSuccess: () => {
      toast.success('Order Marked Ready');
      queryClient.invalidateQueries({ queryKey: ['online-orders'] });
    }
  });

  // Kanban Columns
  const columns = useMemo(() => {
    const orders = onlineOrders || [];
    const filtered = platformFilter === 'all' ? orders : orders.filter(o => o.aggregator === platformFilter);
    
    return {
      new: filtered.filter(o => o.status === 'created'),
      preparing: filtered.filter(o => o.status === 'confirmed' || o.status === 'preparing'),
      ready: filtered.filter(o => o.status === 'ready')
    };
  }, [onlineOrders, platformFilter]);

  if (activeView === 'history') {
     return <OnlineOrderHistory outletId={outletId} onBack={() => setActiveView('live')} />;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] animate-fade-in">
      {/* Header Bar */}
      <div className="bg-surface-900 border border-surface-800 p-4 rounded-3xl mb-6 flex items-center justify-between shadow-sm">
         <div className="flex items-center gap-6">
            <h1 className="text-xl font-black text-white flex items-center gap-3">
               <Globe className="w-6 h-6 text-brand-400"/> Online Orders
               {columns.new.length > 0 && (
                  <span className="flex h-3 w-3 relative">
                     <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                     <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
               )}
            </h1>
            
            <div className="flex bg-surface-950 p-1 rounded-xl shadow-inner gap-1">
               {['all', 'zomato', 'swiggy'].map(p => (
                  <button key={p} onClick={() => setPlatformFilter(p)}
                     className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-widest ${platformFilter === p ? 'bg-surface-800 text-white shadow-lg' : 'text-surface-500 hover:text-surface-300'}`}>
                     {p}
                  </button>
               ))}
            </div>
         </div>

         <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl border transition-all ${autoAccept ? 'bg-success-500/10 border-success-500/30 text-success-400' : 'bg-surface-950 border-surface-800 text-surface-500'}`}>
               {autoAccept ? <Zap className="w-4 h-4"/> : <ZapOff className="w-4 h-4"/>}
               <span className="text-xs font-black uppercase tracking-widest">Auto-Accept</span>
               <button onClick={() => {
                  setAutoAccept(!autoAccept);
                  if(!autoAccept) toast.success('Auto-accept enabled (20m default)');
               }} className={`w-10 h-5 rounded-full relative transition-colors ${autoAccept ? 'bg-success-500' : 'bg-surface-700'}`}>
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${autoAccept ? 'translate-x-6' : 'translate-x-1'}`}/>
               </button>
            </div>

            <button onClick={() => setSoundEnabled(!soundEnabled)} className="p-2.5 bg-surface-950 border border-surface-800 rounded-xl text-surface-400 hover:text-white transition-all">
               {soundEnabled ? <Volume2 className="w-5 h-5"/> : <VolumeX className="w-5 h-5 text-red-400"/>}
            </button>

            <button onClick={() => setActiveView('history')} className="btn-surface font-bold gap-2">
               <History className="w-4 h-4"/> History
            </button>
         </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
         {/* NEW COLUMN */}
         <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-2">
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"/>
                  <h3 className="font-black text-white uppercase tracking-widest text-sm">New Request ({columns.new.length})</h3>
               </div>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 space-y-4 scrollbar-hide">
               {columns.new.map(order => (
                  <OrderCard key={order.id} order={order} onAccept={(prep) => acceptMutation.mutate({ id: order.id, prepTime: prep })} onReject={() => {
                     const r = prompt('Reason for rejection?');
                     if(r) rejectMutation.mutate({ id: order.id, reason: r });
                  }} />
               ))}
               {columns.new.length === 0 && (
                  <div className="py-20 text-center text-surface-600 italic border-2 border-dashed border-surface-800 rounded-3xl">
                     Awaiting new orders...
                  </div>
               )}
            </div>
         </div>

         {/* PREPARING COLUMN */}
         <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-2">
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500"/>
                  <h3 className="font-black text-white uppercase tracking-widest text-sm">Preparing ({columns.preparing.length})</h3>
               </div>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 space-y-4 scrollbar-hide">
               {columns.preparing.map(order => (
                  <OrderCard key={order.id} order={order} onReady={() => readyMutation.mutate(order.id)} />
               ))}
            </div>
         </div>

         {/* READY/PICKUP COLUMN */}
         <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-2">
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-success-500"/>
                  <h3 className="font-black text-white uppercase tracking-widest text-sm">Ready / Out ({columns.ready.length})</h3>
               </div>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 space-y-4 scrollbar-hide">
               {columns.ready.map(order => (
                  <OrderCard key={order.id} order={order} readonly />
               ))}
            </div>
         </div>
      </div>

      {/* Bottom Stats Footer */}
      <div className="mt-6 bg-surface-950 border border-surface-800 p-4 rounded-3xl grid grid-cols-2 lg:grid-cols-4 gap-6">
         <div>
            <p className="text-[10px] text-surface-500 font-black uppercase tracking-widest mb-1">Today's Volume</p>
            <p className="text-xl font-black text-white">{stats?.total_orders || 0} <span className="text-xs text-surface-600 font-medium tracking-normal opacity-60">Orders</span></p>
         </div>
         <div>
            <p className="text-[10px] text-surface-500 font-black uppercase tracking-widest mb-1">Total Revenue</p>
            <p className="text-xl font-black text-brand-400">₹{Number(stats?.total_revenue || 0).toLocaleString()}</p>
         </div>
         <div className="border-l border-surface-800 pl-6">
            <p className="text-[10px] text-surface-500 font-black uppercase tracking-widest mb-1">Zomato</p>
            <p className="text-sm font-bold text-white">₹{Number(stats?.by_platform?.zomato?.revenue || 0).toLocaleString()}</p>
            <p className="text-[9px] text-red-400 font-bold uppercase tracking-tighter">Est. Comm: ₹{Math.round((stats?.by_platform?.zomato?.revenue || 0) * 0.15).toLocaleString()}</p>
         </div>
         <div className="border-l border-surface-800 pl-6">
            <p className="text-[10px] text-surface-500 font-black uppercase tracking-widest mb-1">Swiggy</p>
            <p className="text-sm font-bold text-white">₹{Number(stats?.by_platform?.swiggy?.revenue || 0).toLocaleString()}</p>
            <p className="text-[9px] text-orange-400 font-bold uppercase tracking-tighter">Est. Comm: ₹{Math.round((stats?.by_platform?.swiggy?.revenue || 0) * 0.18).toLocaleString()}</p>
         </div>
      </div>
    </div>
  );
}

function OrderCard({ order, onAccept, onReject, onReady, readonly }) {
  const platformColor = order.aggregator === 'zomato' ? 'bg-red-500' : (order.aggregator === 'swiggy' ? 'bg-orange-500' : 'bg-brand-500');
  const [selectedPrep, setSelectedPrep] = useState(20);

  return (
    <div className="bg-surface-900 border border-surface-800 rounded-3xl p-5 hover:border-surface-700 transition-all shadow-lg group relative overflow-hidden">
       {/* Top Status Bar */}
       <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
             <div className={`${platformColor} px-2 py-0.5 rounded text-[10px] font-black text-white uppercase tracking-widest`}>
                {order.aggregator}
             </div>
             <span className="text-xs font-mono font-bold text-surface-400">#{order.aggregator_order_id?.slice(-8).toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-surface-500 bg-surface-950 px-2 py-1 rounded-lg">
             <Timer className="w-3.5 h-3.5 text-brand-400"/>
             <span>{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
       </div>

       {/* Item List */}
       <div className="space-y-2 mb-4">
          {order.order_items?.map((item, idx) => (
             <div key={idx} className="flex justify-between items-start text-sm">
                <div className="flex items-start gap-2">
                   <div className="mt-1 w-3 h-3 rounded-sm border border-surface-700 flex items-center justify-center p-0.5">
                      <div className={`w-full h-full rounded-full ${item.is_veg ? 'bg-success-500' : 'bg-red-500'}`}/>
                   </div>
                   <span className="text-white font-bold leading-tight">{item.quantity} × {item.name}</span>
                </div>
                <span className="text-surface-400 font-mono text-xs">₹{item.item_total}</span>
             </div>
          ))}
       </div>

       {/* Address / Meta */}
       <div className="pt-4 border-t border-surface-800 mb-5 relative">
          <div className="flex items-center gap-2 text-xs text-surface-500 mb-2">
             <MapPin className="w-3.5 h-3.5 text-surface-600 shrink-0"/>
             <span className="truncate">{order.delivery_address || 'Delivery order'}</span>
          </div>
          <div className="flex items-center justify-between">
             <span className="text-xs font-black text-surface-400 uppercase tracking-widest">Grand Total</span>
             <span className="text-lg font-black text-white tracking-tight">₹{order.grand_total}</span>
          </div>
       </div>

       {/* Actions */}
       {!readonly && (
          <div className="space-y-3">
             {order.status === 'created' ? (
                <>
                   <div className="flex bg-surface-950 p-1 rounded-xl shadow-inner gap-1">
                      {[15, 20, 30, 45].map(t => (
                         <button key={t} onClick={() => setSelectedPrep(t)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${selectedPrep === t ? 'bg-brand-500 text-white shadow-lg' : 'text-surface-500 hover:text-surface-300'}`}>
                            {t}m
                         </button>
                      ))}
                   </div>
                   <div className="flex gap-2">
                      <button onClick={() => onAccept(selectedPrep)} className="flex-1 btn-brand bg-success-600 hover:bg-success-500 border-success-600 font-black py-2.5 rounded-2xl flex items-center justify-center gap-2">
                         <CheckCircle2 className="w-4 h-4"/> Accept
                      </button>
                      <button onClick={() => onReject()} className="btn-surface text-red-400 font-bold px-4 hover:bg-red-500/10 border-red-500/20">
                         <XCircle className="w-5 h-5"/>
                      </button>
                   </div>
                </>
             ) : order.status === 'confirmed' || order.status === 'preparing' ? (
                <button onClick={onReady} className="w-full btn-brand py-3 font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-brand-500/20">
                   Mark Order Ready <ChevronRight className="w-4 h-4"/>
                </button>
             ) : null}
          </div>
       )}

       {/* Corner Aggregator Icon */}
       <div className={`absolute top-0 right-0 w-24 h-24 ${platformColor} opacity-[0.03] translate-x-1/2 -translate-y-1/2 rounded-full`}/>
    </div>
  );
}

function OnlineOrderHistory({ outletId, onBack }) {
   const [filters, setFilters] = useState({
      from: new Date().toISOString().split('T')[0],
      to: new Date().toISOString().split('T')[0],
      aggregator: 'all'
   });

   const { data: history, isLoading } = useQuery({
      queryKey: ['online-order-history', outletId, filters],
      queryFn: () => api.get(`/integrations/online-orders/history?outlet_id=${outletId}&from=${filters.from}&to=${filters.to}${filters.aggregator !== 'all' ? `&aggregator=${filters.aggregator}` : ''}`).then(r => r.data),
      enabled: !!outletId
   });

   return (
      <div className="space-y-6 animate-fade-in">
         <div className="flex justify-between items-center bg-surface-900 p-4 rounded-3xl border border-surface-800">
            <button onClick={onBack} className="btn-surface font-bold gap-2">Back to Dashboard</button>
            <div className="flex items-center gap-4">
               <input type="date" className="input bg-surface-950 py-1.5" value={filters.from} onChange={e=>setFilters({...filters, from: e.target.value})} />
               <input type="date" className="input bg-surface-950 py-1.5" value={filters.to} onChange={e=>setFilters({...filters, to: e.target.value})} />
               <select className="input bg-surface-950 py-1.5" value={filters.aggregator} onChange={e=>setFilters({...filters, aggregator: e.target.value})}>
                  <option value="all">All Channels</option>
                  <option value="zomato">Zomato</option>
                  <option value="swiggy">Swiggy</option>
               </select>
            </div>
         </div>

         <div className="bg-surface-900 border border-surface-800 rounded-3xl overflow-hidden shadow-xl">
            <table className="w-full text-left">
               <thead className="bg-surface-950/50 text-surface-500 text-[10px] font-black uppercase tracking-[0.1em] border-b border-surface-800">
                  <tr>
                     <th className="p-4">Time</th>
                     <th className="p-4">Platform</th>
                     <th className="p-4">ID</th>
                     <th className="p-4">Customer</th>
                     <th className="p-4">Amount</th>
                     <th className="p-4">Status</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-surface-800/40 text-sm">
                  {history?.map(order => (
                     <tr key={order.id} className="hover:bg-surface-800/30 transition-colors">
                        <td className="p-4 text-surface-400">{new Date(order.created_at).toLocaleTimeString()}</td>
                        <td className="p-4">
                           <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${order.aggregator==='zomato'?'bg-red-500':'bg-orange-500'} text-white`}>{order.aggregator}</span>
                        </td>
                        <td className="p-4 font-mono font-bold text-white underline cursor-pointer">{order.aggregator_order_id}</td>
                        <td className="p-4 text-surface-300">{order.customer_name || 'N/A'}</td>
                        <td className="p-4 text-white font-black">₹{order.grand_total}</td>
                        <td className="p-4">
                           <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              order.status === 'completed' ? 'bg-success-500/10 text-success-400' :
                              order.status === 'cancelled' ? 'bg-red-500/10 text-red-400' : 'bg-surface-800 text-surface-500'
                           }`}>{order.status}</span>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>
   );
}
