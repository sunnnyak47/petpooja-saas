import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { useRegion } from '../hooks/useRegion';
import { isValidPhone, isValidEmail, PHONE_MAXLEN, phonePlaceholder } from '../lib/validation';
import Modal from '../components/Modal';
import {
  Plus, Truck, Trash2, Settings, Package,
  Users, ChevronDown, ChevronRight, Loader2,
  History, ChefHat, Zap, Check, X, Edit2, Sparkles,
  RefreshCw,
} from 'lucide-react';

import InventoryOnboarding from '../components/Inventory/InventoryOnboarding';
import AIInsightStrip      from '../components/Inventory/AIInsightStrip';
import ItemGrid            from '../components/Inventory/ItemGrid';
import ItemDetailPanel     from '../components/Inventory/ItemDetailPanel';
import {
  ReceivedDeliverySheet,
  LogWastageSheet,
  AdjustStockSheet,
  CreatePOSheet,
} from '../components/Inventory/QuickActionSheet';
import { useCurrency } from '../hooks/useCurrency';

const UNIT_OPTIONS = ['kg','gm','ltr','ml','pcs','pkt','box','dozen'];
const CAT_OPTIONS  = ['Vegetables','Dairy','Meat','Seafood','Groceries','Beverages','Packaging','Cleaning','Other'];
const PAYMENT_TERMS_OPTIONS = ['Net 7','Net 15','Net 30','Cash on Delivery','Advance'];

const PO_STATUS_STYLES = {
  draft:    'bg-yellow-500/15 text-yellow-400',
  approved: 'bg-blue-500/15 text-blue-400',
  received: 'bg-emerald-500/15 text-emerald-400',
};

/* ─── Collapsible section wrapper ───────────────────────────── */
function Section({ title, icon: Icon, count, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-3xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 transition-all hover:opacity-80"
        style={{ background: 'var(--bg-secondary)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
            <Icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <span className="font-black text-sm" style={{ color: 'var(--text-primary)' }}>{title}</span>
          {count !== undefined && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
              {count}
            </span>
          )}
        </div>
        {open
          ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          : <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />}
      </button>
      {open && (
        <div className="px-6 py-5" style={{ background: 'var(--bg-card)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ─── Add Material Modal (with AI autofill) ─────────────────── */
function AddMaterialModal({ outletId, editItem, onClose }) {
  const qc = useQueryClient();
  const { symbol } = useCurrency();
  const region = useRegion();
  const [form, setForm] = useState(editItem ? {
    name:               editItem.name || '',
    sku:                editItem.sku  || '',
    category:           editItem.category || 'Vegetables',
    unit:               editItem.unit || 'kg',
    cost_per_unit:      editItem.cost_per_unit || 0,
    min_threshold:      editItem.min_threshold || 1,
    max_threshold:      editItem.max_threshold || 10,
    auto_order_enabled: editItem.auto_order_enabled || false,
    reorder_qty:        editItem.reorder_qty || 5,
  } : {
    name: '', sku: '', category: 'Vegetables', unit: 'kg',
    cost_per_unit: 0, min_threshold: 1, max_threshold: 10,
    auto_order_enabled: false, reorder_qty: 5,
  });

  const [aiLoading, setAILoading] = useState(false);

  const aiAutofill = async () => {
    if (!form.name.trim()) return toast.error('Enter an item name first');
    setAILoading(true);
    try {
      const res = await api.post('/inventory/ai/autofill-item', { item_name: form.name, region });
      const data = res.data?.data || res.data;
      setForm(f => ({ ...f, ...data }));
      toast.success('AI filled the details!');
    } catch {
      toast.error('AI autofill failed');
    } finally {
      setAILoading(false);
    }
  };

  const mut = useMutation({
    mutationFn: (d) => editItem
      ? api.patch(`/inventory/items/${editItem.id}`, d)
      : api.post('/inventory/items', { ...d, outlet_id: outletId }),
    onSuccess: () => {
      toast.success(editItem ? 'Item updated' : 'Item added');
      qc.invalidateQueries({ queryKey: ['inv-stock'] });
      qc.invalidateQueries({ queryKey: ['inv-items'] });
      onClose();
    },
    onError: e => toast.error(e.response?.data?.message || 'Failed'),
  });

  const f = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <Modal isOpen onClose={onClose} title={editItem ? 'Edit Material' : 'Add Material'} size="md">
      <div className="space-y-4 mt-4">
        {/* Name + AI autofill */}
        <div>
          <label className="block text-xs font-black mb-1.5 uppercase tracking-wider"
            style={{ color: 'var(--text-secondary)' }}>Item Name *</label>
          <div className="flex gap-2">
            <input
              autoFocus
              className="flex-1 px-4 py-3 rounded-2xl text-sm font-bold outline-none border-2 transition-all"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderColor: form.name ? 'var(--accent)' : 'var(--border)' }}
              placeholder="e.g. Amul Butter 500g"
              value={form.name}
              onChange={e => f('name', e.target.value)}
            />
            <button onClick={aiAutofill} disabled={aiLoading || !form.name.trim()}
              className="px-4 py-3 rounded-2xl text-sm font-black disabled:opacity-50 flex items-center gap-1.5"
              style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              AI Fill
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-black mb-1.5 uppercase tracking-wider"
              style={{ color: 'var(--text-secondary)' }}>Category</label>
            <select
              className="w-full px-3 py-3 rounded-2xl text-sm font-bold outline-none border"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
              value={form.category} onChange={e => f('category', e.target.value)}>
              {CAT_OPTIONS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black mb-1.5 uppercase tracking-wider"
              style={{ color: 'var(--text-secondary)' }}>Unit</label>
            <select
              className="w-full px-3 py-3 rounded-2xl text-sm font-bold outline-none border"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
              value={form.unit} onChange={e => f('unit', e.target.value)}>
              {UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'cost_per_unit', label: `Cost/Unit (${symbol})` },
            { key: 'min_threshold', label: `Min Stock (${form.unit})` },
            { key: 'max_threshold', label: `Max Stock (${form.unit})` },
            { key: 'reorder_qty',   label: `Reorder Qty (${form.unit})` },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs font-black mb-1.5 uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}>{label}</label>
              <input type="number" min="0" step="0.1"
                className="w-full px-3 py-3 rounded-2xl text-sm font-bold outline-none border"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                value={form[key]}
                onChange={e => f(key, e.target.value)}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-4 py-3 rounded-2xl"
          style={{ background: 'var(--bg-secondary)' }}>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Auto-order when low</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Creates a PO automatically when stock hits minimum</p>
          </div>
          <button onClick={() => f('auto_order_enabled', !form.auto_order_enabled)}
            className="relative w-11 h-6 rounded-full transition-all"
            style={{ background: form.auto_order_enabled ? 'var(--accent)' : 'var(--bg-hover)' }}>
            <div className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
              style={{ left: form.auto_order_enabled ? '23px' : '4px' }} />
          </button>
        </div>

        <button
          onClick={() => mut.mutate(form)}
          disabled={mut.isPending || !form.name.trim()}
          className="w-full py-4 rounded-2xl text-sm font-black text-white flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: 'var(--accent)' }}>
          {mut.isPending
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
            : <><Check className="w-4 h-4" /> {editItem ? 'Update Material' : 'Add Material'}</>}
        </button>
      </div>
    </Modal>
  );
}

/* ════════════════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════════════════ */
export default function InventoryPage() {
  const { user } = useSelector(s => s.auth);
  const outletId = user?.outlet_id;
  const qc = useQueryClient();
  const { symbol } = useCurrency();

  // Sheets / modals
  const [sheet, setSheet] = useState(null);  // 'delivery' | 'wastage' | 'adjust' | 'po'
  const [selectedItem, setSelectedItem] = useState(null);
  const [addMaterial, setAddMaterial] = useState(false);
  const [editMaterial, setEditMaterial] = useState(null);

  // Check if inventory is empty → show onboarding
  const { data: stockData, isLoading: checkingStock } = useQuery({
    queryKey: ['inv-stock-check', outletId],
    queryFn: () => api.get(`/inventory/stock?outlet_id=${outletId}&limit=1`),
    enabled: !!outletId,
  });

  const hasItems = ((Array.isArray(stockData?.data) ? stockData.data : stockData?.data?.items || stockData?.data || []).length > 0);
  const [onboardingDone, setOnboardingDone] = useState(false);

  // Remember if the user dismissed the setup wizard for this outlet, so it
  // doesn't pop up again on every refresh when inventory is still empty.
  const onboardSkipped = !!outletId && (typeof window !== 'undefined') &&
    window.localStorage.getItem(`inv_onboard_skip_${outletId}`) === '1';
  const showOnboarding = !checkingStock && !hasItems && !onboardingDone && !onboardSkipped;

  // Suppliers query (for suppliers section)
  const { data: suppliersData } = useQuery({
    queryKey: ['inv-suppliers', outletId],
    queryFn: () => api.get(`/suppliers?outlet_id=${outletId}`),
    enabled: !!outletId,
  });
  const suppliers = suppliersData?.data || [];

  // Purchase Orders query (for PO section)
  const { data: poData } = useQuery({
    queryKey: ['inv-pos', outletId],
    queryFn: () => api.get(`/purchase-orders?outlet_id=${outletId}&limit=20`),
    enabled: !!outletId,
  });
  const pos = poData?.data?.orders || poData?.data || [];

  // Wastage logs (for logs section)
  const { data: wastageData } = useQuery({
    queryKey: ['inv-waste', outletId],
    queryFn: () => api.get(`/inventory/wastage?outlet_id=${outletId}&limit=30`),
    enabled: !!outletId,
  });
  const wastageLogs = wastageData?.data || [];

  // Recipes
  const { data: recipesData } = useQuery({
    queryKey: ['inv-recipes', outletId],
    queryFn: () => api.get(`/inventory/recipes?outlet_id=${outletId}`),
    enabled: !!outletId,
  });
  const recipes = recipesData?.data || [];

  // Adjust item state — holds the item passed from ItemGrid "Adjust" button
  const [adjustItem, setAdjustItem] = useState(null);

  // Supplier mutations
  const [supplierModal, setSupplierModal] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: '', contact_person: '', phone: '', email: '', payment_terms: 'Cash on Delivery' });

  const saveSupplier = () => {
    if (supplierForm.phone && !isValidPhone(supplierForm.phone)) {
      toast.error('Please enter a valid phone number');
      return;
    }
    if (supplierForm.email && !isValidEmail(supplierForm.email)) {
      toast.error('Please enter a valid email address');
      return;
    }
    supplierMut.mutate(supplierForm);
  };

  const supplierMut = useMutation({
    mutationFn: (d) => api.post('/suppliers', { ...d, outlet_id: outletId }),
    onSuccess: () => {
      toast.success('Supplier added');
      qc.invalidateQueries({ queryKey: ['inv-suppliers'] });
      setSupplierModal(false);
      setSupplierForm({ name: '', contact_person: '', phone: '', email: '', payment_terms: 'Cash on Delivery' });
    },
    onError: e => toast.error(e.response?.data?.message || 'Failed'),
  });

  // PO actions
  const approvePO = useMutation({
    mutationFn: (id) => api.post(`/purchase-orders/${id}/approve`),
    onSuccess: () => { toast.success('PO approved'); qc.invalidateQueries({ queryKey: ['inv-pos'] }); },
  });
  const receivePO = useMutation({
    mutationFn: (id) => api.post(`/purchase-orders/${id}/receive`),
    onSuccess: () => {
      toast.success('Stock updated from PO!');
      qc.invalidateQueries({ queryKey: ['inv-pos'] });
      qc.invalidateQueries({ queryKey: ['inv-stock'] });
      qc.invalidateQueries({ queryKey: ['inv-ai-insights'] });
    },
  });

  // Auto-order trigger
  const autoOrderMut = useMutation({
    mutationFn: () => api.post('/inventory/auto-order', { outlet_id: outletId }),
    onSuccess: (res) => {
      toast.success(`Auto-order done! ${res.data?.orders_created || 0} POs created`);
      qc.invalidateQueries({ queryKey: ['inv-pos'] });
      qc.invalidateQueries({ queryKey: ['inv-stock-check'] });
      qc.invalidateQueries({ queryKey: ['inv-stock'] });
    },
    onError: e => toast.error(e.response?.data?.message || 'Failed'),
  });

  // Download a PO PDF through the axios `api` client so it carries the auth
  // Bearer token AND the correct base URL. A raw window.open('/api/...') sends no
  // Authorization header (→ 401) and, in the Electron desktop build, resolves the
  // relative /api path against the local app:// origin instead of the Render
  // backend (→ blank/404). Fetching as a blob and opening an object URL avoids both.
  const downloadPO = async (po) => {
    try {
      const blob = await api.get(`/purchase-orders/${po.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      // Revoke after a tick so the new tab/window has time to load the blob.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      toast.error(e?.message || 'Failed to download PDF');
    }
  };

  const handleInsightAction = (key) => {
    if (key === 'create-po') setSheet('po');
    else if (key === 'view-wastage') {/* scroll to wastage section */ }
    else if (key === 'reorder') setSheet('po');
    else if (key === 'onboard') setOnboardingDone(false);
  };

  if (checkingStock) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* ── Onboarding wizard ── */}
      {showOnboarding && (
        <InventoryOnboarding
          outletId={outletId}
          onComplete={() => {
            setOnboardingDone(true);
            qc.invalidateQueries({ queryKey: ['inv-stock-check'] });
            qc.invalidateQueries({ queryKey: ['inv-stock'] });
          }}
          onSkip={() => {
            setOnboardingDone(true);
            if (outletId) {
              try { window.localStorage.setItem(`inv_onboard_skip_${outletId}`, '1'); } catch { /* ignore */ }
            }
          }}
        />
      )}

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>
            Inventory
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Track stock · manage recipes · auto-reorder
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => autoOrderMut.mutate()}
            disabled={autoOrderMut.isPending}
            title="Trigger auto-order for items below threshold"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all disabled:opacity-50"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
            {autoOrderMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Auto-Order
          </button>
          <button
            onClick={() => setAddMaterial(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white"
            style={{ background: 'var(--accent)' }}>
            <Plus className="w-4 h-4" /> Add Material
          </button>
        </div>
      </div>

      {/* ══ ZONE A — AI Insight Strip ══════════════════════════ */}
      <AIInsightStrip outletId={outletId} onAction={handleInsightAction} />

      {/* ══ ZONE B — Quick Actions (refined: clean white cards, accent on icon only) ══ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: 'delivery', label: 'Received Delivery', icon: Truck,    color: '#10b981', desc: 'Add incoming stock' },
          { key: 'wastage',  label: 'Log Wastage',       icon: Trash2,   color: '#ef4444', desc: 'Record spoilage / damage' },
          { key: 'po',       label: 'Create PO',         icon: Zap,      color: '#6366f1', desc: 'Auto-build supplier order' },
          { key: 'adjust',   label: 'Adjust Stock',      icon: Settings, color: '#f59e0b', desc: 'Manual count correction' },
        ].map(({ key, label, icon: Icon, color, desc }) => (
          <button key={key}
            onClick={() => setSheet(key)}
            className="relative flex flex-col items-start p-4 rounded-xl text-left transition-all overflow-hidden group"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = color + '60'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 8px 22px -10px ${color}40`; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,23,42,0.04)'; }}>
            {/* top edge accent */}
            <span className="absolute top-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: color }} />
            <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
              style={{
                background: color + '14',
                border: `1px solid ${color}26`,
              }}>
              <Icon className="w-4 h-4" style={{ color }} strokeWidth={2.2} />
            </div>
            <p className="text-sm font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>{label}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
          </button>
        ))}
      </div>

      {/* ══ ZONE C — Inventory Grid ════════════════════════════ */}
      <ItemGrid
        outletId={outletId}
        onItemClick={setSelectedItem}
        onAdjust={(item) => { setSelectedItem(null); setAdjustItem(item); setSheet('adjust'); }}
      />

      {/* ══ ADVANCED SECTIONS (collapsed) ════════════════════ */}
      <div className="space-y-3 pt-2">
        <p className="text-xs font-black uppercase tracking-widest px-1" style={{ color: 'var(--text-secondary)' }}>
          Advanced
        </p>

        {/* ── Suppliers ── */}
        <Section title="Suppliers" icon={Users} count={suppliers.length}>
          <div className="space-y-3">
            <button onClick={() => setSupplierModal(true)}
              className="flex items-center gap-2 text-sm font-black px-4 py-2.5 rounded-xl"
              style={{ background: 'var(--accent)', color: '#fff' }}>
              <Plus className="w-4 h-4" /> Add Supplier
            </button>

            {suppliers.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--text-secondary)' }}>
                No suppliers yet
              </p>
            ) : (
              <div className="space-y-2">
                {suppliers.map(s => (
                  <div key={s.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm"
                      style={{ background: 'var(--accent)', color: '#fff' }}>
                      {s.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {s.contact_person || s.phone || s.payment_terms}
                      </p>
                    </div>
                    <span className="text-xs font-bold px-2 py-1 rounded-lg"
                      style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                      {s.payment_terms}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>

        {/* ── Purchase Orders ── */}
        <Section title="Purchase Orders" icon={Truck} count={pos.length}>
          <div className="space-y-2">
            {pos.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--text-secondary)' }}>
                No purchase orders yet. Use "Create PO" above.
              </p>
            ) : (
              pos.map(po => (
                <div key={po.id}
                  className="rounded-2xl p-4"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>{po.po_number}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {po.supplier?.name || 'No supplier'} · {new Date(po.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${PO_STATUS_STYLES[po.status] || 'bg-gray-500/15 text-gray-400'}`}>
                      {po.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>
                      {symbol}{parseFloat(po.grand_total || 0).toLocaleString()}
                    </span>
                    <div className="flex gap-2">
                      {po.status === 'draft' && (
                        <button
                          onClick={() => approvePO.mutate(po.id)}
                          disabled={approvePO.isPending}
                          className="px-3 py-1.5 rounded-xl text-xs font-black"
                          style={{ background: 'var(--accent)', color: '#fff' }}>
                          Approve
                        </button>
                      )}
                      {po.status === 'approved' && (
                        <button
                          onClick={() => receivePO.mutate(po.id)}
                          disabled={receivePO.isPending}
                          className="px-3 py-1.5 rounded-xl text-xs font-black"
                          style={{ background: 'var(--success)', color: '#fff' }}>
                          Mark Received
                        </button>
                      )}
                      {po.pdf_path && (
                        <button
                          onClick={() => downloadPO(po)}
                          className="px-3 py-1.5 rounded-xl text-xs font-black"
                          style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                          PDF
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Section>

        {/* ── Recipes ── */}
        <Section title="Recipes" icon={ChefHat} count={recipes.length}>
          <div className="space-y-2">
            {recipes.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--text-secondary)' }}>
                No recipes linked yet. Link menu items to auto-deduct stock on sale.
              </p>
            ) : (
              recipes.map(r => (
                <div key={r.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <ChefHat className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                      {r.menu_item?.name || r.name}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {r.ingredients?.length || 0} ingredients
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Section>

        {/* ── Wastage Logs ── */}
        <Section title="Wastage Logs" icon={History} count={wastageLogs.length}>
          <div className="space-y-2">
            {wastageLogs.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--text-secondary)' }}>
                No wastage logged yet
              </p>
            ) : (
              wastageLogs.slice(0, 20).map((log, i) => (
                <div key={i}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                      {log.inventory_item?.name || 'Unknown item'}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {log.reason} · {new Date(log.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <span className="text-sm font-black" style={{ color: 'var(--danger)' }}>
                    -{log.quantity} {log.inventory_item?.unit || ''}
                  </span>
                </div>
              ))
            )}
          </div>
        </Section>
      </div>

      {/* ══ SHEETS ══════════════════════════════════════════════ */}
      {sheet === 'delivery' && <ReceivedDeliverySheet outletId={outletId} onClose={() => setSheet(null)} />}
      {sheet === 'wastage'  && <LogWastageSheet       outletId={outletId} onClose={() => setSheet(null)} />}
      {sheet === 'adjust'   && (
        <AdjustStockSheet
          outletId={outletId}
          prefillItem={adjustItem}
          onClose={() => { setSheet(null); setAdjustItem(null); }}
        />
      )}
      {sheet === 'po'       && <CreatePOSheet         outletId={outletId} onClose={() => setSheet(null)} />}

      {/* ══ ITEM DETAIL PANEL ═══════════════════════════════════ */}
      {selectedItem && (
        <ItemDetailPanel
          item={selectedItem}
          outletId={outletId}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {/* ══ ADD / EDIT MATERIAL MODAL ═══════════════════════════ */}
      {(addMaterial || editMaterial) && (
        <AddMaterialModal
          outletId={outletId}
          editItem={editMaterial}
          onClose={() => { setAddMaterial(false); setEditMaterial(null); }}
        />
      )}

      {/* ══ SUPPLIER MODAL ══════════════════════════════════════ */}
      {supplierModal && (
        <Modal isOpen onClose={() => setSupplierModal(false)} title="Add Supplier" size="md">
          <div className="space-y-3 mt-4">
            {[
              { key: 'name',           label: 'Supplier Name *',  placeholder: 'Fresh Farms Pvt Ltd' },
              { key: 'contact_person', label: 'Contact Person',   placeholder: 'Raju Bhai' },
              { key: 'phone',          label: 'Phone',            placeholder: phonePlaceholder('AU') },
              { key: 'email',          label: 'Email',            placeholder: 'supplier@email.com' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-black mb-1.5 uppercase tracking-wider"
                  style={{ color: 'var(--text-secondary)' }}>{label}</label>
                <input
                  className="w-full px-4 py-3 rounded-2xl text-sm font-bold outline-none border-2 transition-all"
                  maxLength={key === 'phone' ? PHONE_MAXLEN : undefined}
                  style={{
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    borderColor: supplierForm[key] ? 'var(--accent)' : 'var(--border)',
                  }}
                  placeholder={placeholder}
                  value={supplierForm[key]}
                  onChange={e => setSupplierForm(f => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}

            <div>
              <label className="block text-xs font-black mb-1.5 uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}>Payment Terms</label>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_TERMS_OPTIONS.map(t => (
                  <button key={t}
                    onClick={() => setSupplierForm(f => ({ ...f, payment_terms: t }))}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                    style={{
                      background: supplierForm.payment_terms === t ? 'var(--accent)' : 'var(--bg-hover)',
                      color: supplierForm.payment_terms === t ? '#fff' : 'var(--text-primary)',
                    }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={saveSupplier}
              disabled={supplierMut.isPending || !supplierForm.name.trim()}
              className="w-full py-4 rounded-2xl text-sm font-black text-white flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'var(--accent)' }}>
              {supplierMut.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                : <><Check className="w-4 h-4" /> Add Supplier</>}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
