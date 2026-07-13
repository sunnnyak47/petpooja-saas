import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import api, { SOCKET_URL } from '../lib/api';
import hybridAPI, { isNetworkError } from '../api/offlineAPI';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useCurrency } from '../hooks/useCurrency';
import { useRegion } from '../hooks/useRegion';
import { useMenuItems } from '../hooks/queries/useMenuItems';
import { AU_TAG_MAP } from '../constants/dietaryTags';
import toast from 'react-hot-toast';
import {
  addToCart, removeFromCart, updateCartQuantity, clearCart,
  setOrderType, setSelectedTable, setOrderNotes, setCovers, setSelectedCustomer,
  setDiscount, setPOSState
} from '../store/slices/posSlice';
import {
  Search, Minus, Plus, Trash2, ShoppingCart, Send, CreditCard,
  Leaf, Drumstick, Egg, Star, X, ClipboardList, Users, Pause, UserPlus,
  Gift, Percent, FileText, Combine,
  LayoutGrid, Utensils, Mic, Printer, AlertCircle, Package, Bike, UtensilsCrossed,
  Phone, ChevronDown, Keyboard, Globe,
} from 'lucide-react';
import TableGrid from '../components/POS/TableGrid';
import useVoiceOrder, { VOICE_LANGUAGES, saveVoiceSettings } from '../hooks/useVoiceOrder';
import Modal from '../components/Modal';
import VoiceConfirmModal from '../components/Voice/VoiceConfirmModal';
import ModifierModal from '../components/POS/ModifierModal';
import CancelOrderModal from '../components/POS/CancelOrderModal';
import BillPreviewModal from '../components/POS/BillPreviewModal';
import PaymentModal from '../components/POS/PaymentModal';
import EBillModal from '../components/POS/EBillModal';
import SplitBillModal from '../components/POS/SplitBillModal';
// ── v2 POS features ───────────────────────────────────────────────────────────
import VoidItemModal from '../components/POS/VoidItemModal';
import DiscountModal from '../components/POS/DiscountModal';
import RefundModal from '../components/POS/RefundModal';
import TaxBreakdownPanel from '../components/POS/TaxBreakdownPanel';
import LoyaltyRedemption from '../components/POS/LoyaltyRedemption';
import GratuitySelector from '../components/POS/GratuitySelector';
import StaffAssignSelector from '../components/POS/StaffAssignSelector';
import { PrintService } from '../lib/PrintService';

const FOOD_ICONS = { veg: Leaf, non_veg: Drumstick, egg: Egg };
const BORDER_COLORS = { veg: 'border-l-slate-200', non_veg: 'border-l-slate-200', egg: 'border-l-slate-200' };
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
  const [voiceText, setVoiceText] = useState('');
  const [showVoiceInput, setShowVoiceInput] = useState(false);
  // Initial language: persisted Voice POS setting, else en-IN
  const [voiceLang, setVoiceLang] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem('msrm_voice_settings') || '{}');
      return s.language || 'en-IN';
    } catch { return 'en-IN'; }
  });
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
  const voice = useVoiceOrder(voiceLang);
  const [billedOrder, setBilledOrder] = useState(null);
  const [selectedItemForModifiers, setSelectedItemForModifiers] = useState(null);
  // True while a Punch-KOT request is in flight — keeps the cart intact until the
  // server confirms so a failed order can never merge into the cashier's next cart.
  const [punching, setPunching] = useState(false);
  const [billing, setBilling] = useState(false);

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
  // Ref mirror of tempOrderId so the long-lived socket handler always reads the
  // CURRENT order id (the effect only re-subscribes on outlet/online change, so
  // reading the state var directly would capture a stale value).
  const tempOrderIdRef = useRef(null);
  useEffect(() => { tempOrderIdRef.current = tempOrderId; }, [tempOrderId]);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [isBilled, setIsBilled] = useState(false);
  // Server-authoritative grand total — used for split/payment to avoid frontend vs backend rounding drift
  const [serverOrderTotal, setServerOrderTotal] = useState(null);
  // Outstanding balance after partial tenders (multi-tender). null = full total due.
  const [balanceDue, setBalanceDue] = useState(null);

  // ── v2 feature state ──────────────────────────────────────────────────────
  const [showVoidItem, setShowVoidItem]         = useState(false);
  const [showDiscount, setShowDiscount]         = useState(false);
  const [showRefund, setShowRefund]             = useState(false);
  const [showTaxBreakdown, setShowTaxBreakdown] = useState(false);
  const [gratuity, setGratuity]                 = useState(0);
  const [appliedLoyaltyPoints, setAppliedLoyaltyPoints]   = useState(0);
  const [appliedLoyaltyDiscount, setAppliedLoyaltyDiscount] = useState(0);
  const [assignedStaff, setAssignedStaff]       = useState(null);
  // currentOrder state for void/refund modals
  const [currentOrderForModal, setCurrentOrderForModal] = useState(null);
  // ── M20: double-tap guard for draft-order actions (Split / eBill / Transfer / Merge).
  // Rapid double-clicks could fire these handlers twice before tempOrderId was set,
  // creating duplicate draft orders. actionBusy disables the buttons in-flight and the
  // ref makes the handlers idempotent per click even before React re-renders.
  const [actionBusy, setActionBusy] = useState(false);
  const actionBusyRef = useRef(false);
  const runDraftAction = async (fn) => {
    if (actionBusyRef.current) return;        // ignore re-entrant double-tap
    actionBusyRef.current = true;
    setActionBusy(true);
    try { await fn(); }
    finally { actionBusyRef.current = false; setActionBusy(false); }
  };

  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const { cart, orderType, selectedTable, orderNotes, covers, selectedCustomer, discount } = useSelector((s) => s.pos);
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id;
  const { format, symbol } = useCurrency();
  const posRegion = useRegion();
  const isAU = posRegion === 'AU';
  const isOnline = useOnlineStatus();

  // ── Electron detection (must be declared before any useEffect that references it) ──
  const IS_ELECTRON = typeof window !== 'undefined' && !!window.electron;

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderIdParam = searchParams.get('order_id');
  const autoPayParam = searchParams.get('pay');

  // Load order from URL param
  useEffect(() => {
    if (orderIdParam) {
      const loadOrderFromUrl = async () => {
        try {
          let order;
          if (IS_ELECTRON && !isOnline) {
            order = await hybridAPI.getOrder(orderIdParam);
          } else {
            const res = await api.get(`/orders/${orderIdParam}`);
            order = res.data?.data ?? res.data;
          }

          // Map to cart (handle both cloud and SQLite shapes)
          const orderItems = order.order_items || order.items || [];
          const cartItems = orderItems.map(item => {
            let addons = [];
            if (Array.isArray(item.addons)) {
              addons = item.addons.map(a => ({ addon_id: a.addon_id, name: a.name, price: Number(a.price), quantity: a.quantity || 1 }));
            } else if (typeof item.addons === 'string') {
              try { addons = JSON.parse(item.addons) || []; } catch { addons = []; }
            }
            return {
              menu_item_id: item.menu_item_id,
              name: item.name || item.menu_item_name,
              base_price: Number(item.unit_price || item.base_price || 0),
              food_type: item.food_type || 'veg',
              kitchen_station: item.kitchen_station,
              variant_id: item.variant_id,
              variant_price: Number(item.variant_price || 0),
              variant_name: item.variant_name,
              quantity: item.quantity,
              notes: item.notes,
              addons,
            };
          });

          dispatch(setPOSState({
            cart: cartItems,
            selectedTable: order.table || null,
            selectedCustomer: order.customer || null,
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

  // ── Hybrid menu/table queries: local SQLite when offline, cloud when online ──
  const { data: hybridMenuData, isLoading: hybridMenuLoading } = useQuery({
    queryKey: ['hybridMenu', outletId, isOnline],
    queryFn: () => hybridAPI.getMenu(outletId),
    enabled: !!outletId && IS_ELECTRON,
    staleTime: isOnline ? 30_000 : Infinity,    // never stale offline
    gcTime: 1000 * 60 * 60,                     // keep cache 1 hour
    retry: isOnline ? 1 : false,
  });

  // Cloud-only fallback for browser (non-Electron)
  const { data: cloudCategories } = useQuery({
    queryKey: ['categories', outletId],
    queryFn: () => api.get(`/menu/categories?outlet_id=${outletId}`).then((r) => r.data),
    enabled: !!outletId && !IS_ELECTRON,
    staleTime: 60_000,
    gcTime: 1000 * 60 * 60,   // cache categories across navigation like the menu
  });

  // Always fetch the full menu in one shot. With the backend pagination
  // cap raised to 500, even Siena's-class restaurants (249 items) fit in
  // a single response. Cache it forever within the session — categories
  // tab filtering happens client-side so we never refetch on tab change.
  // Shared via useMenuItems so POS / Menu / RunningOrders reuse one cache entry.
  const { data: cloudMenuData, isLoading: cloudMenuLoading } = useMenuItems(outletId, {
    enabled: !IS_ELECTRON,
    staleTime: 60_000,
  });

  // True only on a cold load with nothing cached — used to show skeleton tiles instead
  // of a blank grid (a warm cache renders instantly, so this stays false).
  const menuLoading = IS_ELECTRON ? hybridMenuLoading : cloudMenuLoading;

  // Merge: Electron uses hybridMenuData, browser uses cloud
  const categories = IS_ELECTRON
    ? (hybridMenuData?.categories || [])
    : (cloudCategories?.data || cloudCategories || []);

  const rawMenuItems = IS_ELECTRON
    ? (hybridMenuData?.items || [])
    : (cloudMenuData?.items || cloudMenuData?.data || cloudMenuData || []);

  // Counts per category — used for the badges on the tab strip.
  const itemCountByCategory = (() => {
    const m = {};
    for (const it of rawMenuItems) {
      if (!it?.category_id) continue;
      m[String(it.category_id)] = (m[String(it.category_id)] || 0) + 1;
    }
    return m;
  })();
  const totalItemCount = rawMenuItems.length;

  // Apply category filter client-side (both Electron and cloud now)
  const menuData = activeCategory
    ? rawMenuItems.filter(i => String(i.category_id) === String(activeCategory))
    : rawMenuItems;

  const { data: tableAreas } = useQuery({
    queryKey: ['tableAreas', outletId],
    queryFn: () => api.get(`/orders/tables/areas?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId && isOnline,
    staleTime: isOnline ? 30_000 : Infinity,
  });

  const { data: cloudTables } = useQuery({
    queryKey: ['tables', outletId],
    queryFn: async () => {
      if (IS_ELECTRON) return hybridAPI.getTables(outletId);
      const res = await api.get(`/orders/tables?outlet_id=${outletId}`);
      return res.data?.data || res.data || [];
    },
    enabled: !!outletId,
    // Was 30s — too long. After a punch the seized table could still appear
    // "available" in the picker for up to 30s if the socket event was missed.
    // 5s keeps the picker fresh while still cheap enough to avoid refetch storms.
    staleTime: isOnline ? 5_000 : Infinity,
    gcTime: 1000 * 60 * 60,
    retry: isOnline ? 1 : false,
  });

  const tables = cloudTables || [];
  const tablesForSelect = tables;

  // Outlet POS settings — used to enforce mandatory table for dine-in
  const { data: outletSettings } = useQuery({
    queryKey: ['outlet-settings', outletId],
    queryFn: async () => {
      const res = await api.get(`/ho/settings?outlet_id=${outletId}`);
      return res.data?.data || res.data || {};
    },
    enabled: !!outletId && isOnline,
    staleTime: 60_000,
  });
  // Dine-in orders always require a table before they can be punched or billed.
  // Returns true if the order may proceed; otherwise prompts + opens the table picker.
  const ensureTableSelected = () => {
    if (orderType === 'dine_in' && !selectedTable?.id) {
      toast.error('Select a table first for dine-in orders.');
      setTableSelectMode('select'); // open the table picker so they can pick one now
      return false;
    }
    return true;
  };

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

  const items = Array.isArray(menuData) ? menuData : (menuData?.items || menuData?.data || []);
  const filteredItems = useMemo(() => {
    let filtered = items;
    if (search) filtered = filtered.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
    if (shortCodeSearch) {
      // Support a comma-separated list (e.g. "DM, KP") — preview every matching item.
      const codes = shortCodeSearch.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
      filtered = filtered.filter((i) => {
        const sc = i.short_code?.toLowerCase();
        return sc && codes.some((c) => sc === c || sc.includes(c));
      });
    }
    return filtered;
  }, [items, search, shortCodeSearch]);

  const cartTotals = useMemo(() => {
    const lineTotal = cart.reduce((sum, c) => {
      const itemBase = Number(c.base_price) + (c.variant_price || 0);
      const addonsTotal = (c.addons || []).reduce((s, a) => s + (Number(a.price) * a.quantity), 0);
      return sum + (itemBase + addonsTotal) * c.quantity;
    }, 0);
    const defaultGstRate = isAU ? 10 : 5;
    // AU prices are GST-inclusive: tax is extracted from (not added to) the price
    // IN prices are exclusive: tax is added on top
    let subtotal, tax;
    if (isCompMode) {
      subtotal = 0; tax = 0;
    } else if (isAU) {
      // Inclusive: lineTotal already contains GST → extract tax
      tax = cart.reduce((sum, item) => {
        const itemBase = Number(item.base_price) + (item.variant_price || 0);
        const addonsTotal = (item.addons || []).reduce((s, a) => s + (Number(a.price) * a.quantity), 0);
        const lineAmt = (itemBase + addonsTotal) * item.quantity;
        // Nullish (not ||) so an explicit 0% / GST-free item is honored, not coerced to the 10% default
        const rate = item.gst_rate ?? item.tax_rate ?? defaultGstRate;
        // tax = lineAmt - lineAmt / (1 + rate/100)
        return sum + (lineAmt - lineAmt / (1 + rate / 100));
      }, 0);
      subtotal = lineTotal - tax;
    } else {
      // IN: exclusive — add tax on top
      subtotal = lineTotal;
      tax = cart.reduce((sum, item) => {
        const itemBase = Number(item.base_price) + (item.variant_price || 0);
        const addonsTotal = (item.addons || []).reduce((s, a) => s + (Number(a.price) * a.quantity), 0);
        return sum + ((itemBase + addonsTotal) * item.quantity * (item.gst_rate ?? item.tax_rate ?? defaultGstRate) / 100);
      }, 0);
    }
    // BOGO: deduct the free item's unit price from the total
    const bogoDeduction = discount?.type === 'bogo' ? (Number(discount.value) || 0) : 0;

    // AU: keep 2 decimal places (cents). IN: round to nearest whole rupee.
    const rawTotal = isAU ? lineTotal : subtotal + tax;
    const rawTotalAfterBogo = Math.max(0, rawTotal - bogoDeduction);
    const total = isCompMode ? 0 : (isAU ? Math.round(rawTotalAfterBogo * 100) / 100 : Math.round(rawTotalAfterBogo));

    // Recalculate tax proportionally after BOGO (tax reduction = bogoDeduction * taxRate)
    const bogoTaxReduction = isCompMode ? 0 : (rawTotal > 0 ? (tax / rawTotal) * bogoDeduction : 0);
    const finalTax = Math.max(0, tax - bogoTaxReduction);

    const totalWithGratuity = isCompMode ? 0 : Math.round((total + gratuity - appliedLoyaltyDiscount) * 100) / 100;

    return {
      subtotal: Math.round((isCompMode ? 0 : Math.max(0, subtotal - (isAU ? 0 : bogoDeduction))) * 100) / 100,
      tax: Math.round(finalTax * 100) / 100,
      bogoDeduction: Math.round(bogoDeduction * 100) / 100,
      total,
      gratuity,
      loyaltyDiscount: appliedLoyaltyDiscount,
      grandTotal: totalWithGratuity,
    };
  }, [cart, isCompMode, isAU, discount, gratuity, appliedLoyaltyDiscount]);

  // Single source of truth for the amount we DISPLAY and CHARGE. The PAY button and the
  // PaymentModal both read this, so it must always equal the total shown above the button.
  // - Comp waives the whole bill -> 0.
  // - A partial-tender balance (balanceDue) or a finalized bill (billedOrder) is
  //   authoritative when present.
  // - While the order is still editable (not billed) and the cart has items, the LIVE cart
  //   total wins. Previously serverOrderTotal sat above cartTotals here, so it went stale
  //   when you +/- items (PAY showed an old amount) and lingered after a split when you
  //   returned to the screen.
  // - Only when the cart is empty (e.g. items already punched) do we fall back to the
  //   server-recorded total.
  const payableAmount = isCompMode
    ? 0
    : (balanceDue
        ?? billedOrder?.grand_total
        ?? ((!isBilled && cart.length > 0) ? cartTotals.grandTotal : (serverOrderTotal ?? cartTotals.grandTotal)));

  // Sync menu + tables to local SQLite when online (Electron only)
  useEffect(() => {
    if (!outletId || !IS_ELECTRON || !isOnline) return;
    hybridAPI.syncMenuFromCloud(outletId).catch(() => {});
    hybridAPI.syncTablesFromCloud(outletId).catch(() => {});
  }, [outletId, isOnline]);

  useEffect(() => {
    if (!outletId || !isOnline) return;
    // Connect to /orders namespace (only when online)
    const socket = io(`${SOCKET_URL}/orders`, {
      auth: { token: localStorage.getItem('accessToken') },
      transports: ['websocket'],
      withCredentials: true
    });

    // Join outlet room only after connection is established
    socket.on('connect', () => {
      socket.emit('join_outlet', outletId);
    });

    // Listen for table status changes
    socket.on('table_status_change', (data) => {
      queryClient.invalidateQueries({ queryKey: ['tables', outletId] });
      // If our selected table changed, we might need to refresh
      if (selectedTable?.id === data.table_id) {
         // handle selected table update if needed
      }
    });

    socket.on('order_status_change', (data) => {
        // Read the ref, not the closed-over state, so this matches the order
        // currently open on the terminal (not whatever was open at mount).
        if (tempOrderIdRef.current === data.order_id) {
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
  }, [outletId, isOnline, queryClient, dispatch]);

  const handleAddItem = (item) => {
    // Guard: out-of-stock check
    if (item.is_available === false) {
      toast.error(`"${item.name}" is currently unavailable.`, { icon: '🚫', duration: 2500 });
      return;
    }
    if (item.track_inventory && item.stock_quantity !== undefined && item.stock_quantity <= 0) {
      toast.error(`"${item.name}" is out of stock.`, { icon: '📦', duration: 2500 });
      return;
    }
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
      // Honor an explicit 0% / GST-free rate; only fall back to the regional default when unset/NaN
      gst_rate: Number.isFinite(Number(item.gst_rate)) ? Number(item.gst_rate) : (isAU ? 10 : 5),
      food_type: item.food_type,
      kitchen_station: item.kitchen_station,
      variant_id: null,
      variant_price: 0,
      addons: []
    }));
    toast.success(`${item.name} added`, { duration: 1000 });
  };

  // Add an item straight to the cart (no modifier modal) using its default variant.
  // Used by the short-code bulk-add, where we can't pop a modal per item.
  const addItemDirect = (item) => {
    if (item.is_available === false) return false;
    if (!Number(item.base_price) || Number(item.base_price) <= 0) return false;
    const variant = item.variants?.find((v) => v.is_default) || item.variants?.[0] || null;
    dispatch(addToCart({
      menu_item_id: item.id,
      name: item.name,
      base_price: Number(item.base_price),
      gst_rate: Number.isFinite(Number(item.gst_rate)) ? Number(item.gst_rate) : (isAU ? 10 : 5),
      food_type: item.food_type,
      kitchen_station: item.kitchen_station,
      variant_id: variant?.id || null,
      variant_name: variant?.name || null,
      variant_price: variant ? Number(variant.price_addition || 0) : 0,
      addons: [],
    }));
    return true;
  };

  // Short-code box: accepts one or many comma-separated codes (e.g. "DM, KP") and adds
  // every matching item at once. Exact short_code match (case-insensitive).
  const handleAddByShortCodes = () => {
    const codes = shortCodeSearch.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
    if (!codes.length) { toast.error('Enter one or more short codes'); return; }
    const added = [], failed = [];
    codes.forEach((code) => {
      const item = items.find((i) => i.short_code?.toLowerCase() === code);
      if (!item) { failed.push(code.toUpperCase()); return; }
      if (addItemDirect(item)) added.push(item.name);
      else failed.push((item.short_code || code).toUpperCase());
    });
    if (added.length) toast.success(`Added ${added.length} item${added.length > 1 ? 's' : ''}: ${added.join(', ')}`, { duration: 1800 });
    if (failed.length) toast.error(`Not found / unavailable: ${failed.join(', ')}`, { duration: 3000 });
    if (added.length) setShortCodeSearch('');
  };

  // The "Type order…" box is the AI natural-language parser, but people also paste short
  // codes there (e.g. "dm,kp,vb"). Detect a comma-list of short tokens (or a single token
  // that exactly matches a code) and add directly — only real phrases reach the LLM.
  // Returns true if it handled the input (so the caller skips the LLM).
  const tryShortCodeAdd = (text) => {
    const raw = (text || '').trim();
    if (!raw) return false;
    const codeOf = (t) => items.find((i) => i.short_code && i.short_code.toLowerCase() === t.toLowerCase());
    const tokens = raw.split(',').map((t) => t.trim()).filter(Boolean);
    const isCodeToken = (t) => /^[a-z0-9]{1,6}$/i.test(t);
    const looksLikeCodeList = raw.includes(',') && tokens.every(isCodeToken);
    const singleCode = !raw.includes(',') && tokens.length === 1 && isCodeToken(tokens[0]) && !!codeOf(tokens[0]);
    if (!looksLikeCodeList && !singleCode) return false; // let the LLM handle real phrases
    const added = [], failed = [];
    tokens.forEach((t) => {
      const item = codeOf(t);
      if (item && addItemDirect(item)) added.push(item.name);
      else failed.push(t.toUpperCase());
    });
    if (added.length) toast.success(`Added ${added.length} item${added.length > 1 ? 's' : ''}: ${added.join(', ')}`, { duration: 1800 });
    if (failed.length) toast.error(`No item for code: ${failed.join(', ')}`, { duration: 3000 });
    return true;
  };

  const handleCreateOrderCore = async (status) => {
    const orderPayload = {
      outlet_id: outletId,
      order_type: orderType,
      table_id: selectedTable?.id || null,
      customer_id: selectedCustomer?.id || null,
      notes: orderNotes || null,
      status: status,
      items: cart.map((c) => ({
        menu_item_id: c.menu_item_id,
        menu_item_name: c.name,
        unit_price: Number(c.base_price),
        variant_id: c.variant_id,
        quantity: c.quantity,
        addons: c.addons || [],
        notes: c.notes || null
      })),
      covers,
      // Include discount info (BOGO or manager discount) so backend records the correct total
      discount_type: discount?.type || null,
      discount_value: discount?.value || 0,
      discount_reason: discount?.reason || null,
    };

    if (IS_ELECTRON && !isOnline) {
      // Offline: create order in local SQLite
      const result = await hybridAPI.createOrder(orderPayload);
      const orderData = result?.id ? result : { id: result, ...orderPayload };
      setTempOrderId(orderData.id);
      if (orderData.grand_total != null) setServerOrderTotal(Number(orderData.grand_total));
      return orderData;
    }

    try {
      const res = await api.post('/orders', orderPayload);
      const orderData = res.data?.data ?? res.data;
      setTempOrderId(orderData?.id ?? null);
      if (orderData?.grand_total != null) setServerOrderTotal(Number(orderData.grand_total));
      return orderData;
    } catch (err) {
      // Backend briefly unreachable on a desktop terminal → don't block the sale.
      // Write the order to local SQLite; syncEngine pushes it up when back online.
      // Real HTTP errors (err.response present) are re-thrown so their specific
      // message still surfaces, and the browser (non-Electron) path is untouched.
      if (IS_ELECTRON && isNetworkError(err)) {
        const result = await hybridAPI.createOrder(orderPayload);
        const orderData = result?.id ? result : { id: result, ...orderPayload };
        setTempOrderId(orderData.id);
        if (orderData.grand_total != null) setServerOrderTotal(Number(orderData.grand_total));
        return orderData;
      }
      throw err;
    }
  };

  const handleCreateOrder = async (isHold = false) => {
    if (cart.length === 0) return toast.error('Cart is empty');
    // "Held" orders are parked, not sent to the kitchen — allow without a table.
    if (!isHold && !ensureTableSelected()) return;
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
        if (IS_ELECTRON && !isOnline) {
          await hybridAPI.generateKOT(order.id);
        } else {
          await api.post(`/orders/${order.id}/kot`, { outlet_id: outletId });
        }
        toast.success(`Items sent to Kitchen!`);
        dispatch(clearCart());
        setTempOrderId(null);
      }
      setIsCompMode(false);
    } catch (error) { toast.error(error.message); }
  };

  const handlePunchKOT = async () => {
    if (cart.length === 0) return toast.error('Cart is empty');
    if (!ensureTableSelected()) return;

    // ── FAST PATH: new order — single combined punch-kot call ──────────────
    // Correctness over "fire-and-forget": we keep the cart until the server
    // confirms. Clearing instantly then re-adding on failure corrupted the NEXT
    // order (addToCart merges by item+variant+addons). The combined endpoint is
    // sub-second, so awaiting it still feels fast — and the button shows a
    // loading state via `punching` so it can't be double-fired.
    if (!tempOrderId && !(IS_ELECTRON && !isOnline)) {
      if (punching) return; // guard against double-tap
      setPunching(true);
      // Instant feedback: the loading toast appears the moment the button is pressed and
      // swaps to success/error (same toast id) when the server responds. The cart is still
      // cleared only AFTER success (merge-corruption guard above stays intact).
      const sendingToast = toast.loading('Sending to Kitchen…');

      const payload = {
        outlet_id: outletId,
        order_type: orderType,
        table_id: selectedTable?.id || null,
        customer_id: selectedCustomer?.id || null,
        notes: orderNotes || null,
        status: 'created',
        items: cart.map(c => ({
          menu_item_id: c.menu_item_id,
          menu_item_name: c.name,
          unit_price: Number(c.base_price),
          variant_id: c.variant_id,
          quantity: c.quantity,
          addons: c.addons || [],
          notes: c.notes || null,
        })),
        covers,
        discount_type: discount?.type || null,
        discount_value: discount?.value || 0,
        discount_reason: discount?.reason || null,
      };

      // Shared post-success cleanup. Used by BOTH the online success path and the
      // offline fallback so a backend blip leaves the terminal in the exact same
      // clean state (cart cleared, table released) as a normal punch.
      const finishPunch = (orderId, toastMsg) => {
        toast.success(toastMsg, { id: sendingToast, duration: 2000 });
        dispatch(clearCart());
        setGratuity(0);
        setAppliedLoyaltyPoints(0);
        setAppliedLoyaltyDiscount(0);

        // ── Auto-release the terminal back to a clean state after a dine-in punch ──
        // The order is now live in Running Orders. The seized table belongs to that
        // order until it's paid + auto-freed. Holding it on the POS screen as the
        // "currently selected table" created two real problems:
        //   1. The picker's "show selected table even if not available" clause
        //      kept the just-seized table visible, so the operator could re-tap it.
        //   2. There was no obvious way to start the next order without reloading.
        // Clearing selectedTable + tempOrderId here makes the seized table vanish
        // from the picker (it's now plain "occupied"), the cart resets to empty,
        // and the operator can immediately punch a brand-new order. To add items
        // to the previous order, they recall it from Running Orders / Tables.
        if (selectedTable && orderId) {
          const seizedTableId = selectedTable.id;
          // Optimistically flip the seized table to 'occupied' in the local cache
          // BEFORE clearing selectedTable, so the picker has zero frames to show
          // it as still-available between the two state writes.
          queryClient.setQueryData(['tables', outletId], (old) =>
            Array.isArray(old)
              ? old.map(t => t.id === seizedTableId ? { ...t, status: 'occupied', current_order_id: orderId } : t)
              : old
          );
          dispatch(setSelectedTable(null));
          setTempOrderId(null);
          setCurrentOrder(null);
          setIsCompMode(false);
        } else {
          setTempOrderId(null);
          setCurrentOrder(null);
        }
        queryClient.invalidateQueries({ queryKey: ['running-orders'] });
        // Refresh the offline KDS too so the just-punched KOT appears in the kitchen.
        queryClient.invalidateQueries({ queryKey: ['kds-kots'] });
        // Re-sync from server in the background — confirms the optimistic write.
        queryClient.invalidateQueries({ queryKey: ['tables', outletId] });
      };

      try {
        const res = await api.post('/orders/punch-kot', payload);
        const data = res.data?.data ?? res.data;
        const orderId = data?.order?.id;
        // Success — clear cart, release table, reset extras.
        finishPunch(orderId, '🚀 Sent to Kitchen!');
      } catch (err) {
        // ── OFFLINE FALLBACK ──────────────────────────────────────────────
        // A network error means the backend was briefly unreachable (no HTTP
        // response). On a desktop terminal, drop straight to the local SQLite
        // engine so the sale is never blocked — createOrder + generateKOT both
        // write locally and syncEngine pushes them up when connectivity returns.
        // The punch-kot payload already matches hybridAPI.createOrder's shape.
        // Real HTTP errors (err.response present, e.g. 409 table occupied) skip
        // this and keep showing their specific message. Browser (non-Electron)
        // is untouched — the fallback is gated on IS_ELECTRON.
        if (IS_ELECTRON && isNetworkError(err)) {
          try {
            const offlineOrder = await hybridAPI.createOrder(payload);
            const offlineOrderId = offlineOrder?.id;
            await hybridAPI.generateKOT(offlineOrderId);
            // Offline UX is identical to online — the global OnlineStatusBar signals
            // the queued state, so the cashier sees the same "Sent to Kitchen!" here.
            finishPunch(offlineOrderId, '🚀 Sent to Kitchen!');
          } catch (offlineErr) {
            // Even the local engine failed — keep the cart so staff can retry.
            const msg = offlineErr.message || 'KOT failed';
            toast.error(`⚠️ ${msg} — cart kept, please retry`, { id: sendingToast, duration: 5000 });
          }
        } else {
          // Failure — cart is untouched, staff can simply retry.
          const msg = err.response?.data?.message || err.message || 'KOT failed';
          toast.error(`⚠️ ${msg} — cart kept, please retry`, { id: sendingToast, duration: 5000 });
        }
      } finally {
        setPunching(false);
      }

      return;
    }

    // ── SLOW PATH: adding items to existing order OR Electron offline ──
    try {
      // Tracks whether any step fell through to the local SQLite engine — either
      // because we started offline, or a cloud call network-errored mid-flow. It
      // drives the KOT branch (keep the whole flow local once we've gone offline)
      // and the final toast.
      let usedOffline = IS_ELECTRON && !isOnline;

      // Writes the current cart's items into a local SQLite order. Shared by the
      // pure-offline branch and the online→offline network-error fallback.
      const addItemsToSqlite = async (oid) => {
        for (const c of cart) {
          await hybridAPI.addOrderItem({
            order_id: oid,
            menu_item_id: c.menu_item_id,
            menu_item_name: c.name,
            unit_price: Number(c.base_price),
            variant_id: c.variant_id,
            quantity: c.quantity,
            addons: c.addons || [],
            notes: c.notes || null,
          });
        }
      };

      let orderId = tempOrderId;
      if (!orderId) {
        if (IS_ELECTRON && !isOnline) {
          const order = await handleCreateOrderCore('created');
          orderId = order?.id;
          if (!orderId) return toast.error('Failed to create order. Please try again.');
          setTempOrderId(orderId);
        }
      } else {
        // Add items to existing order
        if (IS_ELECTRON && !isOnline) {
          await addItemsToSqlite(orderId);
        } else {
          try {
            await api.post(`/orders/${orderId}/items`, {
              items: cart.map(c => ({
                menu_item_id: c.menu_item_id,
                variant_id: c.variant_id,
                quantity: c.quantity,
                addons: c.addons || [],
                notes: c.notes || null,
              })),
            });
          } catch (err) {
            // Backend briefly unreachable → write the added items to local SQLite
            // instead so the round is never lost. Real HTTP errors re-throw and
            // keep their specific message; browser (non-Electron) is untouched.
            if (IS_ELECTRON && isNetworkError(err)) {
              await addItemsToSqlite(orderId);
              usedOffline = true;
            } else { throw err; }
          }
        }
      }

      // Generate KOT
      if (usedOffline) {
        const kotResult = await hybridAPI.generateKOT(orderId);
        if (kotResult && !kotResult.success) {
          toast.error(kotResult.error || 'No pending items for KOT');
          return;
        }
      } else {
        try {
          await api.post(`/orders/${orderId}/kot`, { outlet_id: outletId });
        } catch (err) {
          // Backend blip on the KOT call → generate it locally instead.
          if (IS_ELECTRON && isNetworkError(err)) {
            const kotResult = await hybridAPI.generateKOT(orderId);
            if (kotResult && !kotResult.success) {
              toast.error(kotResult.error || 'No pending items for KOT');
              return;
            }
            usedOffline = true;
          } else { throw err; }
        }
      }

      // Offline UX is identical to online — same success toast, no "Saved offline"
      // dead-end. The global OnlineStatusBar already signals offline + queued.
      toast.success('🚀 Sent to Kitchen!');
      dispatch(clearCart());
      if (!selectedTable) {
        setTempOrderId(null);
        setCurrentOrder(null);
      }
      queryClient.invalidateQueries({ queryKey: ['running-orders'] });
      queryClient.invalidateQueries({ queryKey: ['kds-kots'] });
      queryClient.invalidateQueries({ queryKey: ['tables', outletId] });
    } catch (err) { toast.error(err.message); }
  };

  const handleGenerateBill = async () => {
    if (billing) return; // guard against double-tap (duplicate bill)
    let orderId = tempOrderId;
    if (!orderId && cart.length > 0) {
      const order = await handleCreateOrderCore('created');
      orderId = order?.id;
      if (orderId) setTempOrderId(orderId);
    }

    if (!orderId || typeof orderId !== 'string' || orderId.length < 5)
      return toast.error('No active order to bill. Please punch KOT first.');

    setBilling(true);
    const billingToast = toast.loading('Generating bill…');
    try {
      let billData;
      if (IS_ELECTRON && !isOnline) {
        billData = await hybridAPI.generateBill(orderId);
      } else {
        try {
          const res = await api.post(`/orders/${orderId}/bill`, { outlet_id: outletId });
          billData = res.data?.data ?? res.data ?? res;
        } catch (err) {
          // Backend briefly unreachable → bill from the local SQLite engine so a
          // blip never blocks billing. Real HTTP errors re-throw and keep their
          // specific message; browser (non-Electron) is untouched.
          if (IS_ELECTRON && isNetworkError(err)) {
            billData = await hybridAPI.generateBill(orderId);
          } else { throw err; }
        }
      }
      setBilledOrder(billData);
      if (billData?.grand_total != null) setServerOrderTotal(Number(billData.grand_total));
      setIsBilled(true);
      setShowBillPreview(true);
      toast.success('Bill Generated!', { id: billingToast });
    } catch (err) { toast.error(err.message, { id: billingToast }); }
    finally { setBilling(false); }
  };

  // Reset the whole POS to an empty state (used by Cancel Order + after payment).
  const resetPOS = () => {
    dispatch(clearCart());
    dispatch(setDiscount({ type: null, value: 0, reason: '' }));
    if (selectedTable) dispatch(setSelectedTable(null));
    setTempOrderId(null);
    setIsBilled(false);
    setBilledOrder(null);
    setServerOrderTotal(null);
    setBalanceDue(null);
    setIsCompMode(false);
    setGratuity(0);
    setAppliedLoyaltyPoints(0);
    setAppliedLoyaltyDiscount(0);
  };

  // Switching the order type starts a NEW order. A dine-in punch keeps tempOrderId set so
  // extra rounds go to the same table — but that held order must NOT absorb the next punch
  // of a different type. Without this, selecting Takeaway/Delivery after a dine-in punch and
  // punching again hit the "add items to existing order" path and merged into the dine-in
  // order (its items + total grew in Live Orders). Reset the order identity on a real type
  // change; keep the cart the operator may have started for the new order. Same type (e.g.
  // punching another dine-in round) is a no-op, so the add-a-round flow is preserved.
  const handleOrderTypeChange = (id) => {
    if (id === orderType) return;
    if (tempOrderId) {
      setTempOrderId(null);
      setCurrentOrder(null);
      setIsBilled(false);
      setBilledOrder(null);
      setServerOrderTotal(null);
      setBalanceDue(null);
    }
    if (id !== 'dine_in' && selectedTable) dispatch(setSelectedTable(null));
    dispatch(setOrderType(id));
  };

  const handleCancelOrder = async (reason) => {
    try {
      // Only orders that were actually created on the server need a cancel call; a
      // not-yet-punched cart is just cleared locally. Either way the cart empties.
      if (tempOrderId) {
        if (IS_ELECTRON && !isOnline) {
          // Offline: void locally (cancels order + frees table + synced=0).
          await hybridAPI.voidOrder(tempOrderId, reason);
        } else {
          try {
            await api.post(`/orders/${tempOrderId}/cancel`, { reason });
          } catch (err) {
            // Backend briefly unreachable → void locally so the terminal never blocks.
            // Real HTTP errors re-throw; browser (non-Electron) is untouched.
            if (IS_ELECTRON && isNetworkError(err)) {
              await hybridAPI.voidOrder(tempOrderId, reason);
            } else { throw err; }
          }
        }
        toast.success('Order cancelled');
        queryClient.invalidateQueries({ queryKey: ['running-orders'] });
        queryClient.invalidateQueries({ queryKey: ['kds-kots'] });
        queryClient.invalidateQueries({ queryKey: ['tables', outletId] });
      } else {
        toast.success('Order cleared');
      }
      resetPOS();
      setShowCancelOrder(false);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Could not cancel order');
    }
  };

  const handleBogo = () => {
    // Toggle off if already active
    if (discount?.type === 'bogo') {
      dispatch(setDiscount({ type: null, value: 0, reason: '' }));
      toast.success('BOGO removed');
      return;
    }
    if (cart.length < 2) {
      toast.error('Add at least 2 items to use BOGO');
      return;
    }
    // Find the cart item with the lowest unit price (base + variant + addons per unit)
    let cheapestIndex = 0;
    let cheapestUnitPrice = Infinity;
    cart.forEach((item, idx) => {
      const unitPrice = (Number(item.base_price) || 0) + (Number(item.variant_price) || 0)
        + (item.addons || []).reduce((s, a) => s + Number(a.price) * a.quantity, 0);
      if (unitPrice < cheapestUnitPrice) {
        cheapestUnitPrice = unitPrice;
        cheapestIndex = idx;
      }
    });
    const freeItem = cart[cheapestIndex];
    const freeItemName = freeItem.variant_name
      ? `${freeItem.name} (${freeItem.variant_name})`
      : freeItem.name;
    dispatch(setDiscount({ type: 'bogo', value: cheapestUnitPrice, reason: `BOGO: ${freeItemName} free` }));
    toast.success(`BOGO applied — ${freeItemName} is free!`);
  };

  const handleTableClick = async (table) => {
    dispatch(setSelectedTable(table));
    if (table.status === 'occupied' && table.orders?.[0]) {
      try {
        let order;
        if (IS_ELECTRON && !isOnline) {
          order = await hybridAPI.getOrder(table.orders[0].id);
        } else {
          const res = await api.get(`/orders/${table.orders[0].id}`);
          order = res.data;
        }

        // Map order items to cart format (handle both cloud and SQLite shapes)
        const orderItems = order.order_items || order.items || [];
        const cartItems = orderItems.map(item => {
          // Parse addons: SQLite stores as JSON string or null, cloud as array
          let addons = [];
          if (Array.isArray(item.addons)) {
            addons = item.addons.map(a => ({
              addon_id: a.addon_id,
              name: a.name,
              price: Number(a.price),
              quantity: a.quantity || 1
            }));
          } else if (typeof item.addons === 'string') {
            try { addons = JSON.parse(item.addons) || []; } catch { addons = []; }
          }
          return {
            menu_item_id: item.menu_item_id,
            name: item.name || item.menu_item_name,
            base_price: Number(item.unit_price || item.base_price || 0),
            food_type: item.food_type || 'veg',
            kitchen_station: item.kitchen_station,
            variant_id: item.variant_id,
            variant_price: Number(item.variant_price || 0),
            variant_name: item.variant_name,
            quantity: item.quantity,
            notes: item.notes,
            addons,
          };
        });

        dispatch(setPOSState({
          cart: cartItems,
          selectedTable: table,
          selectedCustomer: order.customer || null,
          orderType: order.order_type,
          orderNotes: order.notes || '',
          covers: order.covers || 1
        }));

        setTempOrderId(order.id);
        if (order.grand_total != null) setServerOrderTotal(Number(order.grand_total));
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
      setServerOrderTotal(null);
      setBalanceDue(null);
      toast.success(`Table ${table.table_number} selected`);
    }
    setViewMode('menu');
  };

  const processManagerAction = async () => {
    if(!managerPin) return toast.error('PIN is required');
    try {
      if (IS_ELECTRON && !isOnline) {
        // Offline: accept PIN locally (manager override)
        toast('Offline: PIN accepted locally', { icon: '🔑' });
      } else {
        await api.post('/staff/verify-pin', { pin: managerPin, outlet_id: outletId });
      }

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
        if (IS_ELECTRON && !isOnline) {
          await hybridAPI.generateKOT(orderId).catch(() => {});
        } else {
          await api.post(`/orders/${orderId}/kot`, { outlet_id: outletId }).catch(() => {});
        }
      }

      const payAmt = paymentMethod === 'part' ? Number(partPaymentAmount) : (billedOrder?.grand_total || cartTotals.total);
      if (IS_ELECTRON && !isOnline) {
        await hybridAPI.processPayment(orderId, { method: paymentMethod, amount: payAmt });
      } else {
        try {
          await api.post(`/orders/${orderId}/payment`, { method: paymentMethod, amount: payAmt });
        } catch (err) {
          // Backend briefly unreachable → record the payment in local SQLite so a
          // blip never blocks the sale. Real HTTP errors re-throw and keep their
          // specific message; browser (non-Electron) is untouched.
          if (IS_ELECTRON && isNetworkError(err)) {
            await hybridAPI.processPayment(orderId, { method: paymentMethod, amount: payAmt });
          } else { throw err; }
        }
      }

      toast.success(paymentMethod === 'part' ? 'Part Payment Recorded' : 'Payment Completed ✓');
      dispatch(clearCart());
      setShowPayment(false);
      setTempOrderId(null);
    } catch (err) { toast.error(err.message || 'Payment failed'); }
  };

  const executeTableAction = async (targetTableId) => {
     // 'select' mode = initial table assignment before order is created.
     // Just stash the table in Redux — when the user presses Punch/Pay, the order
     // is created with table_id already set.
     if (tableSelectMode === 'select') {
       const t = (tablesForSelect || []).find(x => x.id === targetTableId);
       if (t) dispatch(setSelectedTable({
         id: t.id,
         table_number: t.table_number,
         capacity: t.capacity ?? t.seating_capacity,
         status: t.status,
       }));
       setTableSelectMode(null);
       toast.success(`Table T-${t?.table_number ?? ''} assigned`);
       return;
     }
     // 'transfer' / 'merge' both require an existing order
     if (!tempOrderId) return toast.error('No open order selected');
     // Resolve the target table's live order id — needed for an offline merge, which
     // moves this order's items into that table's order (the online 'auto' shortcut
     // is a backend convenience that isn't available to the local SQLite engine).
     const resolveTargetOrderId = () => {
       const t = (tablesForSelect || []).find(x => x.id === targetTableId);
       return t?.current_order_id || t?.orders?.[0]?.id || null;
     };
     try {
       if (tableSelectMode === 'transfer') {
         if (IS_ELECTRON && !isOnline) {
           await hybridAPI.transferTable(tempOrderId, targetTableId);
         } else {
           try {
             await api.post(`/orders/${tempOrderId}/transfer-table`, { new_table_id: targetTableId });
           } catch (err) {
             if (IS_ELECTRON && isNetworkError(err)) {
               await hybridAPI.transferTable(tempOrderId, targetTableId);
             } else { throw err; }
           }
         }
         toast.success('Table Transferred');
       } else if (tableSelectMode === 'merge') {
         if (IS_ELECTRON && !isOnline) {
           const targetOrderId = resolveTargetOrderId();
           if (!targetOrderId) return toast.error('No order on that table to merge with');
           await hybridAPI.mergeOrders(tempOrderId, targetOrderId);
         } else {
           try {
             await api.post(`/orders/${tempOrderId}/merge`, { target_order_id: 'auto' });
           } catch (err) {
             if (IS_ELECTRON && isNetworkError(err)) {
               const targetOrderId = resolveTargetOrderId();
               if (!targetOrderId) return toast.error('No order on that table to merge with');
               await hybridAPI.mergeOrders(tempOrderId, targetOrderId);
             } else { throw err; }
           }
         }
         toast.success('Tables Merged');
       }
       setTableSelectMode(null);
       dispatch(clearCart());
       // After any offline (or online) transfer/merge, refresh the shared views.
       queryClient.invalidateQueries({ queryKey: ['running-orders'] });
       queryClient.invalidateQueries({ queryKey: ['kds-kots'] });
       queryClient.invalidateQueries({ queryKey: ['tables', outletId] });
     } catch(e) { toast.error(e.message); }
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-7rem)] animate-fade-in relative overflow-hidden">
      {/* Table Select Overlay — refined: zone-grouped, status-aware ───── */}
      {tableSelectMode && (() => {
        const modeTitle = {
          select:   'Assign Table',
          transfer: 'Transfer To',
          merge:    'Merge With',
        }[tableSelectMode] || 'Pick Table';
        const modeSub = {
          select:   'Choose a free table for this order. Tap one to assign.',
          transfer: 'Move this order to another table.',
          merge:    'Combine this order with another active table.',
        }[tableSelectMode] || '';
        // For 'select' mode allow ONLY available tables; for transfer/merge show all
        const list = (tablesForSelect || []).filter(t => {
          if (tableSelectMode === 'select')   return t.status === 'available' || t.id === selectedTable?.id;
          if (tableSelectMode === 'merge')    return t.status === 'occupied';
          return true; // transfer
        });
        // Group by area_id
        const byArea = {};
        list.forEach(t => {
          const k = t.area_id || 'unzoned';
          if (!byArea[k]) byArea[k] = [];
          byArea[k].push(t);
        });
        return (
          <div className="absolute inset-0 backdrop-blur-md z-50 flex flex-col p-6 overflow-y-auto"
            style={{ background: 'rgba(15,23,42,0.45)' }}>
            <div className="max-w-5xl w-full mx-auto rounded-2xl p-6"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 24px 56px rgba(15,23,42,0.2)' }}>
              {/* Header */}
              <div className="flex items-start justify-between mb-5">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--accent)' }}>
                    {tableSelectMode}
                  </div>
                  <h2 className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
                    {modeTitle}
                  </h2>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{modeSub}</p>
                </div>
                <button onClick={() => setTableSelectMode(null)}
                  className="p-2 rounded-lg transition-colors"
                  style={{ color: 'var(--text-secondary)', background: 'var(--bg-hover)' }}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mb-4 text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#10b981' }}/> Free</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#3b82f6' }}/> Busy</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#eab308' }}/> Held</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#94a3b8' }}/> Inactive</span>
                <span className="ml-auto">{list.length} table{list.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Empty */}
              {list.length === 0 ? (
                <div className="text-center py-12 rounded-xl" style={{ background: 'var(--bg-secondary)', border: '1px dashed var(--border)' }}>
                  <Users className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-secondary)', opacity: 0.4 }} />
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                    {tableSelectMode === 'select' ? 'No free tables right now' :
                     tableSelectMode === 'merge'  ? 'No occupied tables to merge with' :
                     'No tables found'}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {tableSelectMode === 'select' && 'Wait for one to clear, or switch to Takeaway/Delivery.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {Object.entries(byArea).map(([areaId, tables]) => {
                    const area = (tableAreas?.data || tableAreas || []).find(a => a.id === areaId);
                    const areaName = area?.name || (areaId === 'unzoned' ? 'Other tables' : 'Zone');
                    return (
                      <div key={areaId}>
                        <div className="flex items-center gap-2 mb-3">
                          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--text-secondary)' }}>
                            {areaName}
                          </h3>
                          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                          <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                            {tables.length} table{tables.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-3">
                          {tables.map(t => {
                            const isSel = selectedTable?.id === t.id;
                            const statusColor =
                              t.status === 'available' ? '#10b981' :
                              t.status === 'occupied'  ? '#3b82f6' :
                              t.status === 'reserved'  ? '#6366f1' :
                              t.status === 'held'      ? '#eab308' :
                              '#94a3b8';
                            const disabled = tableSelectMode === 'select' && t.status !== 'available' && !isSel;
                            return (
                              <button key={t.id}
                                disabled={disabled}
                                onClick={() => executeTableAction(t.id)}
                                className="relative p-3 rounded-xl text-left transition-all overflow-hidden"
                                style={{
                                  background: isSel ? `${statusColor}1c` : 'var(--bg-secondary)',
                                  border: `${isSel ? 2 : 1}px solid ${isSel ? statusColor : 'var(--border)'}`,
                                  opacity: disabled ? 0.45 : 1,
                                  cursor: disabled ? 'not-allowed' : 'pointer',
                                }}
                                onMouseEnter={e => { if (!disabled) { e.currentTarget.style.borderColor = statusColor; e.currentTarget.style.background = `${statusColor}0e`; }}}
                                onMouseLeave={e => { if (!disabled && !isSel) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-secondary)'; }}}>
                                <span className="absolute top-0 left-0 right-0 h-1" style={{ background: statusColor }} />
                                <div className="flex items-start justify-between mt-1.5">
                                  <div>
                                    <div className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Table</div>
                                    <div className="text-xl font-black leading-none tracking-tight" style={{ color: 'var(--text-primary)' }}>
                                      {t.table_number}
                                    </div>
                                  </div>
                                  {isSel && (
                                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md"
                                      style={{ background: statusColor + '22', color: statusColor }}>
                                      Current
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 mt-2 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} />
                                  <span className="capitalize">{t.status}</span>
                                  {(t.capacity || t.seating_capacity) && (
                                    <span className="ml-auto">· {t.capacity || t.seating_capacity} seats</span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Left Menu Area */}
      <div className="flex-1 flex flex-col min-w-0 rounded-2xl p-4 border"
        style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
        {/* Search + Controls */}
        <div className="flex flex-col gap-2 mb-4">
          {/* Row 1: Search (full width) + voice + shortcode */}
          <div className="flex items-center gap-2 relative">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
              <input
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border outline-none"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                placeholder="Search menu items by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
                name="pos-search"
              />
            </div>
            <input
              className="w-32 px-3 py-2.5 rounded-xl text-sm border outline-none"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              placeholder="Codes e.g. DM, KP"
              title="Enter one or more short codes separated by commas, then Add"
              value={shortCodeSearch}
              onChange={(e) => setShortCodeSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddByShortCodes(); } }}
              autoComplete="off"
              name="pos-shortcode"
            />
            <button
              type="button"
              onClick={handleAddByShortCodes}
              disabled={!shortCodeSearch.trim()}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              style={{ background: 'var(--accent)' }}
              title="Add all items for the entered short codes">
              Add
            </button>
            <button
              onClick={() => {
                // In Electron (desktop app) speech recognition isn't available —
                // open the text input as a fallback instead.
                if (!voice.supported) {
                  setShowVoiceInput(true);
                  if (voice.isElectron) {
                    toast('Voice mic isn’t available in desktop app — type your order instead', { icon: '⌨️', duration: 3500 });
                  }
                  return;
                }
                voice.toggleListening();
              }}
              disabled={voice.isThinking}
              title={!voice.supported ? 'Voice mic unavailable in desktop app — click to type instead' : voice.isListening ? 'Tap to stop listening' : 'Tap to start voice order'}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold shadow shrink-0 transition-all ${
                voice.isListening
                  ? 'ring-2 ring-red-400 animate-pulse'
                  : voice.isThinking
                  ? 'opacity-60 cursor-wait'
                  : ''
              }`}
              style={{
                background: voice.isListening ? '#ef4444' : voice.isThinking ? '#6b7280' : 'var(--accent)',
                color: '#fff'
              }}
            >
              <Mic className="w-4 h-4" />
              <span>{voice.isListening ? 'Listening…' : voice.isThinking ? 'Processing…' : 'Voice'}</span>
            </button>
            {/* Language selector for voice */}
            <div className="relative shrink-0" title="Voice language">
              <Globe className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-secondary)' }} />
              <select
                value={voiceLang}
                onChange={(e) => { setVoiceLang(e.target.value); saveVoiceSettings({ language: e.target.value }); }}
                className="pl-7 pr-2 py-2.5 rounded-xl text-xs font-medium border outline-none appearance-none cursor-pointer"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)', minWidth: '70px' }}
              >
                {VOICE_LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.short}</option>
                ))}
              </select>
            </div>
            {/* Toggle text input for voice commands (keyboard icon) */}
            <button
              onClick={() => setShowVoiceInput(v => !v)}
              title="Type a voice command"
              className={`p-2.5 rounded-xl border shrink-0 transition-all ${showVoiceInput ? 'border-accent text-accent' : ''}`}
              style={{ background: 'var(--bg-secondary)', borderColor: showVoiceInput ? 'var(--accent)' : 'var(--border)', color: showVoiceInput ? 'var(--accent)' : 'var(--text-secondary)' }}
            >
              <Keyboard className="w-4 h-4" />
            </button>
            {voice.transcript && (
              <div className="absolute top-full left-0 right-0 mt-1 mx-4 px-3 py-2 rounded-lg text-xs z-50 shadow-lg border"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                🎤 {voice.transcript}
              </div>
            )}
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

          {/* Voice text input row */}
          {showVoiceInput && (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Mic className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                <input
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border outline-none"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--accent)', color: 'var(--text-primary)' }}
                  placeholder='Type order… e.g. "2 butter chicken aur 1 naan"'
                  value={voiceText}
                  onChange={(e) => setVoiceText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && voiceText.trim() && !voice.isThinking) {
                      if (tryShortCodeAdd(voiceText.trim())) { setVoiceText(''); return; }
                      voice.sendToLLM(voiceText.trim());
                      setVoiceText('');
                    }
                  }}
                  autoFocus
                  disabled={voice.isThinking}
                />
              </div>
              <button
                onClick={() => { if (voiceText.trim()) { if (tryShortCodeAdd(voiceText.trim())) { setVoiceText(''); return; } voice.sendToLLM(voiceText.trim()); setVoiceText(''); } }}
                disabled={!voiceText.trim() || voice.isThinking}
                className="px-4 py-2.5 rounded-xl text-sm font-bold shrink-0 transition-all flex items-center gap-1.5"
                style={{
                  background: voiceText.trim() && !voice.isThinking ? 'var(--accent)' : 'var(--bg-hover)',
                  color: voiceText.trim() && !voice.isThinking ? '#fff' : 'var(--text-secondary)',
                }}
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            </div>
          )}

          {/* Row 2: Order type selector — prominent, always visible */}
          <div data-tour="pos.ordertype" className="flex items-center gap-2">
            {[
              { id: 'dine_in',  label: 'Dine In',   Icon: UtensilsCrossed },
              { id: 'takeaway', label: 'Takeaway',   Icon: Package },
              { id: 'delivery', label: 'Delivery',   Icon: Bike },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => handleOrderTypeChange(id)}
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
            {/* Categories — each tab shows its item count so operators
                see at a glance how many items live under each section. */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-none">
              <button
                onClick={() => setActiveCategory(null)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  !activeCategory ? 'tab-btn-active' : 'bg-surface-800 text-surface-400'
                }`}
              >
                All
                <span
                  className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums ${
                    !activeCategory
                      ? 'bg-white/25 text-white'
                      : 'bg-surface-700/70 text-surface-300'
                  }`}
                  aria-label={`${totalItemCount} items in total`}
                >
                  {totalItemCount}
                </span>
              </button>

              {(categories || []).map((cat) => {
                const count = itemCountByCategory[String(cat.id)] || 0;
                const active = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                      active ? 'tab-btn-active' : 'bg-surface-800 text-surface-400'
                    }`}
                  >
                    {cat.name}
                    <span
                      className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums ${
                        active
                          ? 'bg-white/25 text-white'
                          : count === 0
                          ? 'bg-surface-700/40 text-surface-500'
                          : 'bg-surface-700/70 text-surface-300'
                      }`}
                      aria-label={`${count} items in ${cat.name}`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Menu Grid */}
            <div data-tour="pos.menu" className="flex-1 overflow-y-auto grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 content-start">
              {menuLoading && filteredItems.length === 0 &&
                Array.from({ length: 12 }).map((_, i) => (
                  <div key={`sk-${i}`} className="card p-3 pt-2 pl-3 border-l-4 border-l-surface-600 animate-pulse" style={{ minHeight: 76 }}>
                    <div className="h-2 w-1/2 rounded mb-3" style={{ background: 'var(--bg-hover)' }} />
                    <div className="h-3 w-3/4 rounded mb-2" style={{ background: 'var(--bg-hover)' }} />
                    <div className="h-4 w-1/3 rounded" style={{ background: 'var(--bg-hover)' }} />
                  </div>
                ))}
              {!menuLoading && filteredItems.length === 0 && (
                <div className="col-span-full py-12 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {activeCategory ? 'No items in this category' : 'No menu items found'}
                </div>
              )}
              {filteredItems.map((item) => {
                const hasNoPrice = !Number(item.base_price) || Number(item.base_price) <= 0;
                const isOOS = item.is_available === false || (item.track_inventory && item.stock_quantity !== undefined && item.stock_quantity <= 0);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleAddItem(item)}
                    className={`card-hover text-left p-3 pt-2 pl-3 group border-l-4 ${BORDER_COLORS[item.food_type] || 'border-l-surface-600'} relative ${isOOS ? 'opacity-60' : ''}`}
                    title={isOOS ? 'Out of Stock' : hasNoPrice ? 'Price not set — edit this item in Menu' : item.name}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-1 flex-wrap">
                        {isAU ? (
                          Array.isArray(item.tags) && item.tags.length > 0 ? (
                            item.tags.slice(0, 2).map(tv => {
                              const t = AU_TAG_MAP[tv];
                              return t ? <span key={tv} className={`text-[7px] font-black uppercase px-1 py-0.5 rounded ${t.bg} ${t.text}`}>{t.abbr}</span> : null;
                            })
                          ) : (
                            SQUARE_ICONS[item.food_type]
                          )
                        ) : (
                          SQUARE_ICONS[item.food_type]
                        )}
                        {item.short_code && <span className="text-[10px] px-1 rounded font-mono" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{item.short_code}</span>}
                      </div>
                      <div className="flex gap-1">
                        {item.is_bestseller && <Star className="w-3 h-3 text-warning-400 fill-warning-400" />}
                      </div>
                    </div>
                    {isOOS && (
                      <div className="absolute inset-0 rounded-xl flex items-center justify-center pointer-events-none" style={{ background: 'rgba(0,0,0,0.35)', zIndex: 2 }}>
                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md" style={{ background: 'rgba(239,68,68,0.9)', color: '#fff' }}>Out of Stock</span>
                      </div>
                    )}
                    <p className="text-sm font-medium line-clamp-2 mb-1 transition-colors" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                    {hasNoPrice ? (
                      <p className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--danger)' }}>
                        <AlertCircle className="w-3 h-3" /> No price set
                      </p>
                    ) : (
                      <p className="text-base font-bold" style={{ color: 'var(--accent)' }}>{symbol}{Number(item.base_price).toFixed(0)}</p>
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
      <div className="w-[320px] xl:w-[380px] shrink-0 flex flex-col border rounded-2xl overflow-hidden relative shadow-xl"
        style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)", background: "var(--bg-hover)" }}>
           <div className="flex items-center justify-between mb-2">
             <div className="flex items-center gap-2">
               {/* Clickable table picker — opens overlay to pick / change table */}
               {orderType === 'dine_in' ? (
                 <button
                   onClick={() => setTableSelectMode('select')}
                   className={`flex items-center gap-1.5 text-sm font-semibold transition-all px-2 py-1 rounded ${
                     selectedTable
                       ? 'bg-brand-500/20 text-brand-400 hover:bg-brand-500/30'
                       : 'border border-dashed text-surface-400 hover:text-white hover:border-brand-500/60'
                   }`}
                   style={!selectedTable ? { borderColor: 'var(--border)' } : undefined}
                   title={selectedTable ? 'Click to change table' : 'Click to assign a table'}
                 >
                   <Users className="w-3.5 h-3.5" />
                   {selectedTable ? `T-${selectedTable.table_number}` : 'Select Table'}
                 </button>
               ) : (
                 <span className="text-sm font-semibold text-surface-400">
                   {orderType === 'takeaway' ? 'Takeaway' : 'Delivery'}
                 </span>
               )}
               <span className="badge-neutral">{cart.length} item</span>
             </div>
             <div className="flex items-center gap-1">
               {selectedTable && (
                 <>
                   {/* Table transfer lives in Live Orders (Running Orders) now — it was
                       error-prone here next to the table picker. Merge stays. */}
                   <button disabled={actionBusy} onClick={() => runDraftAction(async () => {
                     if (!tempOrderId) {
                       const o = await handleCreateOrderCore('created');
                       if (o?.id) setTempOrderId(o.id);
                     }
                     setTableSelectMode('merge');
                   })} className="p-1.5 hover:text-white text-surface-400 disabled:opacity-50 disabled:cursor-not-allowed" title="Merge"><Combine className="w-4 h-4"/></button>
                 </>
               )}
               <button onClick={() => setShowCovers(!showCovers)} className={`p-1.5 rounded-lg ${showCovers ? 'tab-btn-active' : 'text-surface-400 hover:text-white'}`}><Users className="w-4 h-4" /></button>
               <button onClick={() => setShowNotes(!showNotes)} className={`p-1.5 rounded-lg ${showNotes || orderNotes ? 'tab-btn-active' : 'text-surface-400 hover:text-white'}`}><ClipboardList className="w-4 h-4" /></button>
               <button onClick={() => setShowCustomerSearch(!showCustomerSearch)} className={`p-1.5 rounded-lg ${selectedCustomer ? 'bg-success-500 text-white' : 'text-surface-400 hover:text-white'}`}><UserPlus className="w-4 h-4" /></button>
               <button onClick={() => {dispatch(clearCart()); setIsCompMode(false); setTempOrderId(null); setGratuity(0); setAppliedLoyaltyPoints(0); setAppliedLoyaltyDiscount(0);}} className="p-1.5 text-surface-400 hover:text-red-400"><Trash2 className="w-4 h-4"/></button>
             </div>
           </div>
           
           {selectedCustomer && (
             <div className="flex items-center justify-between bg-brand-500/10 border border-brand-500/20 rounded-lg p-2 text-xs">
               <div className="flex items-center gap-2">
                 <div className="w-6 h-6 bg-brand-500 text-white rounded-full flex items-center justify-center font-bold shadow">{selectedCustomer.full_name?.charAt(0) || '?'}</div>
                 <div>
                    <span className="text-white font-medium block">{selectedCustomer.full_name}</span>
                    <span className="text-brand-400">Loyalty: {selectedCustomer?.loyalty_points?.current_balance ?? 0} pts</span>
                 </div>
               </div>
               <button onClick={() => dispatch(setSelectedCustomer(null))}><X className="w-4 h-4 text-surface-400 hover:text-red-400" /></button>
             </div>
           )}
           {/* Staff assignment — inline compact selector */}
           <div className="flex items-center justify-between mt-1.5">
             <StaffAssignSelector
               outletId={outletId}
               orderId={tempOrderId}
               assignedStaff={assignedStaff}
               onAssign={setAssignedStaff}
             />
           </div>
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
                <p className="text-xs text-surface-500 mt-0.5">{symbol}{(Number(item.base_price) + (item.variant_price || 0)).toFixed(0)} × {item.quantity}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => dispatch(updateCartQuantity({ index: i, quantity: item.quantity - 1 }))} className="w-6 h-6 rounded bg-surface-700 text-surface-300 hover:bg-surface-600 flex items-center justify-center"><Minus className="w-3 h-3" /></button>
                <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                <button onClick={() => dispatch(updateCartQuantity({ index: i, quantity: item.quantity + 1 }))} className="w-6 h-6 rounded bg-surface-700 text-surface-300 hover:bg-surface-600 flex items-center justify-center"><Plus className="w-3 h-3" /></button>
              </div>
              <p className={`text-sm font-semibold w-16 text-right ${isCompMode ? 'text-success-500 line-through' : 'text-white'}`}>
                {symbol}{((Number(item.base_price || 0) + Number(item.variant_price || 0)) * item.quantity).toFixed(0)}
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
               <button onClick={() => { if (isCompMode) { setIsCompMode(false); setCompReason(''); } else { setManagerAction('complimentary'); setShowManagerPin(true); } }} className={`py-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors ${isCompMode ? 'bg-success-500 text-white' : 'bg-surface-700 hover:bg-surface-600 text-surface-300'}`}>
                  <Gift className="w-4 h-4"/> <span className="text-[10px] uppercase font-bold">{isCompMode ? 'Undo Comp' : 'Comp'}</span>
               </button>
               <button onClick={() => setShowDiscount(true)} className={`py-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors ${discount?.type ? 'bg-brand-500 text-white' : 'bg-surface-700 hover:bg-surface-600 text-surface-300'}`}>
                  <Percent className="w-4 h-4"/> <span className="text-[10px] uppercase font-bold">Discount</span>
               </button>
               {tempOrderId && (
                 <button onClick={async () => {
                   try {
                     let order;
                     if (IS_ELECTRON && !isOnline) {
                       order = await hybridAPI.getOrder(tempOrderId);
                     } else {
                       try {
                         const res = await api.get(`/orders/${tempOrderId}`);
                         order = res.data?.data ?? res.data;
                       } catch (err) {
                         if (IS_ELECTRON && isNetworkError(err)) {
                           order = await hybridAPI.getOrder(tempOrderId);
                         } else { throw err; }
                       }
                     }
                     // VoidItemModal reads order.order_items — the SQLite shape uses `items`.
                     if (order && !order.order_items) order = { ...order, order_items: order.items || [] };
                     setCurrentOrderForModal(order);
                     setShowVoidItem(true);
                   } catch { toast.error('Could not load order items'); }
                 }} className="py-2 rounded-lg flex flex-col items-center justify-center gap-1 bg-surface-700 hover:bg-red-500/20 hover:text-red-400 text-surface-300 transition-colors">
                   <Trash2 className="w-4 h-4"/> <span className="text-[10px] uppercase font-bold">Void</span>
                 </button>
               )}
               {/* Split bill moved into the Payment popup (PAY → "Split bill"), so it no
                   longer pre-creates a running order before the owner pays. */}
               <button
                 disabled={actionBusy}
                 onClick={() => runDraftAction(async () => {
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
                 })}
                 className="py-2 rounded-lg flex flex-col items-center justify-center gap-1 bg-surface-700 hover:bg-brand-500 hover:text-white text-surface-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 <FileText className="w-4 h-4"/> <span className="text-[10px] uppercase font-bold">eBill</span>
               </button>
            </div>

            {/* Tax Breakdown Panel */}
            <TaxBreakdownPanel
              outletId={outletId}
              cartItems={cart}
              subtotal={cartTotals.subtotal}
              discount={discount}
              isAU={isAU}
              isVisible={showTaxBreakdown}
            />
            <button
              onClick={() => setShowTaxBreakdown(p => !p)}
              className="w-full text-[10px] uppercase tracking-wider font-semibold py-1 mb-1 flex items-center justify-center gap-1 transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              {showTaxBreakdown ? '▲' : '▼'} Tax breakdown
            </button>

            {/* Loyalty Redemption */}
            {selectedCustomer && (
              <div className="mb-2">
                <LoyaltyRedemption
                  customer={selectedCustomer}
                  outletId={outletId}
                  orderTotal={cartTotals.total}
                  appliedPoints={appliedLoyaltyPoints}
                  onRedeem={(pts, disc) => { setAppliedLoyaltyPoints(pts); setAppliedLoyaltyDiscount(disc); }}
                  onRemove={() => { setAppliedLoyaltyPoints(0); setAppliedLoyaltyDiscount(0); }}
                />
              </div>
            )}

            {/* Gratuity Selector */}
            <div className="mb-2">
              <GratuitySelector
                subtotal={cartTotals.subtotal}
                gratuity={gratuity}
                onGratuityChange={setGratuity}
                isAU={isAU}
              />
            </div>

            <div className="flex justify-between items-end mb-3 px-1">
              <div>
                 <p className="text-xs text-surface-400">Tax: {symbol}{cartTotals.tax.toFixed(isAU ? 2 : 0)}{isAU ? ' incl.' : ''}</p>
                 {cartTotals.bogoDeduction > 0 && (
                   <p className="text-xs text-brand-400 mt-0.5 font-semibold flex items-center gap-1">
                     <Percent className="w-3 h-3" />
                     Discount &minus;{symbol}{isAU ? cartTotals.bogoDeduction.toFixed(2) : Math.round(cartTotals.bogoDeduction)}
                     <button
                       onClick={() => dispatch(setDiscount({ type: null, value: 0, reason: '' }))}
                       className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
                       title="Remove discount">
                       <X className="w-3 h-3" />
                     </button>
                   </p>
                 )}
                 {appliedLoyaltyDiscount > 0 && (
                   <p className="text-xs text-yellow-400 mt-0.5 font-semibold">
                     ⭐ Loyalty &minus;{symbol}{appliedLoyaltyDiscount.toFixed(2)}
                   </p>
                 )}
                 {gratuity > 0 && (
                   <p className="text-xs text-emerald-400 mt-0.5 font-semibold">
                     Gratuity +{symbol}{isAU ? gratuity.toFixed(2) : Math.round(gratuity)}
                   </p>
                 )}
                 <p className="text-2xl font-black text-brand-400 leading-none mt-1">{symbol}{isAU ? cartTotals.grandTotal.toFixed(2) : Math.round(cartTotals.grandTotal)}</p>
                 {isCompMode && <p className="text-xs text-success-400 mt-1 uppercase font-bold tracking-widest">100% Waived</p>}
              </div>
            </div>

            <div className="flex gap-2 mb-2">
               <button onClick={() => setShowCancelOrder(true)} className="btn-surface px-4 py-3 text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors">
                  <X className="w-5 h-5" />
               </button>
               {isBilled ? (
                 <button onClick={() => {
                   if (billedOrder) {
                     PrintService.printBill(billedOrder, { name: user?.outlet_name || 'Restaurant', gstin: user?.gstin, region: isAU ? 'AU' : 'IN' }).catch(() => setShowBillPreview(true));
                   } else {
                     setShowBillPreview(true);
                   }
                 }} className="btn-surface flex-1 py-3 border-brand-500 text-brand-400 font-bold flex items-center justify-center gap-2">
                    <Printer className="w-4 h-4" /> PRINT BILL
                 </button>
               ) : (
                 /* 
                  * Align with Test Workflow: 
                  * If cart has items, primarily show PUNCH KOT. 
                  * Hide GENERATE BILL if items are pending.
                  */
                 <button data-tour="pos.actions" onClick={handlePunchKOT} disabled={punching} className="btn-primary flex-1 py-3 text-sm flex flex-col items-center justify-center gap-1 shadow-lg shadow-brand-500/20 disabled:opacity-60 disabled:cursor-not-allowed">
                    <Send className="w-4 h-4"/> <span>{punching ? 'Sending…' : 'PUNCH KOT & PRINT'}</span>
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

            <button onClick={() => { if (ensureTableSelected()) setShowPayment(true); }} disabled={billing} className="btn-success w-full py-4 rounded-xl text-lg shadow-lg shadow-success-500/20 active:scale-[0.99] transition-transform font-bold tracking-wide disabled:opacity-60 disabled:cursor-not-allowed">
              {isBilled ? 'PAY BILL' : `PAY ${symbol}${isAU ? payableAmount.toFixed(2) : Math.round(payableAmount)}`}
            </button>
            {/* Refund button — visible only for paid orders */}
            {billedOrder?.is_paid && (
              <button
                onClick={async () => {
                  setCurrentOrderForModal(billedOrder);
                  setShowRefund(true);
                }}
                className="w-full mt-1.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                <Package className="w-3.5 h-3.5" /> Process Refund
              </button>
            )}
          </div>
        )}

        {/* Show GENERATE BILL only after KOT is punched (cart empty, real order exists) */}
        {!isBilled && cart.length === 0 && tempOrderId && typeof tempOrderId === 'string' && tempOrderId.length > 10 && (
          <div className="p-3" style={{ background: 'var(--bg-card)' }}>
            <button onClick={handleGenerateBill} disabled={billing} className="w-full py-3 rounded-xl font-bold tracking-wide flex items-center justify-center gap-2 transition-all text-white disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)' }}>
               <FileText className="w-4 h-4" /> {billing ? 'Generating…' : 'GENERATE BILL'}
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
      <Modal isOpen={showManagerPin} onClose={() => { setShowManagerPin(false); setManagerPin(''); setCompReason(''); }} title="Manager Verification" size="sm">
         <div className="space-y-4">
            {/* Context box explains WHY a PIN is needed */}
            <div className="rounded-lg p-3" style={{
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.25)',
            }}>
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(245,158,11,0.15)' }}>
                  <span className="text-base">🔒</span>
                </div>
                <div className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {managerAction === 'complimentary' && <>
                    A complimentary order writes off the entire bill. This needs a manager&rsquo;s
                    4-digit PIN to authorise the revenue write-off.
                  </>}
                  {managerAction === 'discount' && <>
                    Manual discounts beyond the auto-applied rules need manager approval.
                  </>}
                  {managerAction === 'void' && <>
                    Voiding an order removes it from sales — manager PIN required for the audit trail.
                  </>}
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider block mb-2"
                style={{ color: 'var(--text-secondary)' }}>
                Manager PIN
              </label>
              <input
                type="password"
                value={managerPin}
                onChange={e => setManagerPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={e => { if (e.key === 'Enter') processManagerAction(); }}
                className="input w-full text-center font-mono"
                style={{
                  fontSize: 28,
                  letterSpacing: '0.8em',
                  paddingLeft: '0.8em',  // counteract letter-spacing for true centering
                  height: 64,
                }}
                placeholder="••••"
                maxLength={6}
                autoFocus
                inputMode="numeric"
              />
            </div>

            {managerAction === 'complimentary' && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider block mb-2"
                  style={{ color: 'var(--text-secondary)' }}>
                  Reason for comp <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  placeholder="e.g. VIP guest, food complaint, staff meal…"
                  value={compReason}
                  onChange={e => setCompReason(e.target.value)}
                  className="input w-full resize-none text-sm"
                  rows={2}
                />
              </div>
            )}

            <button
              onClick={processManagerAction}
              disabled={!managerPin || managerPin.length < 4 || managerPin.length > 6 || (managerAction === 'complimentary' && !compReason.trim())}
              className="btn-primary w-full py-3 mt-2 disabled:opacity-50 disabled:cursor-not-allowed">
              Authorize
            </button>

            {/* Helpful "no PIN set" footnote */}
            <div className="text-center text-[11px] pt-2" style={{ color: 'var(--text-secondary)' }}>
              Don&rsquo;t have a manager PIN?{' '}
              <button
                type="button"
                onClick={() => { setShowManagerPin(false); navigate('/staff-management'); }}
                className="underline font-semibold"
                style={{ color: 'var(--accent)' }}>
                Set one in Staff Management →
              </button>
            </div>
         </div>
      </Modal>

      {/* Payment Modal — UPI QR · Cash · Card · Razorpay · Due */}
      <PaymentModal
        isOpen={showPayment}
        onClose={() => setShowPayment(false)}
        amount={payableAmount}
        orderId={tempOrderId}
        orderNumber={billedOrder?.order_number}
        customer={selectedCustomer}
        canSplit={!isBilled && cart.length > 0}
        onSplit={() => {
          // Just open the split UI. The order is NOT created here — only when the split
          // is actually processed (ensureOrder below). So cancelling split creates nothing.
          setShowPayment(false);
          setShowSplitBill(true);
        }}
        onSuccess={async (method, paidAmount, razorpayId, meta) => {
          if (cart.length === 0 && !tempOrderId) throw new Error('Cart is empty');
          let orderId = tempOrderId;
          if (!orderId) {
            const order = await handleCreateOrderCore('created');
            orderId = order.id;
            if (IS_ELECTRON && !isOnline) {
              await hybridAPI.generateKOT(orderId).catch(() => {});
            } else {
              await api.post(`/orders/${orderId}/kot`, { outlet_id: outletId }).catch(() => {});
            }
          }

          // ── Part payment → multi-tender endpoint. Records one tender; the order
          //    stays open until the balance is covered, then auto-finalises. ──
          if (method === 'part') {
            const res = await api.post(`/orders/${orderId}/tender`, {
              method: meta?.partMethod || 'cash',
              amount: paidAmount,
            });
            const data = res?.data || {};
            if (data.closed) {
              toast.success('Payment Completed ✓');
            } else {
              // Keep the order open; reflect the reduced balance for the next tender.
              setTempOrderId(orderId);
              setBalanceDue(Number(data.balance_due));
              toast.success(`Partial recorded — ${symbol}${isAU ? Number(data.balance_due).toFixed(2) : Math.round(Number(data.balance_due))} remaining`);
              queryClient.invalidateQueries({ queryKey: ['running-orders'] });
              return; // do NOT clear the cart/order — balance is still owed
            }
          } else {
            const METHOD_MAP = { cash: 'cash', upi: 'upi_razorpay', card: 'card_pine_labs', due: 'due' };
            if (IS_ELECTRON && !isOnline) {
              await hybridAPI.processPayment(orderId, {
                method: METHOD_MAP[method] || method,
                amount: paidAmount,
              });
            } else {
              try {
                await api.post(`/orders/${orderId}/payment`, {
                  method: METHOD_MAP[method] || method,
                  amount: paidAmount,
                  razorpay_payment_id: razorpayId || undefined,
                });
              } catch (err) {
                // Backend briefly unreachable → record the payment in local SQLite
                // so a blip never blocks the sale. Real HTTP errors re-throw (the
                // modal surfaces them); browser (non-Electron) is untouched.
                if (IS_ELECTRON && isNetworkError(err)) {
                  await hybridAPI.processPayment(orderId, {
                    method: METHOD_MAP[method] || method,
                    amount: paidAmount,
                  });
                } else { throw err; }
              }
            }
            toast.success('Payment Completed ✓');
          }

          dispatch(clearCart());
          setTempOrderId(null);
          setIsBilled(false);
          setBilledOrder(null);
          setServerOrderTotal(null);
          setBalanceDue(null);
          setGratuity(0);
          setAppliedLoyaltyPoints(0);
          setAppliedLoyaltyDiscount(0);
          queryClient.invalidateQueries({ queryKey: ['running-orders'] });
          queryClient.invalidateQueries({ queryKey: ['kds-kots'] });
          queryClient.invalidateQueries({ queryKey: ['tables', outletId] });
        }}
      />

      {showSplitBill && <SplitBillModal isOpen={showSplitBill} onClose={() => setShowSplitBill(false)} orderTotal={payableAmount} orderId={tempOrderId}
        ensureOrder={async () => {
          // Create/commit the order ONLY when the split is actually processed.
          if (tempOrderId) return tempOrderId;
          const o = await handleCreateOrderCore('created');
          if (o?.id) { setTempOrderId(o.id); return o.id; }
          return null;
        }} />}
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

      {/* Voice POS — confirm-before-add modal (only renders when voice.pendingOrder exists) */}
      <VoiceConfirmModal voice={voice} />

      {/* Void Item Modal — manager-PIN-gated item void / comp */}
      {showVoidItem && currentOrderForModal && (
        <VoidItemModal
          isOpen={showVoidItem}
          onClose={() => { setShowVoidItem(false); setCurrentOrderForModal(null); }}
          order={currentOrderForModal}
          outletId={outletId}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['running-orders'] });
            queryClient.invalidateQueries({ queryKey: ['kds-kots'] });
            queryClient.invalidateQueries({ queryKey: ['tables', outletId] });
            setShowVoidItem(false);
            setCurrentOrderForModal(null);
          }}
        />
      )}

      {/* Discount Modal — pre-order (Redux) or post-order (API) discount */}
      <DiscountModal
        isOpen={showDiscount}
        onClose={() => setShowDiscount(false)}
        orderId={tempOrderId}
        outletId={outletId}
        cartSubtotal={cartTotals.subtotal}
        currentDiscount={discount}
        onApplyDiscount={(d) =>
          d
            ? dispatch(setDiscount(d))
            : dispatch(setDiscount({ type: null, value: 0, reason: '' }))
        }
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['running-orders'] });
          queryClient.invalidateQueries({ queryKey: ['kds-kots'] });
          queryClient.invalidateQueries({ queryKey: ['tables', outletId] });
          setShowDiscount(false);
        }}
      />

      {/* Refund Modal — post-payment refund with method + reason */}
      {showRefund && currentOrderForModal && (
        <RefundModal
          isOpen={showRefund}
          onClose={() => { setShowRefund(false); setCurrentOrderForModal(null); }}
          order={currentOrderForModal}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['running-orders'] });
            setShowRefund(false);
            setCurrentOrderForModal(null);
            dispatch(clearCart());
            setTempOrderId(null);
            setGratuity(0);
            setAppliedLoyaltyPoints(0);
            setAppliedLoyaltyDiscount(0);
          }}
        />
      )}
    </div>
  );
}
