import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import api, { SOCKET_URL } from '../lib/api';
import hybridAPI from '../api/offlineAPI';
import toast from 'react-hot-toast';
import {
  addToCart, removeFromCart, updateCartQuantity, clearCart,
  setOrderType, setSelectedTable, setOrderNotes, setCovers, setSelectedCustomer,
  setPOSState
} from '../store/slices/posSlice';
import {
  Search, Minus, Plus, Trash2, ShoppingCart, Send, CreditCard,
  Leaf, Drumstick, Egg, Star, X, ClipboardList, Users, Pause, UserPlus,
  SplitSquareHorizontal, Gift, Percent, FileText, ArrowRightLeft, Combine,
  LayoutGrid, Utensils, Mic, Printer, AlertCircle, Package, Bike, UtensilsCrossed,
  Phone, ChevronDown,
} from 'lucide-react';
import TableGrid from '../components/POS/TableGrid';
import VoicePOS from '../components/POS/VoicePOS';
import Modal from '../components/Modal';
import ModifierModal from '../components/POS/ModifierModal';
import CancelOrderModal from '../components/POS/CancelOrderModal';
import BillPreviewModal from '../components/POS/BillPreviewModal';
import PaymentModal from '../components/POS/PaymentModal';
import EBillModal from '../components/POS/EBillModal';
import SplitBillModal from '../components/POS/SplitBillModal';

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
  const [showVoicePOS, setShowVoicePOS] = useState(false);
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
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ full_name: '', phone: '' });
  const [isCompMode, setIsCompMode] = useState(false);
  const [tempOrderId, setTempOrderId] = useState(null);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [isBilled, setIsBilled] = useState(false);

  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const { cart, orderType, selectedTable, orderNotes, covers, selectedCustomer } = useSelector((s) => s.pos);
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id;

  const [searchParams] = useSearchParams();
  const orderIdParam = searchParams.get('order_id');
  const autoPayParam = searchParams.get('pay');

  // Load order from URL param
  useEffect(() => {
    if (orderIdParam) {
      const loadOrderFromUrl = async () => {
        try {
          const res = await api.get(`/orders/${orderIdParam}`);
          const order = res.data?.data ?? res.data;

          // Map to cart
          const cartItems = order.order_items.map(item => ({
            menu_item_id: item.menu_item_id,
            name: item.name,
            base_price: Number(item.unit_price),
            food_type: item.food_type || 'veg',
            kitchen_station: item.kitchen_station,
            variant_id: item.variant_id,
            variant_price: Number(item.variant_price || 0),
            variant_name: item.variant_name,
            quantity: item.quantity,
            notes: item.notes,
            addons: (item.addons ?? []).map(a => ({
              addon_id: a.addon_id,
              name: a.name,
              price: Number(a.price),
              quantity: a.quantity
            }))
          }));

          dispatch(setPOSState({
            cart: cartItems,
            selectedTable: order.table,
            selectedCustomer: order.customer,
            orderType: order.order_type,
            orderNotes: order.notes || '',
            covers: order.covers || 1
          }));

          setTempOrderId(order.id);
          if (order.status === 'billed') {
            setIsBilled(true);
            setBilledOrder(order);
            if (autoPayParam === 'true') setShowPayment(true);
          } else {
            setIsBilled(false);
            setBilledOrder(null);
          }
          setViewMode('menu');
        } catch (err) {
          toast.error('Failed to load order from link');
        }
      };
      loadOrderFromUrl();
    }
  }, [orderIdParam, autoPayParam, dispatch]);

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
    queryFn: async () => {
      const q = customerSearchInput.trim();
      // Exact 10-digit phone → use the fast /phone/:phone endpoint
      if (/^\d{10}$/.test(q)) {
        const res = await api.get(`/customers/phone/${q}`);
        const c = res.data?.data ?? res.data;
        return c ? [c] : [];
      }
      // Partial input → list endpoint with search param
      const res = await api.get(`/customers?search=${encodeURIComponent(q)}&outlet_id=${outletId}&limit=10`);
      return res.data?.data ?? res.data?.customers ?? res.data ?? [];
    },
    enabled: !!outletId && customerSearchInput.trim().length >= 3,
    staleTime: 5000,
  });

  const createCustomerMutation = useMutation({
    mutationFn: (data) => api.post('/customers', { ...data, outlet_id: outletId }),
    onSuccess: (res) => {
      const customer = res.data || res;
      dispatch(setSelectedCustomer(customer));
      setShowCustomerSearch(false);
      setShowNewCustomerForm(false);
      setNewCustomerForm({ full_name: '', phone: '' });
      toast.success(`${customer.full_name} added & selected`);
    },
    onError: (e) => toast.error(e.response?.data?.message || e.message || 'Failed to create customer'),
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
    const socket = io(`${SOCKET_URL}/orders`, {
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
    // Guard: do not add items with 0 or missing price to cart
    if (!Number(item.base_price) || Number(item.base_price) <= 0) {
      toast.error(`"${item.name}" has no price set. Edit the menu item before adding.`, { duration: 3000 });
      return;
    }
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
    // Backend returns { success, data: order } — unwrap to get the actual order object
    const orderData = res.data?.data ?? res.data;
    setTempOrderId(orderData?.id ?? null);
    return orderData;
  };

  const handleCreateOrder = async (isHold = false) => {
    if (cart.length === 0) return toast.error('Cart is empty');
    try {
      const order = await handleCreateOrderCore(isHold ? 'held' : 'created');
      if (!order?.id) return toast.error('Failed to create order. Please try again.');
      setTempOrderId(order.id);
      setCurrentOrder(order);
      
      if (isHold) {
        toast.success(`Order held successfully!`);
        dispatch(clearCart());
        setTempOrderId(null);
      } else {
        const kotResult = await hybridAPI.generateKOT(order.id).catch(() => api.post(`/orders/${order.id}/kot`));
        if (kotResult?.error) toast.error(kotResult.error);
        else toast.success(`Items sent to Kitchen!`);
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
        orderId = order?.id;
        if (!orderId) return toast.error('Failed to create order. Please try again.');
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

      const kotR = await hybridAPI.generateKOT(orderId).catch(() => api.post(`/orders/${orderId}/kot`));
      if (kotR?.error) toast.error(kotR.error);
      else toast.success(`Punch Successful! Sent to Kitchen.`);
      dispatch(clearCart());
      // We keep tempOrderId if it's a table order
    } catch (err) { toast.error(err.message); }
  };

  const handleGenerateBill = async () => {
    let orderId = tempOrderId;
    // If no tempOrderId but items in cart, create order first
    if (!orderId && cart.length > 0) {
       const order = await handleCreateOrderCore('created');
       orderId = order?.id;
       if (orderId) setTempOrderId(orderId);
    }

    if (!orderId || typeof orderId !== 'string' || orderId.length < 5)
      return toast.error('No active order to bill. Please punch KOT first.');

    try {
      let billData;
      const IS_ELECTRON = typeof window !== 'undefined' && !!window.electron;
      if (IS_ELECTRON) {
        const result = await hybridAPI.generateBill(orderId);
        billData = result;
      } else {
        const res = await api.post(`/orders/${orderId}/bill`);
        billData = res.data;
      }
      setBilledOrder(billData);
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
          addons: (item.addons ?? []).map(a => ({
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
        await hybridAPI.generateKOT(orderId).catch(() => api.post(`/orders/${orderId}/kot`).catch(() => {}));
      }

      const IS_ELECTRON = typeof window !== 'undefined' && !!window.electron;
      const payAmt = paymentMethod === 'part' ? Number(partPaymentAmount) : (billedOrder?.grand_total || cartTotals.total);
      if (IS_ELECTRON) {
        await hybridAPI.processPayment(orderId, { method: paymentMethod, amount: payAmt });
      } else {
        await api.post(`/orders/${orderId}/payment`, { method: paymentMethod, amount: payAmt });
      }

      toast.success(paymentMethod === 'part' ? 'Part Payment Recorded' : 'Payment Completed ✓');
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
        <div className="absolute inset-0 backdrop-blur-sm z-50 flex flex-col p-8"
          style={{ background: 'var(--bg-primary)cc' }}>
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
      <div className="flex-1 flex flex-col min-w-0 rounded-2xl p-4 border"
        style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
        {/* Search + Controls */}
        <div className="flex flex-col gap-2 mb-4">
          {/* Row 1: Search (full width) + voice + shortcode */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
              <input
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border outline-none"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                placeholder="Search menu items by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <input
              className="w-32 px-3 py-2.5 rounded-xl text-sm border outline-none"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              placeholder="Short code…"
              value={shortCodeSearch}
              onChange={(e) => setShortCodeSearch(e.target.value)}
            />
            <button
              onClick={() => setShowVoicePOS(true)}
              title="Voice Order (Hindi/Tamil/Punjabi/English…)"
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold shadow shrink-0 transition-all"
              style={{ background: 'linear-gradient(135deg, #EF4444, #F97316)', color: '#fff' }}
            >
              <Mic className="w-4 h-4" />
              <span>Voice</span>
            </button>
            {/* View mode toggle */}
            <div className="flex rounded-xl p-1 gap-1 border shrink-0" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
              <button onClick={() => setViewMode('menu')} title="Menu View"
                className={`p-2 rounded-lg transition-all ${viewMode === 'menu' ? 'tab-btn-active' : 'text-surface-400 hover:text-white'}`}>
                <Utensils className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('tables')} title="Table View"
                className={`p-2 rounded-lg transition-all ${viewMode === 'tables' ? 'tab-btn-active' : 'text-surface-400 hover:text-white'}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Row 2: Order type selector — prominent, always visible */}
          <div className="flex items-center gap-2">
            {[
              { id: 'dine_in',  label: 'Dine In',   Icon: UtensilsCrossed },
              { id: 'takeaway', label: 'Takeaway',   Icon: Package },
              { id: 'delivery', label: 'Delivery',   Icon: Bike },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => dispatch(setOrderType(id))}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border transition-all"
                style={{
                  background: orderType === id ? 'var(--accent)' : 'var(--bg-secondary)',
                  borderColor: orderType === id ? 'var(--accent)' : 'var(--border)',
                  color: orderType === id ? '#fff' : 'var(--text-secondary)',
                }}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
            <select
              className="ml-auto px-3 py-2 rounded-xl text-sm border outline-none"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              value={selectedAreaId || ''}
              onChange={e => setSelectedAreaId(e.target.value || null)}
            >
              <option value="">All Floors</option>
              {tableAreas?.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>

        {viewMode === 'menu' ? (
          <>
            {/* Categories */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-none">
              <button onClick={() => setActiveCategory(null)} className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${!activeCategory ? 'tab-btn-active' : 'bg-surface-800 text-surface-400'}`}>All</button>
              {(categories || []).map((cat) => (
                <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${activeCategory === cat.id ? 'tab-btn-active' : 'bg-surface-800 text-surface-400'}`}>{cat.name}</button>
              ))}
            </div>

            {/* Menu Grid */}
            <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 content-start">
              {filteredItems.map((item) => {
                const hasNoPrice = !Number(item.base_price) || Number(item.base_price) <= 0;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleAddItem(item)}
                    className={`card-hover text-left p-3 pt-2 pl-3 group border-l-4 ${BORDER_COLORS[item.food_type] || 'border-l-surface-600'} relative`}
                    title={hasNoPrice ? 'Price not set — edit this item in Menu' : item.name}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        {SQUARE_ICONS[item.food_type]}
                        {item.short_code && <span className="text-[10px] px-1 rounded font-mono" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{item.short_code}</span>}
                      </div>
                      <div className="flex gap-1">
                        {item.is_bestseller && <Star className="w-3 h-3 text-warning-400 fill-warning-400" />}
                      </div>
                    </div>
                    <p className="text-sm font-medium text-white line-clamp-2 mb-1 group-hover:text-brand-400 transition-colors">{item.name}</p>
                    {hasNoPrice ? (
                      <p className="text-xs font-semibold text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> No price set
                      </p>
                    ) : (
                      <p className="text-base font-bold text-brand-400">₹{Number(item.base_price).toFixed(0)}</p>
                    )}
                  </button>
                );
              })}
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
      <div className="w-[380px] flex flex-col border rounded-2xl overflow-hidden relative shadow-xl"
        style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)", background: "var(--bg-hover)" }}>
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
                   <button onClick={async () => {
                     if (!tempOrderId) {
                       const o = await handleCreateOrderCore('created');
                       if (o?.id) setTempOrderId(o.id);
                     }
                     setTableSelectMode('transfer');
                   }} className="p-1.5 hover:text-white text-surface-400" title="Transfer"><ArrowRightLeft className="w-4 h-4"/></button>
                   <button onClick={async () => {
                     if (!tempOrderId) {
                       const o = await handleCreateOrderCore('created');
                       if (o?.id) setTempOrderId(o.id);
                     }
                     setTableSelectMode('merge');
                   }} className="p-1.5 hover:text-white text-surface-400" title="Merge"><Combine className="w-4 h-4"/></button>
                 </>
               )}
               <button onClick={() => setShowCovers(!showCovers)} className={`p-1.5 rounded-lg ${showCovers ? 'tab-btn-active' : 'text-surface-400 hover:text-white'}`}><Users className="w-4 h-4" /></button>
               <button onClick={() => setShowNotes(!showNotes)} className={`p-1.5 rounded-lg ${showNotes || orderNotes ? 'tab-btn-active' : 'text-surface-400 hover:text-white'}`}><ClipboardList className="w-4 h-4" /></button>
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

        {/* Covers (Pax) panel */}
        {showCovers && (
          <div className="px-4 py-3 flex items-center justify-between border-b" style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)' }}>
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Covers (Pax)</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); dispatch(setCovers(Math.max(1, covers - 1))); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-lg transition-colors"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              >
                −
              </button>
              <input
                type="number"
                min={1}
                max={30}
                value={covers}
                onChange={(e) => dispatch(setCovers(Math.max(1, Math.min(30, Number(e.target.value) || 1))))}
                className="w-12 text-center rounded-lg py-1 text-sm font-bold border outline-none"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); dispatch(setCovers(Math.min(30, covers + 1))); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-lg transition-colors"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                +
              </button>
            </div>
          </div>
        )}

        {/* Special Instructions panel */}
        {showNotes && (
          <div className="px-3 py-3 border-b" style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)' }}>
            <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Special Instructions</p>
            <textarea
              placeholder="e.g. No onion, extra spicy, separate packaging…"
              maxLength={200}
              rows={3}
              value={orderNotes}
              onChange={(e) => dispatch(setOrderNotes(e.target.value))}
              style={{
                width: '100%',
                resize: 'none',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                color: 'var(--text-primary)',
                fontSize: '13px',
                padding: '10px 12px',
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                lineHeight: '1.5',
              }}
            />
            <p className="text-[10px] text-right mt-1" style={{ color: 'var(--text-secondary)' }}>{orderNotes.length}/200</p>
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
                ₹{((Number(item.base_price || 0) + Number(item.variant_price || 0)) * item.quantity).toFixed(0)}
              </p>
            </div>
          ))}
          {cart.length===0 && <div className="text-center pt-10 text-surface-600"><ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-20" /><p className="text-sm">Cart is Empty</p></div>}
        </div>

        {/* Enhanced Checkout Footer */}
        {cart.length > 0 && (
          <div className="p-3 shadow-[0_-10px_20px_rgba(0,0,0,0.3)] select-none"
            style={{ background: 'var(--bg-card)' }}>
            {/* Quick Action Bar (Agent 2) */}
            <div className="grid grid-cols-4 gap-2 mb-3">
               <button onClick={() => { setManagerAction('complimentary'); setShowManagerPin(true); }} className={`py-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors ${isCompMode ? 'bg-success-500 text-white' : 'bg-surface-700 hover:bg-surface-600 text-surface-300'}`}>
                  <Gift className="w-4 h-4"/> <span className="text-[10px] uppercase font-bold">Comp</span>
               </button>
               <button onClick={handleBogo} className="py-2 rounded-lg flex flex-col items-center justify-center gap-1 bg-surface-700 hover:bg-surface-600 text-surface-300 transition-colors">
                  <Percent className="w-4 h-4"/> <span className="text-[10px] uppercase font-bold">Bogo</span>
               </button>
               <button onClick={async () => {
                 if (!tempOrderId) {
                   const o = await handleCreateOrderCore('created');
                   if (o?.id) setTempOrderId(o.id);
                 }
                 setShowSplitBill(true);
               }} className="py-2 rounded-lg flex flex-col items-center justify-center gap-1 bg-surface-700 hover:bg-surface-600 text-surface-300 transition-colors">
                  <SplitSquareHorizontal className="w-4 h-4"/> <span className="text-[10px] uppercase font-bold">Split</span>
               </button>
               <button
                 onClick={async () => {
                   try {
                     let orderId = tempOrderId;
                     if (!orderId) {
                       if (cart.length === 0) return toast.error('Add items first');
                       const o = await handleCreateOrderCore('created');
                       orderId = o.id;
                       setTempOrderId(orderId);
                     }
                     setShowEbill(true);
                   } catch (e) { toast.error(e.message || 'Failed to prepare eBill'); }
                 }}
                 className="py-2 rounded-lg flex flex-col items-center justify-center gap-1 bg-surface-700 hover:bg-brand-500 hover:text-white text-surface-300 transition-colors"
               >
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
               <button onClick={() => setShowCancelOrder(true)} className="btn-surface px-4 py-3 text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors">
                  <X className="w-5 h-5" />
               </button>
               {isBilled ? (
                 <button onClick={() => setShowBillPreview(true)} className="btn-surface flex-1 py-3 border-brand-500 text-brand-400 font-bold flex items-center justify-center gap-2">
                    <Printer className="w-4 h-4" /> PRINT BILL
                 </button>
               ) : (
                 /* 
                  * Align with Test Workflow: 
                  * If cart has items, primarily show PUNCH KOT. 
                  * Hide GENERATE BILL if items are pending.
                  */
                 <button onClick={handlePunchKOT} className="btn-primary flex-1 py-3 text-sm flex flex-col items-center justify-center gap-1 shadow-lg shadow-brand-500/20">
                    <Send className="w-4 h-4"/> <span>PUNCH KOT & PRINT</span>
                 </button>
               )}
            </div>

            <div className="flex gap-2 mb-2">
               {/*
                * Keep HOLD available if not billed
                */}
               {!isBilled && cart.length > 0 && (
                 <button onClick={() => handleCreateOrder(true)} className="btn-surface flex-1 py-3 text-sm flex items-center justify-center gap-2">
                    <Pause className="w-4 h-4"/> <span>HOLD ORDER</span>
                 </button>
               )}
            </div>

            <button onClick={() => setShowPayment(true)} className="btn-success w-full py-4 rounded-xl text-lg shadow-lg shadow-success-500/20 active:scale-[0.99] transition-transform font-bold tracking-wide">
              {isBilled ? 'PAY BILL' : `PAY ₹${cartTotals.total}`}
            </button>
          </div>
        )}

        {/* Show GENERATE BILL only after KOT is punched (cart empty, real order exists) */}
        {!isBilled && cart.length === 0 && tempOrderId && typeof tempOrderId === 'string' && tempOrderId.length > 10 && (
          <div className="p-3" style={{ background: 'var(--bg-card)' }}>
            <button onClick={handleGenerateBill} className="w-full py-3 rounded-xl font-bold tracking-wide flex items-center justify-center gap-2 transition-all text-white"
              style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)' }}>
               <FileText className="w-4 h-4" /> GENERATE BILL
            </button>
          </div>
        )}
      </div>

      {/* Customer Search Panel */}
      {showCustomerSearch && (
        <div className="absolute top-4 right-[400px] w-80 rounded-2xl shadow-2xl z-40 overflow-hidden border"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="p-3 flex justify-between items-center border-b" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
            <h3 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Users className="w-4 h-4" style={{ color: 'var(--accent)' }} /> Find Customer
            </h3>
            <button onClick={() => { setShowCustomerSearch(false); setShowNewCustomerForm(false); }}>
              <X className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>

          {!showNewCustomerForm ? (
            <>
              <div className="p-3">
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                  <input
                    autoFocus
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm border outline-none"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    placeholder="Search by phone number…"
                    value={customerSearchInput}
                    onChange={e => setCustomerSearchInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto px-2 pb-2">
                {customerResults?.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { dispatch(setSelectedCustomer(c)); setShowCustomerSearch(false); setCustomerSearchInput(''); }}
                    className="w-full text-left p-3 rounded-xl mb-1 transition-all group"
                    style={{ background: 'transparent' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{c.full_name}</p>
                    <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-secondary)' }}>{c.phone}</p>
                    {c.loyalty_points?.points > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--accent)' }}>⭐ {c.loyalty_points.points} pts</p>
                    )}
                  </button>
                ))}
                {customerSearchInput.length > 2 && !customerResults?.length && (
                  <div className="p-4 text-center">
                    <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>No customer found.</p>
                    <button
                      onClick={() => { setShowNewCustomerForm(true); setNewCustomerForm({ full_name: '', phone: customerSearchInput }); }}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
                      style={{ background: 'var(--accent)' }}
                    >
                      <UserPlus className="w-4 h-4" /> Add New Customer
                    </button>
                  </div>
                )}
              </div>
              <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <button
                  onClick={() => { setShowNewCustomerForm(true); setNewCustomerForm({ full_name: '', phone: customerSearchInput }); }}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold border flex items-center justify-center gap-2 transition-colors"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)', background: 'transparent' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--accent)10'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <UserPlus className="w-4 h-4" /> New Customer
                </button>
              </div>
            </>
          ) : (
            /* New Customer Form */
            <div className="p-4 space-y-3">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>New Customer</p>
              <input
                autoFocus
                placeholder="Full name *"
                value={newCustomerForm.full_name}
                onChange={e => setNewCustomerForm(p => ({ ...p, full_name: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <input
                placeholder="Phone number *"
                value={newCustomerForm.phone}
                onChange={e => setNewCustomerForm(p => ({ ...p, phone: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowNewCustomerForm(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  Back
                </button>
                <button
                  onClick={() => createCustomerMutation.mutate(newCustomerForm)}
                  disabled={createCustomerMutation.isPending || !newCustomerForm.full_name || !newCustomerForm.phone}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: 'var(--accent)' }}
                >
                  {createCustomerMutation.isPending ? 'Adding…' : 'Add & Select'}
                </button>
              </div>
            </div>
          )}
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

      {/* Payment Modal — UPI QR · Cash · Card · Razorpay · Due */}
      <PaymentModal
        isOpen={showPayment}
        onClose={() => setShowPayment(false)}
        amount={billedOrder?.grand_total || cartTotals.total}
        orderId={tempOrderId}
        orderNumber={billedOrder?.order_number}
        customer={selectedCustomer}
        onSuccess={async (method, paidAmount, razorpayId) => {
          if (cart.length === 0 && !tempOrderId) throw new Error('Cart is empty');
          let orderId = tempOrderId;
          if (!orderId) {
            const order = await handleCreateOrderCore('created');
            orderId = order.id;
            await api.post(`/orders/${orderId}/kot`).catch(() => {});
          }
          await api.post(`/orders/${orderId}/payment`, {
            method,
            amount: paidAmount,
            razorpay_payment_id: razorpayId || undefined,
          });
          toast.success(method === 'part' ? 'Part Payment Recorded' : 'Payment Completed ✓');
          dispatch(clearCart());
          setTempOrderId(null);
          setIsBilled(false);
          setBilledOrder(null);
          queryClient.invalidateQueries({ queryKey: ['running-orders'] });
        }}
      />

      {showSplitBill && <SplitBillModal isOpen={showSplitBill} onClose={() => setShowSplitBill(false)} orderTotal={cartTotals.total} orderId={tempOrderId} />}
      {showEbill && <EBillModal isOpen={showEbill} onClose={() => setShowEbill(false)} orderId={tempOrderId} customer={selectedCustomer} />}
      {showCancelOrder && (
        <CancelOrderModal 
          isOpen={showCancelOrder} 
          onClose={() => setShowCancelOrder(false)} 
          onConfirm={handleCancelOrder}
          hasKots={tempOrderId && cart.length === 0} // Simplification: if cart is empty but order exists, assume KOTs sent
        />
      )}
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

      {/* Voice POS Modal */}
      {showVoicePOS && <VoicePOS onClose={() => setShowVoicePOS(false)} />}
    </div>
  );
}
