import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useCurrency } from '../../hooks/useCurrency';
import { X, Search, Plus, Minus, Check, Loader2, Zap, Truck, Trash2, Settings, Sparkles } from 'lucide-react';

/* ─── Modal / Sheet wrapper ─────────────────────────────────── */
/*  - Mobile  (< 640px): slides up from bottom  */
/*  - Desktop (≥ 640px): centered dialog        */
function Sheet({ title, icon: Icon, onClose, children, accentColor = 'var(--accent)' }) {
  const ref = useRef(null);

  /* Close on outside click */
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const tid = setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => { clearTimeout(tid); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  /* Close on Escape */
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  /* Prevent body scroll while open */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
    >
      <div
        ref={ref}
        className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col animate-slide-up sm:animate-scale-in"
        style={{ background: 'var(--bg-card)', maxHeight: '92dvh', boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          {/* Drag handle — mobile only */}
          <span className="absolute top-2.5 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full sm:hidden"
            style={{ background: 'var(--border)' }} />

          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `color-mix(in srgb, ${accentColor} 15%, transparent)` }}
            >
              <Icon className="w-5 h-5" style={{ color: accentColor }} />
            </div>
            <span className="font-black text-base" style={{ color: 'var(--text-primary)' }}>{title}</span>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-opacity hover:opacity-60"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Scrollable content ── */}
        <div className="overflow-y-auto flex-1 px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

/* ─── Item search ────────────────────────────────────────────── */
function ItemSearch({ outletId, onSelect, placeholder = 'Search ingredients…' }) {
  const [q, setQ] = useState('');
  const { data } = useQuery({
    queryKey: ['inv-items-search', outletId, q],
    queryFn: () => api.get(`/inventory/items?outlet_id=${outletId}&search=${q}&limit=20`),
    enabled: !!outletId && q.length > 0,
  });

  const raw = data?.data;
  const items = Array.isArray(raw) ? raw : (raw?.items || raw || []);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-4 py-3 rounded-2xl mb-2"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
        <input autoFocus
          className="flex-1 bg-transparent text-sm font-bold outline-none"
          style={{ color: 'var(--text-primary)' }}
          placeholder={placeholder}
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>
      {items.length > 0 && (
        <div className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          {items.map(item => (
            <button key={item.id}
              onClick={() => { onSelect(item); setQ(''); }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:opacity-70 transition-opacity text-left"
              style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex-1">
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.category} · {item.unit}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   RECEIVED DELIVERY SHEET
══════════════════════════════════════════════════════════════ */
export function ReceivedDeliverySheet({ outletId, onClose }) {
  const qc = useQueryClient();
  const [entries, setEntries] = useState([]);

  const mut = useMutation({
    mutationFn: () => Promise.all(
      entries.filter(e => e.qty > 0).map(e =>
        api.post('/inventory/adjust', {
          outlet_id: outletId,
          item_id: e.item.id,
          quantity: parseFloat(e.qty),
          reason: 'Delivery received',
        })
      )
    ),
    onSuccess: () => {
      toast.success(`${entries.filter(e => e.qty > 0).length} items stocked up!`);
      qc.invalidateQueries({ queryKey: ['inv-stock'] });
      qc.invalidateQueries({ queryKey: ['inv-ai-insights'] });
      onClose();
    },
    onError: e => toast.error(e.response?.data?.message || 'Failed'),
  });

  const addItem = (item) => {
    if (entries.find(e => e.item.id === item.id)) return;
    setEntries(prev => [...prev, { item, qty: '' }]);
  };

  const updateQty = (id, val) => setEntries(prev => prev.map(e => e.item.id === id ? { ...e, qty: val } : e));
  const removeEntry = (id) => setEntries(prev => prev.filter(e => e.item.id !== id));

  return (
    <Sheet title="Received Delivery" icon={Truck} onClose={onClose} accentColor="var(--success)">
      <div className="space-y-4">
        <ItemSearch outletId={outletId} onSelect={addItem} placeholder="Search item to add…" />

        {entries.length > 0 && (
          <div className="space-y-2">
            {entries.map(e => (
              <div key={e.item.id}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{e.item.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{e.item.unit}</p>
                </div>
                <input type="number" min="0" step="0.1"
                  autoFocus
                  placeholder="Qty"
                  className="w-24 px-3 py-2 rounded-xl text-sm font-black text-right outline-none border-2 transition-all"
                  style={{
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    borderColor: e.qty > 0 ? 'var(--success)' : 'var(--border)',
                  }}
                  value={e.qty}
                  onChange={ev => updateQty(e.item.id, ev.target.value)}
                />
                <button onClick={() => removeEntry(e.item.id)}
                  className="p-1.5 rounded-lg hover:opacity-70"
                  style={{ color: 'var(--danger)' }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}

            <button
              onClick={() => mut.mutate()}
              disabled={mut.isPending || entries.filter(e => e.qty > 0).length === 0}
              className="w-full py-4 rounded-2xl text-sm font-black text-white flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'var(--success)' }}>
              {mut.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                : <><Check className="w-4 h-4" /> Stock Up {entries.filter(e => e.qty > 0).length} Items</>}
            </button>
          </div>
        )}

        {entries.length === 0 && (
          <div className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>
            <Truck className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-bold">Search and add items you received</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LOG WASTAGE SHEET
══════════════════════════════════════════════════════════════ */
const WASTE_REASONS = ['Expired', 'Damaged', 'Over-portioned', 'Cooking error', 'Spillage'];

export function LogWastageSheet({ outletId, onClose }) {
  const qc = useQueryClient();
  const [entries, setEntries] = useState([]);
  const [reasons, setReasons] = useState({});

  const mut = useMutation({
    mutationFn: () => api.post('/inventory/wastage', {
      outlet_id: outletId,
      items: entries.filter(e => e.qty > 0).map(e => ({
        item_id: e.item.id,
        quantity: parseFloat(e.qty),
        reason: reasons[e.item.id] || 'Wastage',
      })),
    }),
    onSuccess: () => {
      toast.success('Wastage logged');
      qc.invalidateQueries({ queryKey: ['inv-stock'] });
      qc.invalidateQueries({ queryKey: ['inv-ai-insights'] });
      onClose();
    },
    onError: e => toast.error(e.response?.data?.message || 'Failed'),
  });

  const addItem = (item) => {
    if (entries.find(e => e.item.id === item.id)) return;
    setEntries(prev => [...prev, { item, qty: '' }]);
    setReasons(r => ({ ...r, [item.id]: 'Expired' }));
  };

  return (
    <Sheet title="Log Wastage" icon={Trash2} onClose={onClose} accentColor="var(--danger)">
      <div className="space-y-4">
        <ItemSearch outletId={outletId} onSelect={addItem} placeholder="Search wasted item…" />

        {entries.map(e => (
          <div key={e.item.id}
            className="rounded-2xl p-4 space-y-3"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{e.item.name}</p>
              <button onClick={() => setEntries(prev => prev.filter(x => x.item.id !== e.item.id))}
                className="p-1 rounded-lg hover:opacity-70" style={{ color: 'var(--danger)' }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <input type="number" min="0" step="0.1"
              placeholder={`Quantity (${e.item.unit})`}
              className="w-full px-3 py-2 rounded-xl text-sm font-bold outline-none border-2 transition-all"
              style={{
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                borderColor: e.qty > 0 ? 'var(--danger)' : 'var(--border)',
              }}
              value={e.qty}
              onChange={ev => setEntries(prev => prev.map(x => x.item.id === e.item.id ? { ...x, qty: ev.target.value } : x))}
            />

            <div className="flex flex-wrap gap-2">
              {WASTE_REASONS.map(r => (
                <button key={r}
                  onClick={() => setReasons(rs => ({ ...rs, [e.item.id]: r }))}
                  className="px-3 py-1 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background: reasons[e.item.id] === r ? 'var(--danger)' : 'var(--bg-hover)',
                    color: reasons[e.item.id] === r ? '#fff' : 'var(--text-secondary)',
                  }}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        ))}

        {entries.length > 0 && (
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || entries.filter(e => e.qty > 0).length === 0}
            className="w-full py-4 rounded-2xl text-sm font-black text-white flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'var(--danger)' }}>
            {mut.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : <><Trash2 className="w-4 h-4" /> Log Wastage</>}
          </button>
        )}

        {entries.length === 0 && (
          <div className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>
            <Trash2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-bold">Search and add wasted items</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ADJUST STOCK SHEET
══════════════════════════════════════════════════════════════ */
const ADJUST_REASONS = ['Manual Count', 'Audit Correction', 'Return to Vendor', 'Transfer', 'Damage Write-off', 'Other'];

export function AdjustStockSheet({ outletId, prefillItem, onClose }) {
  const qc = useQueryClient();
  const [selectedItem, setSelectedItem] = useState(prefillItem || null);
  const [qty, setQty] = useState('');
  const [direction, setDirection] = useState('+');
  const [reason, setReason] = useState('Manual Count');

  const mut = useMutation({
    mutationFn: () => api.post('/inventory/adjust', {
      outlet_id: outletId,
      item_id: selectedItem.id,
      quantity: direction === '+' ? Math.abs(parseFloat(qty)) : -Math.abs(parseFloat(qty)),
      reason,
    }),
    onSuccess: () => {
      toast.success('Stock adjusted');
      qc.invalidateQueries({ queryKey: ['inv-stock'] });
      qc.invalidateQueries({ queryKey: ['inv-ai-insights'] });
      onClose();
    },
    onError: e => toast.error(e.response?.data?.message || 'Failed'),
  });

  return (
    <Sheet title="Adjust Stock" icon={Settings} onClose={onClose}>
      <div className="space-y-4">
        {!selectedItem
          ? <ItemSearch outletId={outletId} onSelect={setSelectedItem} placeholder="Search item to adjust…" />
          : (
            <div>
              <div className="flex items-center justify-between px-4 py-3 rounded-2xl mb-4"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--accent)' }}>
                <div>
                  <p className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>{selectedItem.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{selectedItem.unit}</p>
                </div>
                <button onClick={() => setSelectedItem(null)}
                  className="text-xs font-bold px-2 py-1 rounded-lg"
                  style={{ color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}>
                  Change
                </button>
              </div>

              {/* +/- toggle */}
              <div className="flex gap-2 mb-4">
                {['+', '-'].map(d => (
                  <button key={d}
                    onClick={() => setDirection(d)}
                    className="flex-1 py-3 rounded-2xl text-lg font-black transition-all"
                    style={{
                      background: direction === d ? (d === '+' ? 'var(--success)' : 'var(--danger)') : 'var(--bg-hover)',
                      color: direction === d ? '#fff' : 'var(--text-secondary)',
                    }}>
                    {d === '+' ? '+ Add Stock' : '− Remove Stock'}
                  </button>
                ))}
              </div>

              <input type="number" min="0" step="0.1" autoFocus
                placeholder={`Quantity in ${selectedItem.unit}`}
                className="w-full px-4 py-4 rounded-2xl text-lg font-black text-center outline-none border-2 mb-4 transition-all"
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  borderColor: qty > 0 ? (direction === '+' ? 'var(--success)' : 'var(--danger)') : 'var(--border)',
                }}
                value={qty}
                onChange={e => setQty(e.target.value)}
              />

              <div className="flex flex-wrap gap-2 mb-4">
                {ADJUST_REASONS.map(r => (
                  <button key={r}
                    onClick={() => setReason(r)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                    style={{
                      background: reason === r ? 'var(--accent)' : 'var(--bg-hover)',
                      color: reason === r ? '#fff' : 'var(--text-secondary)',
                    }}>
                    {r}
                  </button>
                ))}
              </div>

              <button
                onClick={() => mut.mutate()}
                disabled={mut.isPending || !qty || parseFloat(qty) <= 0}
                className="w-full py-4 rounded-2xl text-sm font-black text-white flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: direction === '+' ? 'var(--success)' : 'var(--danger)' }}>
                {mut.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                  : <><Check className="w-4 h-4" /> Confirm Adjustment</>}
              </button>
            </div>
          )}
      </div>
    </Sheet>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CREATE PO SHEET  (AI-assisted)
══════════════════════════════════════════════════════════════ */
export function CreatePOSheet({ outletId, onClose }) {
  const { symbol, format } = useCurrency();
  const qc = useQueryClient();
  const [poItems, setPOItems] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);

  const { data: suppliersData } = useQuery({
    queryKey: ['inv-suppliers', outletId],
    queryFn: () => api.get(`/suppliers?outlet_id=${outletId}`),
    enabled: !!outletId,
  });
  const suppliers = suppliersData?.data || [];

  const loadAISuggestions = async () => {
    setLoadingAI(true);
    try {
      const res = await api.post('/inventory/ai/build-po', { outlet_id: outletId });
      const data = res.data?.data || res.data;
      const suggested = (data.items || []).map(item => ({
        ...item,
        qty: item.reorder_qty || 1,
        unit_cost: item.cost_per_unit || 0,
      }));
      setPOItems(suggested);
      if (suggested.length === 0) toast('All items are sufficiently stocked!', { icon: '✅' });
    } catch (e) {
      toast.error('AI suggestion failed');
    } finally {
      setLoadingAI(false);
    }
  };

  const removeItem = (id) => setPOItems(prev => prev.filter(i => i.id !== id));
  const updateQty = (id, val) => setPOItems(prev => prev.map(i => i.id === id ? { ...i, qty: val } : i));

  const total = poItems.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unit_cost) || 0), 0);

  const createMut = useMutation({
    mutationFn: () => api.post('/purchase-orders', {
      outlet_id: outletId,
      ...(supplierId ? { supplier_id: supplierId } : {}),
      notes,
      items: poItems.map(i => ({
        inventory_item_id: i.id,
        unit: i.unit,
        quantity: parseFloat(i.qty) || 1,
        unit_price: parseFloat(i.unit_cost) || 0,
      })),
    }),
    onSuccess: () => {
      toast.success('Purchase order created!');
      qc.invalidateQueries({ queryKey: ['inv-pos'] });
      onClose();
    },
    onError: e => toast.error(e.response?.data?.message || 'Failed'),
  });

  return (
    <Sheet title="Create Purchase Order" icon={Zap} onClose={onClose} accentColor="var(--accent)">
      <div className="space-y-4">
        {/* AI Build button */}
        <button
          onClick={loadAISuggestions}
          disabled={loadingAI}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-black transition-all"
          style={{
            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
            color: 'var(--accent)',
            border: '1.5px dashed var(--accent)',
          }}>
          {loadingAI
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Building smart PO…</>
            : <><Sparkles className="w-4 h-4" /> AI: Order what's running low</>}
        </button>

        {poItems.length > 0 && (
          <>
            <div className="space-y-2">
              {poItems.map(item => (
                <div key={item.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Stock: {item.current} {item.unit} · {format(item.unit_cost)}/{item.unit}
                    </p>
                  </div>
                  <input type="number" min="0" step="0.1"
                    className="w-20 px-2 py-1.5 rounded-xl text-sm font-black text-right outline-none border"
                    style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                    value={item.qty}
                    onChange={e => updateQty(item.id, e.target.value)}
                  />
                  <span className="text-xs font-bold w-8" style={{ color: 'var(--text-secondary)' }}>{item.unit}</span>
                  <button onClick={() => removeItem(item.id)}
                    className="p-1 rounded-lg hover:opacity-70" style={{ color: 'var(--danger)' }}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Supplier select */}
            {suppliers.length > 0 && (
              <div>
                <label className="block text-xs font-black mb-1.5 uppercase tracking-wider"
                  style={{ color: 'var(--text-secondary)' }}>Supplier (optional)</label>
                <select
                  className="w-full px-4 py-3 rounded-2xl text-sm font-bold outline-none border-2 transition-all"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderColor: supplierId ? 'var(--accent)' : 'var(--border)' }}
                  value={supplierId}
                  onChange={e => setSupplierId(e.target.value)}>
                  <option value="">No supplier selected</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            <div className="flex items-center justify-between px-4 py-3 rounded-2xl"
              style={{ background: 'var(--bg-secondary)' }}>
              <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>Estimated Total</span>
              <span className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>
                {format(total)}
              </span>
            </div>

            <button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending || poItems.length === 0}
              className="w-full py-4 rounded-2xl text-sm font-black text-white flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'var(--accent)' }}>
              {createMut.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating PO…</>
                : <><Zap className="w-4 h-4" /> Create PO · {poItems.length} items</>}
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
