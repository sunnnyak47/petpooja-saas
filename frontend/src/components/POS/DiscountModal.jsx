/**
 * DiscountModal — Manager-authorized discount system for POS
 * Supports: Percentage, Flat Amount, BOGO, Coupon Code
 * Handles both pre-order (Redux via onApplyDiscount) and post-order (API via orderId) flows
 */
import { useState, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../../lib/api';
import hybridAPI, { isNetworkError } from '../../api/offlineAPI';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import Modal from '../Modal';
import toast from 'react-hot-toast';
import { useCurrency } from '../../hooks/useCurrency';
import { Percent, Tag, Gift, Ticket, Lock, X, Check, Minus } from 'lucide-react';

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electron;

/* ─── Constants ─────────────────────────────────────────────────────────── */

const TABS = [
  { id: 'percent', label: '% Off',   icon: Percent },
  { id: 'flat',    label: 'Flat Off', icon: Tag     },
  { id: 'bogo',    label: 'BOGO',    icon: Gift    },
  { id: 'coupon',  label: 'Coupon',  icon: Ticket  },
];

const PERCENT_PRESETS = [5, 10, 15, 20, 25, 50];
const FLAT_PRESETS_IN = [50, 100, 200, 500];
const FLAT_PRESETS_AU = [5, 10, 20, 50];

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function calcDiscountAmount(tab, value, subtotal) {
  if (tab === 'percent') return Math.min((subtotal * Number(value)) / 100, subtotal);
  if (tab === 'flat')    return Math.min(Number(value), subtotal);
  return 0; // bogo / coupon handled separately
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function PreviewBox({ subtotal, discountAmount, format }) {
  const newTotal = Math.max(subtotal - discountAmount, 0);
  return (
    <div
      className="rounded-xl p-4 mt-4 text-sm font-mono"
      style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
    >
      <div className="flex justify-between mb-1" style={{ color: 'var(--text-secondary)' }}>
        <span>Subtotal</span>
        <span>{format(subtotal)}</span>
      </div>
      <div className="flex justify-between mb-2" style={{ color: 'var(--danger)' }}>
        <span>Discount</span>
        <span>−{format(discountAmount)}</span>
      </div>
      <div
        className="flex justify-between pt-2 font-bold text-base"
        style={{
          borderTop: '1px solid var(--border)',
          color: 'var(--text-primary)',
        }}
      >
        <span>New Total</span>
        <span>{format(newTotal)}</span>
      </div>
    </div>
  );
}

function PinInput({ pin, onChange, disabled }) {
  return (
    <div className="mt-4">
      <label
        className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
        style={{ color: 'var(--text-secondary)' }}
      >
        <Lock className="inline w-3 h-3 mr-1 mb-0.5" />
        Manager PIN
      </label>
      <input
        type="password"
        maxLength={6}
        value={pin}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        disabled={disabled}
        placeholder="Enter 4–6 digit PIN"
        className="w-full px-4 py-2.5 rounded-xl text-sm font-mono tracking-widest outline-none transition-all"
        style={{
          background: 'var(--bg-input, var(--bg-hover))',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
        }}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      />
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */

export default function DiscountModal({
  isOpen,
  onClose,
  orderId,
  outletId,
  cartSubtotal,
  cartItems,
  currentDiscount,
  onApplyDiscount,
  onSuccess,
}) {
  const { format, symbol, isAU } = useCurrency();
  const isOnline = useOnlineStatus();
  const flatPresets = isAU ? FLAT_PRESETS_AU : FLAT_PRESETS_IN;

  /* ── local state ── */
  const [activeTab, setActiveTab]       = useState('percent');
  const [value, setValue]               = useState('');
  const [reason, setReason]             = useState('');
  const [pin, setPin]                   = useState('');
  const [pinVerified, setPinVerified]   = useState(false);
  const [couponCode, setCouponCode]     = useState('');
  const [couponResult, setCouponResult] = useState(null); // validated coupon data
  const [couponError, setCouponError]   = useState('');

  /* ── reset on open/tab change ── */
  const reset = useCallback(() => {
    setValue('');
    setReason('');
    setPin('');
    setPinVerified(false);
    setCouponCode('');
    setCouponResult(null);
    setCouponError('');
  }, []);

  useEffect(() => {
    if (!isOpen) reset();
  }, [isOpen, reset]);

  useEffect(() => {
    reset();
  }, [activeTab, reset]);

  /* ── derived values ── */
  const numValue = Number(value) || 0;

  // Percentage/Flat discount amount for preview
  const previewDiscountAmount = (() => {
    if (activeTab === 'percent') return calcDiscountAmount('percent', numValue, cartSubtotal);
    if (activeTab === 'flat')    return calcDiscountAmount('flat', numValue, cartSubtotal);
    if (activeTab === 'bogo')    return bogoDiscountAmount();
    if (activeTab === 'coupon' && couponResult) return couponResult.discountAmount ?? 0;
    return 0;
  })();

  function bogoDiscountAmount() {
    if (cartItems && cartItems.length > 0) {
      const cheapest = cartItems.reduce((min, item) => {
        const price = Number(item.price || item.selling_price || 0);
        return price < min ? price : min;
      }, Infinity);
      return cheapest === Infinity ? 0 : cheapest;
    }
    // Fallback: cannot compute without cartItems
    return 0;
  }

  const bogoItem = (() => {
    if (!cartItems || cartItems.length === 0) return null;
    return cartItems.reduce((min, item) => {
      const price = Number(item.price || item.selling_price || 0);
      const minPrice = Number(min?.price || min?.selling_price || Infinity);
      return price < minPrice ? item : min;
    }, null);
  })();

  /* ── mutations ── */

  // Verify Manager PIN
  const verifyPinMutation = useMutation({
    mutationFn: (pinVal) =>
      api.post('/staff/verify-pin', { pin: pinVal, outlet_id: outletId }).then(r => r.data),
    onSuccess: () => {
      setPinVerified(true);
      toast.success('PIN verified');
    },
    onError: () => {
      toast.error('Invalid PIN. Please try again.');
      setPin('');
    },
  });

  // Validate Coupon
  const validateCouponMutation = useMutation({
    mutationFn: (code) =>
      api.get('/discounts/validate', { params: { code, outlet_id: outletId } }).then(r => r.data),
    onSuccess: (data) => {
      setCouponResult(data);
      setCouponError('');
      toast.success('Coupon validated!');
    },
    onError: (err) => {
      if (err?.response?.status === 404) {
        // Treat as manual override
        setCouponResult({
          manual: true,
          discountAmount: 0,
          reason: `Coupon: ${couponCode}`,
        });
        setCouponError('');
        toast('Coupon not found — will apply as manual override.', { icon: 'ℹ️' });
      } else {
        setCouponError(err?.response?.data?.message || 'Validation failed');
        setCouponResult(null);
      }
    },
  });

  // Offline write of the discount's final state to local SQLite (synced=0). Shared
  // by the pure-offline branch and the online→offline network-error fallback.
  const applyDiscountOffline = (payload) =>
    hybridAPI.applyDiscount(orderId, {
      type: payload.discount_type,
      value: payload.discount_value,
      reason: payload.discount_reason,
    });

  // Apply discount to existing order
  const applyToOrderMutation = useMutation({
    mutationFn: async (payload) => {
      if (IS_ELECTRON && !isOnline) return applyDiscountOffline(payload);
      try {
        return (await api.post(`/orders/${orderId}/apply-discount`, payload)).data;
      } catch (err) {
        // Backend briefly unreachable → apply the discount locally so a blip never
        // blocks it. Real HTTP errors re-throw; browser (non-Electron) is untouched.
        if (IS_ELECTRON && isNetworkError(err)) return applyDiscountOffline(payload);
        throw err;
      }
    },
    onSuccess: () => {
      toast.success('Discount applied!');
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to apply discount');
    },
  });

  // Remove discount from existing order
  const removeFromOrderMutation = useMutation({
    mutationFn: async () => {
      const payload = { discount_type: 'flat', discount_value: 0, discount_reason: 'Discount removed' };
      if (IS_ELECTRON && !isOnline) return applyDiscountOffline(payload);
      try {
        return (await api.post(`/orders/${orderId}/apply-discount`, payload)).data;
      } catch (err) {
        if (IS_ELECTRON && isNetworkError(err)) return applyDiscountOffline(payload);
        throw err;
      }
    },
    onSuccess: () => {
      toast.success('Discount removed');
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to remove discount');
    },
  });

  /* ── event handlers ── */

  function handleVerifyPin() {
    if (pin.length < 4) {
      toast.error('PIN must be at least 4 digits');
      return;
    }
    verifyPinMutation.mutate(pin);
  }

  function handleValidateCoupon() {
    if (!couponCode.trim()) {
      toast.error('Enter a coupon code');
      return;
    }
    validateCouponMutation.mutate(couponCode.trim().toUpperCase());
  }

  function buildPayload() {
    if (activeTab === 'percent') {
      return {
        discount_type: 'percentage',
        discount_value: numValue,
        discount_reason: reason,
      };
    }
    if (activeTab === 'flat') {
      return {
        discount_type: 'flat',
        discount_value: numValue,
        discount_reason: reason,
      };
    }
    if (activeTab === 'bogo') {
      return {
        discount_type: 'flat',
        discount_value: bogoDiscountAmount(),
        discount_reason: 'BOGO — Cheapest item free',
      };
    }
    if (activeTab === 'coupon' && couponResult) {
      if (couponResult.manual) {
        return {
          discount_type: 'flat',
          discount_value: 0,
          discount_reason: couponResult.reason,
          coupon_code: couponCode,
        };
      }
      return {
        discount_type: couponResult.discount_type || 'flat',
        discount_value: couponResult.discount_value ?? couponResult.discountAmount ?? 0,
        discount_reason: couponResult.reason || `Coupon: ${couponCode}`,
        coupon_code: couponCode,
      };
    }
    return null;
  }

  function handleApply() {
    const payload = buildPayload();
    if (!payload) {
      toast.error('Nothing to apply');
      return;
    }

    if (orderId) {
      applyToOrderMutation.mutate(payload);
    } else {
      onApplyDiscount?.({
        type: payload.discount_type,
        value: payload.discount_value,
        reason: payload.discount_reason,
        coupon_code: payload.coupon_code,
      });
      toast.success('Discount staged for order');
      onClose();
    }
  }

  function handleRemove() {
    if (orderId) {
      removeFromOrderMutation.mutate();
    } else {
      onApplyDiscount?.(null);
      toast.success('Discount removed');
      onClose();
    }
  }

  /* ── validation: is Apply enabled? ── */
  const canApply = (() => {
    if (activeTab === 'percent') {
      if (!numValue || numValue <= 0 || numValue > 100) return false;
      if (!reason.trim()) return false;
      if (!pinVerified) return false;
      return true;
    }
    if (activeTab === 'flat') {
      if (!numValue || numValue <= 0) return false;
      if (!reason.trim()) return false;
      if (!pinVerified) return false;
      return true;
    }
    if (activeTab === 'bogo') {
      return bogoDiscountAmount() > 0;
    }
    if (activeTab === 'coupon') {
      return !!couponResult;
    }
    return false;
  })();

  const isBusy =
    applyToOrderMutation.isPending ||
    removeFromOrderMutation.isPending ||
    verifyPinMutation.isPending;

  /* ── render ── */

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Apply Discount" size="md">
      {/* ── Tab Row ── */}
      <div
        className="flex rounded-xl p-1 mb-5 gap-1"
        style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? '#fff' : 'var(--text-secondary)',
                boxShadow: active ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
              }}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Percentage Tab ── */}
      {activeTab === 'percent' && (
        <div>
          {/* Big number input */}
          <div className="relative mb-3">
            <input
              type="number"
              min={0}
              max={100}
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="0"
              className="w-full text-4xl font-bold text-center py-4 px-12 rounded-xl outline-none transition-all"
              style={{
                background: 'var(--bg-input, var(--bg-hover))',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
            <span
              className="absolute right-4 top-1/2 -translate-y-1/2 text-2xl font-bold"
              style={{ color: 'var(--text-secondary)' }}
            >
              %
            </span>
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-2 mb-4">
            {PERCENT_PRESETS.map(p => (
              <button
                key={p}
                onClick={() => setValue(String(p))}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: value === String(p) ? 'var(--accent)' : 'var(--bg-hover)',
                  color: value === String(p) ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                {p}%
              </button>
            ))}
          </div>

          {/* Reason */}
          <ReasonInput reason={reason} onChange={setReason} />

          {/* Preview */}
          {numValue > 0 && (
            <PreviewBox
              subtotal={cartSubtotal}
              discountAmount={previewDiscountAmount}
              format={format}
            />
          )}

          {/* PIN — only shown if not yet verified */}
          {!pinVerified ? (
            <>
              <PinInput pin={pin} onChange={setPin} disabled={verifyPinMutation.isPending} />
              <button
                onClick={handleVerifyPin}
                disabled={pin.length < 4 || verifyPinMutation.isPending}
                className="w-full mt-2 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
                style={{
                  background: pin.length >= 4 ? 'var(--accent)' : 'var(--bg-hover)',
                  color: pin.length >= 4 ? '#fff' : 'var(--text-secondary)',
                  opacity: verifyPinMutation.isPending ? 0.7 : 1,
                }}
              >
                <Lock className="w-4 h-4" />
                {verifyPinMutation.isPending ? 'Verifying…' : 'Verify PIN'}
              </button>
            </>
          ) : (
            <div
              className="flex items-center gap-2 mt-4 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)', color: 'var(--success, #16a34a)' }}
            >
              <Check className="w-4 h-4" />
              Manager PIN verified
            </div>
          )}
        </div>
      )}

      {/* ── Flat Tab ── */}
      {activeTab === 'flat' && (
        <div>
          <div className="relative mb-3">
            <span
              className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold"
              style={{ color: 'var(--text-secondary)' }}
            >
              {symbol}
            </span>
            <input
              type="number"
              min={0}
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="0"
              className="w-full text-4xl font-bold text-center py-4 px-12 rounded-xl outline-none transition-all"
              style={{
                background: 'var(--bg-input, var(--bg-hover))',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-2 mb-4">
            {flatPresets.map(p => (
              <button
                key={p}
                onClick={() => setValue(String(p))}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: value === String(p) ? 'var(--accent)' : 'var(--bg-hover)',
                  color: value === String(p) ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                {symbol}{p}
              </button>
            ))}
          </div>

          {/* Reason */}
          <ReasonInput reason={reason} onChange={setReason} />

          {/* Preview */}
          {numValue > 0 && (
            <PreviewBox
              subtotal={cartSubtotal}
              discountAmount={previewDiscountAmount}
              format={format}
            />
          )}

          {/* PIN */}
          {!pinVerified ? (
            <>
              <PinInput pin={pin} onChange={setPin} disabled={verifyPinMutation.isPending} />
              <button
                onClick={handleVerifyPin}
                disabled={pin.length < 4 || verifyPinMutation.isPending}
                className="w-full mt-2 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
                style={{
                  background: pin.length >= 4 ? 'var(--accent)' : 'var(--bg-hover)',
                  color: pin.length >= 4 ? '#fff' : 'var(--text-secondary)',
                  opacity: verifyPinMutation.isPending ? 0.7 : 1,
                }}
              >
                <Lock className="w-4 h-4" />
                {verifyPinMutation.isPending ? 'Verifying…' : 'Verify PIN'}
              </button>
            </>
          ) : (
            <div
              className="flex items-center gap-2 mt-4 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)', color: 'var(--success, #16a34a)' }}
            >
              <Check className="w-4 h-4" />
              Manager PIN verified
            </div>
          )}
        </div>
      )}

      {/* ── BOGO Tab ── */}
      {activeTab === 'bogo' && (
        <div>
          <div
            className="rounded-xl p-5 mb-4 text-center"
            style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
          >
            <Gift
              className="w-10 h-10 mx-auto mb-3"
              style={{ color: 'var(--accent)' }}
            />
            <p className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              Buy One Get One Free
            </p>
            {bogoItem ? (
              <>
                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Cheapest item will be free:
                </p>
                <div
                  className="inline-flex items-center gap-3 px-4 py-2 rounded-lg"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {bogoItem.name || bogoItem.item_name || 'Item'}
                  </span>
                  <span
                    className="font-bold"
                    style={{ color: 'var(--danger)' }}
                  >
                    −{format(bogoDiscountAmount())}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {cartSubtotal > 0
                  ? 'The cheapest item in your cart will be made free.'
                  : 'Add items to your cart first.'}
              </p>
            )}
          </div>

          {bogoDiscountAmount() > 0 && (
            <PreviewBox
              subtotal={cartSubtotal}
              discountAmount={bogoDiscountAmount()}
              format={format}
            />
          )}

          <p
            className="text-xs mt-3 text-center"
            style={{ color: 'var(--text-secondary)' }}
          >
            No manager PIN required for BOGO
          </p>
        </div>
      )}

      {/* ── Coupon Tab ── */}
      {activeTab === 'coupon' && (
        <div>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={couponCode}
              onChange={e => {
                setCouponCode(e.target.value.toUpperCase());
                setCouponResult(null);
                setCouponError('');
              }}
              placeholder="Enter coupon code"
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-mono uppercase outline-none transition-all"
              style={{
                background: 'var(--bg-input, var(--bg-hover))',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                letterSpacing: '0.1em',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              onKeyDown={e => e.key === 'Enter' && handleValidateCoupon()}
            />
            <button
              onClick={handleValidateCoupon}
              disabled={!couponCode.trim() || validateCouponMutation.isPending}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: couponCode.trim() ? 'var(--accent)' : 'var(--bg-hover)',
                color: couponCode.trim() ? '#fff' : 'var(--text-secondary)',
                opacity: validateCouponMutation.isPending ? 0.7 : 1,
              }}
            >
              {validateCouponMutation.isPending ? 'Checking…' : 'Validate'}
            </button>
          </div>

          {couponError && (
            <p className="text-xs mb-3" style={{ color: 'var(--danger)' }}>
              {couponError}
            </p>
          )}

          {couponResult && !couponResult.manual && (
            <div
              className="rounded-xl p-4 mb-3 flex items-center gap-3"
              style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)', border: '1px solid var(--success, #16a34a)' }}
            >
              <Check className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--success, #16a34a)' }} />
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--success, #16a34a)' }}>
                  {couponCode} — Valid!
                </p>
                <p className="text-xs" style={{ color: 'var(--success, #16a34a)' }}>
                  {couponResult.reason || `Saves ${format(couponResult.discountAmount ?? 0)}`}
                </p>
              </div>
            </div>
          )}

          {couponResult?.manual && (
            <div
              className="rounded-xl p-4 mb-3 flex items-center gap-3"
              style={{ background: 'color-mix(in srgb, var(--warning) 15%, transparent)', border: '1px solid var(--warning, #ca8a04)' }}
            >
              <Ticket className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--warning, #ca8a04)' }} />
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--warning, #ca8a04)' }}>
                  Manual override
                </p>
                <p className="text-xs" style={{ color: 'var(--warning, #ca8a04)' }}>
                  Code not found in system — will be recorded as "{couponResult.reason}"
                </p>
              </div>
            </div>
          )}

          {couponResult && couponResult.discountAmount > 0 && (
            <PreviewBox
              subtotal={cartSubtotal}
              discountAmount={couponResult.discountAmount}
              format={format}
            />
          )}

          <p
            className="text-xs mt-3 text-center"
            style={{ color: 'var(--text-secondary)' }}
          >
            No manager PIN required for coupon discounts
          </p>
        </div>
      )}

      {/* ── Action Buttons ── */}
      <div className="flex gap-3 mt-6">
        {currentDiscount && (
          <button
            onClick={handleRemove}
            disabled={isBusy}
            className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: 'color-mix(in srgb, var(--danger) 15%, transparent)',
              color: 'var(--danger)',
              border: '1px solid var(--danger)',
              opacity: isBusy ? 0.6 : 1,
            }}
          >
            <Minus className="w-4 h-4" />
            Remove
          </button>
        )}

        <button
          onClick={handleApply}
          disabled={!canApply || isBusy}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all"
          style={{
            background: canApply ? 'var(--accent)' : 'var(--bg-hover)',
            color: canApply ? '#fff' : 'var(--text-secondary)',
            opacity: isBusy ? 0.7 : 1,
            cursor: canApply && !isBusy ? 'pointer' : 'not-allowed',
          }}
        >
          <Check className="w-4 h-4" />
          {applyToOrderMutation.isPending ? 'Applying…' : 'Apply Discount'}
        </button>
      </div>

      {/* ── Current Discount Badge ── */}
      {currentDiscount && (
        <div
          className="mt-4 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2"
          style={{
            background: 'color-mix(in srgb, var(--warning) 15%, transparent)',
            border: '1px solid var(--warning, #ca8a04)',
            color: 'var(--warning, #ca8a04)',
          }}
        >
          <Tag className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            Current:{' '}
            <strong>
              {currentDiscount.type === 'percentage'
                ? `${currentDiscount.value}% off`
                : `${format(currentDiscount.value)} off`}
            </strong>
            {currentDiscount.reason ? ` — ${currentDiscount.reason}` : ''}
          </span>
        </div>
      )}
    </Modal>
  );
}

/* ─── Shared Reason Input ────────────────────────────────────────────────── */

function ReasonInput({ reason, onChange }) {
  return (
    <div>
      <label
        className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
        style={{ color: 'var(--text-secondary)' }}
      >
        Reason <span style={{ color: 'var(--danger)' }}>*</span>
      </label>
      <input
        type="text"
        value={reason}
        onChange={e => onChange(e.target.value)}
        placeholder="e.g. Customer loyalty, Manager override…"
        className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
        style={{
          background: 'var(--bg-input, var(--bg-hover))',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
        }}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      />
    </div>
  );
}
