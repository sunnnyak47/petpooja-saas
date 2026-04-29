import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import api, { SOCKET_URL } from '../lib/api';
import toast from 'react-hot-toast';
import {
  ShoppingBag, Globe, CheckCircle2, XCircle,
  Clock, MapPin, Phone, AlertCircle,
  Volume2, VolumeX, Zap, ZapOff,
  Download, History, Search, Filter,
  ChevronRight, Timer, Settings2, ExternalLink
} from 'lucide-react';
import { io } from 'socket.io-client';

const PLATFORM_META = {
  swiggy:   { label: 'Swiggy',    color: '#FF5200', bg: '#fff3ed' },
  zomato:   { label: 'Zomato',    color: '#E23744', bg: '#fdf0f1' },
  doordash: { label: 'DoorDash',  color: '#FF3008', bg: '#fff2f0' },
  menulog:  { label: 'Menulog',   color: '#E60000', bg: '#fff0f0' },
};

function PlatformBadge({ platform }) {
  const meta = PLATFORM_META[platform] || { label: platform, color: '#888', bg: '#f5f5f5' };
  return (
    <span style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}30` }}
      className="text-xs font-bold px-2 py-0.5 rounded-full capitalize">
      {meta.label}
    </span>
  );
}

function AggOrderCard({ order, onAccept, onReject, onReady, isAccepting, isRejecting, isReadying }) {
  const [prepTime, setPrepTime] = useState(20);
  const statusColors = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    ACCEPTED: 'bg-blue-100 text-blue-800',
    PREPARING: 'bg-purple-100 text-purple-800',
    READY: 'bg-green-100 text-green-800',
    REJECTED: 'bg-red-100 text-red-800',
  };
  const total = order.total_amount ?? order.items?.reduce((s, i) => s + (i.price * i.quantity), 0) ?? 0;

  return (
    <div className="card p-4 border-l-4 mb-3" style={{ borderLeftColor: PLATFORM_META[order.platform]?.color || '#ccc' }}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <PlatformBadge platform={order.platform} />
            <span className="font-semibold text-sm">#{order.order_number || order.platform_order_id}</span>
          </div>
          {order.customer_name && (
            <div className="flex items-center gap-1 text-xs text-secondary">
              <Phone size={10} /> {order.customer_name} {order.customer_phone && `• ${order.customer_phone}`}
            </div>
          )}
          {order.delivery_address && (
            <div className="flex items-center gap-1 text-xs text-secondary mt-0.5">
              <MapPin size={10} /> {order.delivery_address}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="font-bold text-lg">₹{Number(total).toFixed(2)}</div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[order.status] || 'bg-gray-100 text-gray-700'}`}>
            {order.status}
          </span>
        </div>
      </div>

      <div className="bg-surface rounded p-2 mb-3 space-y-1">
        {(order.items || []).map((item, i) => (
          <div key={i} className="flex justify-between text-xs">
            <span>{item.quantity}× {item.name}</span>
            <span>₹{(item.price * item.quantity).toFixed(2)}</span>
          </div>
        ))}
      </div>

      {order.status === 'PENDING' && (
        <div className="flex items-center gap-2">
          <select value={prepTime} onChange={e => setPrepTime(Number(e.target.value))}
            className="input text-xs py-1 flex-1">
            {[10,15,20,25,30,45].map(t => <option key={t} value={t}>{t} min</option>)}
          </select>
          <button onClick={() => onAccept(order.id, prepTime)} disabled={isAccepting}
            className="btn-primary text-xs py-1 px-3 flex items-center gap-1">
            <CheckCircle2 size={12} /> Accept
          </button>
          <button onClick={() => onReject(order.id)} disabled={isRejecting}
            className="btn-danger text-xs py-1 px-3 flex items-center gap-1">
            <XCircle size={12} /> Reject
          </button>
        </div>
      )}
      {order.status === 'ACCEPTED' && (
        <button onClick={() => onReady(order.id)} disabled={isReadying}
          className="btn-primary w-full text-xs py-1.5 flex items-center justify-center gap-1">
          <CheckCircle2 size={12} /> Mark Ready for Pickup
        </button>
      )}
    </div>
  );
}

function HistoryView({ outletId, platformFilter }) {
  const [search, setSearch] = useState('');
  const { data: history, isLoading } = useQuery({
    queryKey: ['agg-order-history', outletId, platformFilter],
    queryFn: () => {
      const params = new URLSearchParams({ outlet_id: outletId, limit: 50 });
      if (platformFilter !== 'all') params.set('platform', platformFilter);
      return api.get(`/aggregators/orders/history?${params}`).then(r => r.data?.data || r.data || []);
    },
    enabled: !!outletId,
  });

  const filtered = (history || []).filter(o =>
    !search || (o.order_number || '').toLowerCase().includes(search.toLowerCase()) ||
    (o.customer_name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search orders..." className="input pl-9 text-sm" />
        </div>
      </div>
      {isLoading ? (
        <div className="text-center py-8 text-secondary">Loading history...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-secondary">No orders found</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(order => {
            const total = order.total_amount ?? 0;
            return (
              <div key={order.id} className="card p-3 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <PlatformBadge platform={order.platform} />
                    <span className="text-sm font-medium">#{order.order_number || order.platform_order_id}</span>
                    <span className="text-xs text-secondary">{order.customer_name}</span>
                  </div>
                  <div className="text-xs text-secondary mt-0.5">
                    {new Date(order.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">₹{Number(total).toFixed(2)}</div>
                  <span className={`text-xs ${order.status === 'DELIVERED' ? 'text-green-600' : order.status === 'REJECTED' ? 'text-red-600' : 'text-blue-600'}`}>
                    {order.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function OnlineOrdersPage() {
  const { user, token } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id;
  const queryClient = useQueryClient();
  const socketRef = useRef(null);
  const navigate = useNavigate();

  const [autoAccept, setAutoAccept] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [activeView, setActiveView] = useState('live');
  const [platformFilter, setPlatformFilter] = useState('all');

  const notificationSound = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2861/2861-preview.mp3'));

  const { data: activeOrders = [], isLoading } = useQuery({
    queryKey: ['agg-orders-active', outletId],
    queryFn: () => api.get(`/aggregators/orders/active?outlet_id=${outletId}`).then(r => r.data?.data || r.data || []),
    enabled: !!outletId && activeView === 'live',
    refetchInterval: 30000,
  });

  const { data: stats } = useQuery({
    queryKey: ['agg-orders-stats', outletId],
    queryFn: () => api.get(`/aggregators/orders/stats?outlet_id=${outletId}`).then(r => r.data?.data || r.data || {}),
    enabled: !!outletId,
  });

  // Socket.io for real-time order notifications
  useEffect(() => {
    if (!outletId || !token) return;
    socketRef.current = io(SOCKET_URL, { auth: { token }, path: '/socket.io' });
    socketRef.current.on('connect', () => {
      socketRef.current.emit('join-outlet', outletId);
    });
    socketRef.current.on('new-online-order', (order) => {
      if (soundEnabled) notificationSound.current.play().catch(() => {});
      queryClient.invalidateQueries(['agg-orders-active', outletId]);
      queryClient.invalidateQueries(['agg-orders-stats', outletId]);
      toast.success(`New ${order.platform || ''} order received!`, { duration: 5000 });
      if (autoAccept) {
        acceptMutation.mutate({ id: order.id, prepTime: 20 });
      }
    });
    return () => socketRef.current?.disconnect();
  }, [outletId, token, soundEnabled, autoAccept]);

  const acceptMutation = useMutation({
    mutationFn: ({ id, prepTime }) => api.post(`/aggregators/orders/${id}/accept`, { prep_time: prepTime }),
    onSuccess: () => {
      queryClient.invalidateQueries(['agg-orders-active', outletId]);
      toast.success('Order accepted');
    },
    onError: () => toast.error('Failed to accept order'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id) => api.post(`/aggregators/orders/${id}/reject`, { reason: 'Rejected by restaurant' }),
    onSuccess: () => {
      queryClient.invalidateQueries(['agg-orders-active', outletId]);
      toast.success('Order rejected');
    },
    onError: () => toast.error('Failed to reject order'),
  });

  const readyMutation = useMutation({
    mutationFn: (id) => api.post(`/aggregators/orders/${id}/ready`),
    onSuccess: () => {
      queryClient.invalidateQueries(['agg-orders-active', outletId]);
      toast.success('Order marked ready for pickup');
    },
    onError: () => toast.error('Failed to update order'),
  });

  const filteredOrders = (activeOrders || []).filter(o =>
    platformFilter === 'all' || o.platform === platformFilter
  );

  const pending   = filteredOrders.filter(o => o.status === 'PENDING');
  const preparing = filteredOrders.filter(o => ['ACCEPTED','PREPARING'].includes(o.status));
  const ready     = filteredOrders.filter(o => o.status === 'READY');

  const statsByPlatform = {};
  Object.keys(PLATFORM_META).forEach(p => {
    statsByPlatform[p] = (activeOrders || []).filter(o => o.platform === p).length;
  });

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe size={24} className="text-accent" /> Online Orders
          </h1>
          <p className="text-secondary text-sm mt-1">
            Live orders from Swiggy, Zomato, DoorDash & Menulog
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSoundEnabled(v => !v)}
            className={`p-2 rounded-lg border transition-colors ${soundEnabled ? 'border-accent text-accent' : 'border-border text-secondary'}`}
            title={soundEnabled ? 'Mute notifications' : 'Enable notifications'}>
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button
            onClick={() => setAutoAccept(v => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${autoAccept ? 'border-accent bg-accent/10 text-accent' : 'border-border text-secondary'}`}>
            {autoAccept ? <Zap size={14} /> : <ZapOff size={14} />}
            Auto-Accept
          </button>
          <button
            onClick={() => navigate('/aggregators')}
            className="btn-secondary flex items-center gap-2 text-sm">
            <Settings2 size={14} /> Manage Platforms
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="card p-4">
          <div className="text-2xl font-bold">{activeOrders.length}</div>
          <div className="text-xs text-secondary">Active Orders</div>
        </div>
        {Object.entries(PLATFORM_META).map(([key, meta]) => (
          <div key={key} className="card p-4 cursor-pointer hover:border-accent transition-colors"
            style={{ borderLeft: `3px solid ${meta.color}` }}
            onClick={() => setPlatformFilter(platformFilter === key ? 'all' : key)}>
            <div className="text-xl font-bold" style={{ color: meta.color }}>{statsByPlatform[key] || 0}</div>
            <div className="text-xs text-secondary">{meta.label}</div>
          </div>
        ))}
      </div>

      {/* View Toggle + Platform Filter */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={() => setActiveView('live')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeView === 'live' ? 'bg-accent text-white' : 'bg-surface text-secondary hover:text-primary'}`}>
            Live Orders {pending.length > 0 && <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5">{pending.length}</span>}
          </button>
          <button onClick={() => setActiveView('history')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeView === 'history' ? 'bg-accent text-white' : 'bg-surface text-secondary hover:text-primary'}`}>
            <History size={14} className="inline mr-1" /> History
          </button>
        </div>
        <div className="flex gap-2">
          {['all', ...Object.keys(PLATFORM_META)].map(p => (
            <button key={p} onClick={() => setPlatformFilter(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${platformFilter === p ? 'bg-accent text-white' : 'bg-surface border border-border text-secondary hover:text-primary'}`}>
              {p === 'all' ? 'All' : PLATFORM_META[p]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* Live Orders — Kanban */}
      {activeView === 'live' && (
        isLoading ? (
          <div className="text-center py-16 text-secondary">Loading orders...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingBag size={48} className="mx-auto text-secondary mb-3 opacity-50" />
            <p className="text-secondary">No active orders right now</p>
            <button onClick={() => navigate('/aggregators')} className="btn-secondary mt-4 flex items-center gap-2 mx-auto">
              <ExternalLink size={14} /> Configure Platforms
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Pending */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                <h3 className="font-semibold text-sm">New Orders</h3>
                <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full">{pending.length}</span>
              </div>
              {pending.length === 0 ? <div className="text-center py-6 text-secondary text-sm">No new orders</div> :
                pending.map(order => (
                  <AggOrderCard key={order.id} order={order}
                    onAccept={(id, pt) => acceptMutation.mutate({ id, prepTime: pt })}
                    onReject={(id) => rejectMutation.mutate(id)}
                    onReady={(id) => readyMutation.mutate(id)}
                    isAccepting={acceptMutation.isPending}
                    isRejecting={rejectMutation.isPending}
                    isReadying={readyMutation.isPending} />
                ))
              }
            </div>

            {/* Preparing */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <h3 className="font-semibold text-sm">Preparing</h3>
                <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">{preparing.length}</span>
              </div>
              {preparing.length === 0 ? <div className="text-center py-6 text-secondary text-sm">No orders in prep</div> :
                preparing.map(order => (
                  <AggOrderCard key={order.id} order={order}
                    onAccept={(id, pt) => acceptMutation.mutate({ id, prepTime: pt })}
                    onReject={(id) => rejectMutation.mutate(id)}
                    onReady={(id) => readyMutation.mutate(id)}
                    isAccepting={acceptMutation.isPending}
                    isRejecting={rejectMutation.isPending}
                    isReadying={readyMutation.isPending} />
                ))
              }
            </div>

            {/* Ready */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <h3 className="font-semibold text-sm">Ready for Pickup</h3>
                <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">{ready.length}</span>
              </div>
              {ready.length === 0 ? <div className="text-center py-6 text-secondary text-sm">Nothing ready yet</div> :
                ready.map(order => (
                  <AggOrderCard key={order.id} order={order}
                    onAccept={(id, pt) => acceptMutation.mutate({ id, prepTime: pt })}
                    onReject={(id) => rejectMutation.mutate(id)}
                    onReady={(id) => readyMutation.mutate(id)}
                    isAccepting={acceptMutation.isPending}
                    isRejecting={rejectMutation.isPending}
                    isReadying={readyMutation.isPending} />
                ))
              }
            </div>
          </div>
        )
      )}

      {/* History View */}
      {activeView === 'history' && (
        <HistoryView outletId={outletId} platformFilter={platformFilter} />
      )}

      {/* Today's Summary Footer */}
      {stats && (
        <div className="card p-4 flex flex-wrap gap-6 text-sm border-t">
          <div><span className="text-secondary">Today's Orders:</span> <strong>{stats.today_orders ?? 0}</strong></div>
          <div><span className="text-secondary">Revenue:</span> <strong>₹{Number(stats.today_revenue ?? 0).toFixed(2)}</strong></div>
          <div><span className="text-secondary">Accepted:</span> <strong className="text-green-600">{stats.accepted ?? 0}</strong></div>
          <div><span className="text-secondary">Rejected:</span> <strong className="text-red-600">{stats.rejected ?? 0}</strong></div>
          {Object.entries(PLATFORM_META).map(([p, meta]) => stats[p] != null && (
            <div key={p}><span className="text-secondary">{meta.label}:</span> <strong style={{ color: meta.color }}>{stats[p]}</strong></div>
          ))}
        </div>
      )}
    </div>
  );
}
