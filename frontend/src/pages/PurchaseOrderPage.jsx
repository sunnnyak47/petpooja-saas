/**
 * Purchase Order Page — full PO workflow with preset item chips, live totals,
 * PDF download, and WhatsApp send.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart, Plus, Trash2, Search, FileText, Send, Check,
  ChevronDown, ChevronUp, Download, MessageSquare, Eye, ArrowLeft,
  Package, X, Edit2, CheckCircle, Clock, Truck
} from 'lucide-react';
import api from '../lib/api';
import { useTheme } from '../themes/ThemeContext';
import toast from 'react-hot-toast';

/* ── helpers ─────────────────────────────────── */
const fmt = (n) => `₹${parseFloat(n || 0).toFixed(2)}`;
const CATEGORIES = [
  'ALL', 'Vegetables', 'Dairy', 'Grains & Flours', 'Spices & Masalas',
  'Meat & Fish', 'Dry Goods', 'Packaging', 'Beverages', 'Other',
];
const STATUS_COLORS = {
  draft:    { bg: '#f1f5f9', text: '#64748b', label: 'Draft' },
  approved: { bg: '#dcfce7', text: '#16a34a', label: 'Approved' },
  sent:     { bg: '#dbeafe', text: '#2563eb', label: 'Sent' },
  received: { bg: '#f0fdf4', text: '#15803d', label: 'Received' },
  cancelled:{ bg: '#fee2e2', text: '#dc2626', label: 'Cancelled' },
};

/* ── Tiny components ──────────────────────────── */
function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.draft;
  return (
    <span style={{ background: s.bg, color: s.text }}
      className="px-2 py-0.5 rounded-full text-xs font-semibold">
      {s.label}
    </span>
  );
}

/* ═══════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════ */
export default function PurchaseOrderPage() {
  const { isDark } = useTheme();
  const navigate = useNavigate();

  // view states: 'list' | 'create' | 'detail'
  const [view, setView] = useState('list');
  const [selectedPO, setSelectedPO] = useState(null);

  // list data
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);

  const bg    = isDark ? '#0f172a' : '#f8fafc';
  const card  = isDark ? '#1e293b' : '#ffffff';
  const border= isDark ? '#334155' : '#e2e8f0';
  const text  = isDark ? '#f1f5f9' : '#0f172a';
  const muted = isDark ? '#94a3b8' : '#64748b';

  /* ── load data ── */
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [poRes, supRes, preRes] = await Promise.all([
        api.get('/purchase-orders'),
        api.get('/suppliers'),
        api.get('/presets'),
      ]);
      setOrders(poRes.data?.items ?? poRes.data ?? []);
      setSuppliers(supRes.data ?? []);
      setPresets(preRes.data ?? []);
    } catch (e) {
      toast.error('Failed to load data');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ── router ── */
  if (view === 'create') {
    return <CreatePOView
      isDark={isDark} card={card} border={border} text={text} muted={muted} bg={bg}
      suppliers={suppliers} presets={presets}
      onSaved={() => { loadAll(); setView('list'); }}
      onBack={() => setView('list')}
    />;
  }
  if (view === 'detail' && selectedPO) {
    return <PODetailView
      poId={selectedPO}
      isDark={isDark} card={card} border={border} text={text} muted={muted} bg={bg}
      suppliers={suppliers}
      onBack={() => { loadAll(); setView('list'); setSelectedPO(null); }}
    />;
  }

  /* ── LIST VIEW ── */
  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }} className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart size={24} /> Purchase Orders
          </h1>
          <p style={{ color: muted }} className="text-sm mt-1">
            Manage vendor orders and inventory procurement
          </p>
        </div>
        <button
          onClick={() => setView('create')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-semibold"
          style={{ background: '#3b82f6' }}
        >
          <Plus size={18} /> New PO
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Orders', value: orders.length, color: '#3b82f6' },
          { label: 'Draft', value: orders.filter(o => o.status === 'draft').length, color: '#94a3b8' },
          { label: 'Sent', value: orders.filter(o => o.status === 'sent').length, color: '#2563eb' },
          { label: 'Received', value: orders.filter(o => o.status === 'received').length, color: '#16a34a' },
        ].map(s => (
          <div key={s.label} style={{ background: card, border: `1px solid ${border}` }}
            className="rounded-xl p-4">
            <p style={{ color: muted }} className="text-xs">{s.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: card, border: `1px solid ${border}` }} className="rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40" style={{ color: muted }}>
            Loading...
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3" style={{ color: muted }}>
            <Package size={40} />
            <p>No purchase orders yet</p>
            <button onClick={() => setView('create')}
              className="px-4 py-2 rounded-lg text-white text-sm"
              style={{ background: '#3b82f6' }}>Create First PO</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: isDark ? '#0f172a' : '#f8fafc', color: muted }}>
                  {['PO Number', 'Supplier', 'Date', 'Items', 'Grand Total', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((po, i) => (
                  <tr key={po.id}
                    style={{ borderTop: `1px solid ${border}`, background: i % 2 === 0 ? 'transparent' : (isDark ? '#0f172a22' : '#f8fafc55') }}
                    className="hover:opacity-80 cursor-pointer"
                    onClick={() => { setSelectedPO(po.id); setView('detail'); }}
                  >
                    <td className="px-4 py-3 font-mono font-semibold" style={{ color: '#3b82f6' }}>
                      {po.po_number}
                    </td>
                    <td className="px-4 py-3">{po.supplier?.name ?? '—'}</td>
                    <td className="px-4 py-3" style={{ color: muted }}>
                      {po.order_date ? new Date(po.order_date).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td className="px-4 py-3">{po._count?.po_items ?? po.po_items?.length ?? 0} items</td>
                    <td className="px-4 py-3 font-semibold">{fmt(po.grand_total)}</td>
                    <td className="px-4 py-3"><StatusBadge status={po.status} /></td>
                    <td className="px-4 py-3">
                      <button onClick={e => { e.stopPropagation(); setSelectedPO(po.id); setView('detail'); }}
                        className="p-1 rounded hover:opacity-70">
                        <Eye size={16} style={{ color: muted }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   CREATE PO VIEW
═══════════════════════════════════════════════ */
function CreatePOView({ isDark, card, border, text, muted, bg, suppliers, presets, onSaved, onBack }) {
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [search, setSearch]     = useState('');
  const [lineItems, setLineItems] = useState([]);
  const [form, setForm] = useState({
    supplier_id: '',
    order_date: new Date().toISOString().split('T')[0],
    delivery_date: '',
    reference_number: '',
    terms: 'Payment due within 30 days of delivery.',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  /* filtered presets */
  const filtered = useMemo(() => {
    let p = presets;
    if (activeCategory !== 'ALL') p = p.filter(x => x.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      p = p.filter(x => x.name.toLowerCase().includes(q));
    }
    return p;
  }, [presets, activeCategory, search]);

  /* add preset to line items */
  const addPreset = (preset) => {
    const exists = lineItems.find(l => l.preset_id === preset.id);
    if (exists) {
      toast('Item already in order — adjust quantity below', { icon: 'ℹ️' });
      return;
    }
    setLineItems(prev => [...prev, {
      preset_id: preset.id,
      item_name: preset.name,
      category: preset.category,
      unit: preset.unit,
      quantity: preset.default_quantity ?? 1,
      unit_rate: preset.default_rate ?? 0,
      tax_rate: preset.tax_rate ?? 5,
      hsn_code: preset.hsn_code ?? '',
      notes: '',
    }]);
  };

  const removeItem = (idx) => setLineItems(prev => prev.filter((_, i) => i !== idx));

  const updateItem = (idx, field, val) => {
    setLineItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  };

  /* totals */
  const { subtotal, taxTotal, grandTotal } = useMemo(() => {
    let subtotal = 0, taxTotal = 0;
    for (const l of lineItems) {
      const amt = parseFloat(l.quantity || 0) * parseFloat(l.unit_rate || 0);
      const tax = amt * (parseFloat(l.tax_rate || 0) / 100);
      subtotal += amt;
      taxTotal += tax;
    }
    return { subtotal, taxTotal, grandTotal: subtotal + taxTotal };
  }, [lineItems]);

  const submit = async () => {
    if (!form.supplier_id) { toast.error('Please select a supplier'); return; }
    if (lineItems.length === 0) { toast.error('Add at least one item'); return; }
    setSaving(true);
    try {
      await api.post('/purchase-orders', { ...form, items: lineItems });
      toast.success('Purchase Order created!');
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.message ?? 'Failed to create PO');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }} className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg hover:opacity-70" style={{ background: card }}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold">New Purchase Order</h1>
          <p style={{ color: muted }} className="text-sm">Select items and fill details</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* LEFT: Preset Browser */}
        <div className="xl:col-span-2">
          <div style={{ background: card, border: `1px solid ${border}` }} className="rounded-xl p-4 mb-4">
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <Package size={16} /> Quick Add Items
            </h2>
            {/* Search */}
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: muted }} />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search items..."
                className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: isDark ? '#0f172a' : '#f8fafc', border: `1px solid ${border}`, color: text }}
              />
            </div>
            {/* Category chips */}
            <div className="flex gap-2 flex-wrap mb-4">
              {CATEGORIES.map(cat => (
                <button key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                  style={{
                    background: activeCategory === cat ? '#3b82f6' : (isDark ? '#0f172a' : '#f1f5f9'),
                    color: activeCategory === cat ? '#fff' : muted,
                  }}>
                  {cat}
                </button>
              ))}
            </div>
            {/* Preset grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
              {filtered.map(preset => (
                <button key={preset.id}
                  onClick={() => addPreset(preset)}
                  className="text-left p-3 rounded-lg border transition-all hover:opacity-80 hover:border-blue-400"
                  style={{ border: `1px solid ${border}`, background: isDark ? '#0f172a' : '#f8fafc' }}>
                  <p className="text-xs font-semibold leading-tight">{preset.name}</p>
                  <p style={{ color: muted }} className="text-xs mt-0.5">
                    {preset.default_quantity} {preset.unit}
                  </p>
                  {preset.default_rate > 0 && (
                    <p className="text-xs font-bold mt-0.5" style={{ color: '#3b82f6' }}>
                      {fmt(preset.default_rate)}/{preset.unit}
                    </p>
                  )}
                </button>
              ))}
              {filtered.length === 0 && (
                <p style={{ color: muted }} className="col-span-3 text-sm py-4 text-center">No items found</p>
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <div style={{ background: card, border: `1px solid ${border}` }} className="rounded-xl p-4">
            <h2 className="font-semibold mb-3">Order Items ({lineItems.length})</h2>
            {lineItems.length === 0 ? (
              <p style={{ color: muted }} className="text-sm text-center py-6">
                Click items above to add them here
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ color: muted }}>
                      {['Item', 'Category', 'HSN', 'Unit', 'Qty', 'Rate (₹)', 'GST%', 'Amount', ''].map(h => (
                        <th key={h} className="text-left pb-2 pr-2 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, i) => {
                      const amt = parseFloat(item.quantity || item.ordered_quantity || 0) * parseFloat(item.unit_rate || item.unit_cost || 0);
                      const tax = amt * (parseFloat(item.tax_rate || 0) / 100);
                      return (
                        <tr key={i} style={{ borderTop: `1px solid ${border}` }}>
                          <td className="py-2 pr-2">
                            <input value={item.item_name} onChange={e => updateItem(i, 'item_name', e.target.value)}
                              className="w-28 px-1 py-0.5 rounded text-xs outline-none"
                              style={{ background: isDark ? '#0f172a' : '#f8fafc', border: `1px solid ${border}`, color: text }} />
                          </td>
                          <td className="py-2 pr-2 whitespace-nowrap" style={{ color: muted }}>{item.category}</td>
                          <td className="py-2 pr-2">
                            <input value={item.hsn_code} onChange={e => updateItem(i, 'hsn_code', e.target.value)}
                              placeholder="HSN"
                              className="w-16 px-1 py-0.5 rounded text-xs outline-none"
                              style={{ background: isDark ? '#0f172a' : '#f8fafc', border: `1px solid ${border}`, color: text }} />
                          </td>
                          <td className="py-2 pr-2">
                            <input value={item.unit} onChange={e => updateItem(i, 'unit', e.target.value)}
                              className="w-12 px-1 py-0.5 rounded text-xs outline-none"
                              style={{ background: isDark ? '#0f172a' : '#f8fafc', border: `1px solid ${border}`, color: text }} />
                          </td>
                          <td className="py-2 pr-2">
                            <input type="number" min="0.01" step="0.01" value={item.quantity}
                              onChange={e => updateItem(i, 'quantity', e.target.value)}
                              className="w-14 px-1 py-0.5 rounded text-xs outline-none"
                              style={{ background: isDark ? '#0f172a' : '#f8fafc', border: `1px solid ${border}`, color: text }} />
                          </td>
                          <td className="py-2 pr-2">
                            <input type="number" min="0" step="0.01" value={item.unit_rate}
                              onChange={e => updateItem(i, 'unit_rate', e.target.value)}
                              className="w-16 px-1 py-0.5 rounded text-xs outline-none"
                              style={{ background: isDark ? '#0f172a' : '#f8fafc', border: `1px solid ${border}`, color: text }} />
                          </td>
                          <td className="py-2 pr-2">
                            <select value={item.tax_rate} onChange={e => updateItem(i, 'tax_rate', e.target.value)}
                              className="w-14 px-1 py-0.5 rounded text-xs outline-none"
                              style={{ background: isDark ? '#0f172a' : '#f8fafc', border: `1px solid ${border}`, color: text }}>
                              {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                            </select>
                          </td>
                          <td className="py-2 pr-2 font-semibold whitespace-nowrap">
                            {fmt(amt + tax)}
                          </td>
                          <td className="py-2">
                            <button onClick={() => removeItem(i)} className="p-1 rounded hover:opacity-70">
                              <Trash2 size={14} style={{ color: '#ef4444' }} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: PO Details + Summary */}
        <div className="space-y-4">
          {/* PO Details */}
          <div style={{ background: card, border: `1px solid ${border}` }} className="rounded-xl p-4">
            <h2 className="font-semibold mb-3">Order Details</h2>
            <div className="space-y-3">
              <div>
                <label style={{ color: muted }} className="text-xs font-semibold block mb-1">Supplier *</label>
                <select value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: isDark ? '#0f172a' : '#f8fafc', border: `1px solid ${border}`, color: text }}>
                  <option value="">Select supplier...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ color: muted }} className="text-xs font-semibold block mb-1">Order Date *</label>
                  <input type="date" value={form.order_date} onChange={e => setForm(f => ({ ...f, order_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: isDark ? '#0f172a' : '#f8fafc', border: `1px solid ${border}`, color: text }} />
                </div>
                <div>
                  <label style={{ color: muted }} className="text-xs font-semibold block mb-1">Delivery Date</label>
                  <input type="date" value={form.delivery_date} onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: isDark ? '#0f172a' : '#f8fafc', border: `1px solid ${border}`, color: text }} />
                </div>
              </div>
              <div>
                <label style={{ color: muted }} className="text-xs font-semibold block mb-1">Reference No.</label>
                <input value={form.reference_number} onChange={e => setForm(f => ({ ...f, reference_number: e.target.value }))}
                  placeholder="e.g. INV-001"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: isDark ? '#0f172a' : '#f8fafc', border: `1px solid ${border}`, color: text }} />
              </div>
              <div>
                <label style={{ color: muted }} className="text-xs font-semibold block mb-1">Terms</label>
                <textarea rows={2} value={form.terms} onChange={e => setForm(f => ({ ...f, terms: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={{ background: isDark ? '#0f172a' : '#f8fafc', border: `1px solid ${border}`, color: text }} />
              </div>
              <div>
                <label style={{ color: muted }} className="text-xs font-semibold block mb-1">Notes</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Internal notes..."
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={{ background: isDark ? '#0f172a' : '#f8fafc', border: `1px solid ${border}`, color: text }} />
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div style={{ background: card, border: `1px solid ${border}` }} className="rounded-xl p-4">
            <h2 className="font-semibold mb-3">Order Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span style={{ color: muted }}>Subtotal</span>
                <span>{fmt(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: muted }}>GST</span>
                <span>{fmt(taxTotal)}</span>
              </div>
              <div className="flex justify-between font-bold text-base border-t pt-2 mt-2" style={{ borderColor: border }}>
                <span>Grand Total</span>
                <span style={{ color: '#3b82f6' }}>{fmt(grandTotal)}</span>
              </div>
            </div>
            <button
              onClick={submit} disabled={saving}
              className="w-full mt-4 py-3 rounded-xl text-white font-bold flex items-center justify-center gap-2 transition-opacity"
              style={{ background: saving ? '#94a3b8' : '#3b82f6' }}>
              {saving ? 'Creating...' : <><Plus size={16} /> Create Purchase Order</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PO DETAIL VIEW
═══════════════════════════════════════════════ */
function PODetailView({ poId, isDark, card, border, text, muted, bg, onBack }) {
  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [showWA, setShowWA] = useState(false);
  const [sending, setSending] = useState(false);
  const [approving, setApproving] = useState(false);
  // WhatsApp direct-send state
  const [waStatus, setWaStatus]   = useState(null); // null | 'connected' | 'qr_pending' | 'disconnected'
  const [waQR, setWaQR]           = useState(null);
  const [waConnecting, setWaConnecting] = useState(false);
  const [showWASetup, setShowWASetup]   = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const loadPO = useCallback(async () => {
    try {
      const res = await api.get(`/purchase-orders/${poId}`);
      const loaded = res.data ?? res;
      setPo(loaded);
      // Pre-fill WhatsApp phone from supplier
      if (loaded?.supplier?.phone) {
        setWhatsappPhone(loaded.supplier.phone);
      }
    } catch (e) { toast.error('Failed to load PO'); }
    finally { setLoading(false); }
  }, [poId]);

  useEffect(() => { loadPO(); }, [loadPO]);

  // ── WhatsApp status check — must be declared before useEffect that uses it ──
  const checkWAStatus = useCallback(async () => {
    try {
      const res = await api.get('/whatsapp/status');
      const d = res.data ?? res;
      setWaStatus(d.status);
      setWaQR(d.qr_base64 || null);
      return d.status;
    } catch { return 'disconnected'; }
  }, []);

  // Auto-poll WhatsApp status while setup modal is open
  useEffect(() => {
    if (!showWASetup) return;
    const iv = setInterval(async () => {
      const status = await checkWAStatus();
      if (status === 'connected') clearInterval(iv);
    }, 2500);
    return () => clearInterval(iv);
  }, [showWASetup, checkWAStatus]);

  const approvePO = async () => {
    setApproving(true);
    try {
      await api.post(`/purchase-orders/${poId}/approve`);
      toast.success('PO approved!');
      loadPO();
    } catch (e) { toast.error('Failed to approve'); }
    finally { setApproving(false); }
  };

  // Fetch PDF as authenticated blob and trigger save-file dialog
  const generateAndDownloadPdf = async () => {
    setGeneratingPdf(true);
    try {
      toast('Generating PDF…', { icon: '⏳' });
      // GET /download streams the PDF directly — interceptor returns raw blob
      const blob = await api.get(`/purchase-orders/${poId}/download`, { responseType: 'blob' });
      const url  = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `PO-${po?.po_number || poId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded!');
    } catch (e) {
      console.error('PDF error', e);
      toast.error('Failed to download PDF');
    } finally { setGeneratingPdf(false); }
  };

  // ── WhatsApp direct-send helpers ───────────────────────────────
  const connectWA = async () => {
    setWaConnecting(true);
    setShowWASetup(true);
    try {
      await api.post('/whatsapp/connect');
      // Poll for QR or connected
      let attempts = 0;
      const poll = setInterval(async () => {
        const status = await checkWAStatus();
        attempts++;
        if (status === 'connected' || attempts > 30) clearInterval(poll);
      }, 2000);
    } catch (e) { toast.error('Failed to connect WhatsApp'); }
    finally { setWaConnecting(false); }
  };

  const openWhatsApp = async () => {
    if (po?.supplier?.phone) setWhatsappPhone(po.supplier.phone);
    const status = await checkWAStatus();
    if (status !== 'connected') {
      setShowWASetup(true);
    } else {
      setShowWA(true);
    }
  };

  const sendWhatsAppDirect = async () => {
    if (!whatsappPhone.trim()) { toast.error('Enter phone number'); return; }
    setSending(true);
    try {
      toast('Sending PDF to WhatsApp…', { icon: '📤' });
      await api.post('/whatsapp/send-po', { po_id: poId, phone: whatsappPhone });
      toast.success('✅ PDF sent to vendor WhatsApp!');
      setShowWA(false);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Send failed';
      toast.error(msg);
    } finally { setSending(false); }
  };

  const sendWhatsApp = async () => {
    // Try direct Baileys send first, fall back to wa.me link
    const status = await checkWAStatus();
    if (status === 'connected') {
      await sendWhatsAppDirect();
      return;
    }
    if (!whatsappPhone.trim()) { toast.error('Enter phone number'); return; }
    setSending(true);
    try {
      toast('Preparing WhatsApp…', { icon: '📤' });
      const res = await api.post(`/purchase-orders/${poId}/whatsapp`, { phone: whatsappPhone });
      const result = res.data ?? res;
      if (result?.wa_link) {
        window.open(result.wa_link, '_blank');
        toast.success('WhatsApp opened — tap Send');
        setShowWA(false);
      } else {
        toast.error('No WhatsApp link returned');
      }
      loadPO();
    } catch (e) { toast.error('Failed to send via WhatsApp'); }
    finally { setSending(false); }
  };

  if (loading) {
    return (
      <div style={{ background: bg, minHeight: '100vh', color: text }} className="p-6 flex items-center justify-center">
        <span style={{ color: muted }}>Loading...</span>
      </div>
    );
  }
  if (!po) return null;

  const items = po.po_items ?? [];
  const supplier = po.supplier ?? {};

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }} className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg hover:opacity-70" style={{ background: card }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold font-mono">{po.po_number}</h1>
              <StatusBadge status={po.status} />
            </div>
            <p style={{ color: muted }} className="text-sm">
              {po.order_date ? new Date(po.order_date).toLocaleDateString('en-IN') : ''}
              {supplier.name ? ` · ${supplier.name}` : ''}
            </p>
          </div>
        </div>
        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          {po.status === 'draft' && (
            <button onClick={approvePO} disabled={approving}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-semibold"
              style={{ background: '#16a34a' }}>
              <CheckCircle size={16} /> {approving ? 'Approving...' : 'Approve'}
            </button>
          )}
          {/* PDF: one button — generates & downloads in one shot */}
          <button onClick={generateAndDownloadPdf} disabled={generatingPdf}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity"
            style={{ background: '#4f46e5', color: '#fff', opacity: generatingPdf ? 0.7 : 1 }}>
            {generatingPdf
              ? <><span className="animate-spin">⏳</span> Generating…</>
              : <><FileText size={16} /> Download PDF</>}
          </button>
          {/* WhatsApp: one click, phone pre-filled from supplier */}
          <button onClick={openWhatsApp}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold"
            style={{ background: '#25d366' }}>
            <MessageSquare size={16} /> WhatsApp
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {/* Supplier + Delivery Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div style={{ background: card, border: `1px solid ${border}` }} className="rounded-xl p-4">
              <p style={{ color: muted }} className="text-xs font-semibold mb-2">VENDOR</p>
              <p className="font-bold">{supplier.name || '—'}</p>
              {supplier.phone && <p style={{ color: muted }} className="text-sm">{supplier.phone}</p>}
              {supplier.email && <p style={{ color: muted }} className="text-sm">{supplier.email}</p>}
              {supplier.address && <p style={{ color: muted }} className="text-sm">{supplier.address}</p>}
              {supplier.gstin && <p className="text-xs mt-1">GSTIN: {supplier.gstin}</p>}
            </div>
            <div style={{ background: card, border: `1px solid ${border}` }} className="rounded-xl p-4">
              <p style={{ color: muted }} className="text-xs font-semibold mb-2">ORDER INFO</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: muted }}>Order Date</span>
                  <span>{po.order_date ? new Date(po.order_date).toLocaleDateString('en-IN') : '—'}</span>
                </div>
                {po.delivery_date && (
                  <div className="flex justify-between">
                    <span style={{ color: muted }}>Delivery Date</span>
                    <span>{new Date(po.delivery_date).toLocaleDateString('en-IN')}</span>
                  </div>
                )}
                {po.reference_number && (
                  <div className="flex justify-between">
                    <span style={{ color: muted }}>Reference</span>
                    <span className="font-mono">{po.reference_number}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div style={{ background: card, border: `1px solid ${border}` }} className="rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b" style={{ borderColor: border }}>
              <h2 className="font-semibold">Items ({items.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: isDark ? '#0f172a' : '#f8fafc', color: muted }}>
                    {['#', 'Item', 'HSN', 'Unit', 'Qty', 'Rate', 'GST%', 'Amount'].map(h => (
                      <th key={h} className="px-4 py-2 text-left text-xs font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const amt = parseFloat(item.quantity || item.ordered_quantity || 0) * parseFloat(item.unit_rate || item.unit_cost || 0);
                    const tax = amt * (parseFloat(item.tax_rate || 0) / 100);
                    return (
                      <tr key={item.id || i} style={{ borderTop: `1px solid ${border}` }}>
                        <td className="px-4 py-2 text-xs" style={{ color: muted }}>{i + 1}</td>
                        <td className="px-4 py-2 font-semibold">{item.item_name}</td>
                        <td className="px-4 py-2 text-xs font-mono" style={{ color: muted }}>{item.hsn_code || '—'}</td>
                        <td className="px-4 py-2 text-xs">{item.unit}</td>
                        <td className="px-4 py-2">{item.quantity ?? item.ordered_quantity}</td>
                        <td className="px-4 py-2">{fmt(item.unit_rate ?? item.unit_cost)}</td>
                        <td className="px-4 py-2">{item.tax_rate}%</td>
                        <td className="px-4 py-2 font-semibold">{fmt(amt + tax)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Totals + Terms */}
        <div className="space-y-4">
          <div style={{ background: card, border: `1px solid ${border}` }} className="rounded-xl p-4">
            <h2 className="font-semibold mb-3">Order Totals</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span style={{ color: muted }}>Subtotal</span>
                <span>{fmt(po.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: muted }}>GST</span>
                <span>{fmt(po.tax_amount)}</span>
              </div>
              {parseFloat(po.discount_amount) > 0 && (
                <div className="flex justify-between" style={{ color: '#16a34a' }}>
                  <span>Discount</span>
                  <span>-{fmt(po.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg border-t pt-2" style={{ borderColor: border }}>
                <span>Grand Total</span>
                <span style={{ color: '#3b82f6' }}>{fmt(po.grand_total)}</span>
              </div>
            </div>
          </div>

          {po.terms && (
            <div style={{ background: card, border: `1px solid ${border}` }} className="rounded-xl p-4">
              <p style={{ color: muted }} className="text-xs font-semibold mb-2">TERMS & CONDITIONS</p>
              <p className="text-sm">{po.terms}</p>
            </div>
          )}

          {po.notes && (
            <div style={{ background: card, border: `1px solid ${border}` }} className="rounded-xl p-4">
              <p style={{ color: muted }} className="text-xs font-semibold mb-2">NOTES</p>
              <p className="text-sm">{po.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── WhatsApp QR Setup Modal ── */}
      {showWASetup && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: '#00000099' }}>
          <div style={{ background: card, border: `1px solid ${border}`, color: text, width: 420 }}
            className="rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base flex items-center gap-2">
                <span style={{ background: '#25d366', borderRadius: 8, padding: '4px 8px' }}>
                  <MessageSquare size={16} color="#fff" />
                </span>
                Connect WhatsApp
              </h3>
              <button onClick={() => setShowWASetup(false)} style={{ color: muted }}><X size={18} /></button>
            </div>

            {waStatus === 'connected' ? (
              <div className="text-center py-4">
                <div className="text-5xl mb-3">✅</div>
                <p className="font-bold text-lg mb-1">WhatsApp Connected!</p>
                <p style={{ color: muted }} className="text-sm mb-4">Your number +91-7900000776 is ready to send POs.</p>
                <button onClick={() => { setShowWASetup(false); setShowWA(true); }}
                  className="w-full py-3 rounded-xl text-white font-bold"
                  style={{ background: '#25d366' }}>
                  Send PO Now →
                </button>
              </div>
            ) : waQR ? (
              <div className="text-center">
                <p className="text-sm mb-3" style={{ color: muted }}>
                  Scan this QR code with WhatsApp on <strong>+91-7900000776</strong>
                </p>
                <p className="text-xs mb-4" style={{ color: muted }}>
                  Open WhatsApp → Linked Devices → Link a Device → Scan QR
                </p>
                <div className="flex justify-center mb-4">
                  <img src={waQR} alt="WhatsApp QR"
                    style={{ width: 220, height: 220, borderRadius: 12, border: `4px solid #25d366` }} />
                </div>
                <p className="text-xs animate-pulse" style={{ color: '#25d366' }}>⏳ Waiting for scan…</p>
                <button onClick={checkWAStatus} className="mt-3 text-xs underline" style={{ color: muted }}>
                  Check status
                </button>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="text-5xl mb-3">📱</div>
                <p className="font-bold mb-2">Link Your WhatsApp</p>
                <p style={{ color: muted }} className="text-sm mb-5">
                  Connect <strong>+91-7900000776</strong> to send PO PDFs directly from the software — no Meta API needed.
                </p>
                <button onClick={connectWA} disabled={waConnecting}
                  className="w-full py-3 rounded-xl text-white font-bold flex items-center justify-center gap-2"
                  style={{ background: waConnecting ? '#94a3b8' : '#25d366' }}>
                  {waConnecting ? '⏳ Connecting…' : '🔗 Connect WhatsApp'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── WhatsApp Send Modal ── */}
      {showWA && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: '#00000099' }}>
          <div style={{ background: card, border: `1px solid ${border}`, color: text, width: 420 }}
            className="rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-base flex items-center gap-2">
                <span style={{ background: '#25d366', borderRadius: 8, padding: '4px 8px' }}>
                  <MessageSquare size={16} color="#fff" />
                </span>
                Send PO via WhatsApp
              </h3>
              <button onClick={() => setShowWA(false)} style={{ color: muted }}><X size={18} /></button>
            </div>

            {/* Connection status */}
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg"
              style={{ background: waStatus === 'connected' ? '#d1fae5' : '#fef3c7' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: waStatus === 'connected' ? '#059669' : '#f59e0b', display: 'inline-block' }} />
              <span className="text-xs font-semibold" style={{ color: waStatus === 'connected' ? '#065f46' : '#92400e' }}>
                {waStatus === 'connected' ? '✓ WhatsApp Connected — will send directly from +91-7900000776' : 'WhatsApp not connected — will open wa.me link'}
              </span>
              {waStatus !== 'connected' && (
                <button onClick={() => { setShowWA(false); connectWA(); }}
                  className="ml-auto text-xs font-bold underline" style={{ color: '#f59e0b' }}>
                  Connect
                </button>
              )}
            </div>

            {/* PO summary */}
            <div className="rounded-xl p-3 mb-4 text-sm" style={{ background: isDark ? '#0f172a' : '#f8fafc', border: `1px solid ${border}` }}>
              <div className="flex justify-between mb-1">
                <span style={{ color: muted }}>PO</span>
                <span className="font-mono font-bold" style={{ color: '#4f46e5' }}>{po.po_number}</span>
              </div>
              <div className="flex justify-between mb-1">
                <span style={{ color: muted }}>Supplier</span>
                <span className="font-semibold">{po.supplier?.name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: muted }}>Grand Total</span>
                <span className="font-bold" style={{ color: '#16a34a' }}>
                  ₹{Number(po.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Phone */}
            <label className="text-xs font-bold mb-1 block" style={{ color: muted }}>VENDOR WHATSAPP NUMBER</label>
            <input
              value={whatsappPhone}
              onChange={e => setWhatsappPhone(e.target.value)}
              placeholder="+919876543210"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-4"
              style={{ background: isDark ? '#0f172a' : '#f1f5f9', border: `1px solid ${border}`, color: text }}
              onKeyDown={e => e.key === 'Enter' && sendWhatsApp()}
            />

            <div className="flex gap-3">
              <button onClick={() => setShowWA(false)} className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ background: isDark ? '#1e293b' : '#f1f5f9', color: muted }}>
                Cancel
              </button>
              <button onClick={sendWhatsApp} disabled={sending}
                className="flex-1 py-3 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2"
                style={{ background: sending ? '#94a3b8' : '#25d366' }}>
                {sending ? '⏳ Sending…' : <><MessageSquare size={15} /> Send PDF Invoice</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
