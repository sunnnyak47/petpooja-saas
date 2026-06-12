/**
 * @fileoverview OrderFinancialModals — Five modal components for the Running Orders page.
 * Covers: Discount, Tip, Notes/Allergens, Reprint KOT, and Audit Log.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../lib/api';
import Modal from '../Modal';
import toast from 'react-hot-toast';
import { useCurrency } from '../../hooks/useCurrency';
import {
  Percent,
  DollarSign,
  CheckCircle,
  PauseCircle,
  CreditCard,
  Receipt,
  Plus,
  X,
  Printer,
  Clock,
  AlertCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-secondary)' }}>
      {children}
    </p>
  );
}

function ToggleButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-150"
      style={
        active
          ? { background: 'var(--accent)', color: '#fff' }
          : { background: 'var(--bg-hover)', color: 'var(--text-secondary)' }
      }
    >
      {children}
    </button>
  );
}

function InputBase({ ...props }) {
  return (
    <input
      {...props}
      className="w-full rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40 transition"
      style={{
        background: 'var(--bg-hover)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
      }}
    />
  );
}

function ActionButton({ onClick, disabled, loading, variant = 'primary', children }) {
  const base =
    'flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed';
  const styles =
    variant === 'primary'
      ? { background: 'var(--accent)', color: '#fff' }
      : variant === 'danger'
      ? { background: '#ef4444', color: '#fff' }
      : { background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)' };

  return (
    <button type="button" className={base} style={styles} onClick={onClick} disabled={disabled || loading}>
      {loading ? 'Saving…' : children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component 1 — DiscountModal
// ---------------------------------------------------------------------------

export function DiscountModal({ isOpen, onClose, order, outletId, onSuccess }) {
  const { format, symbol } = useCurrency();

  const [discountType, setDiscountType] = useState('percentage');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [coupon, setCoupon] = useState('');

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setDiscountType(order?.discount_type || 'percentage');
      setValue(order?.discount_value ? String(order.discount_value) : '');
      setReason(order?.discount_reason || '');
      setCoupon(order?.coupon_code || '');
    }
  }, [isOpen, order]);

  const subtotal = Number(order?.subtotal || order?.total_amount || 0);
  const grandTotal = Number(order?.grand_total || order?.total_amount || 0);
  const prevDiscount = Number(order?.discount_amount || 0);

  const numVal = Number(value) || 0;
  const newDiscountAmount =
    discountType === 'percentage' ? (subtotal * numVal) / 100 : numVal;
  const newTotal = Math.max(0, grandTotal - prevDiscount + newDiscountAmount);

  const { mutate, isLoading } = useMutation({
    mutationFn: (body) => api.post(`/orders/${order.id}/apply-discount`, body).then((r) => r.data),
    onSuccess: () => {
      toast.success('Discount applied!');
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to apply discount');
    },
  });

  const handleApply = () => {
    if (!value && value !== '0') return toast.error('Enter a discount value');
    mutate({
      discount_type: discountType,
      discount_value: numVal,
      discount_reason: reason || undefined,
      coupon_code: coupon || undefined,
    });
  };

  const handleRemove = () => {
    mutate({ discount_type: 'flat', discount_value: 0, discount_reason: 'Removed' });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Apply Discount" size="md">
      <div className="space-y-5">
        {/* Subtotal */}
        <div
          className="rounded-xl px-4 py-3 flex justify-between items-center"
          style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
        >
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Order Subtotal
          </span>
          <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
            {format(subtotal)}
          </span>
        </div>

        {/* Existing discount badge */}
        {prevDiscount > 0 && (
          <div className="text-xs rounded-lg px-3 py-2 bg-green-500/10 border border-green-500/20 text-green-400">
            Current discount: {order.discount_type === 'percentage' ? `${order.discount_value}% off` : `flat ${format(order.discount_value)}`} (−{format(prevDiscount)})
          </div>
        )}

        {/* Type toggle */}
        <div>
          <SectionLabel>Discount Type</SectionLabel>
          <div className="flex gap-2">
            <ToggleButton active={discountType === 'percentage'} onClick={() => setDiscountType('percentage')}>
              Percentage %
            </ToggleButton>
            <ToggleButton active={discountType === 'flat'} onClick={() => setDiscountType('flat')}>
              Flat Amount
            </ToggleButton>
          </div>
        </div>

        {/* Value input */}
        <div>
          <SectionLabel>Value</SectionLabel>
          <div className="relative">
            <InputBase
              type="number"
              min="0"
              max={discountType === 'percentage' ? 100 : undefined}
              step="0.01"
              placeholder={discountType === 'percentage' ? 'e.g. 10' : 'e.g. 50'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              style={{
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                paddingRight: '2.5rem',
              }}
            />
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold"
              style={{ color: 'var(--text-secondary)' }}
            >
              {discountType === 'percentage' ? '%' : symbol}
            </span>
          </div>
        </div>

        {/* Live preview */}
        {numVal > 0 && (
          <div
            className="rounded-xl px-4 py-3 space-y-1"
            style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
          >
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>Discount</span>
              <span className="text-red-400 font-semibold">−{format(newDiscountAmount)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              <span>New Total</span>
              <span>{format(newTotal)}</span>
            </div>
          </div>
        )}

        {/* Reason */}
        <div>
          <SectionLabel>Discount Reason (optional)</SectionLabel>
          <InputBase
            type="text"
            placeholder="e.g. Manager override, loyalty discount…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        {/* Coupon */}
        <div>
          <SectionLabel>Coupon Code (optional)</SectionLabel>
          <InputBase
            type="text"
            placeholder="e.g. DIWALI20"
            value={coupon}
            onChange={(e) => setCoupon(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          {prevDiscount > 0 && (
            <ActionButton variant="danger" onClick={handleRemove} loading={isLoading}>
              Remove Discount
            </ActionButton>
          )}
          <ActionButton onClick={handleApply} loading={isLoading} disabled={!value}>
            Apply Discount
          </ActionButton>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Component 2 — TipModal
// ---------------------------------------------------------------------------

const TIP_PRESETS = [5, 10, 15, 20];

export function TipModal({ isOpen, onClose, order, onSuccess }) {
  const { format, symbol } = useCurrency();

  const [selectedPreset, setSelectedPreset] = useState(null);
  const [customValue, setCustomValue] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedPreset(null);
      setCustomValue('');
      setIsCustom(false);
    }
  }, [isOpen]);

  const grandTotal = Number(order?.grand_total || order?.total_amount || 0);
  const tipAmount = isCustom
    ? Number(customValue) || 0
    : selectedPreset != null
    ? (grandTotal * selectedPreset) / 100
    : 0;

  const { mutate, isLoading } = useMutation({
    mutationFn: (body) => api.post(`/orders/${order.id}/tip`, body).then((r) => r.data),
    onSuccess: () => {
      toast.success('Tip added to bill!');
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      // The axios interceptor normalises failures to a thrown Error whose
      // `message` already carries the backend message — `err.response` is stripped,
      // so read `err.message` directly.
      toast.error(err?.message || 'Failed to add tip');
    },
  });

  const handleAdd = () => {
    if (!tipAmount || tipAmount <= 0) return toast.error('Enter a valid tip amount');
    mutate({ amount: tipAmount });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Tip" size="sm">
      <div className="space-y-5">
        {/* Order total */}
        <div
          className="rounded-xl px-4 py-3 flex justify-between items-center"
          style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
        >
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Order Total
          </span>
          <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
            {format(grandTotal)}
          </span>
        </div>

        {/* Preset buttons */}
        <div>
          <SectionLabel>Quick Select</SectionLabel>
          <div className="grid grid-cols-5 gap-2">
            {TIP_PRESETS.map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => { setSelectedPreset(pct); setIsCustom(false); setCustomValue(''); }}
                className="py-2 rounded-xl text-sm font-semibold transition-all"
                style={
                  !isCustom && selectedPreset === pct
                    ? { background: 'var(--accent)', color: '#fff' }
                    : { background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
                }
              >
                {pct}%
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setIsCustom(true); setSelectedPreset(null); }}
              className="py-2 rounded-xl text-sm font-semibold transition-all"
              style={
                isCustom
                  ? { background: 'var(--accent)', color: '#fff' }
                  : { background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
              }
            >
              Custom
            </button>
          </div>
        </div>

        {/* Custom input */}
        {isCustom && (
          <div>
            <SectionLabel>Custom Tip Amount</SectionLabel>
            <div className="relative">
              <InputBase
                type="number"
                min="0"
                step="0.01"
                placeholder="Enter amount"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                style={{ paddingLeft: '2.5rem', background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold"
                style={{ color: 'var(--text-secondary)' }}
              >
                {symbol}
              </span>
            </div>
          </div>
        )}

        {/* Tip preview */}
        {tipAmount > 0 && (
          <div
            className="rounded-xl px-4 py-3 flex justify-between items-center"
            style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
          >
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Tip
            </span>
            <span className="font-bold text-green-400">{format(tipAmount)}</span>
          </div>
        )}

        {/* Note */}
        <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
          Tip will be collected at payment
        </p>

        {/* Action */}
        <ActionButton onClick={handleAdd} loading={isLoading} disabled={tipAmount <= 0}>
          Add to Bill
        </ActionButton>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Component 3 — NotesModal
// ---------------------------------------------------------------------------

const ALLERGEN_TAGS = ['No Nuts', 'No Gluten', 'No Dairy', 'No Eggs', 'No Shellfish', 'Vegan', 'Halal', 'Spicy'];
const MAX_NOTES_LENGTH = 500;

export function NotesModal({ isOpen, onClose, order, onSuccess }) {
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) setNotes(order?.notes || '');
  }, [isOpen, order]);

  const appendAllergen = (tag) => {
    setNotes((prev) => {
      const separator = prev && !prev.endsWith(' ') && !prev.endsWith('\n') ? ' ' : '';
      const next = prev + separator + tag;
      return next.slice(0, MAX_NOTES_LENGTH);
    });
  };

  const { mutate, isLoading } = useMutation({
    mutationFn: (body) => api.patch(`/orders/${order.id}/notes`, body).then((r) => r.data),
    onSuccess: () => {
      toast.success('Notes saved!');
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      const status = err?.response?.status;
      if (status === 404 || status === 405) {
        toast.error('Could not save notes — check backend');
      } else {
        toast.error(err?.response?.data?.message || 'Failed to save notes');
      }
    },
  });

  const handleSave = () => mutate({ notes });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Order Notes & Allergens" size="md">
      <div className="space-y-4">
        {/* Allergen quick-add */}
        <div>
          <SectionLabel>Quick Allergen Tags</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {ALLERGEN_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => appendAllergen(tag)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.color = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                + {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Notes textarea */}
        <div>
          <SectionLabel>Notes</SectionLabel>
          <textarea
            rows={5}
            maxLength={MAX_NOTES_LENGTH}
            placeholder="Special instructions, allergies, preferences…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40 transition resize-none"
            style={{
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
          <div className="text-right text-xs mt-1" style={{ color: notes.length >= MAX_NOTES_LENGTH ? '#ef4444' : 'var(--text-secondary)' }}>
            {notes.length}/{MAX_NOTES_LENGTH}
          </div>
        </div>

        {/* Action */}
        <ActionButton onClick={handleSave} loading={isLoading}>
          Save Notes
        </ActionButton>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Component 4 — ReprintKOTModal
// ---------------------------------------------------------------------------

export function ReprintKOTModal({ isOpen, onClose, order, outletId, onSuccess }) {
  const { data: fullOrder, isLoading: fetching, error } = useQuery({
    queryKey: ['order-detail', order?.id],
    queryFn: () => api.get(`/orders/${order.id}`).then((r) => r.data),
    enabled: isOpen && !!order?.id,
    staleTime: 30_000,
  });

  const { mutate: fireKOT, isLoading: firingKOT } = useMutation({
    mutationFn: (body) => api.post(`/orders/${order.id}/kot`, body).then((r) => r.data),
    onSuccess: (_, vars) => {
      if (vars.reprint) {
        toast.success('KOT reprint sent!');
      } else {
        toast.success('New KOT fired!');
        onSuccess?.();
      }
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'KOT action failed');
    },
  });

  const kots = fullOrder?.kots || order?.kots || [];
  const orderItems = fullOrder?.order_items || order?.order_items || [];
  const hasPendingItems = orderItems.some((item) => !item?.is_kot_sent);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Reprint / New KOT" size="md">
      <div className="space-y-4">
        {fetching && (
          <div className="text-center py-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Loading KOTs…
          </div>
        )}

        {error && (
          <div className="text-center py-4 text-sm text-red-400">
            <AlertCircle className="w-5 h-5 mx-auto mb-1" />
            Failed to load order details
          </div>
        )}

        {!fetching && kots.length === 0 && (
          <div className="text-center py-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
            No KOTs sent for this order yet.
          </div>
        )}

        {kots.length > 0 && (
          <div className="space-y-2">
            <SectionLabel>Existing KOTs</SectionLabel>
            {kots.map((kot) => (
              <div
                key={kot.id}
                className="flex items-center justify-between rounded-xl px-4 py-3"
                style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    KOT #{kot.kot_number || kot.id?.toString().slice(-4)}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {kot.created_at
                      ? new Date(kot.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '—'}{' '}
                    &bull; {kot.kot_items?.length ?? kot.items_count ?? '?'} items
                  </p>
                </div>
                <button
                  type="button"
                  disabled={firingKOT}
                  onClick={() =>
                    fireKOT({ outlet_id: outletId, reprint: true, kot_id: kot.id })
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  <Printer className="w-3.5 h-3.5" />
                  Reprint
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Fire new KOT */}
        {hasPendingItems && (
          <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <ActionButton
              onClick={() => fireKOT({ outlet_id: outletId })}
              loading={firingKOT}
            >
              Fire New KOT
            </ActionButton>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Component 5 — AuditLogModal
// ---------------------------------------------------------------------------

const STATUS_ICONS = {
  created: Plus,
  confirmed: CheckCircle,
  held: PauseCircle,
  billed: Receipt,
  cancelled: X,
  paid: CreditCard,
};

const STATUS_COLORS = {
  created: 'text-blue-400',
  confirmed: 'text-green-400',
  held: 'text-slate-400',
  billed: 'text-purple-400',
  cancelled: 'text-red-400',
  paid: 'text-emerald-400',
};

function TimelineEntry({ entry, isLast }) {
  const StatusIcon = STATUS_ICONS[entry.new_status] || Clock;
  const colorClass = STATUS_COLORS[entry.new_status] || 'text-slate-400';

  return (
    <div className="flex gap-3 relative">
      {/* Timeline line */}
      {!isLast && (
        <div
          className="absolute left-4 top-8 bottom-0 w-px"
          style={{ background: 'var(--border)' }}
        />
      )}

      {/* Icon */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${colorClass}`}
        style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
      >
        <StatusIcon className="w-4 h-4" />
      </div>

      {/* Content */}
      <div className="pb-5 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-semibold ${colorClass}`}>
            {entry.new_status?.toUpperCase() ?? '—'}
          </span>
          {entry.old_status && (
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              from {entry.old_status}
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          {entry.created_at
            ? new Date(entry.created_at).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : '—'}
          {entry.changed_by_name ? ` · ${entry.changed_by_name}` : ''}
          {entry.user?.name ? ` · ${entry.user.name}` : ''}
        </p>
        {(entry.reason || entry.notes) && (
          <p className="text-xs mt-1 italic" style={{ color: 'var(--text-secondary)' }}>
            {entry.reason || entry.notes}
          </p>
        )}
      </div>
    </div>
  );
}

export function AuditLogModal({ isOpen, onClose, order }) {
  const { format } = useCurrency();
  const { data: fullOrder, isLoading, error } = useQuery({
    queryKey: ['order-audit', order?.id],
    queryFn: () => api.get(`/orders/${order.id}`).then((r) => r.data),
    enabled: isOpen && !!order?.id,
    staleTime: 60_000,
  });

  const statusHistory = fullOrder?.status_history || fullOrder?.statusHistory || [];
  const payments = fullOrder?.payments || [];

  const handleExport = () => {
    const lines = [
      `Order History — #${fullOrder?.order_number || order?.id}`,
      `Generated: ${new Date().toLocaleString()}`,
      '',
      ...(statusHistory.map(
        (e) =>
          `${e.created_at ? new Date(e.created_at).toLocaleString() : '—'} | ${e.old_status || '—'} → ${e.new_status || '—'} | ${e.changed_by_name || e.user?.name || 'System'}${e.reason ? ` | ${e.reason}` : ''}`
      )),
      '',
      'Payments:',
      ...(payments.map(
        (p) => `${p.method} — ${p.amount} — ${p.status}`
      )),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `order-${order?.id}-history.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Order History" size="lg">
      <div className="space-y-5">
        {/* Order metadata */}
        {(fullOrder || order) && (
          <div
            className="rounded-xl px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm"
            style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
          >
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Order # </span>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {fullOrder?.order_number || order?.order_number || order?.id}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Table </span>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {fullOrder?.table?.number ?? order?.table?.number ?? '—'}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Customer </span>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {fullOrder?.customer?.name ?? order?.customer?.name ?? 'Walk-in'}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Created </span>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {(fullOrder?.created_at || order?.created_at)
                  ? new Date(fullOrder?.created_at || order?.created_at).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
              </span>
            </div>
          </div>
        )}

        {/* Timeline */}
        {isLoading && (
          <div className="text-center py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Loading history…
          </div>
        )}

        {error && (
          <div className="text-center py-4 text-sm text-red-400">
            <AlertCircle className="w-5 h-5 mx-auto mb-1" />
            Failed to load order history
          </div>
        )}

        {!isLoading && statusHistory.length === 0 && !error && (
          <div className="text-center py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>
            No status history recorded for this order.
          </div>
        )}

        {statusHistory.length > 0 && (
          <div>
            <SectionLabel>Status Timeline</SectionLabel>
            <div className="mt-2">
              {statusHistory.map((entry, idx) => (
                <TimelineEntry
                  key={entry.id ?? idx}
                  entry={entry}
                  isLast={idx === statusHistory.length - 1}
                />
              ))}
            </div>
          </div>
        )}

        {/* Payments */}
        {payments.length > 0 && (
          <div>
            <SectionLabel>Payments</SectionLabel>
            <div className="space-y-2">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl px-4 py-2.5 text-sm"
                  style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
                >
                  <span className="font-medium capitalize" style={{ color: 'var(--text-primary)' }}>
                    {p.method?.replace('_', ' ') ?? '—'}
                  </span>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        p.status === 'completed' || p.status === 'success'
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-yellow-500/10 text-yellow-400'
                      }`}
                    >
                      {p.status}
                    </span>
                    <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                      {typeof p.amount === 'number' ? format(p.amount) : p.amount}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Export */}
        {!isLoading && (fullOrder || order) && (
          <button
            type="button"
            onClick={handleExport}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            <Printer className="w-4 h-4" />
            Export History
          </button>
        )}
      </div>
    </Modal>
  );
}
