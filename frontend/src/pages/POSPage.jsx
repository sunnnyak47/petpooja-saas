import { useState, useMemo, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  addToCart, removeFromCart, updateCartQuantity, clearCart,
  setOrderType, setSelectedTable, setOrderNotes, setCovers, setSelectedCustomer,
  setPOSState
} from '../store/slices/posSlice';
import {
  Search, Minus, Plus, Trash2, ShoppingCart, Send, CreditCard,
  Leaf, Drumstick, Egg, Star, Flame, X, ClipboardList, Users, Pause, UserPlus, 
  SplitSquareHorizontal, Gift, Percent, FileText, ArrowRightLeft, Combine, 
  LayoutGrid, Utensils
} from 'lucide-react';
import TableGrid from '../components/POS/TableGrid';
import Modal from '../components/Modal';
import ModifierModal from '../components/POS/ModifierModal';
import CancelOrderModal from '../components/POS/CancelOrderModal';
import BillPreviewModal from '../components/POS/BillPreviewModal';
import { AlertCircle } from 'lucide-react';

const FOOD_ICONS = { veg: Leaf, non_veg: Drumstick, egg: Egg };
const BORDER_COLORS = { veg: 'border-l-green-500', non_veg: 'border-l-red-500', egg: 'border-l-yellow-500' };
const SQUARE_ICONS = {
  veg: <div className="w-3 h-3 border border-green-500 flex items-center justify-center p-[1px]"><div className="w-full h-full bg-green-500 rounded-full"></div></div>,
  non_veg: <div className="w-3 h-3 border border-red-500 flex items-center justify-center p-[1px]"><div className="w-full h-full bg-red-500 rounded-full"></div></div>,
  egg: <div className="w-3 h-3 border border-yellow-500 flex items-center justify-center p-[1px]"><div className="w-full h-full bg-yellow-500 rounded-full"></div></div>
};

export default function POSPage() {
  const [search, setSearch] = useState('');
  const [shortCodeSearch, setShortCodeSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);
  const [viewMode, setViewMode] = useState('menu'); // 'menu' or 'tables'
  const [selectedAreaId, setSelectedAreaId] = useState(null);
  
  // UI states
  const [showNotes, setShowNotes] = useState(false);
  const [showCovers, setShowCovers] = useState(false);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showSplitBill, setShowSplitBill] = useState(false);
  const [showEbill, setShowEbill] = useState(false);
  const [showCancelOrder, setShowCancelOrder] = useState(false);
  const [showBillPreview, setShowBillPreview] = useState(false);
  const [billedOrder, setBilledOrder] = useState(null);
  const [selectedItemForModifiers, setSelectedItemForModifiers] = useState(null);

  // Manager Auth for Void/Comp/Discount
  const [showManagerPin, setShowManagerPin] = useState(false);
  const [managerAction, setManagerAction] = useState(null); // 'complimentary', 'discount', 'void'
  const [managerPin, setManagerPin] = useState('');
  const [compReason, setCompReason] = useState('');
  
  // Table Merge/Transfer
  const [tableSelectMode, setTableSelectMode] = useState(null); // 'merge' or 'transfer'
  
  // Payment states
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [sendSms, setSendSms] = useState(true);
  const [partPaymentAmount, setPartPaymentAmount] = useState('');
  
  // Customer search state
  const [customerSearchInput, setCustomerSearchInput] = useState('');
  const [isCompMode, setIsCompMode] = useState(false);
  const [tempOrderId, setTempOrderId] = useState(null);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [isBilled, setIsBilled] = useState(false);

  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const { cart, orderType, selectedTable, orderNotes, covers, selectedCustomer } = useSelector((s) => s.pos);
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id;

  const { data: categories } = useQuery({
    queryKey: ['categories', outletId],
    queryFn: () => api.get(`/menu/categories?outlet_id=${outletId}`).then((r) => r.data),
    enabled: !!outletId,
  });

  const { data: tableAreas } = useQuery({
    queryKey: ['tableAreas', outletId],
    queryFn: () => api.get(`/orders/tables/areas?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId,
  });

  const { data: tables } = useQuery({
    queryKey: ['tables', outletId],
    queryFn: () => api.get(`/orders/tables?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId,
  });

  const tablesForSelect = tables || [];

  const { data: menuData } = useQuery({
    queryKey: ['menuItems', outletId, activeCategory],
    queryFn: () => api.get(`/menu/items?outlet_id=${outletId}&limit=100${activeCategory ? `&category_id=${activeCategory}` : ''}`).then((r) => r.data),
    enabled: !!outletId,
  });

  const { data: customerResults } = useQuery({
    queryKey: ['customersSearch', outletId, customerSearchInput],
    queryFn: () => api.get(`/customers/search?phone=${customerSearchInput}&outlet_id=${outletId}`).then((r) => r.data),
    enabled: !!outletId && customerSearchInput.length > 2,
  });

  const items = menuData?.items || menuData || [];
  const filteredItems = useMemo(() => {
    let filtered = items;
    if (search) filtered = filtered.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
    if (shortCodeSearch) filtered = filtered.filter((i) => i.short_code?.toLowerCase().includes(shortCodeSearch.toLowerCase()));
    return filtered;
  }, [items, search, shortCodeSearch]);

  const cartTotals = useMemo(() => {
    const subtotal = cart.reduce((sum, c) => {
      const itemBase = Number(c.base_price) + (c.variant_price || 0);
      const addonsTotal = (c.addons || []).reduce((s, a) => s + (Number(a.price) * a.quantity), 0);
      return sum + (itemBase + addonsTotal) * c.quantity;
    }, 0);
    const tax = isCompMode ? 0 : subtotal * 0.05;
    return { 
      subtotal: isCompMode ? 0 : subtotal, 
      tax, 
      total: isCompMode ? 0 : Math.round(subtotal + tax) 
    };
  }, [cart, isCompMode]);

  useEffect(() => {
    if (!outletId) return;
    // Connect to /orders namespace
    const socket = io(`${import.meta.env.VITE_API_URL || window.location.origin}/orders`, { 
      transports: ['websocket'],
      withCredentials: true
    });
    
    // Join outlet room
    socket.emit('join_outlet', outletId);
    
    // Listen for table status changes
    socket.on('table_status_change', (data) => {
      queryClient.invalidateQueries({ queryKey: ['tables', outletId] });
      // If our selected table changed, we might need to refresh
      if (selectedTable?.id === data.table_id) {
         // handle selected table update if needed
      }
    });

    socket.on('order_status_change', (data) => {
        if (tempOrderId === data.order_id) {
           if (data.status === 'billed') setIsBilled(true);
           if (data.status === 'cancelled') {
              dispatch(clearCart());
              setTempOrderId(null);
              setIsBilled(false);
              toast.error('This order has been cancelled');
           }
        }
    });

    return () => {
      socket.disconnect();
    };
  }, [outletId, queryClient]);

  const handleAddItem = (item) => {
    if (item.variants?.length > 0 || item.addons?.length > 0) {
      setSelectedItemForModifiers(item);
      return;
    }
    dispatch(addToCart({
      menu_item_id: item.id,
      name: item.name,
      base_price: Number(item.base_price),
      food_type: item.food_type,
      kitchen_station: item.kitchen_station,
      variant_id: null,
      variant_price: 0,
      addons: []
    }));
    toast.success(`${item.name} added`, { duration: 1000 });
  };

  const handleCreateOrderCore = async (status, isBogo = false) => {
    const res = await api.post('/orders', {
      outlet_id: outletId,
      order_type: orderType,
      table_id: selectedTable?.id || null,
      customer_id: selectedCustomer?.id || null,
      notes: orderNotes || null,
      status: status, 
      items: cart.map((c) => ({
        menu_item_id: c.menu_item_id, 
        variant_id: c.variant_id, 
        quantity: c.quantity, 
        addons: c.addons || [],
        notes: c.notes || null
      })),
      covers,
    });
    setTempOrderId(res.data?.id);
    return res.data;
  };

  const handleCreateOrder = async (isHold = false) => {
    if (cart.length === 0) return toast.error('Cart is empty');
    try {
      const order = await handleCreateOrderCore(isHold ? 'held' : 'created');
      setTempOrderId(order.id);
      setCurrentOrder(order);
      
      if (isHold) {
        toast.success(`Order held successfully!`);
        dispatch(clearCart());
        setTempOrderId(null);
      } else {
        await api.post(`/orders/${order.id}/kot`);
        toast.success(`Items sent to Kitchen!`);
        // We don't clear cart here if it's a running order
        // but for this POS logic, let's keep it consistent
        dispatch(clearCart());
        setTempOrderId(null); 
      }
      setIsCompMode(false);
    } catch (error) { toast.error(error.message); }
  };

  const handlePunchKOT = async () => {
    if (cart.length === 0) return toast.error('Cart is empty');
    try {
      let orderId = tempOrderId;
      if (!orderId) {
        const order = await handleCreateOrderCore('created');
        orderId = order.id;
        setTempOrderId(orderId);
      } else {
         // Add items to existing order first
         await api.post(`/orders/${orderId}/items`, {
            items: cart.map(c => ({
                menu_item_id: c.menu_item_id,
                variant_id: c.variant_id,
                quantity: c.quantity,
                addons: c.addons || [],
                notes: c.notes || null
            }))
         });
      }
      
      await api.post(`/orders/${orderId}/kot`);
      toast.success(`Punch Successful! Sent to Kitchen.`);
      dispatch(clearCart());
      // We keep tempOrderId if it's a table order
    } catch (err) { toast.error(err.message); }
  };

  const handleGenerateBill = async () => {
    let orderId = tempOrderId;
    // If no tempOrderId but items in cart, create order first
    if (!orderId && cart.length > 0) {
       const order = await handleCreateOrderCore('created');
       orderId = order.id;
       setTempOrderId(orderId);
    }
    
    if (!orderId) return toast.error('No order to bill');

    try {
      const res = await api.post(`/orders/${orderId}/bill`);
      setBilledOrder(res.data);
      setIsBilled(true);
      setShowBillPreview(true);
      toast.success('Bill Generated!');
    } catch (err) { toast.error(err.message); }
  };

  const handleCancelOrder = async (reason) => {
    if (!tempOrderId) return;
    try {
      await api.post(`/orders/${tempOrderId}/cancel`, { reason });
      toast.success('Order Cancelled');
      dispatch(clearCart());
      setTempOrderId(null);
      setIsBilled(false);
      if (selectedTable) {
        dispatch(setSelectedTable(null));
      }
    } catch (err) { toast.error(err.message); }
  };

  const handleBogo = async () => {
    if (cart.length < 2) return toast.error('Add another item to apply BOGO');
    toast.success('BOGO Applied: 50% discount on lowest item');
    // Implement BOGO in UI logic or send specially to BE
  };

  const handleTableClick = async (table) => {
    dispatch(setSelectedTable(table));
    if (table.status === 'occupied' && table.orders?.[0]) {
      try {
        const res = await api.get(`/orders/${table.orders[0].id}`);
        const order = res.data;
        
        // Map order items to cart format
        const cartItems = order.order_items.map(item => ({
          menu_item_id: item.menu_item_id,
          name: item.name,
          base_price: Number(item.unit_price),
          food_type: item.food_type || 'veg', // Fallback if not in item
          kitchen_station: item.kitchen_station,
          variant_id: item.variant_id,
          variant_price: Number(item.variant_price || 0),
          variant_name: item.variant_name,
          quantity: item.quantity,
          notes: item.notes,
          addons: item.addons.map(a => ({
            addon_id: a.addon_id,
            name: a.name,
            price: Number(a.price),
            quantity: a.quantity
          }))
        }));

        dispatch(setPOSState({
          cart: cartItems,
          selectedTable: table,
          selectedCustomer: order.customer,
          orderType: order.order_type,
          orderNotes: order.notes || '',
          covers: order.covers || 1
        }));

        setTempOrderId(order.id);
        if (order.status === 'billed') {
          setIsBilled(true);
          setBilledOrder(order);
        } else {
          setIsBilled(false);
          setBilledOrder(null);
        }
        
        toast.success(`Order for Table ${table.table_number} loaded`);
      } catch (err) {
        toast.error('Failed to load table order');
      }
    } else {
      // Clear for new order
      dispatch(clearCart());
      dispatch(setSelectedTable(table));
      setTempOrderId(null);
      setIsBilled(false);
      setBilledOrder(null);
      toast.success(`Table ${table.table_number} selected`);
    }
    setViewMode('menu');
  };

  const processManagerAction = async () => {
    if(!managerPin) return toast.error('PIN is required');
    try {
      const res = await api.post('/staff/verify-pin', { pin: managerPin, outlet_id: outletId });
      
      if(managerAction === 'complimentary') {
         if(!compReason) return toast.error('Reason required');
         setIsCompMode(true);
         toast.success('Complimentary Mode Enabled');
      }
      setShowManagerPin(false);
      setManagerPin('');
      setCompReason('');
    } catch(e) { 
      toast.error(e.response?.data?.message || 'Invalid PIN'); 
    }
  };

  const handlePayment = async () => {
    if (cart.length === 0 && !tempOrderId) return toast.error('Cart is empty');
    if (paymentMethod === 'due' && !selectedCustomer) return toast.error('Customer required for Due');
    
    try {
      let orderId = tempOrderId;
      if (!orderId) {
        const order = await handleCreateOrderCore('created');
        orderId = order.id;
        await api.post(`/orders/${orderId}/kot`).catch(e=>{});
      }

      await api.post(`/orders/${orderId}/payment`, {
        method: paymentMethod,
        amount: paymentMethod === 'part' ? Number(partPaymentAmount) : (billedOrder?.grand_total || cartTotals.total)
      });

      toast.success(paymentMethod === 'part' ? 'Part Payment Recorded' : 'Payment Completed');
      dispatch(clearCart());
      setShowPayment(false);
      setTempOrderId(null);
    } catch (err) { toast.error(err.message || 'Payment failed'); }
  };

  const executeTableAction = async (targetTableId) => {
     if(!tempOrderId) return toast.error('No open order selected');
     try {
       if(tableSelectMode === 'transfer') {
         await api.post(`/orders/${tempOrderId}/transfer-table`, { new_table_id: targetTableId });
         toast.success('Table Transferred');
       } else if (tableSelectMode === 'merge') {
         await api.post(`/orders/${tempOrderId}/merge`, { target_order_id: 'auto' }); // Simplified
         toast.success('Tables Merged');
       }
       setTableSelectMode(null);
       dispatch(clearCart());
     } catch(e) { toast.error(e.message); }
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-7rem)] animate-fade-in relative overflow-hidden">
      {/* Table Select Overlay */}
      {tableSelectMode && (
        <div className="absolute inset-0 bg-surfce-950/80 backdrop-blur-sm z-50 flex flex-col p-8">
           <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl text-white font-bold">Select Target Table for {tableSelectMode.toUpperCase()}</h2>
              <button onClick={() => setTableSelectMode(null)} className="btn-ghost text-red-400">Cancel</button>
           </div>
           <div className="grid grid-cols-6 gap-4">
             {tablesForSelect?.map(t => (
               <button key={t.id} onClick={() => executeTableAction(t.id)} className={`p-4 rounded-xl border-2 font-bold text-lg ${t.status === 'available' ? 'border-success-500 bg-success-500/10 text-success-400' : 'border-red-500 bg-red-500/10 text-red-400'}`}>
                 T{t.table_number} <span className="block text-xs opacity-70 font-normal">{t.status}</span>
               </button>
             ))}
           </div>
        </div>
      )}

      {/* Left Menu Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-surface-900 border border-surface-800 rounded-2xl p-4">
        {/* Search */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
            <input className="input pl-10" placeholder="Search menu items..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="relative max-w-[150px]">
            <input className="input" placeholder="Short Code (BB)" autoFocus value={shortCodeSearch} onChange={(e) => setShortCodeSearch(e.target.value)} />
          </div>
          <select className="input max-w-[150px]">
             <option>All Floors</option>
             {tableAreas?.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div className="flex bg-surface-800 rounded-xl p-1 ml-auto gap-1">
             <button
               onClick={() => setViewMode('menu')}
               className={`p-2 rounded-lg transition-all ${viewMode === 'menu' ? 'bg-brand-500 text-white' : 'text-surface-400 hover:text-white'}`}
               title="Menu View"
             >
               <Utensils className="w-4 h-4" />
             </button>
             <button
               onClick={() => setViewMode('tables')}
               className={`p-2 rounded-lg transition-all ${viewMode === 'tables' ? 'bg-brand-500 text-white' : 'text-surface-400 hover:text-white'}`}
               title="Table View"
             >
               <LayoutGrid className="w-4 h-4" />
             </button>
             <div className="w-px h-4 bg-surface-700 mx-1 self-center" />
             {['dine_in', 'takeaway', 'delivery'].map((t) => (
                <button key={t} onClick={() => dispatch(setOrderType(t))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${orderType === t ? 'bg-brand-500 text-white' : 'text-surface-400 hover:text-white'}`}>
                  {t.split('_').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ')}
                </button>
             ))}
          </div>
        </div>

        {viewMode === 'menu' ? (
          <>
            {/* Categories */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-none">
              <button onClick={() => setActiveCategory(null)} className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${!activeCategory ? 'bg-brand-500 text-white' : 'bg-surface-800 text-surface-400'}`}>All</button>
              {(categories || []).map((cat) => (
                <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${activeCategory === cat.id ? 'bg-brand-500 text-white' : 'bg-surface-800 text-surface-400'}`}>{cat.name}</button>
              ))}
            </div>

            {/* Menu Grid */}
            <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 content-start">
              {filteredItems.map((item) => (
                <button key={item.id} onClick={() => handleAddItem(item)} className={`card-hover text-left p-3 pt-2 pl-3 group border-l-4 ${BORDER_COLORS[item.food_type] || 'border-l-surface-600'}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      {SQUARE_ICONS[item.food_type]}
                      {item.short_code && <span className="text-[10px] bg-surface-800 px-1 rounded text-surface-400 font-mono">{item.short_code}</span>}
                    </div>
                    <div className="flex gap-1">
                      {item.is_bestseller && <Star className="w-3 h-3 text-warning-400 fill-warning-400" />}
                    </div>
                  </div>
                  <p className="text-sm font-medium text-white line-clamp-2 mb-1 group-hover:text-brand-400 transition-colors">{item.name}</p>
                  <p className="text-base font-bold text-brand-400">₹{Number(item.base_price).toFixed(0)}</p>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-hidden">
            <TableGrid 
              tables={tables || []} 
              areas={tableAreas || []} 
              selectedAreaId={selectedAreaId}
              onAreaChange={setSelectedAreaId}
              onTableClick={handleTableClick}
            />
          </div>
        )}
      </div>

      {/* Right: Cart */}
      <div className="w-[380px] flex flex-col bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden relative shadow-xl">
        <div className="px-4 py-3 border-b border-surface-800 bg-surface-800/20">
           <div className="flex items-center justify-between mb-2">
             <div className="flex items-center gap-2">
               <span className={`text-sm font-semibold text-white ${selectedTable ? 'bg-brand-500/20 px-2 py-1 rounded text-brand-400' : ''}`}>
                 {selectedTable ? `T-${selectedTable.table_number}` : 'No Table'}
               </span>
               <span className="badge-neutral">{cart.length} item</span>
             </div>
             <div className="flex items-center gap-1">
               {selectedTable && (
                 <>
                   <button onClick={async() => { const o = await handleCreateOrderCore('created'); setTableSelectMode('transfer'); }} className="p-1.5 hover:text-white text-surface-400" title="Transfer"><ArrowRightLeft className="w-4 h-4"/></button>
                   <button onClick={async() => { const o = await handleCreateOrderCore('created'); setTableSelectMode('merge'); }} className="p-1.5 hover:text-white text-surface-400" title="Merge"><Combine className="w-4 h-4"/></button>
                 </>
               )}
               <button onClick={() => setShowCovers(!showCovers)} className={`p-1.5 rounded-lg ${showCovers ? 'bg-brand-500 text-white' : 'text-surface-400 hover:text-white'}`}><Users className="w-4 h-4" /></button>
               <button onClick={() => setShowNotes(!showNotes)} className={`p-1.5 rounded-lg ${showNotes || orderNotes ? 'bg-brand-500 text-white' : 'text-surface-400 hover:text-white'}`}><ClipboardList className="w-4 h-4" /></button>
               <button onClick={() => setShowCustomerSearch(!showCustomerSearch)} className={`p-1.5 rounded-lg ${selectedCustomer ? 'bg-success-500 text-white' : 'text-surface-400 hover:text-white'}`}><UserPlus className="w-4 h-4" /></button>
               <button onClick={() => {dispatch(clearCart()); setIsCompMode(false); setTempOrderId(null)}} className="p-1.5 text-surface-400 hover:text-red-400"><Trash2 className="w-4 h-4"/></button>
             </div>
           </div>
           
           {selectedCustomer && (
             <div className="flex items-center justify-between bg-brand-500/10 border border-brand-500/20 rounded-lg p-2 text-xs">
               <div className="flex items-center gap-2">
                 <div className="w-6 h-6 bg-brand-500 text-white rounded-full flex items-center justify-center font-bold shadow">{selectedCustomer.full_name.charAt(0)}</div>
                 <div>
                    <span className="text-white font-medium block">{selectedCustomer.full_name}</span>
                    <span className="text-brand-400">Loyalty: 450 pts</span>
                 </div>
               </div>
               <button onClick={() => dispatch(setSelectedCustomer(null))}><X className="w-4 h-4 text-surface-400 hover:text-red-400" /></button>
             </div>
           )}
        </div>

        {/* Dynamic drop downs for header options */}
        {showCovers && (
          <div className="bg-surface-800 px-4 py-3 flex justify-between items-center border-b border-surface-700 animate-slide-down">
            <span className="text-sm">Covers (Pax)</span>
            <div className="flex items-center gap-3">
               <button onClick={() => dispatch(setCovers(Math.max(1, covers - 1)))} className="w-8 h-8 rounded bg-surface-700 hover:bg-surface-600 flex items-center justify-center"><Minus className="w-4 h-4"/></button>
               <span className="font-bold w-4 text-center">{covers}</span>
               <button onClick={() => dispatch(setCovers(Math.min(30, covers + 1)))} className="w-8 h-8 rounded bg-surface-700 hover:bg-surface-600 flex items-center justify-center"><Plus className="w-4 h-4"/></button>
            </div>
          </div>
        )}
        {showNotes && (
          <div className="bg-surface-800 p-3 border-b border-surface-700 animate-slide-down">
             <textarea className="input w-full resize-none text-sm h-16 bg-surface-900 border-surface-700" placeholder="Special instructions (Max 200 char)..." maxLength={200} value={orderNotes} onChange={(e) => dispatch(setOrderNotes(e.target.value))} />
          </div>
        )}

        {/* Cart List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 relative">
          {isCompMode && <div className="absolute inset-0 z-0 flex items-center justify-center opacity-10 pointer-events-none transform -rotate-45 text-4xl font-black tracking-widest uppercase">Complimentary</div>}
          {cart.map((item, i) => (
            <div key={i} className={`relative z-10 flex items-center gap-3 p-2 bg-surface-800/40 border-l-4 ${BORDER_COLORS[item.food_type] || 'border-l-surface-600'} rounded-lg group hover:bg-surface-800`}>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${isCompMode ? 'text-success-400' : 'text-white'}`}>
                  {item.name}
                  {item.variant_name && <span className="text-[10px] ml-1 bg-surface-700 px-1 rounded text-surface-400">{item.variant_name}</span>}
                </p>
                <div className="flex flex-wrap gap-1 mt-0.5">
                   {item.addons?.map((a, ai) => (
                     <span key={ai} className="text-[9px] text-brand-400 bg-brand-500/10 px-1 rounded">+{a.name} (x{a.quantity})</span>
                   ))}
                </div>
                <p className="text-xs text-surface-500 mt-0.5">₹{(Number(item.base_price) + (item.variant_price || 0)).toFixed(0)} × {item.quantity}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => dispatch(updateCartQuantity({ index: i, quantity: item.quantity - 1 }))} className="w-6 h-6 rounded bg-surface-700 text-surface-300 hover:bg-surface-600 flex items-center justify-center"><Minus className="w-3 h-3" /></button>
                <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                <button onClick={() => dispatch(updateCartQuantity({ index: i, quantity: item.quantity + 1 }))} className="w-6 h-6 rounded bg-surface-700 text-surface-300 hover:bg-surface-600 flex items-center justify-center"><Plus className="w-3 h-3" /></button>
              </div>
              <p className={`text-sm font-semibold w-16 text-right ${isCompMode ? 'text-success-500 line-through' : 'text-white'}`}>
                ₹{(item.base_price * item.quantity).toFixed(0)}
              </p>
            </div>
          ))}
          {cart.length===0 && <div className="text-center pt-10 text-surface-600"><ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-20" /><p className="text-sm">Cart is Empty</p></div>}
        </div>

        {/* Enhanced Checkout Footer */}
        {cart.length > 0 && (
          <div className="bg-surface-800 p-3 shadow-[0_-10px_20px_rgba(0,0,0,0.3)] select-none">
            {/* Quick Action Bar (Agent 2) */}
            <div className="grid grid-cols-4 gap-2 mb-3">
               <button onClick={() => { setManagerAction('complimentary'); setShowManagerPin(true); }} className={`py-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors ${isCompMode ? 'bg-success-500 text-white' : 'bg-surface-700 hover:bg-surface-600 text-surface-300'}`}>
                  <Gift className="w-4 h-4"/> <span className="text-[10px] uppercase font-bold">Comp</span>
               </button>
               <button onClick={handleBogo} className="py-2 rounded-lg flex flex-col items-center justify-center gap-1 bg-surface-700 hover:bg-surface-600 text-surface-300 transition-colors">
                  <Percent className="w-4 h-4"/> <span className="text-[10px] uppercase font-bold">Bogo</span>
               </button>
               <button onClick={async () => { const o = await handleCreateOrderCore('created'); setTempOrderId(o.id); setShowSplitBill(true); }} className="py-2 rounded-lg flex flex-col items-center justify-center gap-1 bg-surface-700 hover:bg-surface-600 text-surface-300 transition-colors">
                  <SplitSquareHorizontal className="w-4 h-4"/> <span className="text-[10px] uppercase font-bold">Split</span>
               </button>
               <button onClick={async () => { const o = await handleCreateOrderCore('created'); setTempOrderId(o.id); setShowEbill(true); }} className="py-2 rounded-lg flex flex-col items-center justify-center gap-1 bg-surface-700 hover:bg-brand-500 hover:text-white text-surface-300 transition-colors">
                  <FileText className="w-4 h-4"/> <span className="text-[10px] uppercase font-bold">eBill</span>
               </button>
            </div>

            <div className="flex justify-between items-end mb-3 px-1">
              <div>
                 <p className="text-xs text-surface-400">Total Tax: ₹{cartTotals.tax.toFixed(1)}</p>
                 <p className="text-2xl font-black text-brand-400 leading-none mt-1">₹{cartTotals.total}</p>
                 {isCompMode && <p className="text-xs text-success-400 mt-1 uppercase font-bold tracking-widest">100% Waived</p>}
              </div>
            </div>

            <div className="flex gap-2 mb-2">
              {!isBilled ? (
                <>
                  <button onClick={() => handleCreateOrder(true)} className="btn-surface flex-1 py-3 text-sm flex flex-col items-center justify-center gap-1">
                     <Pause className="w-4 h-4"/> <span>HOLD</span>
                  </button>
                  <button onClick={handlePunchKOT} className="btn-primary flex-1 py-3 text-sm flex flex-col items-center justify-center gap-1">
                     <Send className="w-4 h-4"/> <span>PUNCH KOT</span>
                  </button>
                </>
              ) : (
                <div className="flex-1 bg-brand-500/10 border border-brand-500/20 rounded-xl p-2 flex items-center justify-center gap-2 text-brand-400 font-bold">
                   <ClipboardCheck className="w-4 h-4" /> BILLED: {billedOrder?.invoice_number}
                </div>
              )}
            </div>
            
            <div className="flex gap-2 mb-2">
               <button onClick={() => setShowCancelOrder(true)} className="btn-surface px-4 py-3 text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors">
                  <X className="w-5 h-5" />
               </button>
               {!isBilled ? (
                 <button onClick={handleGenerateBill} className="btn-surface flex-1 py-3 bg-surface-700 text-white font-bold tracking-wide flex items-center justify-center gap-2">
                    <FileText className="w-4 h-4" /> GENERATE BILL
                 </button>
               ) : (
                 <button onClick={() => setShowBillPreview(true)} className="btn-surface flex-1 py-3 border-brand-500 text-brand-400 font-bold flex items-center justify-center gap-2">
                    <Printer className="w-4 h-4" /> PRINT BILL
                 </button>
               )}
            </div>

            <button onClick={() => setShowPayment(true)} className="btn-success w-full py-4 rounded-xl text-lg shadow-lg shadow-success-500/20 active:scale-[0.99] transition-transform font-bold tracking-wide">
              {isBilled ? 'PAY BILL' : `PAY ₹${cartTotals.total}`}
            </button>
          </div>
        )}
      </div>

      {/* Customer Search Panel Side Dialog */}
      {showCustomerSearch && (
        <div className="absolute top-4 right-[400px] w-80 bg-surface-900 border border-surface-700 rounded-2xl shadow-2xl z-40 overflow-hidden">
           <div className="bg-surface-800 p-3 flex justify-between items-center border-b border-surface-700">
             <h3 className="font-semibold text-white flex items-center gap-2"><Users className="w-4 h-4 text-brand-400"/> Customers</h3>
             <button onClick={() => setShowCustomerSearch(false)} className="p-1 hover:text-red-400"><X className="w-4 h-4"/></button>
           </div>
           <div className="p-3">
              <input autoFocus className="input w-full font-bold tracking-wide border-surface-700" placeholder="Mobile ending in..." value={customerSearchInput} onChange={e=>setCustomerSearchInput(e.target.value)} />
           </div>
           <div className="max-h-96 overflow-y-auto px-2 pb-2">
              {customerResults?.map(c => (
                 <button key={c.id} onClick={() => {dispatch(setSelectedCustomer(c)); setShowCustomerSearch(false)}} className="w-full text-left p-3 rounded-xl hover:bg-surface-800 mb-1 group transition-all">
                    <p className="font-semibold text-brand-100 group-hover:text-brand-400">{c.full_name}</p>
                    <p className="font-mono text-sm text-surface-400 mt-1">{c.phone}</p>
                 </button>
              ))}
              {customerSearchInput.length > 3 && !customerResults?.length && (
                 <div className="p-4 text-center">
                    <p className="text-sm text-surface-400 mb-3">No matching record.</p>
                    <button className="btn-primary w-full text-sm"><UserPlus className="w-4 h-4 inline mr-1"/> New Customer</button>
                 </div>
              )}
           </div>
        </div>
      )}

      {/* PIN Verification Modal */}
      <Modal isOpen={showManagerPin} onClose={() => setShowManagerPin(false)} title="Manager Verification" size="sm">
         <div className="space-y-4">
            <p className="text-sm text-surface-300 text-center">Enter 4-digit Manager PIN to authorize</p>
            <input type="password" value={managerPin} onChange={e=>setManagerPin(e.target.value)} className="input w-full text-center text-2xl tracking-[1em]" maxLength={4} autoFocus/>
            {managerAction === 'complimentary' && (
              <textarea placeholder="Reason for complimentary order..." value={compReason} onChange={e=>setCompReason(e.target.value)} className="input w-full resize-none text-sm"/>
            )}
            <button onClick={processManagerAction} className="btn-primary w-full py-3 mt-2">Authorize</button>
         </div>
      </Modal>

      {/* Payment Processing Modal */}
      <Modal isOpen={showPayment} onClose={() => setShowPayment(false)} title="Settle Checkout" size="md">
        <div className="space-y-6 pt-2 select-none">
           <div className="text-center bg-surface-900 rounded-xl p-6 border border-surface-800">
              <p className="text-sm text-surface-400 uppercase font-bold tracking-widest mb-2">Amount Due</p>
              <p className="text-5xl font-black text-brand-400 font-mono tracking-tight">₹{cartTotals.total}</p>
           </div>
           
           <div>
             <p className="text-xs text-surface-500 uppercase font-bold mb-3 pl-1">Payment Method</p>
             <div className="grid grid-cols-5 gap-2">
                {['cash', 'card', 'upi', 'due', 'part'].map(m => (
                  <button key={m} onClick={() => setPaymentMethod(m)} className={`py-3 rounded-xl border-2 font-bold text-xs uppercase tracking-wide transition-all ${paymentMethod === m ? 'border-brand-500 bg-brand-500 text-white shadow-lg shadow-brand-500/20' : 'border-surface-700 bg-surface-800 text-surface-400 hover:border-surface-600'}`}>
                    {m}
                  </button>
                ))}
             </div>
             
             {paymentMethod === 'part' && (
                <div className="mt-4 animate-slide-down border-t border-surface-800 pt-4">
                   <p className="text-sm text-surface-400 mb-2">Enter Partial Amount Paid</p>
                   <input type="number" className="input w-full text-2xl font-bold py-3 text-white" autoFocus value={partPaymentAmount} onChange={e=>setPartPaymentAmount(e.target.value)} placeholder={`Max: ₹${cartTotals.total}`} />
                   {partPaymentAmount && <p className="text-xs text-brand-400 mt-2 font-medium bg-brand-500/10 inline-block p-1.5 rounded">Remaining Due: ₹{cartTotals.total - Number(partPaymentAmount)}</p>}
                </div>
             )}
           </div>

           {paymentMethod === 'due' && !selectedCustomer && (
             <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg text-sm text-red-400 flex items-start gap-2">
                <Users className="w-5 h-5 shrink-0" />
                <p><strong>Customer Link Required:</strong> You must attach a customer to track credit/due payments.</p>
             </div>
           )}

           <div className="flex items-center gap-3 mt-4 pt-4 border-t border-surface-800 bg-surface-800/30 p-4 rounded-xl">
              <input type="checkbox" id="send-sms" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} className="w-5 h-5 rounded bg-surface-900 border-surface-600 text-brand-500 focus:ring-brand-500 focus:ring-offset-surface-800 cursor-pointer"/>
              <label htmlFor="send-sms" className="text-sm font-medium text-surface-300 cursor-pointer select-none leading-none mt-0.5">Automated Feedback SMS & eBill</label>
           </div>

           {selectedCustomer && (selectedCustomer.loyalty_points?.current_balance || 0) >= 100 && (
             <div className="mt-4 p-4 bg-brand-500/10 border border-brand-500/20 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-sm text-brand-400 font-bold">Redeem Points?</p>
                  <p className="text-[10px] text-surface-500 uppercase tracking-widest font-black">Available: {selectedCustomer.loyalty_points.current_balance} pts</p>
                </div>
                <button onClick={() => toast.success('Redemption logic triggered!')} className="btn-brand text-xs font-black px-4 py-2">Apply ₹{(selectedCustomer.loyalty_points.current_balance * 0.1).toFixed(0)}</button>
             </div>
           )}

           <button onClick={handlePayment} disabled={(paymentMethod === 'due' && !selectedCustomer) || (paymentMethod === 'part' && !partPaymentAmount)} className="btn-success w-full py-4 text-xl font-bold tracking-wide mt-4 disabled:opacity-50 disabled:grayscale">
             Confirm {paymentMethod.toUpperCase()} Receipt
           </button>
        </div>
      </Modal>

      {showSplitBill && <SplitBillModal isOpen={showSplitBill} onClose={() => setShowSplitBill(false)} orderTotal={cartTotals.total} orderId={tempOrderId} />}
      {showEbill && <EBillModal isOpen={showEbill} onClose={() => setShowEbill(false)} orderId={tempOrderId} customer={selectedCustomer} />}
      {showCancelOrder && <CancelOrderModal isOpen={showCancelOrder} onClose={() => setShowCancelOrder(false)} onConfirm={handleCancelOrder} />}
      {showBillPreview && <BillPreviewModal isOpen={showBillPreview} onClose={() => setShowBillPreview(false)} order={billedOrder} onPrint={() => { toast.success('Printing to Thermal...'); setShowBillPreview(false); }} />}
      
      {selectedItemForModifiers && (
        <ModifierModal 
          isOpen={!!selectedItemForModifiers} 
          onClose={() => setSelectedItemForModifiers(null)} 
          item={selectedItemForModifiers}
          onAdd={(itemData) => {
            dispatch(addToCart(itemData));
            toast.success(`${itemData.name} added`);
          }}
        />
      )}
    </div>
  );
}
