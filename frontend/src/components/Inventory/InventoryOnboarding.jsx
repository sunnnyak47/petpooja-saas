import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useCurrency } from '../../hooks/useCurrency';
import {
  Sparkles, ChefHat, Package, Users, Layers, Zap,
  ArrowRight, ArrowLeft, Check, Loader2, Plus, Trash2,
  X, Edit3, RefreshCw,
} from 'lucide-react';

const CUISINE_PRESETS = [
  'North Indian', 'South Indian', 'Chinese', 'Pizza & Pasta',
  'Biryani & Mughlai', 'Fast Food & Burgers', 'Bakery & Cafe',
  'Seafood', 'Multi-Cuisine', 'Street Food',
];

const UNIT_OPTIONS = ['kg', 'gm', 'ltr', 'ml', 'pcs', 'pkt', 'box', 'dozen'];
const CAT_OPTIONS  = ['Vegetables', 'Dairy', 'Meat', 'Seafood', 'Groceries', 'Beverages', 'Packaging', 'Cleaning', 'Other'];
const PAYMENT_TERMS_OPTIONS = ['Net 7', 'Net 15', 'Net 30', 'Cash on Delivery', 'Advance'];

const STEPS = [
  { id: 1, label: 'Cuisine', icon: ChefHat,  title: 'What do you serve?' },
  { id: 2, label: 'Items',   icon: Package,  title: 'Review your inventory list' },
  { id: 3, label: 'Stock',   icon: Layers,   title: 'How much do you have right now?' },
  { id: 4, label: 'Supplier',icon: Users,    title: 'Who supplies your ingredients?' },
  { id: 5, label: 'Done',    icon: Zap,      title: "You're all set!" },
];

export default function InventoryOnboarding({ outletId, onComplete }) {
  const { symbol } = useCurrency();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [restaurantType, setRestaurantType] = useState('');
  const [customType, setCustomType] = useState('');
  const [items, setItems] = useState([]);       // suggested + edited items
  const [openingStock, setOpeningStock] = useState({});  // { itemIndex: qty }
  const [supplier, setSupplier] = useState({ name: '', contact_person: '', phone: '', email: '', payment_terms: 'Cash on Delivery' });
  const [skipSupplier, setSkipSupplier] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);

  // ── Step 1 → 2: Gemini suggests items ──────────────────────
  const suggestMutation = useMutation({
    mutationFn: (type) => api.post('/inventory/ai/suggest-items', { restaurant_type: type }).then(r => r.data),
    onSuccess: (data) => {
      const suggested = (data.data || data).map((item, i) => ({
        ...item,
        _id: `s-${i}`,
        selected: true,
      }));
      setItems(suggested);
      setStep(2);
    },
    onError: (err) => toast.error('AI suggestion failed: ' + (err.response?.data?.message || err.message)),
  });

  // ── Step 4: Save supplier ────────────────────────────────────
  const supplierMutation = useMutation({
    mutationFn: (s) => api.post('/inventory/suppliers', { ...s, outlet_id: outletId }),
    onError: (err) => toast.error('Supplier save failed: ' + (err.response?.data?.message || err.message)),
  });

  // ── Final save: bulk create items + opening stock ─────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const selectedItems = items.filter(i => i.selected);

      // 1. Create inventory items
      const created = await Promise.all(
        selectedItems.map(item =>
          api.post('/inventory/items', {
            outlet_id: outletId,
            name: item.name,
            sku: item.sku,
            category: item.category,
            unit: item.unit,
            cost_per_unit: parseFloat(item.cost_per_unit) || 0,
            min_threshold: parseFloat(item.min_threshold) || 1,
            max_threshold: parseFloat(item.max_threshold) || 10,
            auto_order_enabled: item.auto_order_enabled,
            reorder_qty: parseFloat(item.reorder_qty) || 5,
          }).then(r => ({ original: item, created: r.data?.data || r.data }))
        )
      );

      // 2. Set opening stock for items that have a non-zero qty
      const stockAdjusts = created.filter(c => {
        const qty = parseFloat(openingStock[c.original._id] || 0);
        return qty > 0 && c.created?.id;
      });

      await Promise.all(
        stockAdjusts.map(c =>
          api.post('/inventory/adjust', {
            outlet_id: outletId,
            item_id: c.created.id,
            quantity: parseFloat(openingStock[c.original._id]),
            reason: 'Opening stock entry',
          })
        )
      );

      // 3. Save supplier if provided
      if (!skipSupplier && supplier.name.trim()) {
        await supplierMutation.mutateAsync(supplier);
      }

      return { itemsCreated: created.length, stockSet: stockAdjusts.length };
    },
    onSuccess: (result) => {
      toast.success(`Setup complete! ${result.itemsCreated} items added, ${result.stockSet} stock levels set.`);
      qc.invalidateQueries({ queryKey: ['inv-stock'] });
      qc.invalidateQueries({ queryKey: ['inv-items'] });
      qc.invalidateQueries({ queryKey: ['inv-suppliers'] });
      onComplete();
    },
    onError: (err) => toast.error('Setup failed: ' + (err.response?.data?.message || err.message)),
  });

  const handleCuisineNext = () => {
    const type = customType.trim() || restaurantType;
    if (!type) return toast.error('Please select or enter your restaurant type');
    suggestMutation.mutate(type);
  };

  const toggleItem = (id) =>
    setItems(prev => prev.map(i => i._id === id ? { ...i, selected: !i.selected } : i));

  const updateItem = (id, field, value) =>
    setItems(prev => prev.map(i => i._id === id ? { ...i, [field]: value } : i));

  const removeItem = (id) => setItems(prev => prev.filter(i => i._id !== id));

  const addCustomItem = () => {
    const newItem = {
      _id: `c-${Date.now()}`,
      name: '',
      category: 'Other',
      unit: 'pcs',
      cost_per_unit: 0,
      min_threshold: 1,
      max_threshold: 10,
      auto_order_enabled: false,
      reorder_qty: 5,
      sku: `CUST-${Date.now()}`,
      selected: true,
      _editing: true,
    };
    setItems(prev => [...prev, newItem]);
    setEditingIdx(newItem._id);
  };

  const selectedCount = items.filter(i => i.selected).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col"
        style={{ background: 'var(--bg-card)', maxHeight: '90vh' }}>

        {/* ── Progress Header ── */}
        <div className="px-8 pt-8 pb-6 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--accent)', color: '#fff' }}>
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="font-black text-base" style={{ color: 'var(--text-primary)' }}>
                Inventory Setup
              </span>
            </div>
            <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
              Step {step} of {STEPS.length}
            </span>
          </div>

          {/* Step dots */}
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = step > s.id;
              const active = step === s.id;
              return (
                <div key={s.id} className="flex items-center gap-2 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                    done   ? 'text-white' :
                    active ? 'text-white' : ''
                  }`}
                    style={{
                      background: done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--bg-hover)',
                      color: done || active ? '#fff' : 'var(--text-secondary)',
                    }}>
                    {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="flex-1 h-0.5 rounded-full transition-all duration-500"
                      style={{ background: step > s.id ? 'var(--success)' : 'var(--border)' }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Step Content ── */}
        <div className="flex-1 overflow-y-auto px-8 py-6">

          {/* STEP 1 — Cuisine type */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-black mb-1" style={{ color: 'var(--text-primary)' }}>
                  What kind of food do you serve?
                </h2>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  AI will suggest the right ingredients for your kitchen.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {CUISINE_PRESETS.map(c => (
                  <button key={c}
                    onClick={() => { setRestaurantType(c); setCustomType(''); }}
                    className="px-4 py-3 rounded-2xl text-sm font-bold text-left transition-all"
                    style={{
                      background: restaurantType === c ? 'var(--accent)' : 'var(--bg-hover)',
                      color: restaurantType === c ? '#fff' : 'var(--text-primary)',
                      border: `2px solid ${restaurantType === c ? 'var(--accent)' : 'transparent'}`,
                    }}>
                    {c}
                  </button>
                ))}
              </div>

              <div>
                <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>
                  OR TYPE YOUR OWN
                </p>
                <input
                  className="w-full px-4 py-3 rounded-2xl text-sm font-bold outline-none border-2 transition-all"
                  style={{
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    borderColor: customType ? 'var(--accent)' : 'var(--border)',
                  }}
                  placeholder="e.g. Punjabi Dhaba, Dessert Shop, Juice Bar…"
                  value={customType}
                  onChange={e => { setCustomType(e.target.value); setRestaurantType(''); }}
                />
              </div>
            </div>
          )}

          {/* STEP 2 — Review AI-suggested items */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-black mb-1" style={{ color: 'var(--text-primary)' }}>
                  Your starter inventory list
                </h2>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  AI built this list for you. Deselect anything you don't need, or add custom items.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>
                  {selectedCount} of {items.length} selected
                </span>
                <button onClick={addCustomItem}
                  className="flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-xl"
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
                  <Plus className="w-3.5 h-3.5" /> Add Custom
                </button>
              </div>

              <div className="space-y-2">
                {items.map(item => (
                  <div key={item._id}
                    className="rounded-2xl p-3 transition-all"
                    style={{
                      background: item.selected ? 'var(--bg-secondary)' : 'var(--bg-hover)',
                      border: `1.5px solid ${item.selected ? 'var(--accent)' : 'var(--border)'}`,
                      opacity: item.selected ? 1 : 0.5,
                    }}>

                    {editingIdx === item._id ? (
                      /* Inline edit row */
                      <div className="space-y-2">
                        <input
                          autoFocus
                          className="w-full px-3 py-2 rounded-xl text-sm font-bold outline-none border"
                          style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                          placeholder="Item name"
                          value={item.name}
                          onChange={e => updateItem(item._id, 'name', e.target.value)}
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <select
                            className="px-2 py-1.5 rounded-xl text-xs font-bold outline-none border"
                            style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                            value={item.category}
                            onChange={e => updateItem(item._id, 'category', e.target.value)}>
                            {CAT_OPTIONS.map(c => <option key={c}>{c}</option>)}
                          </select>
                          <select
                            className="px-2 py-1.5 rounded-xl text-xs font-bold outline-none border"
                            style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                            value={item.unit}
                            onChange={e => updateItem(item._id, 'unit', e.target.value)}>
                            {UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
                          </select>
                          <input
                            type="number"
                            className="px-2 py-1.5 rounded-xl text-xs font-bold outline-none border"
                            style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                            placeholder={`Cost ${symbol}`}
                            value={item.cost_per_unit}
                            onChange={e => updateItem(item._id, 'cost_per_unit', e.target.value)}
                          />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingIdx(null)}
                            className="flex-1 py-1.5 rounded-xl text-xs font-black text-white"
                            style={{ background: 'var(--accent)' }}>
                            Done
                          </button>
                          <button onClick={() => removeItem(item._id)}
                            className="px-3 py-1.5 rounded-xl text-xs font-black"
                            style={{ background: 'var(--bg-hover)', color: 'var(--danger)' }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Collapsed row */
                      <div className="flex items-center gap-3">
                        <button onClick={() => toggleItem(item._id)}
                          className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all"
                          style={{
                            borderColor: item.selected ? 'var(--accent)' : 'var(--border)',
                            background: item.selected ? 'var(--accent)' : 'transparent',
                          }}>
                          {item.selected && <Check className="w-3 h-3 text-white" />}
                        </button>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                            {item.name || '(unnamed)'}
                          </p>
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {item.category} · {item.unit} · {symbol}{item.cost_per_unit}/unit
                          </p>
                        </div>

                        <button onClick={() => setEditingIdx(item._id)}
                          className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
                          style={{ color: 'var(--text-secondary)' }}>
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3 — Opening stock */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-black mb-1" style={{ color: 'var(--text-primary)' }}>
                  How much do you have right now?
                </h2>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Enter current quantities. Skip items you'll count later — you can always update.
                </p>
              </div>

              <div className="space-y-2">
                {items.filter(i => i.selected).map(item => (
                  <div key={item._id}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                        {item.name}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        Unit: {item.unit}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="0"
                        className="w-24 px-3 py-2 rounded-xl text-sm font-black text-right outline-none border-2 transition-all"
                        style={{
                          background: 'var(--bg-card)',
                          color: 'var(--text-primary)',
                          borderColor: openingStock[item._id] > 0 ? 'var(--accent)' : 'var(--border)',
                        }}
                        value={openingStock[item._id] || ''}
                        onChange={e => setOpeningStock(s => ({ ...s, [item._id]: e.target.value }))}
                      />
                      <span className="text-xs font-bold w-8" style={{ color: 'var(--text-secondary)' }}>
                        {item.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4 — Supplier */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-black mb-1" style={{ color: 'var(--text-primary)' }}>
                  Who supplies your ingredients?
                </h2>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Add one supplier to start. You can add more later.
                </p>
              </div>

              <button
                onClick={() => setSkipSupplier(s => !s)}
                className="flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl"
                style={{
                  background: skipSupplier ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--bg-hover)',
                  color: skipSupplier ? 'var(--accent)' : 'var(--text-secondary)',
                  border: `1px solid ${skipSupplier ? 'var(--accent)' : 'transparent'}`,
                }}>
                <X className="w-4 h-4" />
                Skip for now
              </button>

              {!skipSupplier && (
                <div className="space-y-3">
                  {[
                    { field: 'name',           label: 'Supplier / Company Name*', placeholder: 'e.g. Fresh Farms Pvt Ltd', required: true },
                    { field: 'contact_person', label: 'Contact Person',           placeholder: 'e.g. Raju Bhai' },
                    { field: 'phone',          label: 'Phone Number',             placeholder: '+91 98765 43210' },
                    { field: 'email',          label: 'Email (optional)',          placeholder: 'supplier@email.com' },
                  ].map(({ field, label, placeholder }) => (
                    <div key={field}>
                      <label className="block text-xs font-black mb-1.5 uppercase tracking-wider"
                        style={{ color: 'var(--text-secondary)' }}>{label}</label>
                      <input
                        className="w-full px-4 py-3 rounded-2xl text-sm font-bold outline-none border-2 transition-all"
                        style={{
                          background: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          borderColor: supplier[field] ? 'var(--accent)' : 'var(--border)',
                        }}
                        placeholder={placeholder}
                        value={supplier[field]}
                        onChange={e => setSupplier(s => ({ ...s, [field]: e.target.value }))}
                      />
                    </div>
                  ))}

                  <div>
                    <label className="block text-xs font-black mb-1.5 uppercase tracking-wider"
                      style={{ color: 'var(--text-secondary)' }}>Payment Terms</label>
                    <div className="flex flex-wrap gap-2">
                      {PAYMENT_TERMS_OPTIONS.map(t => (
                        <button key={t}
                          onClick={() => setSupplier(s => ({ ...s, payment_terms: t }))}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                          style={{
                            background: supplier.payment_terms === t ? 'var(--accent)' : 'var(--bg-hover)',
                            color: supplier.payment_terms === t ? '#fff' : 'var(--text-primary)',
                          }}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 5 — Done */}
          {step === 5 && (
            <div className="flex flex-col items-center justify-center text-center py-8 space-y-6">
              <div className="w-24 h-24 rounded-full flex items-center justify-center"
                style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)' }}>
                <Zap className="w-12 h-12" style={{ color: 'var(--success)' }} />
              </div>

              <div>
                <h2 className="text-3xl font-black mb-2" style={{ color: 'var(--text-primary)' }}>
                  You're all set!
                </h2>
                <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
                  {selectedCount} items ready · opening stock logged · AI insights enabled
                </p>
              </div>

              <div className="w-full max-w-sm space-y-3 text-left">
                {[
                  { icon: Package, label: `${selectedCount} inventory items added` },
                  { icon: Layers, label: `${Object.values(openingStock).filter(v => v > 0).length} items with opening stock set` },
                  { icon: Users, label: skipSupplier ? 'Supplier: skipped (add later)' : `Supplier: ${supplier.name || 'saved'}` },
                  { icon: Sparkles, label: 'AI will monitor stock and give daily insights' },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                    style={{ background: 'var(--bg-secondary)' }}>
                    <Icon className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                    <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer Buttons ── */}
        <div className="px-8 py-6 flex items-center justify-between shrink-0"
          style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 1}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold transition-all disabled:opacity-0"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          {step < 4 && (
            <button
              onClick={() => {
                if (step === 1) handleCuisineNext();
                else setStep(s => s + 1);
              }}
              disabled={suggestMutation.isPending || (step === 2 && selectedCount === 0)}
              className="flex items-center gap-2 px-8 py-3 rounded-2xl text-sm font-black text-white disabled:opacity-50 transition-all"
              style={{ background: 'var(--accent)' }}>
              {suggestMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> AI is thinking…</>
                : <>{step === 1 ? 'Generate My List' : 'Continue'} <ArrowRight className="w-4 h-4" /></>}
            </button>
          )}

          {step === 4 && (
            <button
              onClick={() => setStep(5)}
              disabled={!skipSupplier && !supplier.name.trim()}
              className="flex items-center gap-2 px-8 py-3 rounded-2xl text-sm font-black text-white disabled:opacity-50 transition-all"
              style={{ background: 'var(--accent)' }}>
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {step === 5 && (
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex items-center gap-2 px-8 py-3 rounded-2xl text-sm font-black text-white disabled:opacity-50 transition-all"
              style={{ background: 'var(--success)' }}>
              {saveMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                : <><Zap className="w-4 h-4" /> Launch Inventory</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
