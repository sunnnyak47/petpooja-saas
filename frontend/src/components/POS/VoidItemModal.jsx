import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../../lib/api';
import hybridAPI, { isNetworkError } from '../../api/offlineAPI';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import Modal from '../Modal';
import toast from 'react-hot-toast';
import { useCurrency } from '../../hooks/useCurrency';
import { Trash2, Gift, ChefHat, AlertTriangle, Check, X, Lock } from 'lucide-react';

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electron;

const QUICK_REASONS = [
  'Wrong order',
  'Customer changed mind',
  'Out of stock',
  'Quality issue',
  'Staff error',
];

export default function VoidItemModal({ isOpen, onClose, order, outletId, onSuccess }) {
  const { format } = useCurrency();
  const isOnline = useOnlineStatus();

  const [selectedItemId, setSelectedItemId] = useState(null);
  const [voidType, setVoidType] = useState('void');
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  // Reset all state whenever modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedItemId(null);
      setVoidType('void');
      setReason('');
      setPin('');
      setPinError('');
    }
  }, [isOpen]);

  const voidableItems = (order?.order_items || []).filter((item) => !item.is_deleted);
  const selectedItem = voidableItems.find((i) => i.id === selectedItemId) || null;

  const isComped = (item) =>
    item.discount_amount != null && item.discount_amount >= item.item_total;

  const canSubmit =
    selectedItemId !== null &&
    reason.trim().length > 0 &&
    pin.length >= 4;

  // PIN verification + void mutation combined
  const voidMutation = useMutation({
    mutationFn: async () => {
      // Offline write of the item void's final state to local SQLite (synced=0).
      const offlineVoid = () =>
        hybridAPI.voidItem(order.id, selectedItemId, {
          manager_pin: pin,
          reason: reason.trim(),
          void_type: voidType,
        });

      // Offline: the verify-pin endpoint is unreachable, so the manager PIN is
      // accepted locally and the item is voided straight in local SQLite.
      if (IS_ELECTRON && !isOnline) return offlineVoid();

      // Step 1: verify manager PIN
      try {
        await api.post('/staff/verify-pin', { pin, outlet_id: outletId });
      } catch (err) {
        // A network blip on the PIN check → accept locally and void offline.
        if (IS_ELECTRON && isNetworkError(err)) return offlineVoid();
        const msg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          'Invalid manager PIN';
        throw new Error(msg);
      }

      // Step 2: submit void
      try {
        const { data } = await api.post(`/orders/${order.id}/void-item`, {
          item_id: selectedItemId,
          manager_pin: pin,
          reason: reason.trim(),
          void_type: voidType,
        });
        return data;
      } catch (err) {
        // Backend briefly unreachable → void locally so a blip never blocks it.
        if (IS_ELECTRON && isNetworkError(err)) return offlineVoid();
        throw err;
      }
    },
    onSuccess: () => {
      const label = voidType === 'comp' ? 'Item comped' : 'Item voided';
      toast.success(`${label} successfully`);
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      const msg = err?.message || 'Something went wrong';
      if (msg.toLowerCase().includes('pin')) {
        setPinError(msg);
      } else {
        toast.error(msg);
      }
    },
  });

  const handleSubmit = () => {
    if (!canSubmit || voidMutation.isPending) return;
    setPinError('');
    voidMutation.mutate();
  };

  const handleQuickReason = (r) => {
    setReason(r);
  };

  const handlePinChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setPin(val);
    if (pinError) setPinError('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Void / Comp Item" size="lg">
      {/* ── Empty state ── */}
      {voidableItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <AlertTriangle className="w-10 h-10" style={{ color: 'var(--text-secondary)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            No items can be voided
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">

          {/* ── Section 1: Item list ── */}
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              Select item to void
            </p>
            <div className="flex flex-col gap-2">
              {voidableItems.map((item) => {
                const comped = isComped(item);
                const isSelected = item.id === selectedItemId;

                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className="w-full text-left rounded-xl px-4 py-3 border transition-all"
                    style={{
                      background: isSelected
                        ? 'rgba(245, 158, 11, 0.08)'
                        : 'var(--bg-hover)',
                      borderColor: isSelected
                        ? 'rgb(245, 158, 11)'
                        : 'var(--border)',
                      borderLeftWidth: isSelected ? '3px' : '1px',
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: name + badges */}
                      <div className="flex flex-col gap-1 min-w-0">
                        <span
                          className={`text-sm font-semibold truncate ${comped ? 'line-through' : ''}`}
                          style={{ color: comped ? 'var(--text-secondary)' : 'var(--text-primary)' }}
                        >
                          {item.name}
                        </span>

                        <div className="flex items-center flex-wrap gap-1.5">
                          {item.variant_name && (
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{
                                background: 'rgba(99, 102, 241, 0.15)',
                                color: 'rgb(129, 140, 248)',
                              }}
                            >
                              {item.variant_name}
                            </span>
                          )}
                          {item.is_kot_sent && (
                            <span className="flex items-center gap-1 text-xs font-medium"
                              style={{ color: 'rgb(251, 146, 60)' }}>
                              <span
                                className="w-1.5 h-1.5 rounded-full inline-block"
                                style={{ background: 'rgb(251, 146, 60)' }}
                              />
                              KOT Sent
                            </span>
                          )}
                          {comped && (
                            <span
                              className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                              style={{
                                background: 'rgba(245, 158, 11, 0.12)',
                                color: 'rgb(245, 158, 11)',
                              }}
                            >
                              <Gift className="w-3 h-3" />
                              Comped
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: qty × price + total */}
                      <div className="flex flex-col items-end shrink-0">
                        <span
                          className="text-xs"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {item.quantity} × {format(item.unit_price)}
                        </span>
                        <span
                          className="text-sm font-bold"
                          style={{ color: isSelected ? 'rgb(245, 158, 11)' : 'var(--text-primary)' }}
                        >
                          {format(item.item_total)}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Section 2: Void type toggle (only when item selected) ── */}
          {selectedItem && (
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                Action type
              </p>
              <div
                className="flex rounded-xl border overflow-hidden"
                style={{ borderColor: 'var(--border)' }}
              >
                <button
                  onClick={() => setVoidType('void')}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-all"
                  style={{
                    background:
                      voidType === 'void'
                        ? 'linear-gradient(135deg, rgb(239,68,68), rgb(185,28,28))'
                        : 'transparent',
                    color:
                      voidType === 'void' ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                  VOID
                </button>
                <button
                  onClick={() => setVoidType('comp')}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-all"
                  style={{
                    background:
                      voidType === 'comp'
                        ? 'linear-gradient(135deg, rgb(245,158,11), rgb(180,83,9))'
                        : 'transparent',
                    color:
                      voidType === 'comp' ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  <Gift className="w-4 h-4" />
                  COMP
                </button>
              </div>

              {/* Contextual explanation */}
              <p
                className="text-xs mt-2 px-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                {voidType === 'void'
                  ? 'Item will be removed completely and the order total will be reduced.'
                  : 'Item stays on the order (kitchen is already preparing it) but the price is zeroed out as complimentary.'}
              </p>
            </div>
          )}

          {/* ── Section 3: Reason ── */}
          {selectedItem && (
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                Reason <span style={{ color: 'rgb(239,68,68)' }}>*</span>
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {QUICK_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => handleQuickReason(r)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
                    style={{
                      background:
                        reason === r
                          ? 'rgba(245,158,11,0.15)'
                          : 'var(--bg-hover)',
                      borderColor:
                        reason === r ? 'rgb(245,158,11)' : 'var(--border)',
                      color:
                        reason === r ? 'rgb(245,158,11)' : 'var(--text-secondary)',
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Void reason (required)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl text-sm border outline-none transition-colors"
                style={{
                  background: 'var(--bg-input, var(--bg-hover))',
                  borderColor: reason.trim() ? 'var(--border)' : 'var(--border)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgb(245,158,11)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
              />
            </div>
          )}

          {/* ── Section 4: Manager PIN ── */}
          {selectedItem && (
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Lock className="w-3 h-3 inline-block mr-1 mb-0.5" />
                Manager PIN
              </p>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                placeholder="••••"
                value={pin}
                onChange={handlePinChange}
                className="w-full px-4 py-3 rounded-xl border outline-none transition-colors tracking-[0.5em] text-center"
                style={{
                  background: 'var(--bg-input, var(--bg-hover))',
                  borderColor: pinError ? 'rgb(239,68,68)' : 'var(--border)',
                  color: 'var(--text-primary)',
                  fontSize: '1.5rem',
                  letterSpacing: '0.5em',
                }}
                onFocus={(e) => {
                  if (!pinError) e.currentTarget.style.borderColor = 'rgb(99,102,241)';
                }}
                onBlur={(e) => {
                  if (!pinError) e.currentTarget.style.borderColor = 'var(--border)';
                }}
              />
              {pinError && (
                <div className="flex items-center gap-1.5 mt-1.5 px-1">
                  <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <p className="text-xs text-red-400">{pinError}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Section 5: KOT warning if applicable ── */}
          {selectedItem?.is_kot_sent && voidType === 'void' && (
            <div
              className="flex items-start gap-3 px-4 py-3 rounded-xl border"
              style={{
                background: 'rgba(239,68,68,0.08)',
                borderColor: 'rgba(239,68,68,0.25)',
              }}
            >
              <ChefHat className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
              <p className="text-xs text-red-400 font-medium">
                This item has already been sent to the kitchen. A void will mark it cancelled — please inform the kitchen staff manually if needed.
              </p>
            </div>
          )}

          {/* ── Confirm button ── */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              disabled={voidMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border transition-all"
              style={{
                background: 'transparent',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
                opacity: voidMutation.isPending ? 0.5 : 1,
              }}
            >
              <X className="w-4 h-4" />
              Cancel
            </button>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit || voidMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98] shadow-lg"
              style={{
                background:
                  !canSubmit || voidMutation.isPending
                    ? 'var(--bg-hover)'
                    : voidType === 'comp'
                    ? 'linear-gradient(135deg, rgb(245,158,11), rgb(180,83,9))'
                    : 'linear-gradient(135deg, rgb(239,68,68), rgb(185,28,28))',
                color:
                  !canSubmit || voidMutation.isPending
                    ? 'var(--text-secondary)'
                    : '#fff',
                boxShadow:
                  canSubmit && !voidMutation.isPending
                    ? voidType === 'comp'
                      ? '0 4px 20px rgba(245,158,11,0.25)'
                      : '0 4px 20px rgba(239,68,68,0.25)'
                    : 'none',
                cursor: !canSubmit || voidMutation.isPending ? 'not-allowed' : 'pointer',
              }}
            >
              {voidMutation.isPending ? (
                <>
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Processing…
                </>
              ) : voidType === 'comp' ? (
                <>
                  <Gift className="w-4 h-4" />
                  Comp Item
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Void Item
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
