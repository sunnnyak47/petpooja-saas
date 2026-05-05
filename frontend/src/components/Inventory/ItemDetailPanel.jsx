import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import {
  X, History, Edit3, Trash2, Check, Loader2, Plus, Minus,
  TrendingDown, TrendingUp, AlertCircle, Sparkles,
} from 'lucide-react';
import { AdjustStockSheet } from './QuickActionSheet';

const STATUS_BG = {
  OK:       'color-mix(in srgb, var(--success) 10%, transparent)',
  LOW:      'color-mix(in srgb, var(--warning) 10%, transparent)',
  CRITICAL: 'color-mix(in srgb, var(--danger) 10%, transparent)',
  OUT:      'color-mix(in srgb, var(--danger) 15%, transparent)',
};

const TX_ICONS = {
  adjustment:  { Icon: TrendingUp,   color: 'var(--success)' },
  consumption: { Icon: TrendingDown, color: 'var(--danger)' },
  wastage:     { Icon: AlertCircle,  color: 'var(--warning)' },
};

export default function ItemDetailPanel({ item, outletId, onClose }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [form, setForm] = useState({
    name: item.name,
    cost_per_unit: item.cost_per_unit || 0,
    min_threshold: item.min_threshold || 1,
    max_threshold: item.max_threshold || 10,
    auto_order_enabled: item.auto_order_enabled || false,
    reorder_qty: item.reorder_qty || 5,
  });

  // Last 15 transactions for this item
  const { data: txData } = useQuery({
    queryKey: ['item-tx', item.id, outletId],
    queryFn: () => api.get(`/inventory/stock?outlet_id=${outletId}&item_id=${item.id}&limit=15`).then(r => r.data),
    enabled: !!item.id,
  });

  const transactions = txData?.data?.transactions || [];

  const updateMut = useMutation({
    mutationFn: (data) => api.patch(`/inventory/items/${item.id}`, data),
    onSuccess: () => {
      toast.success('Item updated');
      qc.invalidateQueries({ queryKey: ['inv-stock'] });
      qc.invalidateQueries({ queryKey: ['inv-items'] });
      setEditing(false);
    },
    onError: e => toast.error(e.response?.data?.message || 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/inventory/items/${item.id}`),
    onSuccess: () => {
      toast.success('Item deleted');
      qc.invalidateQueries({ queryKey: ['inv-stock'] });
      qc.invalidateQueries({ queryKey: ['inv-items'] });
      onClose();
    },
    onError: e => toast.error(e.response?.data?.message || 'Failed'),
  });

  const aiAutofillMut = useMutation({
    mutationFn: () => api.post('/inventory/ai/autofill-item', { item_name: form.name }),
    onSuccess: (res) => {
      const data = res.data?.data || res.data;
      setForm(f => ({ ...f, ...data }));
      toast.success('AI filled details');
    },
    onError: () => toast.error('AI autofill failed'),
  });

  const status = item.stock_status || 'OK';

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}>
        <div
          className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
          style={{ background: 'var(--bg-card)', maxHeight: '92vh' }}
          onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="px-6 py-5 shrink-0"
            style={{ background: STATUS_BG[status], borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{
                      background: 'var(--bg-card)',
                      color: status === 'OK' ? 'var(--success)' : status === 'LOW' ? 'var(--warning)' : 'var(--danger)',
                    }}>
                    {status}
                  </span>
                  <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{item.category}</span>
                </div>
                <h3 className="text-xl font-black leading-tight" style={{ color: 'var(--text-primary)' }}>
                  {item.name}
                </h3>
              </div>
              <button onClick={onClose}
                className="w-8 h-8 rounded-xl flex items-center justify-center ml-3 shrink-0"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Stock stats */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              {[
                { label: 'Current Stock', value: `${item.current_stock ?? 0} ${item.unit}`, highlight: true },
                { label: 'Min Threshold', value: `${item.min_threshold ?? 0} ${item.unit}` },
                { label: 'Cost/Unit', value: `₹${item.cost_per_unit ?? 0}` },
              ].map(({ label, value, highlight }) => (
                <div key={label} className="px-3 py-2 rounded-2xl text-center"
                  style={{ background: highlight ? 'var(--bg-card)' : 'color-mix(in srgb, var(--bg-card) 60%, transparent)' }}>
                  <p className="text-xs font-bold mb-0.5" style={{ color: 'var(--text-secondary)' }}>{label}</p>
                  <p className="text-sm font-black" style={{ color: highlight ? 'var(--accent)' : 'var(--text-primary)' }}>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {/* Quick adjust buttons */}
            <div className="px-6 py-4 flex gap-3"
              style={{ borderBottom: '1px solid var(--border)' }}>
              <button
                onClick={() => setShowAdjust(true)}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-black"
                style={{ background: 'var(--accent)', color: '#fff' }}>
                <Plus className="w-4 h-4" /> Adjust Stock
              </button>
              <button
                onClick={() => setEditing(e => !e)}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-black"
                style={{
                  background: editing ? 'var(--accent)' : 'var(--bg-hover)',
                  color: editing ? '#fff' : 'var(--text-primary)',
                }}>
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => { if (window.confirm(`Delete "${item.name}"?`)) deleteMut.mutate(); }}
                disabled={deleteMut.isPending}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-black"
                style={{ background: 'color-mix(in srgb, var(--danger) 12%, transparent)', color: 'var(--danger)' }}>
                {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </div>

            {/* Edit form */}
            {editing && (
              <div className="px-6 py-4 space-y-3"
                style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                    Edit Details
                  </span>
                  <button
                    onClick={() => aiAutofillMut.mutate()}
                    disabled={aiAutofillMut.isPending}
                    className="flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-xl"
                    style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
                    {aiAutofillMut.isPending
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Sparkles className="w-3 h-3" />}
                    AI Autofill
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'cost_per_unit', label: 'Cost/Unit (₹)', type: 'number' },
                    { key: 'min_threshold', label: `Min Threshold (${item.unit})`, type: 'number' },
                    { key: 'max_threshold', label: `Max Threshold (${item.unit})`, type: 'number' },
                    { key: 'reorder_qty',   label: `Reorder Qty (${item.unit})`, type: 'number' },
                  ].map(({ key, label, type }) => (
                    <div key={key}>
                      <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                        {label}
                      </label>
                      <input type={type}
                        className="w-full px-3 py-2 rounded-xl text-sm font-bold outline-none border-2 transition-all"
                        style={{
                          background: 'var(--bg-card)',
                          color: 'var(--text-primary)',
                          borderColor: 'var(--border)',
                        }}
                        value={form[key]}
                        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between px-3 py-2 rounded-xl"
                  style={{ background: 'var(--bg-card)' }}>
                  <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Auto-order when low</span>
                  <button
                    onClick={() => setForm(f => ({ ...f, auto_order_enabled: !f.auto_order_enabled }))}
                    className="relative w-10 h-6 rounded-full transition-all"
                    style={{ background: form.auto_order_enabled ? 'var(--accent)' : 'var(--bg-hover)' }}>
                    <div className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                      style={{ left: form.auto_order_enabled ? '22px' : '4px' }} />
                  </button>
                </div>

                <button
                  onClick={() => updateMut.mutate(form)}
                  disabled={updateMut.isPending}
                  className="w-full py-3 rounded-2xl text-sm font-black text-white flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: 'var(--accent)' }}>
                  {updateMut.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                    : <><Check className="w-4 h-4" /> Save Changes</>}
                </button>
              </div>
            )}

            {/* Transaction history */}
            <div className="px-6 py-4">
              <div className="flex items-center gap-2 mb-3">
                <History className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                <span className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Recent Activity
                </span>
              </div>

              {transactions.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: 'var(--text-secondary)' }}>
                  No transactions yet
                </p>
              ) : (
                <div className="space-y-2">
                  {transactions.map((tx, i) => {
                    const cfg = TX_ICONS[tx.transaction_type] || TX_ICONS.adjustment;
                    const Icon = cfg.Icon;
                    const qty = parseFloat(tx.quantity);
                    return (
                      <div key={i}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl"
                        style={{ background: 'var(--bg-secondary)' }}>
                        <Icon className="w-4 h-4 shrink-0" style={{ color: cfg.color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                            {tx.reason || tx.transaction_type}
                          </p>
                          <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                            {new Date(tx.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <span className="text-sm font-black"
                          style={{ color: qty > 0 ? 'var(--success)' : 'var(--danger)' }}>
                          {qty > 0 ? '+' : ''}{qty} {item.unit}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showAdjust && (
        <AdjustStockSheet
          outletId={outletId}
          prefillItem={item}
          onClose={() => setShowAdjust(false)}
        />
      )}
    </>
  );
}
