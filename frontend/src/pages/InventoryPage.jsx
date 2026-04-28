import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import {
  Package, Search, Plus, AlertTriangle, ArrowDown, ArrowUp,
  History, Trash2, Edit2, Truck, BarChart2, Zap, ChefHat,
  RefreshCw, X, CheckCircle2, Users, Settings, Eye,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const TABS = [
  { id: 'stock',     label: 'Stock Dashboard', icon: BarChart2 },
  { id: 'materials', label: 'Raw Materials',   icon: Package },
  { id: 'recipes',   label: 'Recipes',         icon: ChefHat },
  { id: 'suppliers', label: 'Suppliers',       icon: Users },
  { id: 'po',        label: 'Purchase Orders', icon: Truck },
  { id: 'logs',      label: 'Logs & Wastage',  icon: History },
];

const UNIT_OPTIONS = ['kg','gm','ltr','ml','pcs','pkt','box','dozen'];
const CAT_OPTIONS  = ['Vegetables','Dairy','Meat','Seafood','Groceries','Beverages','Packaging','Cleaning','Other'];

// ─── stock status badge ─────────────────────────────────────────
function StockBadge({ status }) {
  const map = {
    OK:       'bg-emerald-500/15 text-emerald-400',
    LOW:      'bg-yellow-500/15 text-yellow-400',
    CRITICAL: 'bg-orange-500/20 text-orange-400',
    OUT:      'bg-red-500/20 text-red-400 animate-pulse',
  };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${map[status] || map.OK}`}>{status}</span>;
}

export default function InventoryPage() {
  const { user } = useSelector(s => s.auth);
  const outletId = user?.outlet_id;
  const qc = useQueryClient();

  const [tab, setTab]       = useState('stock');
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('all');

  // Modals
  const [itemModal, setItemModal]   = useState(false);
  const [editItem, setEditItem]     = useState(null);
  const [adjustModal, setAdjustModal] = useState(false);
  const [adjustItem, setAdjustItem] = useState(null);
  const [wastageModal, setWastageModal] = useState(false);
  const [poModal, setPOModal]       = useState(false);
  const [supplierModal, setSupplierModal] = useState(false);
  const [recipeModal, setRecipeModal] = useState(false);
  const [recipeItem, setRecipeItem] = useState(null); // menu item being configured

  // PO form
  const [poForm, setPOForm] = useState({ supplier_id: '', expected_date: '', notes: '', items: [] });

  // ── Queries ─────────────────────────────────────────────────
  const { data: stockData, isLoading: loadingStock } = useQuery({
    queryKey: ['inv-stock', outletId, search, stockFilter],
    queryFn: () => api.get(`/inventory/stock?outlet_id=${outletId}&search=${search}${stockFilter !== 'all' ? `&low_stock=true` : ''}`).then(r => r.data),
    enabled: !!outletId,
  });

  const { data: itemsData, isLoading: loadingItems } = useQuery({
    queryKey: ['inv-items', outletId, search],
    queryFn: () => api.get(`/inventory/items?outlet_id=${outletId}&search=${search}&limit=200`).then(r => r.data),
    enabled: !!outletId && ['materials','po','wastage'].includes(tab),
  });

  const { data: menuItems } = useQuery({
    queryKey: ['menuItemsAll', outletId],
    queryFn: () => api.get(`/menu/items?outlet_id=${outletId}&limit=500`).then(r => r.data),
    enabled: !!outletId && tab === 'recipes',
  });

  const { data: recipesData } = useQuery({
    queryKey: ['inv-recipes', outletId],
    queryFn: () => api.get(`/inventory/recipes?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId && tab === 'recipes',
  });

  const { data: suppliers } = useQuery({
    queryKey: ['inv-suppliers', outletId],
    queryFn: () => api.get(`/inventory/suppliers?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId,
  });

  const { data: poData } = useQuery({
    queryKey: ['inv-pos', outletId],
    queryFn: () => api.get(`/purchase-orders?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId && tab === 'po',
  });

  const { data: wasteLogs } = useQuery({
    queryKey: ['inv-waste', outletId],
    queryFn: () => api.get(`/inventory/wastage?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId && tab === 'logs',
  });

  const { data: lowStockItems } = useQuery({
    queryKey: ['inv-low', outletId],
    queryFn: () => api.get(`/inventory/low-stock?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId,
    refetchInterval: 30000,
  });

  const { data: consumption } = useQuery({
    queryKey: ['inv-consumption', outletId],
    queryFn: () => api.get(`/inventory/consumption-report?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId && tab === 'stock',
  });

  // ── Mutations ────────────────────────────────────────────────
  const inv = (key) => qc.invalidateQueries({ queryKey: [key] });
  const invalidateAll = () => { inv('inv-stock'); inv('inv-items'); inv('inv-low'); inv('inv-recipes'); };

  const createItemMut = useMutation({
    mutationFn: d => api.post('/inventory/items', { ...d, outlet_id: outletId }),
    onSuccess: () => { toast.success('Material created'); invalidateAll(); setItemModal(false); setEditItem(null); },
    onError: e => toast.error(e.response?.data?.message || 'Failed'),
  });

  const updateItemMut = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/inventory/items/${id}`, data),
    onSuccess: () => { toast.success('Updated'); invalidateAll(); setItemModal(false); setEditItem(null); },
    onError: e => toast.error(e.response?.data?.message || 'Failed'),
  });

  const deleteItemMut = useMutation({
    mutationFn: id => api.delete(`/inventory/items/${id}`),
    onSuccess: () => { toast.success('Deleted'); invalidateAll(); },
  });

  const adjustMut = useMutation({
    mutationFn: d => api.post('/inventory/adjust', { ...d, outlet_id: outletId }),
    onSuccess: () => { toast.success('Stock adjusted'); invalidateAll(); setAdjustModal(false); },
    onError: e => toast.error(e.response?.data?.message || 'Failed'),
  });

  const wastageMut = useMutation({
    mutationFn: d => api.post('/inventory/wastage', { ...d, outlet_id: outletId }),
    onSuccess: () => { toast.success('Wastage logged'); invalidateAll(); setWastageModal(false); },
    onError: e => toast.error(e.response?.data?.message || 'Failed'),
  });

  const autoOrderMut = useMutation({
    mutationFn: () => api.post('/inventory/auto-order', { outlet_id: outletId }),
    onSuccess: r => {
      const d = r.data?.data || r.data || {};
      toast.success(`Auto-order done: ${d.orders_created || 0} PO(s) created`);
      qc.invalidateQueries({ queryKey: ['inv-pos'] });
    },
    onError: e => toast.error(e.response?.data?.message || 'Auto-order failed'),
  });

  const supplierMut = useMutation({
    mutationFn: d => api.post('/inventory/suppliers', { ...d, outlet_id: outletId }),
    onSuccess: () => { toast.success('Supplier added'); qc.invalidateQueries({ queryKey: ['inv-suppliers'] }); setSupplierModal(false); },
    onError: e => toast.error(e.response?.data?.message || 'Failed'),
  });

  const createPOMut = useMutation({
    mutationFn: d => api.post('/purchase-orders', { ...d, outlet_id: outletId }),
    onSuccess: () => { toast.success('Purchase Order created'); qc.invalidateQueries({ queryKey: ['inv-pos'] }); setPOModal(false); setPOForm({ supplier_id: '', expected_date: '', notes: '', items: [] }); },
    onError: e => toast.error(e.response?.data?.message || 'Failed to create PO'),
  });

  const createRecipeMut = useMutation({
    mutationFn: ({ menuItemId, ingredients }) => api.post(`/inventory/recipes/${menuItemId}`, { ingredients }),
    onSuccess: () => { toast.success('Recipe saved'); qc.invalidateQueries({ queryKey: ['inv-recipes'] }); setRecipeModal(false); },
    onError: e => toast.error(e.response?.data?.message || 'Failed'),
  });

  // ── Derived data ─────────────────────────────────────────────
  const stockItems  = useMemo(() => stockData?.items || [], [stockData]);
  const rawMats     = useMemo(() => itemsData?.items || itemsData || [], [itemsData]);
  const menuItemArr = useMemo(() => menuItems?.items || menuItems || [], [menuItems]);
  const recipesArr  = useMemo(() => recipesData || [], [recipesData]);
  const suppliersArr = useMemo(() => suppliers || [], [suppliers]);
  const posArr      = useMemo(() => poData?.items || [], [poData]);
  const logsArr     = useMemo(() => wasteLogs || [], [wasteLogs]);
  const lowCount    = (lowStockItems || []).length;

  // ── Item form state (for add/edit modal) ─────────────────────
  const [itemForm, setItemForm] = useState({
    name: '', sku: '', category: 'Vegetables', unit: 'kg',
    cost_per_unit: '', min_threshold: '', max_threshold: '',
    auto_order_enabled: false, reorder_qty: '', preferred_supplier_id: '',
  });

  function openAddItem() {
    setEditItem(null);
    setItemForm({ name: '', sku: '', category: 'Vegetables', unit: 'kg', cost_per_unit: '', min_threshold: '', max_threshold: '', auto_order_enabled: false, reorder_qty: '', preferred_supplier_id: '' });
    setItemModal(true);
  }

  function openEditItem(item) {
    setEditItem(item);
    setItemForm({
      name: item.name || '', sku: item.sku || '',
      category: item.category || 'Vegetables', unit: item.unit || 'kg',
      cost_per_unit: item.cost_per_unit || '', min_threshold: item.min_threshold || '',
      max_threshold: item.max_threshold || '',
      auto_order_enabled: item.auto_order_enabled || false,
      reorder_qty: item.reorder_qty || '', preferred_supplier_id: item.preferred_supplier_id || '',
    });
    setItemModal(true);
  }

  function saveItem(e) {
    e.preventDefault();
    const data = { ...itemForm };
    if (editItem) updateItemMut.mutate({ id: editItem.id, data });
    else createItemMut.mutate(data);
  }

  // ── Recipe builder state ────────────────────────────────────
  const [recipeIngredients, setRecipeIngredients] = useState([]);
  const [ingSearch, setIngSearch] = useState('');

  function openRecipeBuilder(menuItem) {
    setRecipeItem(menuItem);
    const existing = recipesArr.find(r => r.menu_item_id === menuItem.id);
    setRecipeIngredients(existing?.ingredients?.map(i => ({
      inventory_item_id: i.inventory_item_id,
      name: i.inventory_item?.name || '',
      unit: i.unit,
      quantity: Number(i.quantity),
    })) || []);
    setIngSearch('');
    setRecipeModal(true);
  }

  // ── PO item builder ─────────────────────────────────────────
  function addPOItem(invItem) {
    setPOForm(f => ({
      ...f,
      items: f.items.find(i => i.inventory_item_id === invItem.id)
        ? f.items
        : [...f.items, { inventory_item_id: invItem.id, name: invItem.name, unit: invItem.unit, quantity: 1, unit_cost: Number(invItem.cost_per_unit) }],
    }));
  }

  function updatePOItem(id, key, val) {
    setPOForm(f => ({ ...f, items: f.items.map(i => i.inventory_item_id === id ? { ...i, [key]: val } : i) }));
  }

  function removePOItem(id) {
    setPOForm(f => ({ ...f, items: f.items.filter(i => i.inventory_item_id !== id) }));
  }

  const poTotal = poForm.items.reduce((s, i) => s + (Number(i.quantity) * Number(i.unit_cost)), 0);

  // ── Supplier form ────────────────────────────────────────────
  const [supplierForm, setSupplierForm] = useState({ name: '', contact_person: '', phone: '', email: '', address: '', payment_terms: '' });

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 animate-fade-in pb-20">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">Inventory Management</h1>
          <p className="text-surface-500 text-sm">Track stock, manage recipes, auto-reorder from vendors</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setWastageModal(true)} className="btn-surface text-red-400 border-red-400/20 hover:bg-red-400/10 gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Log Wastage
          </button>
          <button onClick={() => setPOModal(true)} className="btn-surface gap-1.5">
            <Truck className="w-4 h-4" /> Create PO
          </button>
          <button
            onClick={() => autoOrderMut.mutate()}
            disabled={autoOrderMut.isPending}
            className="btn-surface text-emerald-400 border-emerald-400/20 hover:bg-emerald-400/10 gap-1.5"
            title="Check all auto-order enabled items and create POs for those below threshold"
          >
            <Zap className="w-4 h-4" /> {autoOrderMut.isPending ? 'Checking…' : 'Run Auto-Order'}
          </button>
          <button onClick={openAddItem} className="btn-primary gap-1.5">
            <Plus className="w-4 h-4" /> Add Material
          </button>
        </div>
      </div>

      {/* ── Low Stock Alert Banner ── */}
      {lowCount > 0 && (
        <div className="flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-2xl px-5 py-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 animate-pulse" />
            <div>
              <p className="text-white font-bold text-sm">⚠️ {lowCount} item{lowCount > 1 ? 's' : ''} running low</p>
              <p className="text-surface-500 text-xs">Consider restocking or run Auto-Order to raise POs automatically</p>
            </div>
          </div>
          <button onClick={() => { setTab('stock'); setStockFilter('low'); }} className="text-red-400 text-xs font-bold uppercase tracking-widest hover:underline">View →</button>
        </div>
      )}

      {/* ── Tabs + Search ── */}
      <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between bg-surface-900 p-2 rounded-2xl border border-surface-800">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${tab === t.id ? 'bg-brand-500 text-white shadow-lg' : 'text-surface-400 hover:text-white hover:bg-surface-800'}`}>
                <Icon className="w-4 h-4" />{t.label}
                {t.id === 'stock' && lowCount > 0 && <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">{lowCount}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
            <input className="input pl-10 h-9 text-sm w-56" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {tab === 'stock' && (
            <select className="input h-9 py-0 text-sm" value={stockFilter} onChange={e => setStockFilter(e.target.value)}>
              <option value="all">All Items</option>
              <option value="low">Low Stock</option>
            </select>
          )}
        </div>
      </div>

      {/* ══ STOCK DASHBOARD ══ */}
      {tab === 'stock' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {loadingStock
              ? [...Array(6)].map((_, i) => <div key={i} className="h-44 bg-surface-900 rounded-2xl animate-pulse border border-surface-800" />)
              : stockItems.map(item => (
                <div key={item.id} className="group relative bg-surface-900 border border-surface-800 rounded-2xl p-4 hover:border-brand-500/40 transition-all flex flex-col gap-2 overflow-hidden">
                  <div className="flex justify-between items-start">
                    <div className="p-2 bg-surface-800 rounded-xl group-hover:bg-brand-500/10 transition-colors">
                      <Package className="w-4 h-4 text-brand-400" />
                    </div>
                    <StockBadge status={item.stock_status} />
                  </div>
                  <div>
                    <p className="font-bold text-white truncate text-sm group-hover:text-brand-400 transition-colors">{item.name}</p>
                    <p className="text-[10px] text-surface-500 uppercase tracking-wider">{item.category}</p>
                  </div>
                  <div className="mt-auto">
                    <p className="text-[10px] text-surface-500 font-bold">Current Stock</p>
                    <p className="text-xl font-black text-white">{Number(item.current_stock).toFixed(2)}<span className="text-xs text-surface-400 font-normal ml-1">{item.unit}</span></p>
                    <p className="text-[10px] text-surface-500 mt-0.5">Min: {item.min_threshold} {item.unit}</p>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1 bg-surface-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${item.stock_status === 'OK' ? 'bg-emerald-500' : item.stock_status === 'LOW' ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(100, (Number(item.current_stock) / Math.max(Number(item.min_threshold) * 2, 1)) * 100)}%` }} />
                  </div>
                  {/* Quick adjust */}
                  <button onClick={() => { setAdjustItem(item); setAdjustModal(true); }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center text-white transition-all shadow-lg">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              ))}
            {stockItems.length === 0 && !loadingStock && (
              <div className="col-span-full py-20 flex flex-col items-center text-surface-600 bg-surface-900/50 rounded-2xl border border-dashed border-surface-800">
                <Package className="w-12 h-12 mb-3 opacity-20" />
                <p className="font-bold">No stock items found.</p>
                <button onClick={openAddItem} className="btn-primary mt-4 text-sm">Add First Material</button>
              </div>
            )}
          </div>

          {/* Consumption Chart */}
          <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
            <h3 className="font-bold text-white mb-4 flex items-center gap-2"><BarChart2 className="w-4 h-4 text-brand-400" /> Top Consumed This Week</h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={consumption || []} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" stroke="#737373" fontSize={11} width={90} />
                  <Tooltip contentStyle={{ background: '#171717', border: '1px solid #404040', borderRadius: 10 }} cursor={{ fill: '#262626' }} />
                  <Bar dataKey="quantity" radius={[0, 4, 4, 0]} barSize={16}>
                    {(consumption || []).map((_, i) => (
                      <Cell key={i} fill={['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6'][i % 5]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ══ RAW MATERIALS ══ */}
      {tab === 'materials' && (
        <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-950/60 text-surface-500 text-[11px] font-bold uppercase tracking-widest border-b border-surface-800">
                <tr>
                  <th className="px-5 py-3 text-left">Material</th>
                  <th className="px-5 py-3 text-left">Category</th>
                  <th className="px-5 py-3 text-left">Unit</th>
                  <th className="px-5 py-3 text-left">Cost/Unit</th>
                  <th className="px-5 py-3 text-left">Min Threshold</th>
                  <th className="px-5 py-3 text-left">Auto-Order</th>
                  <th className="px-5 py-3 text-left">Vendor</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800/40">
                {loadingItems
                  ? [...Array(5)].map((_, i) => <tr key={i}><td colSpan={8} className="px-5 py-4"><div className="h-4 bg-surface-800 rounded animate-pulse" /></td></tr>)
                  : rawMats.map(rm => (
                    <tr key={rm.id} className="hover:bg-surface-800/30 transition-colors group">
                      <td className="px-5 py-3">
                        <p className="font-bold text-white">{rm.name}</p>
                        <p className="text-[10px] text-surface-500 font-mono">{rm.sku || '—'}</p>
                      </td>
                      <td className="px-5 py-3"><span className="px-2 py-0.5 rounded bg-surface-800 text-[10px] font-bold uppercase text-surface-400">{rm.category}</span></td>
                      <td className="px-5 py-3 text-surface-300">{rm.unit}</td>
                      <td className="px-5 py-3 font-bold text-white">₹{Number(rm.cost_per_unit).toFixed(2)}</td>
                      <td className="px-5 py-3 text-surface-300">{rm.min_threshold} {rm.unit}</td>
                      <td className="px-5 py-3">
                        {rm.auto_order_enabled
                          ? <span className="text-emerald-400 text-xs font-bold flex items-center gap-1"><Zap className="w-3 h-3" /> On ({rm.reorder_qty} {rm.unit})</span>
                          : <span className="text-surface-600 text-xs">Off</span>}
                      </td>
                      <td className="px-5 py-3 text-surface-400 text-xs">{rm.preferred_supplier?.name || suppliersArr.find(s => s.id === rm.preferred_supplier_id)?.name || '—'}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setAdjustItem(rm); setAdjustModal(true); }} className="p-2 text-surface-500 hover:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-all" title="Adjust Stock"><ArrowUp className="w-4 h-4" /></button>
                          <button onClick={() => openEditItem(rm)} className="p-2 text-surface-500 hover:text-white hover:bg-surface-800 rounded-lg transition-all"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => { if (confirm(`Delete ${rm.name}?`)) deleteItemMut.mutate(rm.id); }} className="p-2 text-surface-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
          {rawMats.length === 0 && !loadingItems && (
            <div className="py-16 flex flex-col items-center text-surface-500">
              <Package className="w-10 h-10 mb-3 opacity-20" />
              <p className="font-bold">No raw materials defined.</p>
              <button onClick={openAddItem} className="btn-primary mt-4 text-sm">Add First Material</button>
            </div>
          )}
        </div>
      )}

      {/* ══ RECIPES ══ */}
      {tab === 'recipes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-surface-400 text-sm">Link menu items to raw materials. When an order is placed, stock is automatically deducted. When cancelled, stock is restored.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {menuItemArr.map(mi => {
              const recipe = recipesArr.find(r => r.menu_item_id === mi.id);
              return (
                <div key={mi.id} className="bg-surface-900 border border-surface-800 rounded-2xl p-4 hover:border-brand-500/30 transition-all">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-bold text-white">{mi.name}</p>
                      <p className="text-xs text-surface-500">₹{mi.base_price}</p>
                    </div>
                    <button onClick={() => openRecipeBuilder(mi)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${recipe ? 'bg-brand-500/10 text-brand-400 hover:bg-brand-500/20' : 'bg-surface-800 text-surface-400 hover:text-white hover:bg-surface-700'}`}>
                      {recipe ? <><Edit2 className="w-3 h-3 inline mr-1" />Edit Recipe</> : <><Plus className="w-3 h-3 inline mr-1" />Add Recipe</>}
                    </button>
                  </div>
                  {recipe?.ingredients?.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {recipe.ingredients.map(ing => (
                        <span key={ing.id} className="text-[11px] bg-surface-800 text-surface-300 px-2 py-0.5 rounded border border-surface-700">
                          {ing.quantity} {ing.unit} {ing.inventory_item?.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-surface-600 italic">No ingredients linked — stock won't be deducted for this item</p>
                  )}
                </div>
              );
            })}
            {menuItemArr.length === 0 && <div className="col-span-full py-16 text-center text-surface-500">No menu items found. Add items from Menu page first.</div>}
          </div>
        </div>
      )}

      {/* ══ SUPPLIERS ══ */}
      {tab === 'suppliers' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setSupplierForm({ name: '', contact_person: '', phone: '', email: '', address: '', payment_terms: '' }); setSupplierModal(true); }} className="btn-primary gap-1.5">
              <Plus className="w-4 h-4" /> Add Supplier
            </button>
          </div>
          <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-950/60 text-surface-500 text-[11px] font-bold uppercase tracking-widest border-b border-surface-800">
                <tr>
                  <th className="px-5 py-3 text-left">Name</th>
                  <th className="px-5 py-3 text-left">Contact</th>
                  <th className="px-5 py-3 text-left">Phone</th>
                  <th className="px-5 py-3 text-left">Email</th>
                  <th className="px-5 py-3 text-left">Payment Terms</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800/40">
                {suppliersArr.map(s => (
                  <tr key={s.id} className="hover:bg-surface-800/30 transition-colors">
                    <td className="px-5 py-3 font-bold text-white">{s.name}</td>
                    <td className="px-5 py-3 text-surface-300">{s.contact_person || '—'}</td>
                    <td className="px-5 py-3 text-surface-300">{s.phone || '—'}</td>
                    <td className="px-5 py-3 text-surface-400 text-xs">{s.email || '—'}</td>
                    <td className="px-5 py-3 text-surface-400 text-xs">{s.payment_terms || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {suppliersArr.length === 0 && (
              <div className="py-16 flex flex-col items-center text-surface-500">
                <Users className="w-10 h-10 mb-3 opacity-20" />
                <p className="font-bold">No suppliers added yet.</p>
                <button onClick={() => setSupplierModal(true)} className="btn-primary mt-4 text-sm">Add First Supplier</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ PURCHASE ORDERS ══ */}
      {tab === 'po' && (
        <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-950/60 text-surface-500 text-[11px] font-bold uppercase tracking-widest border-b border-surface-800">
                <tr>
                  <th className="px-5 py-3 text-left">PO #</th>
                  <th className="px-5 py-3 text-left">Supplier</th>
                  <th className="px-5 py-3 text-left">Items</th>
                  <th className="px-5 py-3 text-left">Total</th>
                  <th className="px-5 py-3 text-left">Expected</th>
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-left">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800/40">
                {posArr.map(po => (
                  <tr key={po.id} className="hover:bg-surface-800/30 transition-colors">
                    <td className="px-5 py-3 font-mono text-brand-400 font-bold">{po.po_number}</td>
                    <td className="px-5 py-3 text-white">{po.supplier?.name}</td>
                    <td className="px-5 py-3 text-surface-300">{po._count?.po_items || 0} SKU</td>
                    <td className="px-5 py-3 font-bold text-white">₹{Number(po.total_amount || 0).toLocaleString()}</td>
                    <td className="px-5 py-3 text-surface-400 text-xs">{po.expected_date ? new Date(po.expected_date).toLocaleDateString('en-IN') : '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${po.status === 'received' ? 'bg-emerald-500/15 text-emerald-400' : po.status === 'draft' ? 'bg-amber-500/15 text-amber-400' : 'bg-brand-500/15 text-brand-400'}`}>
                        {po.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-surface-500 text-xs max-w-[200px] truncate">{po.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {posArr.length === 0 && (
              <div className="py-16 flex flex-col items-center text-surface-500">
                <Truck className="w-10 h-10 mb-3 opacity-20" />
                <p className="font-bold">No purchase orders yet.</p>
                <button onClick={() => setPOModal(true)} className="btn-primary mt-4 text-sm">Create First PO</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ LOGS & WASTAGE ══ */}
      {tab === 'logs' && (
        <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-800 flex items-center justify-between">
            <h3 className="font-bold text-white flex items-center gap-2"><History className="w-4 h-4 text-brand-400" /> Wastage & Transaction Logs</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-950/60 text-surface-500 text-[10px] font-bold uppercase tracking-widest border-b border-surface-800">
                <tr>
                  <th className="px-5 py-3 text-left">Date / Time</th>
                  <th className="px-5 py-3 text-left">Item</th>
                  <th className="px-5 py-3 text-left">Qty</th>
                  <th className="px-5 py-3 text-left">Staff</th>
                  <th className="px-5 py-3 text-left">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800/40">
                {logsArr.map(log => (
                  <tr key={log.id} className="hover:bg-surface-800/30 transition-colors">
                    <td className="px-5 py-3 text-surface-400 text-xs">{new Date(log.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="px-5 py-3 font-bold text-white">{log.inventory_item?.name}</td>
                    <td className="px-5 py-3 text-red-400 font-mono">−{log.quantity} {log.inventory_item?.unit}</td>
                    <td className="px-5 py-3 text-surface-300">{log.user?.full_name || 'System'}</td>
                    <td className="px-5 py-3"><span className="px-2 py-0.5 rounded bg-red-500/8 border border-red-500/15 text-[10px] text-red-300">{log.reason}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logsArr.length === 0 && (
              <div className="py-16 text-center text-surface-500">No wastage logs yet.</div>
            )}
          </div>
        </div>
      )}

      {/* ══ MODAL: Add/Edit Material ══ */}
      <Modal isOpen={itemModal} onClose={() => { setItemModal(false); setEditItem(null); }} title={editItem ? 'Edit Raw Material' : 'Add Raw Material'} size="lg">
        <form onSubmit={saveItem} className="mt-4 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Material Name *</label>
              <input className="input w-full" required placeholder="e.g. Tomato, Basmati Rice, Chicken Breast" value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">SKU / Code</label>
              <input className="input w-full font-mono" placeholder="TOM-001" value={itemForm.sku} onChange={e => setItemForm(f => ({ ...f, sku: e.target.value }))} />
            </div>
            <div>
              <label className="label">Category *</label>
              <select className="input w-full" required value={itemForm.category} onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))}>
                {CAT_OPTIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Unit *</label>
              <select className="input w-full" required value={itemForm.unit} onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))}>
                {UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Cost per Unit (₹) *</label>
              <input type="number" step="0.01" className="input w-full" required placeholder="0.00" value={itemForm.cost_per_unit} onChange={e => setItemForm(f => ({ ...f, cost_per_unit: e.target.value }))} />
            </div>
            <div>
              <label className="label">Min Threshold (low-stock alert) *</label>
              <input type="number" step="0.1" className="input w-full" required placeholder="e.g. 5" value={itemForm.min_threshold} onChange={e => setItemForm(f => ({ ...f, min_threshold: e.target.value }))} />
            </div>
            <div>
              <label className="label">Max Threshold</label>
              <input type="number" step="0.1" className="input w-full" placeholder="e.g. 50" value={itemForm.max_threshold} onChange={e => setItemForm(f => ({ ...f, max_threshold: e.target.value }))} />
            </div>
          </div>

          {/* Auto-Order Section */}
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-white text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-emerald-400" /> Auto-Order from Vendor</p>
                <p className="text-xs text-surface-400 mt-0.5">Automatically raise a PO to your preferred supplier when stock hits the threshold</p>
              </div>
              <button type="button"
                onClick={() => setItemForm(f => ({ ...f, auto_order_enabled: !f.auto_order_enabled }))}
                className={`w-12 h-6 rounded-full relative transition-all ${itemForm.auto_order_enabled ? 'bg-emerald-500' : 'bg-surface-700'}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${itemForm.auto_order_enabled ? 'left-6' : 'left-0.5'}`} />
              </button>
            </div>
            {itemForm.auto_order_enabled && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Reorder Quantity *</label>
                  <input type="number" step="0.1" className="input w-full" required={itemForm.auto_order_enabled} placeholder={`How many ${itemForm.unit} to order`} value={itemForm.reorder_qty} onChange={e => setItemForm(f => ({ ...f, reorder_qty: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Preferred Supplier *</label>
                  <select className="input w-full" required={itemForm.auto_order_enabled} value={itemForm.preferred_supplier_id} onChange={e => setItemForm(f => ({ ...f, preferred_supplier_id: e.target.value }))}>
                    <option value="">Select supplier…</option>
                    {suppliersArr.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {suppliersArr.length === 0 && <p className="text-xs text-amber-400 mt-1">No suppliers yet — add one in the Suppliers tab first</p>}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-surface-800">
            <button type="button" onClick={() => { setItemModal(false); setEditItem(null); }} className="btn-surface">Cancel</button>
            <button type="submit" disabled={createItemMut.isPending || updateItemMut.isPending} className="btn-primary px-8">
              {createItemMut.isPending || updateItemMut.isPending ? 'Saving…' : 'Save Material'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ══ MODAL: Quick Adjust Stock ══ */}
      <Modal isOpen={adjustModal} onClose={() => setAdjustModal(false)} title="Adjust Stock" size="sm">
        {adjustItem && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-3 bg-surface-800/50 p-3 rounded-xl border border-surface-700">
              <div className="p-2 bg-brand-500/10 rounded-xl"><Package className="w-5 h-5 text-brand-400" /></div>
              <div>
                <p className="font-bold text-white">{adjustItem.name}</p>
                <p className="text-xs text-surface-400">Current stock: {Number(adjustItem.current_stock ?? 0).toFixed(2)} {adjustItem.unit}</p>
              </div>
            </div>
            <AdjustForm item={adjustItem} onSubmit={d => adjustMut.mutate(d)} loading={adjustMut.isPending} />
          </div>
        )}
      </Modal>

      {/* ══ MODAL: Log Wastage ══ */}
      <Modal isOpen={wastageModal} onClose={() => setWastageModal(false)} title="Log Wastage" size="sm">
        <form className="mt-4 space-y-4" onSubmit={e => {
          e.preventDefault();
          const fd = new FormData(e.target);
          wastageMut.mutate({ items: [{ item_id: fd.get('item_id'), quantity: Number(fd.get('quantity')), reason: fd.get('reason') }] });
        }}>
          <div className="bg-red-500/8 border border-red-500/20 p-3 rounded-xl">
            <p className="text-xs text-red-400 font-bold"><AlertTriangle className="w-3 h-3 inline mr-1" />This will permanently deduct stock and log it for auditing</p>
          </div>
          <div>
            <label className="label">Item *</label>
            <select name="item_id" className="input w-full" required>
              <option value="">Select item…</option>
              {stockItems.map(i => <option key={i.id} value={i.id}>{i.name} ({Number(i.current_stock).toFixed(2)} {i.unit})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Quantity *</label>
              <input name="quantity" type="number" step="0.01" className="input w-full" required placeholder="0.0" />
            </div>
            <div>
              <label className="label">Reason *</label>
              <input name="reason" className="input w-full" required placeholder="Expired / Spilled…" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setWastageModal(false)} className="btn-surface">Cancel</button>
            <button type="submit" disabled={wastageMut.isPending} className="btn-primary bg-red-600 hover:bg-red-500 border-red-600">
              {wastageMut.isPending ? 'Logging…' : 'Log Wastage'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ══ MODAL: Create PO ══ */}
      <Modal isOpen={poModal} onClose={() => setPOModal(false)} title="Create Purchase Order" size="xl">
        <div className="mt-4 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Supplier *</label>
              <select className="input w-full" required value={poForm.supplier_id} onChange={e => setPOForm(f => ({ ...f, supplier_id: e.target.value }))}>
                <option value="">Select supplier…</option>
                {suppliersArr.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {suppliersArr.length === 0 && <p className="text-xs text-amber-400 mt-1">Add suppliers in the Suppliers tab first</p>}
            </div>
            <div>
              <label className="label">Expected Delivery Date</label>
              <input type="date" className="input w-full" value={poForm.expected_date} onChange={e => setPOForm(f => ({ ...f, expected_date: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Notes / Instructions</label>
            <input className="input w-full" placeholder="e.g. Deliver before 8am, call on arrival" value={poForm.notes} onChange={e => setPOForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          {/* Item picker */}
          <div>
            <label className="label">Add Items to Order</label>
            <div className="flex gap-2 mb-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                <input className="input pl-10 w-full text-sm" placeholder="Search raw materials…" value={ingSearch} onChange={e => setIngSearch(e.target.value)} />
              </div>
            </div>
            <div className="max-h-40 overflow-y-auto border border-surface-700 rounded-xl divide-y divide-surface-700/50 bg-surface-950">
              {rawMats.filter(m => m.name.toLowerCase().includes(ingSearch.toLowerCase())).slice(0, 20).map(m => (
                <div key={m.id} className="flex items-center justify-between px-4 py-2 hover:bg-surface-800 transition-colors">
                  <div>
                    <p className="text-sm text-white font-medium">{m.name}</p>
                    <p className="text-xs text-surface-500">₹{m.cost_per_unit}/{m.unit}</p>
                  </div>
                  <button onClick={() => addPOItem(m)} className="text-xs text-brand-400 border border-brand-500/30 px-2 py-1 rounded-lg hover:bg-brand-500/10 transition-all">+ Add</button>
                </div>
              ))}
            </div>
          </div>

          {/* Selected items */}
          {poForm.items.length > 0 && (
            <div className="bg-surface-900 rounded-xl border border-surface-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-800/60 text-surface-400 text-[10px] font-bold uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Item</th>
                    <th className="px-4 py-2 text-center">Qty</th>
                    <th className="px-4 py-2 text-center">Unit Cost (₹)</th>
                    <th className="px-4 py-2 text-right">Total</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-700/50">
                  {poForm.items.map(item => (
                    <tr key={item.inventory_item_id}>
                      <td className="px-4 py-2 font-medium text-white">{item.name} <span className="text-surface-500 text-[10px]">({item.unit})</span></td>
                      <td className="px-4 py-2"><input type="number" step="0.1" className="input w-20 text-center py-1 h-8 text-sm" value={item.quantity} onChange={e => updatePOItem(item.inventory_item_id, 'quantity', e.target.value)} /></td>
                      <td className="px-4 py-2"><input type="number" step="0.01" className="input w-24 text-center py-1 h-8 text-sm" value={item.unit_cost} onChange={e => updatePOItem(item.inventory_item_id, 'unit_cost', e.target.value)} /></td>
                      <td className="px-4 py-2 text-right font-bold text-white">₹{(Number(item.quantity) * Number(item.unit_cost)).toFixed(2)}</td>
                      <td className="px-4 py-2"><button onClick={() => removePOItem(item.inventory_item_id)} className="text-surface-500 hover:text-red-400 transition-colors"><X className="w-4 h-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-3 bg-surface-800/40 flex justify-end">
                <p className="text-sm font-black text-white">Grand Total: <span className="text-brand-400">₹{poTotal.toFixed(2)}</span></p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-surface-800">
            <button onClick={() => setPOModal(false)} className="btn-surface">Cancel</button>
            <button
              onClick={() => createPOMut.mutate({ supplier_id: poForm.supplier_id, expected_date: poForm.expected_date || undefined, notes: poForm.notes, items: poForm.items.map(i => ({ inventory_item_id: i.inventory_item_id, quantity: Number(i.quantity), unit_cost: Number(i.unit_cost) })), total_amount: poTotal })}
              disabled={createPOMut.isPending || !poForm.supplier_id || poForm.items.length === 0}
              className="btn-primary px-8"
            >
              {createPOMut.isPending ? 'Creating…' : 'Create Purchase Order'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ══ MODAL: Add Supplier ══ */}
      <Modal isOpen={supplierModal} onClose={() => setSupplierModal(false)} title="Add Supplier" size="md">
        <form className="mt-4 space-y-4" onSubmit={e => { e.preventDefault(); supplierMut.mutate(supplierForm); }}>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Supplier / Company Name *</label>
              <input className="input w-full" required placeholder="e.g. Fresh Farms Pvt Ltd" value={supplierForm.name} onChange={e => setSupplierForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Contact Person</label>
              <input className="input w-full" placeholder="Ramesh Kumar" value={supplierForm.contact_person} onChange={e => setSupplierForm(f => ({ ...f, contact_person: e.target.value }))} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input w-full" placeholder="+91 98765 43210" value={supplierForm.phone} onChange={e => setSupplierForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input w-full" placeholder="vendor@example.com" value={supplierForm.email} onChange={e => setSupplierForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="label">Payment Terms</label>
              <select className="input w-full" value={supplierForm.payment_terms} onChange={e => setSupplierForm(f => ({ ...f, payment_terms: e.target.value }))}>
                <option value="">Select…</option>
                <option>COD</option>
                <option>Net 7</option>
                <option>Net 15</option>
                <option>Net 30</option>
                <option>Advance</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Address</label>
              <input className="input w-full" placeholder="Full address" value={supplierForm.address} onChange={e => setSupplierForm(f => ({ ...f, address: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setSupplierModal(false)} className="btn-surface">Cancel</button>
            <button type="submit" disabled={supplierMut.isPending} className="btn-primary px-8">{supplierMut.isPending ? 'Adding…' : 'Add Supplier'}</button>
          </div>
        </form>
      </Modal>

      {/* ══ MODAL: Recipe Builder ══ */}
      <Modal isOpen={recipeModal} onClose={() => setRecipeModal(false)} title={`Recipe: ${recipeItem?.name || ''}`} size="lg">
        <div className="mt-4 space-y-4">
          <p className="text-xs text-surface-400">When this menu item is ordered, stock for each ingredient below is automatically deducted. When the order is cancelled, stock is restored.</p>

          {/* Ingredient search */}
          <div>
            <label className="label">Add Ingredient</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
              <input className="input pl-10 w-full text-sm" placeholder="Search raw materials…" value={ingSearch} onChange={e => setIngSearch(e.target.value)} />
            </div>
            {ingSearch && (
              <div className="mt-1 max-h-40 overflow-y-auto border border-surface-700 rounded-xl bg-surface-950 divide-y divide-surface-700/50">
                {rawMats.filter(m => m.name.toLowerCase().includes(ingSearch.toLowerCase())).map(m => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-2 hover:bg-surface-800 transition-colors cursor-pointer" onClick={() => {
                    if (!recipeIngredients.find(i => i.inventory_item_id === m.id)) {
                      setRecipeIngredients(prev => [...prev, { inventory_item_id: m.id, name: m.name, unit: m.unit, quantity: 1 }]);
                    }
                    setIngSearch('');
                  }}>
                    <p className="text-sm text-white">{m.name}</p>
                    <p className="text-xs text-surface-500">{m.unit}</p>
                  </div>
                ))}
                {rawMats.filter(m => m.name.toLowerCase().includes(ingSearch.toLowerCase())).length === 0 && (
                  <p className="px-4 py-3 text-sm text-surface-500">No materials found</p>
                )}
              </div>
            )}
          </div>

          {/* Ingredient list */}
          {recipeIngredients.length > 0 ? (
            <div className="space-y-2">
              {recipeIngredients.map((ing, idx) => (
                <div key={ing.inventory_item_id} className="flex items-center gap-3 bg-surface-800/40 border border-surface-700 rounded-xl px-4 py-2">
                  <p className="flex-1 text-sm font-medium text-white">{ing.name}</p>
                  <input
                    type="number" step="0.01" min="0.01"
                    className="input w-24 text-center py-1 h-8 text-sm"
                    value={ing.quantity}
                    onChange={e => setRecipeIngredients(prev => prev.map((i, j) => j === idx ? { ...i, quantity: Number(e.target.value) } : i))}
                  />
                  <span className="text-surface-400 text-xs w-8">{ing.unit}</span>
                  <button onClick={() => setRecipeIngredients(prev => prev.filter((_, j) => j !== idx))} className="text-surface-500 hover:text-red-400 transition-colors"><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-surface-600 border border-dashed border-surface-700 rounded-xl">
              <ChefHat className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No ingredients added yet. Search above to add raw materials.</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-surface-800">
            <button onClick={() => setRecipeModal(false)} className="btn-surface">Cancel</button>
            <button
              onClick={() => createRecipeMut.mutate({ menuItemId: recipeItem?.id, ingredients: recipeIngredients })}
              disabled={createRecipeMut.isPending || recipeIngredients.length === 0}
              className="btn-primary px-8"
            >
              {createRecipeMut.isPending ? 'Saving…' : 'Save Recipe'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Sub-component: Adjust Form ─────────────────────────────────
function AdjustForm({ item, onSubmit, loading }) {
  const [type, setType] = useState('add');
  return (
    <form onSubmit={e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      onSubmit({ item_id: item.id, quantity: type === 'add' ? Number(fd.get('qty')) : -Number(fd.get('qty')), reason: fd.get('reason') });
    }} className="space-y-4">
      <div className="flex bg-surface-800 p-1 rounded-xl">
        <button type="button" onClick={() => setType('add')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${type === 'add' ? 'bg-emerald-500 text-white' : 'text-surface-400'}`}><ArrowUp className="w-3 h-3 inline mr-1" />Add Stock</button>
        <button type="button" onClick={() => setType('reduce')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${type === 'reduce' ? 'bg-red-500 text-white' : 'text-surface-400'}`}><ArrowDown className="w-3 h-3 inline mr-1" />Deduct</button>
      </div>
      <div>
        <label className="label">Quantity ({item.unit})</label>
        <input name="qty" type="number" step="0.01" className="input w-full text-center text-xl font-black py-4" placeholder="0.0" required />
      </div>
      <div>
        <label className="label">Reason</label>
        <select name="reason" className="input w-full">
          <option>Manual Receipt</option>
          <option>Stock Audit Correction</option>
          <option>Opening Stock</option>
          <option>Damaged Goods</option>
          <option>Return to Vendor</option>
          <option>Purchase Order Received</option>
        </select>
      </div>
      <button type="submit" disabled={loading} className="btn-primary w-full py-3 font-bold">
        {loading ? 'Applying…' : 'Apply Adjustment'}
      </button>
    </form>
  );
}
