import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { Clock, Check, ChefHat, AlertTriangle, Bell, Flame } from 'lucide-react';

const SOCKET_URL = import.meta.env.VITE_API_URL || window.location.origin;
const OUTLET_ID = new URLSearchParams(window.location.search).get('outlet') || 'default';

const STATION_COLORS = {
  KITCHEN: 'from-orange-500 to-red-600',
  BAR: 'from-blue-500 to-indigo-600',
  COLD: 'from-cyan-500 to-teal-600',
  DESSERT: 'from-pink-500 to-rose-600',
  GRILL: 'from-amber-500 to-orange-600',
};

const STATUS_STYLES = {
  pending: { border: 'border-yellow-500', bg: 'bg-yellow-500/5', pulse: true },
  preparing: { border: 'border-blue-500', bg: 'bg-blue-500/5', pulse: true },
  ready: { border: 'border-green-500', bg: 'bg-green-500/10', pulse: false },
};

export default function KitchenDisplay() {
  const [kots, setKots] = useState([]);
  const [station, setStation] = useState('');
  const [now, setNow] = useState(Date.now());
  const [connected, setConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [outletId, setOutletId] = useState(OUTLET_ID);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // 1. Resolve Outlet ID from token
    const token = localStorage.getItem('accessToken');
    let resolvedOutletId = OUTLET_ID;

    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.outlet_id) resolvedOutletId = payload.outlet_id;
      } catch (e) {
        console.error('Failed to parse token for outlet_id');
      }
    }
    setOutletId(resolvedOutletId);

    // 2. Fetch already pending KOTs
    if (token) {
      fetch(`/api/kitchen/kot/pending?outlet_id=${resolvedOutletId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) setKots(data.data);
      })
      .catch(err => console.error('Failed to fetch initial KOTs:', err));
    }

    // 3. Setup WebSockets
    const socket = io(`${SOCKET_URL}/kitchen`, {
      query: { outlet_id: resolvedOutletId, station: station || undefined },
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.emit('join_station', { outletId: resolvedOutletId, station });

    socket.on('new_kot', (kot) => {
      setKots((prev) => [...prev, { ...kot, received_at: Date.now(), status: 'pending' }]);
      if (soundEnabled) playAlert();
    });

    socket.on('kot_complete', ({ kot_id }) => {
      setKots((prev) => prev.filter((k) => k.id !== kot_id));
    });

    socket.on('kot_item_ready', ({ kot_id, item_id }) => {
      setKots((prev) => prev.map((k) => {
        if (k.id !== kot_id) return k;
        const items = (k.items || k.kot_items || []).map((it) =>
          (it.id === item_id || it.order_item_id === item_id) ? { ...it, status: 'ready' } : it
        );
        return { ...k, items, kot_items: items };
      }));
    });

    return () => socket.disconnect();
  }, [station, soundEnabled]);

  const playAlert = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) { /* no audio context */ }
  }, []);

  const markReady = async (kotId, itemId) => {
    try {
      await fetch(`/api/kitchen/kot/${kotId}/item-ready`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        body: JSON.stringify({ kot_item_id: itemId }),
      });
      setKots((prev) => prev.map((k) => {
        if (k.id !== kotId) return k;
        const items = (k.items || k.kot_items || []).map((it) =>
          (it.id === itemId || it.order_item_id === itemId) ? { ...it, status: 'ready' } : it
        );
        return { ...k, items, kot_items: items };
      }));
    } catch (e) { console.error('Failed to mark ready:', e); }
  };

  const completeKot = async (kotId) => {
    try {
      await fetch(`/api/kitchen/kot/${kotId}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      });
      setKots((prev) => prev.filter((k) => k.id !== kotId));
    } catch (e) { console.error('Failed to complete KOT:', e); }
  };

  const getElapsed = (receivedAt) => {
    const diff = Math.floor((now - (receivedAt || now)) / 1000);
    const min = Math.floor(diff / 60);
    const sec = diff % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  };

  const isUrgent = (receivedAt) => (now - (receivedAt || now)) > 600000;

  const stations = ['', 'KITCHEN', 'BAR', 'COLD', 'DESSERT', 'GRILL'];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4">
      {/* Header */}
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center">
            <ChefHat className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Kitchen Display</h1>
            <div className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'} ${connected ? 'animate-pulse' : ''}`} />
              <span className="text-zinc-500">{connected ? 'Connected' : 'Disconnected'}</span>
              <span className="text-zinc-700">|</span>
              <span className="text-zinc-500">{kots.length} active KOTs</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Station Filter */}
          <div className="flex bg-zinc-900 rounded-xl p-1 gap-1">
            {stations.map((s) => (
              <button key={s} onClick={() => setStation(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${station === s ? 'bg-red-500 text-white' : 'text-zinc-500 hover:text-white'}`}>
                {s || 'ALL'}
              </button>
            ))}
          </div>

          {/* Sound toggle */}
          <button onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-xl transition-all ${soundEnabled ? 'bg-green-500/20 text-green-400' : 'bg-zinc-800 text-zinc-600'}`}>
            <Bell className="w-5 h-5" />
          </button>

          {/* Clock */}
          <div className="text-right">
            <p className="text-2xl font-bold font-mono text-white">
              {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      </header>

      {/* KOT Grid */}
      {kots.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[70vh] text-zinc-700">
          <ChefHat className="w-24 h-24 mb-4 opacity-20" />
          <p className="text-2xl font-bold">No Active Orders</p>
          <p className="text-sm mt-1">New KOTs will appear here in real-time</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {kots.map((kot) => {
            const items = kot.items || kot.kot_items || [];
            const urgent = isUrgent(kot.received_at);
            const style = STATUS_STYLES[kot.status] || STATUS_STYLES.pending;
            const allReady = items.every((it) => it.status === 'ready');

            return (
              <div key={kot.id || Math.random()}
                className={`border-2 rounded-2xl overflow-hidden transition-all ${style.border} ${style.bg} ${style.pulse ? 'animate-pulse-slow' : ''} ${urgent ? 'ring-2 ring-red-500 ring-offset-2 ring-offset-zinc-950' : ''}`}>
                {/* KOT Header */}
                <div className={`px-4 py-2.5 bg-gradient-to-r ${STATION_COLORS[kot.station] || STATION_COLORS.KITCHEN} flex items-center justify-between`}>
                  <div>
                    <p className="font-bold text-sm">#{kot.order_number || kot.kot_number}</p>
                    <p className="text-xs opacity-80">{kot.station} • {kot.order_type?.replace('_', ' ')}</p>
                  </div>
                  <div className="text-right">
                    <div className={`flex items-center gap-1 text-sm font-mono font-bold ${urgent ? 'text-red-200' : 'text-white'}`}>
                      {urgent && <Flame className="w-4 h-4 animate-bounce" />}
                      <Clock className="w-3.5 h-3.5" />
                      {getElapsed(kot.received_at)}
                    </div>
                    {kot.table_id && <p className="text-xs opacity-70">Table {kot.table_id.slice(-4)}</p>}
                  </div>
                </div>

                {/* Items */}
                <div className="p-3 space-y-2">
                  {items.map((item, idx) => {
                    const oi = item.order_item || item;
                    return (
                      <div key={idx}
                        className={`flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer ${item.status === 'ready' ? 'bg-green-500/10 line-through opacity-50' : 'bg-zinc-800/50 hover:bg-zinc-800'}`}
                        onClick={() => item.status !== 'ready' && markReady(kot.id, item.id || item.order_item_id)}>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{oi.name || 'Item'}</p>
                          {oi.variant_name && <p className="text-xs text-zinc-500">{oi.variant_name}</p>}
                          {oi.notes && <p className="text-xs text-yellow-400 mt-0.5">📝 {oi.notes}</p>}
                          {oi.addons?.length > 0 && (
                            <p className="text-xs text-blue-400 mt-0.5">+ {oi.addons.map((a) => a.name).join(', ')}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-zinc-300">×{item.quantity || oi.quantity}</span>
                          {item.status === 'ready' ? (
                            <Check className="w-5 h-5 text-green-400" />
                          ) : (
                            <div className="w-5 h-5 rounded-full border-2 border-zinc-600 hover:border-green-400 transition-colors" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Complete Button */}
                <div className="px-3 pb-3">
                  <button onClick={() => completeKot(kot.id)}
                    className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all ${allReady ? 'bg-green-500 hover:bg-green-600 text-white animate-bounce' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'}`}>
                    <Check className="w-4 h-4 inline mr-1" />
                    {allReady ? 'COMPLETE ORDER' : 'Mark All Ready'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
