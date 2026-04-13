import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShoppingBag, 
  Search, 
  ChevronRight, 
  Plus, 
  Minus, 
  X, 
  CheckCircle2,
  Clock,
  Navigation
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = import.meta.env.VITE_API_URL || '';

const CustomerMenu = () => {
  // 1. URL State (outlet_id and table_id from path)
  // Format: /table/:table_id/:outlet_id
  const [tableId, setTableId] = useState(null);
  const [outletId, setOutletId] = useState(null);
  
  // 2. Data State
  const [categories, setCategories] = useState([]);
  const [filteredCategories, setFilteredCategories] = useState([]);
  const [outlet, setOutlet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [branding, setBranding] = useState({ platform_name: 'Petpooja ERP' });
  
  // 3. UI State
  const [activeCategory, setActiveCategory] = useState(null);
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [step, setStep] = useState('menu'); // 'menu', 'checkout', 'success'
  const [orderInfo, setOrderInfo] = useState({ name: '', phone: '' });
  const [placingOrder, setPlacingOrder] = useState(false);

  // Initialize from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlOutlet = params.get('outlet') || '00c68b05-5b6f-47fb-a460-2c53c6ed99da'; // Default for test
    const urlTable = params.get('table') || 'adb27974-ed1c-4e0f-9788-6a6881c4e478';
    
    setOutletId(urlOutlet);
    setTableId(urlTable);
    
    fetchMenu(urlOutlet);
    fetchBranding();
  }, []);

  const fetchBranding = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/superadmin/config/public`);
      const data = await res.json();
      if (data.success) {
        setBranding(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch branding:', err);
    }
  };

  const fetchMenu = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/online-orders/menu/${id}`);
      const data = await res.json();
      if (data.success) {
        setCategories(data.data.categories || []);
        setOutlet(data.data.outlet);
        if (data.data.categories?.length > 0) {
          setActiveCategory(data.data.categories[0].id);
        }
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Failed to load menu. Please scan QR again.');
    } finally {
      setLoading(false);
    }
  };

  // Cart Functions
  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateQuantity = (id, delta) => {
    setCart(prev => prev.map(i => {
      if (i.id === id) {
        const newQty = Math.max(0, i.quantity + delta);
        return { ...i, quantity: newQty };
      }
      return i;
    }).filter(i => i.quantity > 0));
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (Number(item.base_price) * item.quantity), 0);
  }, [cart]);

  const placeOrder = async () => {
    if (cart.length === 0) return;
    setPlacingOrder(true);
    try {
      const orderPayload = {
        outlet_id: outletId,
        table_id: tableId,
        customer_name: orderInfo.name,
        customer_phone: orderInfo.phone,
        order_type: 'qr_order',
        source: 'qr',
        items: cart.map(item => ({
          menu_item_id: item.id,
          quantity: item.quantity,
          variant_id: null, // Hardcoded for simplified mobile UI
          addons: []
        }))
      };

      const res = await fetch(`${API_BASE}/api/online-orders/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });
      const data = await res.json();
      
      if (data.success) {
        setStep('success');
        setCart([]);
        setIsCartOpen(false);
      } else {
        alert(data.message || 'Failed to place order');
      }
    } catch (err) {
      alert('Network error. Please try again.');
    } finally {
      setPlacingOrder(false);
    }
  };

  if (loading) return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-500 border-t-transparent shadow-xl"></div>
    </div>
  );

  if (error) return (
    <div className="flex h-screen flex-col items-center justify-center p-6 text-center">
      <X size={64} className="mb-4 text-red-500" />
      <h2 className="text-xl font-bold">Oops!</h2>
      <p className="text-gray-600">{error}</p>
    </div>
  );

  return (
    <div className="relative min-h-screen pb-32">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white px-4 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{outlet?.name || `${branding.platform_name} Restaurant`}</h1>
            <div className="flex items-center gap-1 text-sm text-gray-500">
              <Navigation size={12} className="text-primary-500" />
              <span>Table {tableId ? 'Occupied' : 'Default'}</span>
            </div>
          </div>
          <div className="h-10 w-10 flex items-center justify-center rounded-full bg-primary-100 text-primary-600 font-bold uppercase">
            {outlet?.name?.charAt(0) || branding.platform_name?.charAt(0) || 'P'}
          </div>
        </div>
      </header>

      {/* Category Nav */}
      <nav className="sticky top-[72px] z-20 flex gap-2 overflow-x-auto bg-white px-4 py-3 no-scrollbar border-b border-gray-100">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
              activeCategory === cat.id 
                ? 'bg-primary-500 text-white shadow-md shadow-primary-200' 
                : 'bg-gray-100 text-gray-600 active:bg-gray-200'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </nav>

      {/* Menu Content */}
      <main className="px-4 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCategory}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="grid gap-4"
          >
            {categories.find(c => c.id === activeCategory)?.menu_items?.map(item => (
              <motion.div 
                key={item.id}
                layoutId={item.id}
                className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm border border-gray-100"
              >
                <div className="h-24 w-24 flex-shrink-0 rounded-xl bg-gray-100 overflow-hidden">
                   <img 
                      src={item.image_url || `https://source.unsplash.com/200x200/?food,${item.name}`} 
                      alt={item.name}
                      className="h-full w-full object-cover"
                   />
                </div>
                <div className="flex flex-grow flex-col justify-between py-0.5">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className={`h-3 w-3 rounded-sm border-2 ${item.food_type === 'veg' ? 'border-green-600' : 'border-red-600'} flex items-center justify-center p-[1px]`}>
                        <div className={`h-full w-full rounded-full ${item.food_type === 'veg' ? 'bg-green-600' : 'bg-red-600'}`}></div>
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{item.food_type === 'veg' ? 'Veg' : 'Non-Veg'}</span>
                    </div>
                    <h3 className="font-bold text-gray-900 leading-tight">{item.name}</h3>
                    <p className="mt-1 text-xs text-gray-500 line-clamp-1">{item.description || 'Delicious freshly prepared dish.'}</p>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-bold text-primary-600">₹{item.base_price}</span>
                    <button 
                      onClick={() => addToCart(item)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 text-primary-600 border border-primary-100 active:bg-primary-500 active:text-white transition-colors"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating Cart Button */}
      {cart.length > 0 && step === 'menu' && (
        <motion.div 
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="fixed bottom-6 left-1/2 w-[90%] -translate-x-1/2 z-40"
        >
          <button 
            onClick={() => setIsCartOpen(true)}
            className="flex w-full items-center justify-between rounded-2xl bg-primary-500 p-4 text-white shadow-2xl shadow-primary-300 ring-4 ring-white/20"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShoppingBag size={24} />
                <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-primary-600">
                  {cart.length}
                </span>
              </div>
              <div className="text-left">
                <span className="block text-xs uppercase opacity-70">View Cart</span>
                <span className="block font-bold">₹{cartTotal}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 font-bold">
              <span>Checkout</span>
              <ChevronRight size={20} />
            </div>
          </button>
        </motion.div>
      )}

      {/* Cart Sheet */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] rounded-t-[32px] bg-white p-6 shadow-2xl"
            >
              <div className="absolute top-3 left-1/2 -translate-x-1/2 h-1.5 w-12 rounded-full bg-gray-200" />
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold">Your Cart</h2>
                <button onClick={() => setIsCartOpen(false)} className="rounded-full bg-gray-100 p-2 text-gray-500">
                  <X size={20} />
                </button>
              </div>

              <div className="max-h-[50vh] overflow-y-auto pr-2 no-scrollbar">
                {cart.map((item) => (
                  <div key={item.id} className="mb-4 flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex gap-3">
                      <div className="h-16 w-16 flex-shrink-0 rounded-xl bg-gray-100 overflow-hidden">
                        <img src={item.image_url || `https://source.unsplash.com/200x200/?food,${item.name}`} alt={item.name} className="h-full w-full object-cover" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 leading-tight">{item.name}</h4>
                        <p className="text-sm font-bold text-primary-500">₹{Number(item.base_price) * item.quantity}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-1.5 border border-gray-100">
                      <button onClick={() => updateQuantity(item.id, -1)} className="text-primary-500">
                        <Minus size={18} />
                      </button>
                      <span className="w-4 text-center font-bold">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, 1)} className="text-primary-500">
                        <Plus size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 space-y-4">
                <div className="flex items-center justify-between text-lg font-bold">
                  <span>Grand Total</span>
                  <span className="text-primary-600">₹{cartTotal}</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <input 
                    type="text" 
                    placeholder="Your Name"
                    value={orderInfo.name}
                    onChange={(e) => setOrderInfo(prev => ({ ...prev, name: e.target.value }))}
                    className="rounded-xl bg-gray-100 p-4 font-medium outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <input 
                    type="tel" 
                    placeholder="Phone (Optional)"
                    value={orderInfo.phone}
                    onChange={(e) => setOrderInfo(prev => ({ ...prev, phone: e.target.value }))}
                    className="rounded-xl bg-gray-100 p-4 font-medium outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <button 
                  onClick={placeOrder}
                  disabled={placingOrder}
                  className="w-full rounded-2xl bg-primary-500 py-4 font-bold text-white shadow-xl shadow-primary-200 active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {placingOrder ? (
                     <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  ) : (
                    <>
                      <span>Submit Order</span>
                      <ChevronRight size={20} />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Success Modal */}
      <AnimatePresence>
        {step === 'success' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-white p-8 text-center"
          >
            <motion.div 
               initial={{ scale: 0.8, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               transition={{ delay: 0.2 }}
            >
              <div className="mb-6 flex justify-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-orange-100 text-orange-500">
                  <Clock size={56} />
                </div>
              </div>
              <h2 className="mb-2 text-3xl font-extrabold text-gray-900">Order Sent! ⏳</h2>
              <p className="mb-8 text-gray-500">Waiting for the restaurant to confirm your order. Please stay seated.</p>
              
              <div className="space-y-4 rounded-3xl bg-gray-50 p-6">
                <div className="flex items-center gap-4 text-left">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm text-orange-500">
                    <Clock size={24} />
                  </div>
                  <div>
                    <span className="block text-xs font-bold uppercase text-gray-400">Submitted At</span>
                    <span className="font-bold text-gray-800">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-left">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm text-primary-500">
                    <Navigation size={24} />
                  </div>
                  <div>
                    <span className="block text-xs font-bold uppercase text-gray-400">Status</span>
                    <span className="font-bold text-orange-600">⏳ Waiting for Confirmation</span>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setStep('menu')}
                className="mt-12 w-full rounded-2xl border-2 border-primary-500 py-4 font-bold text-primary-600 active:bg-primary-50 transition-colors"
              >
                Order More
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CustomerMenu;
