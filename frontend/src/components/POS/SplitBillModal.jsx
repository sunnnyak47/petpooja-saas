import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../Modal';
import { CreditCard, Plus, Trash2, Minus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { useRegion } from '../../hooks/useRegion';
import { useCurrency } from '../../hooks/useCurrency';

const PAYMENT_METHODS_AU = [
  { value: 'cash',   label: 'Cash' },
  { value: 'card',   label: 'Card' },
  { value: 'eftpos', label: 'EFTPOS' },
];
const PAYMENT_METHODS_IN = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi',  label: 'UPI' },
];

function clampSplitCount(v) {
  const n = parseInt(v, 10);
  if (isNaN(n) || n < 2) return 2;
  if (n > 20) return 20;
  return n;
}

export default function SplitBillModal({ isOpen, onClose, orderTotal, orderId }) {
  const userRegion = useRegion();
  const isAU = userRegion === 'AU';
  const { symbol } = useCurrency();
  const methods = isAU ? PAYMENT_METHODS_AU : PAYMENT_METHODS_IN;

  const [splitMode, setSplitMode] = useState('equal');
  const [splitCount, setSplitCount] = useState(2);
  // Raw string so user can clear the field while typing
  const [splitCountInput, setSplitCountInput] = useState('2');
  // Per-slot payment methods for equal mode
  const [slotMethods, setSlotMethods] = useState(['cash', 'cash']);
  // Custom mode: array of { amount: string, method: string }
  const [customSplits, setCustomSplits] = useState([
    { amount: '', method: 'cash' },
    { amount: '', method: 'cash' },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);

  const total = Number(orderTotal) || 0;

  // ── Keep slotMethods in sync when splitCount changes ──
  useEffect(() => {
    setSlotMethods(prev => {
      if (prev.length === splitCount) return prev;
      if (prev.length < splitCount) {
        return [...prev, ...Array(splitCount - prev.length).fill('cash')];
      }
      return prev.slice(0, splitCount);
    });
  }, [splitCount]);

  // ── Equal split amounts (no shared refs, no mutation) ──
  const equalSplits = useMemo(() => {
    if (splitCount < 2 || total === 0) return [];
    const base = Math.floor((total / splitCount) * 100) / 100; // floor to 2dp
    const remainder = Math.round((total - base * splitCount) * 100) / 100;
    return Array.from({ length: splitCount }, (_, i) => ({
      amount: i === splitCount - 1 ? Math.round((base + remainder) * 100) / 100 : base,
      method: slotMethods[i] || 'cash',
    }));
  }, [total, splitCount, slotMethods]);

  // ── Custom split validation ──
  const customTotal = useMemo(
    () => customSplits.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0),
    [customSplits]
  );
  const customRemaining = Math.round((total - customTotal) * 100) / 100;
  const customValid = Math.abs(customRemaining) < 0.01;

  // ── Helpers for equal mode ──
  const handleCountInput = (val) => {
    setSplitCountInput(val);
    const n = clampSplitCount(val);
    setSplitCount(n);
  };
  const nudgeCount = (delta) => {
    const next = clampSplitCount(splitCount + delta);
    setSplitCount(next);
    setSplitCountInput(String(next));
  };
  const handleSlotMethod = (i, method) => {
    setSlotMethods(prev => prev.map((m, idx) => (idx === i ? method : m)));
  };

  // ── Helpers for custom mode ──
  const addCustomSlot = () => {
    if (customSplits.length >= 20) return;
    setCustomSplits(prev => [...prev, { amount: '', method: 'cash' }]);
  };
  const removeCustomSlot = (i) => {
    if (customSplits.length <= 2) return;
    setCustomSplits(prev => prev.filter((_, idx) => idx !== i));
  };
  const updateCustomSlot = (i, field, value) => {
    setCustomSplits(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  };
  const fillRemainder = (i) => {
    // Auto-fill the remaining amount into this slot
    const othersTotal = customSplits.reduce(
      (s, c, idx) => idx !== i ? s + (parseFloat(c.amount) || 0) : s, 0
    );
    const fill = Math.round((total - othersTotal) * 100) / 100;
    if (fill < 0) return;
    updateCustomSlot(i, 'amount', String(fill));
  };

  // ── Submit ──
  const processSplitPayment = async () => {
    if (!orderId) {
      toast.error('No active order found');
      return;
    }
    const splits = splitMode === 'equal' ? equalSplits : customSplits.map(s => ({
      method: s.method,
      amount: parseFloat(s.amount) || 0,
    }));

    if (splitMode === 'custom' && !customValid) {
      toast.error(`Amounts don't add up — ${customRemaining > 0 ? `${symbol}${customRemaining.toFixed(2)} remaining` : `${symbol}${Math.abs(customRemaining).toFixed(2)} over`}`);
      return;
    }

    setIsProcessing(true);
    try {
      await api.post(`/orders/${orderId}/payment`, {
        method: 'split',
        amount: total,
        splits: splits.map(s => ({ method: s.method, amount: s.amount })),
      });
      toast.success('Split bill payment processed!');
      onClose(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Payment failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const fmt = (n) => isAU ? n.toFixed(2) : String(Math.round(n));

  return (
    <Modal isOpen={isOpen} onClose={() => onClose()} title="Split Bill" size="lg">
      <div className="space-y-5">

        {/* Total banner */}
        <div className="flex items-center justify-between px-4 py-3 rounded-xl"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Order Total</span>
          <span className="text-xl font-black" style={{ color: 'var(--text-primary)' }}>{symbol}{fmt(total)}</span>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {['equal', 'custom'].map(m => (
            <button key={m} onClick={() => setSplitMode(m)}
              className="flex-1 py-2.5 text-sm font-semibold transition-colors"
              style={{
                background: splitMode === m ? 'var(--accent)' : 'var(--bg-card)',
                color: splitMode === m ? '#fff' : 'var(--text-secondary)',
              }}>
              {m === 'equal' ? 'Split Equally' : 'Custom Amounts'}
            </button>
          ))}
        </div>

        {/* ── EQUAL MODE ── */}
        {splitMode === 'equal' && (
          <div className="space-y-4">
            {/* People count stepper */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                Split between
              </span>
              <div className="flex items-center rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                <button
                  onClick={() => nudgeCount(-1)}
                  disabled={splitCount <= 2}
                  className="w-10 h-10 flex items-center justify-center transition-colors disabled:opacity-30"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  type="number" min="2" max="20"
                  className="w-12 text-center text-sm font-bold bg-transparent outline-none"
                  style={{ color: 'var(--text-primary)' }}
                  value={splitCountInput}
                  onChange={e => handleCountInput(e.target.value)}
                  onBlur={() => setSplitCountInput(String(splitCount))}
                />
                <button
                  onClick={() => nudgeCount(1)}
                  disabled={splitCount >= 20}
                  className="w-10 h-10 flex items-center justify-center transition-colors disabled:opacity-30"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>people</span>
            </div>

            {/* Split cards */}
            <div className="grid grid-cols-2 gap-3">
              {equalSplits.map((s, i) => (
                <div key={i} className="p-4 rounded-xl"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: 'var(--text-secondary)' }}>Bill {i + 1}</p>
                  <p className="text-2xl font-black mb-3" style={{ color: 'var(--accent)' }}>
                    {symbol}{fmt(s.amount)}
                  </p>
                  <select
                    className="w-full text-sm rounded-lg px-2 py-1.5 outline-none"
                    style={{
                      background: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                    }}
                    value={s.method}
                    onChange={e => handleSlotMethod(i, e.target.value)}>
                    {methods.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CUSTOM MODE ── */}
        {splitMode === 'custom' && (
          <div className="space-y-3">
            {customSplits.map((s, i) => (
              <div key={i} className="flex items-center gap-2 p-3 rounded-xl"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                <span className="text-sm font-semibold w-16 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                  Bill {i + 1}
                </span>

                {/* Amount input */}
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
                    style={{ color: 'var(--text-secondary)' }}>{symbol}</span>
                  <input
                    type="number" min="0" step="0.01"
                    placeholder="0.00"
                    className="w-full pl-7 pr-2 py-2 rounded-lg text-sm outline-none"
                    style={{
                      background: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                    }}
                    value={s.amount}
                    onChange={e => updateCustomSlot(i, 'amount', e.target.value)}
                  />
                </div>

                {/* Fill remainder button */}
                <button
                  onClick={() => fillRemainder(i)}
                  className="text-xs px-2 py-2 rounded-lg font-semibold shrink-0 transition-colors"
                  style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent)' }}
                  title="Fill remaining amount">
                  Fill
                </button>

                {/* Method select */}
                <select
                  className="text-sm rounded-lg px-2 py-2 outline-none shrink-0"
                  style={{
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                  }}
                  value={s.method}
                  onChange={e => updateCustomSlot(i, 'method', e.target.value)}>
                  {methods.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>

                {/* Remove slot */}
                <button
                  onClick={() => removeCustomSlot(i)}
                  disabled={customSplits.length <= 2}
                  className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30"
                  style={{ color: '#ef4444' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {/* Remaining indicator */}
            <div className="flex items-center justify-between px-1">
              <button
                onClick={addCustomSlot}
                disabled={customSplits.length >= 20}
                className="flex items-center gap-1.5 text-sm font-semibold transition-colors disabled:opacity-40"
                style={{ color: 'var(--accent)' }}>
                <Plus className="w-4 h-4" /> Add another bill
              </button>
              <span className={`text-sm font-bold ${customValid ? 'text-green-500' : Math.abs(customRemaining) > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                {customValid
                  ? '✓ Amounts balance'
                  : customRemaining > 0
                    ? `${symbol}${customRemaining.toFixed(2)} remaining`
                    : `${symbol}${Math.abs(customRemaining).toFixed(2)} over`}
              </span>
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={processSplitPayment}
            disabled={isProcessing || (splitMode === 'custom' && !customValid)}
            className="w-full py-4 rounded-xl text-base font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #16a34a, #15803d)',
              color: '#fff',
              boxShadow: '0 6px 18px -6px rgba(22,163,74,0.5)',
            }}>
            <CreditCard className="w-5 h-5" />
            {isProcessing ? 'Processing…' : `Process ${splitMode === 'equal' ? splitCount : customSplits.length} Bills`}
          </button>
        </div>

      </div>
    </Modal>
  );
}
