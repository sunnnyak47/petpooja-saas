/**
 * RefundModal — Process full or partial refunds on paid POS orders.
 * Supports: Full Refund · Partial Refund · Original Method · Cash Override · Loyalty Credit
 * · Refund to card via Tyro EFTPOS terminal (AU, when the original payment ran
 *   through a paired Tyro terminal — detected via the order's approved
 *   TerminalTransaction). The terminal refund runs FIRST (money moves at the
 *   terminal), then the backend refund is recorded with the terminal txn linked.
 */
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../../lib/api';
import Modal from '../Modal';
import toast from 'react-hot-toast';
import { useCurrency } from '../../hooks/useCurrency';
import TyroIClient from './TyroIClient';
import { RotateCcw, CreditCard, Banknote, Star, AlertTriangle, Check } from 'lucide-react';

const REFUND_REASONS = [
  { value: 'customer_request', label: 'Customer request' },
  { value: 'wrong_item',       label: 'Wrong item' },
  { value: 'quality_issue',    label: 'Quality issue' },
  { value: 'overcharge',       label: 'Overcharge' },
  { value: 'technical_error',  label: 'Technical error' },
  { value: 'other',            label: 'Other' },
];

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function methodLabel(method) {
  const map = {
    cash: 'Cash', card: 'Card', upi: 'UPI', eftpos: 'EFTPOS',
    due: 'Account Credit', part: 'Part Payment',
  };
  return map[method?.toLowerCase()] ?? method ?? 'Original Method';
}

function methodIcon(method) {
  switch (method?.toLowerCase()) {
    case 'cash': return Banknote;
    case 'card':
    case 'eftpos': return CreditCard;
    default: return CreditCard;
  }
}

/* ─── Step indicators ─────────────────────────────────────────────────────── */

function StepDot({ step, current, label }) {
  const done    = current > step;
  const active  = current === step;
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200"
        style={{
          background: done ? 'var(--accent)' : active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--bg-hover)',
          color:      done || active ? 'var(--accent-text)' : 'var(--text-secondary)',
          border:     active ? '2px solid var(--accent)' : '2px solid transparent',
        }}
      >
        {done ? <Check size={14} /> : step}
      </div>
      <span className="text-[10px] font-medium" style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)' }}>
        {label}
      </span>
    </div>
  );
}

function StepConnector({ active }) {
  return (
    <div
      className="flex-1 h-0.5 mb-5 rounded-full transition-all duration-300"
      style={{ background: active ? 'var(--accent)' : 'var(--border)' }}
    />
  );
}

/* ─── Main Component ──────────────────────────────────────────────────────── */

export default function RefundModal({ isOpen, onClose, order, onSuccess }) {
  const { format } = useCurrency();
  const outletId = useSelector((s) => s.auth?.user?.outlet_id);

  /* wizard state */
  const [step, setStep] = useState(1);

  /* step-1 */
  const [refundType,   setRefundType]   = useState('full');      // 'full' | 'partial'
  const [customAmount, setCustomAmount] = useState('');

  /* step-2 */
  const [refundMethod, setRefundMethod] = useState('original');  // 'original' | 'tyro_terminal' | 'cash' | 'loyalty'

  /* step-3 */
  const [reason, setReason]   = useState('');
  const [notes,  setNotes]    = useState('');
  const [managerPin, setManagerPin] = useState('');

  /* Tyro terminal refund overlay */
  const [showTyroTerminal, setShowTyroTerminal] = useState(false);
  const [pinChecking, setPinChecking] = useState(false);

  /* derived */
  const maxAmount    = order?.grand_total ?? 0;
  const refundAmount = refundType === 'full'
    ? maxAmount
    : Math.min(parseFloat(customAmount || '0'), maxAmount);

  const primaryPayment = order?.payments?.[0];
  const originalMethodLabel = primaryPayment
    ? methodLabel(primaryPayment.method)
    : 'Original Method';

  /* Was this order paid through the Tyro terminal? An approved 'purchase'
     TerminalTransaction on the order is the authoritative signal — it only
     exists when the outlet was Tyro-paired and the card ran at the terminal.
     Fails silently (no option shown) when Tyro isn't set up. */
  const { data: tyroTxns } = useQuery({
    queryKey: ['tyro-order-txns', order?.id],
    queryFn: () => api.get('/integrations/tyro/transactions', {
      params: { outlet_id: outletId, order_id: order.id },
    }).then((r) => r.data?.data || r.data),
    enabled: isOpen && !!order?.id && !!outletId,
    retry: false,
  });
  const tyroPurchase = Array.isArray(tyroTxns)
    ? tyroTxns.find((t) => t.type === 'purchase' && t.status === 'approved')
    : null;

  /* ── mutation ─────────────────────────────────────────────────────────── */

  const { mutate: processRefund, isPending } = useMutation({
    // `terminalTransactionId` is set only for the Tyro path — the approved
    // 'refund' TerminalTransaction the terminal just completed, which the
    // backend links to the refund Payment row it creates.
    mutationFn: ({ terminalTransactionId } = {}) => {
      const combinedReason = notes.trim()
        ? `${reason} — ${notes.trim()}`
        : reason;
      return api.post(`/orders/${order.id}/refund`, {
        refund_amount: refundAmount,
        manager_pin:   managerPin,
        reason:        combinedReason,
        terminal_transaction_id: terminalTransactionId || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Refund processed successfully');
      onSuccess?.();
      handleClose();
    },
    onError: (err) => {
      const status = err?.response?.status;
      if (status === 400) {
        toast.error(err?.response?.data?.message ?? 'Refund amount exceeds original payment amount');
      } else if (status === 403) {
        toast.error('Invalid manager PIN');
      } else if (status === 409) {
        toast.error('This order has already been refunded');
      } else {
        toast.error(err?.response?.data?.message ?? 'Refund failed — please try again');
      }
    },
  });

  /* ── helpers ──────────────────────────────────────────────────────────── */

  function handleClose() {
    setStep(1);
    setRefundType('full');
    setCustomAmount('');
    setRefundMethod('original');
    setReason('');
    setNotes('');
    setManagerPin('');
    setShowTyroTerminal(false);
    onClose();
  }

  function canAdvanceStep1() {
    if (refundType === 'full') return true;
    const v = parseFloat(customAmount);
    return !isNaN(v) && v > 0 && v <= maxAmount;
  }

  function canAdvanceStep2() {
    return !!refundMethod;
  }

  function canSubmit() {
    return !!reason && refundAmount > 0 && /^\d{4,6}$/.test(managerPin);
  }

  /* Submit: Tyro path verifies the manager PIN FIRST (so the terminal never
     refunds money the backend then refuses to record over a bad PIN), then
     runs the terminal refund; the backend refund is recorded on approval. */
  async function handleSubmit() {
    if (refundMethod !== 'tyro_terminal') return processRefund({});
    setPinChecking(true);
    try {
      await api.post('/staff/verify-pin', { outlet_id: outletId, pin: managerPin });
      setShowTyroTerminal(true);
    } catch (err) {
      toast.error(err?.response?.data?.message ?? 'Invalid manager PIN');
    } finally {
      setPinChecking(false);
    }
  }

  /* ── render ───────────────────────────────────────────────────────────── */

  if (!order) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Process Refund" size="lg">
      <div className="px-6 pb-6 flex flex-col gap-5">

        {/* Step Progress */}
        <div className="flex items-center gap-2 pt-2">
          <StepDot step={1} current={step} label="Amount" />
          <StepConnector active={step >= 2} />
          <StepDot step={2} current={step} label="Method" />
          <StepConnector active={step >= 3} />
          <StepDot step={3} current={step} label="Reason" />
        </div>

        {/* Order Summary Banner */}
        <div
          className="rounded-xl px-4 py-3 flex items-center justify-between"
          style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
        >
          <div>
            <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Order #{order.order_number}
            </p>
            <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text-primary)' }}>
              {order.order_items?.length ?? 0} item{order.order_items?.length !== 1 ? 's' : ''} ·{' '}
              Paid {format(maxAmount)}
            </p>
          </div>
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)', color: 'var(--success)' }}
          >
            <Check size={12} />
            Paid
          </div>
        </div>

        {/* ── STEP 1: Refund Type ────────────────────────────────────────── */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              How much would you like to refund?
            </p>

            {/* Full Refund */}
            <button
              onClick={() => setRefundType('full')}
              className="w-full rounded-xl px-4 py-4 text-left transition-all duration-150 flex items-center justify-between"
              style={{
                background:   refundType === 'full' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--bg-hover)',
                border:       `2px solid ${refundType === 'full' ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}
                >
                  <RotateCcw size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Full Refund
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Refund the entire order total
                  </p>
                </div>
              </div>
              <span className="text-base font-bold" style={{ color: 'var(--accent)' }}>
                {format(maxAmount)}
              </span>
            </button>

            {/* Partial Refund */}
            <button
              onClick={() => setRefundType('partial')}
              className="w-full rounded-xl px-4 py-4 text-left transition-all duration-150"
              style={{
                background: refundType === 'partial' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--bg-hover)',
                border:     `2px solid ${refundType === 'partial' ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ background: 'color-mix(in srgb, var(--warning) 15%, transparent)', color: 'var(--warning)' }}
                >
                  <CreditCard size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Partial Refund
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Enter a custom refund amount
                  </p>
                </div>
              </div>

              {refundType === 'partial' && (
                <div
                  className="rounded-lg px-3 py-2 flex items-center gap-2"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Amount
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={maxAmount}
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    placeholder={`0.00 — max ${format(maxAmount)}`}
                    autoFocus
                    className="flex-1 bg-transparent text-sm font-semibold outline-none"
                    style={{ color: 'var(--text-primary)' }}
                  />
                </div>
              )}
            </button>

            {/* Items reference */}
            {order.order_items?.length > 0 && (
              <div
                className="rounded-xl px-4 py-3"
                style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
              >
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Order Items
                </p>
                <div className="flex flex-col gap-1.5">
                  {order.order_items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {item.name} × {item.quantity}
                      </span>
                      <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                        {format(item.item_total)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Original payment breakdown */}
            {order.payments?.length > 0 && (
              <div
                className="rounded-xl px-4 py-3"
                style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
              >
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Original Payments
                </p>
                <div className="flex flex-col gap-1.5">
                  {order.payments.map((p, i) => {
                    const Icon = methodIcon(p.method);
                    return (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Icon size={12} style={{ color: 'var(--text-secondary)' }} />
                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {methodLabel(p.method)}
                          </span>
                        </div>
                        <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                          {format(p.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              onClick={() => setStep(2)}
              disabled={!canAdvanceStep1()}
              className="w-full py-3 rounded-xl text-sm font-bold transition-opacity"
              style={{
                background: 'var(--accent)',
                color:      'var(--accent-text)',
                opacity:    canAdvanceStep1() ? 1 : 0.4,
                cursor:     canAdvanceStep1() ? 'pointer' : 'not-allowed',
              }}
            >
              Continue →
            </button>
          </div>
        )}

        {/* ── STEP 2: Refund Method ──────────────────────────────────────── */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Where should the refund go?
            </p>

            {/* Refunding amount pill */}
            <div
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', border: '1px solid var(--accent)' }}
            >
              <span className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
                Refunding
              </span>
              <span className="text-lg font-bold" style={{ color: 'var(--accent)' }}>
                {format(refundAmount)}
              </span>
            </div>

            {/* Option: original method */}
            {primaryPayment && (
              <MethodOption
                id="original"
                selected={refundMethod === 'original'}
                onSelect={() => setRefundMethod('original')}
                Icon={methodIcon(primaryPayment.method)}
                label={`Refund to ${originalMethodLabel}`}
                description={`Return funds to the original ${originalMethodLabel.toLowerCase()} payment`}
                iconColor="var(--accent)"
                iconBg="color-mix(in srgb, var(--accent) 15%, transparent)"
              />
            )}

            {/* Option: Tyro EFTPOS terminal — only when the original payment ran
                through the terminal (approved purchase TerminalTransaction). */}
            {tyroPurchase && (
              <MethodOption
                id="tyro_terminal"
                selected={refundMethod === 'tyro_terminal'}
                onSelect={() => setRefundMethod('tyro_terminal')}
                Icon={CreditCard}
                label="Refund to card via terminal"
                description="Push the refund back to the customer's card on the Tyro EFTPOS terminal"
                iconColor="#7c3aed"
                iconBg="color-mix(in srgb, #7c3aed 15%, transparent)"
              />
            )}

            {/* Option: cash */}
            <MethodOption
              id="cash"
              selected={refundMethod === 'cash'}
              onSelect={() => setRefundMethod('cash')}
              Icon={Banknote}
              label="Cash Refund"
              description="Issue cash from the register"
              iconColor="var(--success)"
              iconBg="color-mix(in srgb, var(--success) 15%, transparent)"
            />

            {/* Option: loyalty */}
            <MethodOption
              id="loyalty"
              selected={refundMethod === 'loyalty'}
              onSelect={() => setRefundMethod('loyalty')}
              Icon={Star}
              label="Credit to Loyalty"
              description="Add credit to customer's loyalty account"
              iconColor="var(--warning)"
              iconBg="color-mix(in srgb, var(--warning) 15%, transparent)"
            />

            <div className="flex gap-3 mt-1">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'transparent' }}
              >
                ← Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!canAdvanceStep2()}
                className="flex-[2] py-3 rounded-xl text-sm font-bold transition-opacity"
                style={{
                  background: 'var(--accent)',
                  color:      'var(--accent-text)',
                  opacity:    canAdvanceStep2() ? 1 : 0.4,
                  cursor:     canAdvanceStep2() ? 'pointer' : 'not-allowed',
                }}
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Reason ────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Why is this refund being issued?
            </p>

            {/* Summary pill */}
            <div
              className="rounded-xl px-4 py-3 flex flex-col gap-2"
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Refund Amount</span>
                <span className="text-base font-bold" style={{ color: 'var(--accent)' }}>
                  {format(refundAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Method</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {refundMethod === 'original'
                    ? `${originalMethodLabel} (original)`
                    : refundMethod === 'tyro_terminal'
                    ? 'Card via Tyro terminal'
                    : refundMethod === 'cash'
                    ? 'Cash'
                    : 'Loyalty Credit'}
                </span>
              </div>
            </div>

            {/* Reason dropdown */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Reason <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="rounded-xl px-4 py-3 text-sm outline-none appearance-none"
                style={{
                  background:   'var(--bg-hover)',
                  border:       `1px solid ${reason ? 'var(--accent)' : 'var(--border)'}`,
                  color:        reason ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                <option value="" disabled>Select a reason…</option>
                {REFUND_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* Manager PIN — the backend authorises every refund against a
                manager PIN scoped to this outlet. */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Manager PIN <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={managerPin}
                onChange={(e) => setManagerPin(e.target.value.replace(/\D/g, ''))}
                placeholder="4–6 digit manager PIN"
                className="rounded-xl px-4 py-3 text-sm outline-none text-center tracking-[0.5em]"
                style={{
                  background: 'var(--bg-hover)',
                  border:     `1px solid ${/^\d{4,6}$/.test(managerPin) ? 'var(--accent)' : 'var(--border)'}`,
                  color:      'var(--text-primary)',
                }}
              />
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Additional Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Optional — describe the issue in more detail"
                className="rounded-xl px-4 py-3 text-sm outline-none resize-none"
                style={{
                  background:   'var(--bg-hover)',
                  border:       '1px solid var(--border)',
                  color:        'var(--text-primary)',
                }}
              />
            </div>

            {/* Warning if partial */}
            {refundType === 'partial' && (
              <div
                className="flex items-start gap-2 rounded-xl px-4 py-3"
                style={{ background: 'color-mix(in srgb, var(--warning) 15%, transparent)', border: '1px solid var(--warning)' }}
              >
                <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--warning)' }} />
                <p className="text-xs" style={{ color: 'var(--warning)' }}>
                  Partial refunds cannot be reversed. Confirm the amount before proceeding.
                </p>
              </div>
            )}

            <div className="flex gap-3 mt-1">
              <button
                onClick={() => setStep(2)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'transparent' }}
                disabled={isPending}
              >
                ← Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit() || isPending || pinChecking}
                className="flex-[2] py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-opacity"
                style={{
                  background: 'var(--danger)',
                  color:      '#fff',
                  opacity:    canSubmit() && !isPending && !pinChecking ? 1 : 0.5,
                  cursor:     canSubmit() && !isPending && !pinChecking ? 'pointer' : 'not-allowed',
                }}
              >
                <RotateCcw size={15} className={isPending || pinChecking ? 'animate-spin' : ''} />
                {isPending || pinChecking
                  ? 'Processing…'
                  : refundMethod === 'tyro_terminal'
                  ? `Refund ${format(refundAmount)} to card`
                  : `Refund ${format(refundAmount)}`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tyro EFTPOS refund overlay — money moves at the terminal FIRST; only an
          approved terminal refund reaches the backend refund endpoint (with the
          TerminalTransaction linked). Mock mode simulates the approval. */}
      {showTyroTerminal && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <TyroIClient
            outletId={outletId}
            orderId={order.id}
            amountCents={Math.round(refundAmount * 100)}
            mode="refund"
            onSuccess={({ transaction_id }) => {
              setShowTyroTerminal(false);
              processRefund({ terminalTransactionId: transaction_id });
            }}
            onCancel={() => setShowTyroTerminal(false)}
            onError={() => { /* TyroIClient shows its own error UI; operator closes it, wizard stays put */ }}
          />
        </div>
      )}
    </Modal>
  );
}

/* ─── Method Option Card ─────────────────────────────────────────────────── */

function MethodOption({ id, selected, onSelect, Icon, label, description, iconColor, iconBg }) {
  return (
    <button
      onClick={onSelect}
      className="w-full rounded-xl px-4 py-4 text-left transition-all duration-150 flex items-center gap-3"
      style={{
        background: selected ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--bg-hover)',
        border:     `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
      }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: iconBg, color: iconColor }}
      >
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
          {label}
        </p>
        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
          {description}
        </p>
      </div>
      {selected && (
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
        >
          <Check size={11} />
        </div>
      )}
    </button>
  );
}
