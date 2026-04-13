import { useState, useEffect, useRef } from 'react';
import { 
  BellRing, Check, X, Info, UtensilsCrossed, 
  MapPin, ShoppingBag, User, Smartphone 
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function IncomingOrderAlert({ order, onAccepted, onRejected, audioLocked, audioCtx }) {
  const [loading, setLoading] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    if (!audioCtx) return;
    
    let intervalId;

    const playBeep = () => {
      // If the parent didn't unlock it yet, don't try to play here to avoid errors
      if (audioCtx.state === 'suspended') return;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); 
      osc.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.1); 

      gain.gain.setValueAtTime(0, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.05); 
      gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5); 

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    };

    // Only set interval if we aren't locked or if we want to try periodically
    intervalId = setInterval(playBeep, 2000);
    playBeep(); // Try immediate

    return () => {
      clearInterval(intervalId);
    };
  }, [audioCtx, audioLocked]);

  const handleAccept = async () => {
    setLoading(true);
    try {
      await api.put(`/online-orders/${order.order_id}/accept`);
      toast.success(`Order #${order.order_number} Accepted!`);
      if (onAccepted) onAccepted();
    } catch (err) {
      toast.error('Failed to accept order');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!window.confirm('Mark this as a FAKE/REJECTED order? This will release the table.')) return;
    setLoading(true);
    try {
      await api.put(`/online-orders/${order.order_id}/reject`);
      toast.error('Order Rejected');
      if (onRejected) onRejected();
    } catch (err) {
      toast.error('Failed to reject order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-surface-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg bg-surface-900 border-2 border-brand-500 rounded-[32px] shadow-2xl shadow-brand-500/20 overflow-hidden relative animate-bounce-in">
        
        {/* Animated Background Ring */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-brand-600/10 rounded-full blur-3xl animate-pulse delay-700"></div>

        <div className="p-8 relative">
          {/* Header */}
          <div className="flex items-center gap-5 mb-8">
            <div className="w-20 h-20 rounded-[28px] bg-brand-500 flex items-center justify-center text-white shadow-xl shadow-brand-500/30 animate-ring scale-110">
              <BellRing className="w-10 h-10" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-400">New Incoming Order</p>
              <h2 className="text-3xl font-black text-white">Accept Order?</h2>
            </div>
          </div>

          {/* Order Details Grid */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-surface-800/50 p-5 rounded-3xl border border-surface-700/50">
              <div className="flex items-center gap-3 text-surface-400 mb-1">
                <UtensilsCrossed className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Table</span>
              </div>
              <p className="text-2xl font-black text-white">Table {order.table_number}</p>
            </div>

            <div className="bg-surface-800/50 p-5 rounded-3xl border border-surface-700/50">
              <div className="flex items-center gap-3 text-surface-400 mb-1">
                <User className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Customer</span>
              </div>
              <p className="text-xl font-black text-white truncate">{order.customer_name || 'Walk-in'}</p>
            </div>

            <div className="bg-surface-800/50 p-5 rounded-3xl border border-surface-700/50">
              <div className="flex items-center gap-3 text-surface-400 mb-1">
                <ShoppingBag className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Items</span>
              </div>
              <p className="text-xl font-black text-white">{order.items_count} Items</p>
            </div>

            <div className="bg-surface-800/50 p-5 rounded-3xl border border-surface-700/50">
              <div className="flex items-center gap-3 text-surface-400 mb-1">
                <Info className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Amount</span>
              </div>
              <p className="text-xl font-black text-brand-400">₹{order.total_amount}</p>
            </div>
          </div>

          <div className="bg-brand-500/5 border border-brand-500/10 p-4 rounded-2xl mb-8 flex items-center gap-3">
            <Smartphone className="w-5 h-5 text-brand-400" />
            <p className="text-xs text-brand-300 font-medium italic">
              Order #{order.order_number} placed via QR Scan. Verification recommended.
            </p>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-5 gap-4">
            <button 
              onClick={handleReject}
              disabled={loading}
              className="col-span-2 py-5 rounded-3xl bg-surface-800 hover:bg-red-500/20 border border-surface-700 hover:border-red-500/40 text-surface-400 hover:text-red-400 font-black flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            >
              <X className="w-6 h-6" />
              REJECT
            </button>
            <button 
              onClick={handleAccept}
              disabled={loading}
              className="col-span-3 py-5 rounded-3xl bg-brand-500 hover:bg-brand-600 text-white font-black flex items-center justify-center gap-3 shadow-xl shadow-brand-500/20 transition-all active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <Check className="w-7 h-7" />
                  <span className="text-lg">ACCEPT & KOT</span>
                </>
              )}
            </button>
          </div>

          {/* Audio Unlocking Overlay */}
          {audioLocked && (
            <div 
              onClick={() => audioCtx?.resume()}
              className="absolute inset-x-0 bottom-0 bg-orange-500 text-white py-3 flex items-center justify-center gap-3 cursor-pointer hover:bg-orange-600 transition-colors animate-pulse"
            >
              <BellRing className="w-5 h-5 animate-bounce" />
              <span className="text-sm font-bold uppercase tracking-widest">Tap anywhere to enable sound alerts</span>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes ring {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.4); }
          50% { transform: scale(1.05); box-shadow: 0 0 0 20px rgba(249, 115, 22, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(249, 115, 22, 0); }
        }
        .animate-ring {
          animation: ring 1.5s infinite;
        }
        @keyframes bounce-in {
          0% { opacity: 0; transform: scale(0.3) translateY(40px); }
          50% { opacity: 1; transform: scale(1.05) translateY(0); }
          70% { transform: scale(0.9) ; }
          100% { transform: scale(1); }
        }
        .animate-bounce-in {
          animation: bounce-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      `}</style>
    </div>
  );
}
