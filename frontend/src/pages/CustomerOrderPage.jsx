/**
 * @fileoverview Public customer ordering page — accessed via QR code scan.
 * No authentication required. Mobile-optimized PWA-ready page.
 * URL format: /order?outlet=OUTLET_ID&table=TABLE_ID
 */
import { useState, useEffect, useMemo } from 'react';
import {
  ShoppingBag, ChevronRight, Plus, Minus, X,
  CheckCircle2, Clock, UtensilsCrossed, Leaf, Drumstick
} from 'lucide-react';

// Using relative paths to work with Vercel rewrites or direct proxy
const API_PREFIX = '/api';

export default function CustomerOrderPage() {
  const [tableId, setTableId] = useState(null);
  const [outletId, setOutletId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [outlet, setOutlet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [step, setStep] = useState('menu');
  const [orderInfo, setOrderInfo] = useState({ name: '', phone: '' });
  const [placingOrder, setPlacingOrder] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oid = params.get('outlet');
    const tid = params.get('table');
    if (!oid || !tid) {
      setError('Invalid QR code. Please scan again.');
      setLoading(false);
      return;
    }
    setOutletId(oid);
    setTableId(tid);
    fetchMenu(oid);
  }, []);

  const fetchMenu = async (id) => {
    try {
      const res = await fetch(`${API_PREFIX}/online-orders/menu/${id}`);
      const data = await res.json();
      if (data.success) {
        const cats = data.data?.categories || data.data || [];
        setCategories(Array.isArray(cats) ? cats : []);
        setOutlet(data.data?.outlet || null);
        if (cats.length > 0) setActiveCategory(cats[0].id);
      } else {
        setError(data.message || 'Menu not found');
      }
    } catch (err) {
      setError('Failed to load menu. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateQuantity = (id, delta) => {
    setCart(prev => prev.map(i => {
      if (i.id === id) return { ...i, quantity: Math.max(0, i.quantity + delta) };
      return i;
    }).filter(i => i.quantity > 0));
  };

  const cartTotal = useMemo(() =>
    cart.reduce((sum, item) => sum + (Number(item.base_price) * item.quantity), 0), [cart]);

  const cartCount = useMemo(() =>
    cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  const placeOrder = async () => {
    if (cart.length === 0) return;
    setPlacingOrder(true);
    try {
      const payload = {
        outlet_id: outletId,
        table_id: tableId,
        customer_name: orderInfo.name || 'Walk-in',
        customer_phone: orderInfo.phone || null,
        order_type: 'qr_order',
        source: 'qr',
        items: cart.map(item => ({
          menu_item_id: item.id,
          quantity: item.quantity,
          variant_id: null,
          addons: []
        }))
      };
      const res = await fetch(`${API_PREFIX}/online-orders/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setLastOrder(data.data);
        setStep('success');
        setCart([]);
        setIsCartOpen(false);
      } else {
        alert(data.message || 'Order failed. Please try again.');
      }
    } catch (err) {
      alert('Network error. Please try again.');
    } finally {
      setPlacingOrder(false);
    }
  };

  // LOADING STATE
  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-white">
      <div className="text-center">
        <div className="mx-auto h-14 w-14 animate-spin rounded-full border-4 border-orange-500 border-t-transparent"></div>
        <p className="mt-4 text-sm text-gray-500 font-medium">Loading Menu...</p>
      </div>
    </div>
  );

  // ERROR STATE
  if (error) return (
    <div className="flex h-screen flex-col items-center justify-center p-8 bg-white text-center">
      <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mb-4">
        <X size={40} className="text-red-500" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
      <p className="text-gray-500 mb-6">{error}</p>
      <button onClick={() => window.location.reload()} className="px-6 py-3 bg-orange-500 text-white rounded-2xl font-bold">
        Try Again
      </button>
    </div>
  );

  // SUCCESS STATE
  if (step === 'success') return (
    <div className="flex h-screen flex-col items-center justify-center p-8 bg-white text-center">
      <div className="w-24 h-24 rounded-full bg-green-50 flex items-center justify-center mb-6 animate-bounce-slow">
        <CheckCircle2 size={56} className="text-green-500" />
      </div>
      <h2 className="text-3xl font-extrabold text-gray-900 mb-3">Order Placed! 🎉</h2>
      <p className="text-gray-500 mb-8 max-w-xs">Your food is being prepared. Sit back and relax!</p>
      
      <div className="w-full max-w-xs space-y-4 mb-8">
        {/* Order Receipt Card */}
        <div className="bg-gray-50 border border-gray-100 rounded-3xl p-6 text-left">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Order Receipt</span>
            <span className="bg-orange-100 text-orange-600 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">Paid</span>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500 font-medium">Order ID</span>
              <span className="text-sm text-gray-900 font-black">#{lastOrder?.order_number || '---'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500 font-medium">Table</span>
              <span className="text-sm text-gray-900 font-black">T-{lastOrder?.table_number || '--'}</span>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-gray-200/50">
              <span className="text-base text-gray-900 font-bold">Total Paid</span>
              <span className="text-lg text-orange-600 font-black">₹{Number(lastOrder?.total_amount || 0).toFixed(0)}</span>
            </div>
          </div>
        </div>

        {/* Time Estimate Card */}
        <div className="bg-orange-500/5 border border-orange-500/10 rounded-3xl p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-orange-500">
              <Clock size={24} />
            </div>
            <div className="text-left">
              <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">Estimated Time</p>
              <p className="font-bold text-gray-800">15–20 Minutes</p>
            </div>
          </div>
        </div>
      </div>
      <button onClick={() => { setStep('menu'); fetchMenu(outletId); }}
        className="w-full max-w-xs py-4 rounded-2xl border-2 border-orange-500 font-bold text-orange-600 active:bg-orange-50 transition-colors">
        Order More Items
      </button>
    </div>
  );

  const activeCat = categories.find(c => c.id === activeCategory);
  const menuItems = activeCat?.menu_items || activeCat?.items || [];

  // MAIN MENU
  return (
    <div className="min-h-screen bg-gray-50 pb-32" style={{ fontFamily: "'Inter', 'Outfit', system-ui, sans-serif" }}>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-4 py-4 shadow-sm border-b border-gray-100">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <h1 className="text-lg font-extrabold text-gray-900">{outlet?.name || 'Restaurant Menu'}</h1>
            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
              <UtensilsCrossed size={10} /> Dine-in · QR Order
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-orange-200">
            {outlet?.name?.charAt(0) || 'P'}
          </div>
        </div>
      </header>

      {/* Category Pills */}
      <nav className="sticky top-[72px] z-20 bg-white border-b border-gray-100">
        <div className="flex gap-2 overflow-x-auto px-4 py-3 max-w-lg mx-auto"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition-all shrink-0 ${
                activeCategory === cat.id
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-200'
                  : 'bg-gray-100 text-gray-600 active:bg-gray-200'
              }`}>
              {cat.name}
            </button>
          ))}
        </div>
      </nav>

      {/* Menu Items */}
      <main className="px-4 py-5 max-w-lg mx-auto">
        <div className="space-y-3">
          {menuItems.length === 0 && (
            <div className="py-16 text-center text-gray-400">
              <UtensilsCrossed size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">No items in this category</p>
            </div>
          )}
          {menuItems.map(item => {
            const inCart = cart.find(c => c.id === item.id);
            return (
              <div key={item.id} className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm border border-gray-100/80 active:scale-[0.99] transition-transform">
                {/* Image */}
                <div className="h-24 w-24 flex-shrink-0 rounded-xl bg-gradient-to-br from-gray-100 to-gray-50 overflow-hidden">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-gray-300">
                      <UtensilsCrossed size={28} />
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex flex-grow flex-col justify-between py-0.5 min-w-0">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className={`h-3 w-3 rounded-sm border-2 ${item.food_type === 'veg' ? 'border-green-600' : 'border-red-600'} flex items-center justify-center p-[1px]`}>
                        <div className={`h-full w-full rounded-full ${item.food_type === 'veg' ? 'bg-green-600' : 'bg-red-600'}`}></div>
                      </div>
                      <span className="text-[9px] uppercase tracking-wider text-gray-400 font-bold">
                        {item.food_type === 'veg' ? 'Veg' : 'Non-Veg'}
                      </span>
                    </div>
                    <h3 className="font-bold text-gray-900 leading-tight text-sm truncate">{item.name}</h3>
                    {item.description && <p className="mt-0.5 text-[11px] text-gray-400 line-clamp-1">{item.description}</p>}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-extrabold text-orange-600">₹{Number(item.base_price).toFixed(0)}</span>
                    {inCart ? (
                      <div className="flex items-center gap-2 bg-orange-500 rounded-lg px-2 py-1">
                        <button onClick={() => updateQuantity(item.id, -1)} className="text-white"><Minus size={16} /></button>
                        <span className="text-white font-bold text-sm w-4 text-center">{inCart.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)} className="text-white"><Plus size={16} /></button>
                      </div>
                    ) : (
                      <button onClick={() => addToCart(item)}
                        className="flex h-8 items-center gap-1 px-3 rounded-lg bg-white text-orange-600 border-2 border-orange-500 text-xs font-bold active:bg-orange-500 active:text-white transition-colors">
                        <Plus size={14} /> ADD
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Floating Cart Bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4 bg-gradient-to-t from-gray-50 via-gray-50/95 to-transparent pt-8">
          <button onClick={() => setIsCartOpen(true)}
            className="flex w-full max-w-lg mx-auto items-center justify-between rounded-2xl bg-orange-500 p-4 text-white shadow-2xl shadow-orange-300/50 active:scale-[0.98] transition-transform">
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShoppingBag size={22} />
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-black text-orange-600">
                  {cartCount}
                </span>
              </div>
              <div className="text-left">
                <span className="block text-[10px] uppercase opacity-70 tracking-wider">View Cart</span>
                <span className="block font-extrabold text-lg leading-tight">₹{cartTotal.toFixed(0)}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 font-bold bg-white/20 rounded-xl px-4 py-2">
              <span>Checkout</span>
              <ChevronRight size={18} />
            </div>
          </button>
        </div>
      )}

      {/* Cart Bottom Sheet */}
      {isCartOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setIsCartOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] rounded-t-[28px] bg-white p-5 shadow-2xl animate-slide-up">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" />
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-extrabold">Your Cart</h2>
              <button onClick={() => setIsCartOpen(false)} className="p-2 rounded-full bg-gray-100 text-gray-500">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[40vh] overflow-y-auto space-y-3 pr-1" style={{ scrollbarWidth: 'none' }}>
              {cart.map(item => (
                <div key={item.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-14 w-14 flex-shrink-0 rounded-xl bg-gray-100 overflow-hidden">
                      {item.image_url ? <img src={item.image_url} alt="" className="h-full w-full object-cover" /> :
                        <div className="h-full w-full flex items-center justify-center text-gray-300"><UtensilsCrossed size={18} /></div>}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-sm text-gray-900 truncate">{item.name}</h4>
                      <p className="text-sm font-extrabold text-orange-500">₹{(Number(item.base_price) * item.quantity).toFixed(0)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-2.5 py-1 border border-gray-100 shrink-0">
                    <button onClick={() => updateQuantity(item.id, -1)} className="text-orange-500"><Minus size={16} /></button>
                    <span className="w-5 text-center font-bold text-sm">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, 1)} className="text-orange-500"><Plus size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-4 border-t border-gray-100 space-y-4">
              <div className="flex justify-between text-lg font-extrabold">
                <span>Total</span>
                <span className="text-orange-600">₹{cartTotal.toFixed(0)}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="Your Name" value={orderInfo.name}
                  onChange={e => setOrderInfo(p => ({ ...p, name: e.target.value }))}
                  className="rounded-xl bg-gray-100 px-4 py-3 text-sm font-black text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-brand-500" />
                <input type="tel" placeholder="Phone (Optional)" value={orderInfo.phone}
                  onChange={e => setOrderInfo(p => ({ ...p, phone: e.target.value }))}
                  className="rounded-xl bg-gray-100 px-4 py-3 text-sm font-black text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <button onClick={placeOrder} disabled={placingOrder}
                className="w-full rounded-2xl bg-orange-500 py-4 font-bold text-white shadow-xl shadow-orange-200 active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-base">
                {placingOrder ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" /> :
                  <><span>Place Order</span><ChevronRight size={18} /></>}
              </button>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .animate-slide-up { animation: slide-up 0.3s ease-out; }
        @keyframes bounce-slow { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        .animate-bounce-slow { animation: bounce-slow 2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
