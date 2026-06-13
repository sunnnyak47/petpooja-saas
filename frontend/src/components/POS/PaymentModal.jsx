/**
 * PaymentModal — Full Indian payment gateway modal
 * Supports: Cash · Card · UPI QR (GPay/PhonePe/Paytm) · Razorpay · Due · Part-payment
 */
import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Modal from '../Modal';
import {
  Banknote, CreditCard, Smartphone, Clock, SplitSquareHorizontal,
  CheckCircle2, Loader, Copy, RefreshCw, Shield, X, ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import api from '../../lib/api';
import { useCurrency } from '../../hooks/useCurrency';
import { useRegion } from '../../hooks/useRegion';

/* Load the Square Web Payments SDK once (sandbox or production build). */
function loadSquareWebSdk(environment) {
  return new Promise((resolve, reject) => {
    if (window.Square) return resolve(window.Square);
    const src = environment === 'production'
      ? 'https://web.squarecdn.com/v1/square.js'
      : 'https://sandbox.web.squarecdn.com/v1/square.js';
    let s = document.querySelector(`script[src="${src}"]`);
    if (s) {
      s.addEventListener('load', () => resolve(window.Square));
      s.addEventListener('error', () => reject(new Error('Square SDK failed to load')));
      if (window.Square) resolve(window.Square);
      return;
    }
    s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve(window.Square);
    s.onerror = () => reject(new Error('Square SDK failed to load'));
    document.body.appendChild(s);
  });
}

const METHODS_IN = [
  { id: 'cash',  label: 'Cash',       icon: Banknote,            color: '#16a34a' },
  { id: 'upi',   label: 'UPI / QR',   icon: Smartphone,          color: '#7c3aed' },
  { id: 'card',  label: 'Card',       icon: CreditCard,          color: '#0ea5e9' },
  { id: 'part',  label: 'Part Pay',   icon: SplitSquareHorizontal, color: '#d97706' },
  { id: 'due',   label: 'Due / Credit', icon: Clock,             color: '#dc2626' },
];
const METHODS_AU = [
  { id: 'cash',   label: 'Cash',       icon: Banknote,            color: '#16a34a' },
  { id: 'eftpos', label: 'EFTPOS',     icon: CreditCard,          color: '#7c3aed' },
  { id: 'card',   label: 'Card',       icon: CreditCard,          color: '#0ea5e9' },
  { id: 'part',   label: 'Part Pay',   icon: SplitSquareHorizontal, color: '#d97706' },
  { id: 'due',    label: 'Due / Credit', icon: Clock,             color: '#dc2626' },
];

/* Load Razorpay checkout JS once */
function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function PaymentModal({
  isOpen,
  onClose,
  amount,            // number — grand total
  orderId,
  orderNumber,
  customer,
  onSuccess,         // (method, paidAmount) => void
}) {
  const { format, symbol, locale } = useCurrency();
  const userRegion = useRegion();
  const isAU = userRegion === 'AU';
  const METHODS = isAU ? METHODS_AU : METHODS_IN;
  const [method, setMethod]           = useState('cash');
  const [partAmount, setPartAmount]   = useState('');
  const [partMethod, setPartMethod]   = useState('cash'); // tender type for a part payment
  const [upiVpa, setUpiVpa]           = useState('');
  const [merchantName, setMerchantName] = useState('Restaurant');
  const [razorpayKey, setRazorpayKey] = useState('');
  const [razorpayEnabled, setRazorpayEnabled] = useState(false);
  const [processing, setProcessing]   = useState(false);
  const [upiPaid, setUpiPaid]         = useState(false);
  const [copied, setCopied]           = useState(false);

  // ── Square Web Payments (online card, AU) ──
  const outletId = useSelector(s => s.auth?.user?.outlet_id);
  const [squareCfg, setSquareCfg]     = useState(null); // { connected, application_id, location_id, environment }
  const [sqLoading, setSqLoading]     = useState(false);
  const [sqError, setSqError]         = useState('');
  const sqCardRef = useRef(null);
  const squareReady = isAU && !!squareCfg?.connected && !!squareCfg?.application_id && !!squareCfg?.location_id;

  // Load settings from localStorage (set in SettingsPage)
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('msrm_settings') || '{}');
      if (s.upi_vpa)          setUpiVpa(s.upi_vpa);
      if (s.merchant_name)    setMerchantName(s.merchant_name);
      if (s.razorpay_key)     setRazorpayKey(s.razorpay_key);
      if (s.razorpay_enabled) setRazorpayEnabled(!!s.razorpay_enabled);
    } catch {}
  }, [isOpen]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setMethod('cash');
      setPartAmount('');
      setPartMethod('cash');
      setProcessing(false);
      setUpiPaid(false);
      setCopied(false);
    }
  }, [isOpen]);

  // Fetch Square connection status when the modal opens (AU only).
  useEffect(() => {
    if (!isOpen || !isAU) return;
    let cancelled = false;
    api.get('/integrations/au/square/status', { params: { outlet_id: outletId } })
      .then(res => res.data)
      .then(cfg => { if (!cancelled) setSquareCfg(cfg); })
      .catch(() => { if (!cancelled) setSquareCfg(null); });
    return () => { cancelled = true; };
  }, [isOpen, isAU, outletId]);

  // Mount/teardown the Square secure card field when the Card method is active.
  useEffect(() => {
    let destroyed = false;
    async function setup() {
      if (!isOpen || method !== 'card' || !squareReady) return;
      setSqError('');
      setSqLoading(true);
      try {
        await loadSquareWebSdk(squareCfg.environment);
        if (destroyed || !window.Square) return;
        const payments = window.Square.payments(squareCfg.application_id, squareCfg.location_id);
        const card = await payments.card();
        if (destroyed) { try { await card.destroy(); } catch {} return; }
        await card.attach('#square-card-container');
        sqCardRef.current = card;
      } catch (e) {
        if (!destroyed) setSqError(e?.message || 'Could not load the secure card field');
      } finally {
        if (!destroyed) setSqLoading(false);
      }
    }
    setup();
    return () => {
      destroyed = true;
      if (sqCardRef.current) { try { sqCardRef.current.destroy(); } catch {} sqCardRef.current = null; }
    };
  }, [isOpen, method, squareReady, squareCfg]);

  // Tokenize the card via Square and charge it through our backend.
  const handleSquareCard = async () => {
    if (!sqCardRef.current) return toast.error('Card field is not ready yet');
    setProcessing(true);
    try {
      const result = await sqCardRef.current.tokenize();
      if (result.status !== 'OK') {
        throw new Error(result.errors?.[0]?.message || 'Card could not be verified');
      }
      const res = await api.post('/integrations/au/square/process-payment', {
        outlet_id: outletId,
        amount: effectiveAmount,
        source_id: result.token,
        order_id: orderId,
      }).then(r => r.data);
      toast.success('Card payment approved ✓');
      await onSuccess('card', effectiveAmount, res?.payment_id);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || 'Square payment failed');
    } finally {
      setProcessing(false);
    }
  };

  const effectiveAmount = method === 'part' && partAmount ? Number(partAmount) : amount;

  /* ── UPI deep link ── */
  const upiUri = upiVpa
    ? `upi://pay?pa=${encodeURIComponent(upiVpa)}&pn=${encodeURIComponent(merchantName)}&am=${effectiveAmount}&cu=INR&tn=${encodeURIComponent('Order ' + (orderNumber || orderId || ''))}`
    : '';

  const copyUpi = () => {
    navigator.clipboard.writeText(upiVpa).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  /* ── Razorpay handler (secure: server-created order + server-side signature verify) ── */
  const handleRazorpay = async () => {
    setProcessing(true);

    // 1) Load the Razorpay checkout SDK.
    const loaded = await loadRazorpay();
    if (!loaded) { setProcessing(false); return toast.error('Razorpay failed to load. Check internet.'); }

    // 2) Create the order SERVER-SIDE. The server returns the publishable key,
    //    the Razorpay order id, the amount (paise) and currency. Never trust a
    //    client-only amount checkout — the order id ties the payment to the server.
    let order;
    try {
      order = await api.post('/integrations/razorpay/create-order', {
        amount: effectiveAmount,
        order_id: orderId,
        customer_name: customer?.full_name,
        customer_phone: customer?.phone,
      }).then(r => r.data);
    } catch (e) {
      toast.error(e?.message || 'Could not start Razorpay payment');
      setProcessing(false);
      return;
    }

    if (!order || (!order.id && !order.key)) {
      toast.error('Could not start Razorpay payment');
      setProcessing(false);
      return;
    }

    // Mock mode = backend has no real keys → test key, no real signature to verify.
    const isMock = !!order.mock || order.key === 'rzp_test_mock' || String(order.id || '').startsWith('order_mock_');

    // 3) Build options from the SERVER response (key + order_id are authoritative).
    const options = {
      key: order.key || razorpayKey,
      amount: order.amount || Math.round(effectiveAmount * 100),
      currency: order.currency || 'INR',
      order_id: order.id,
      name: merchantName,
      description: `Order #${orderNumber || orderId}`,
      prefill: {
        name:  customer?.full_name  || '',
        email: customer?.email      || '',
        contact: customer?.phone    || '',
      },
      theme: { color: '#2563eb' },
      // 4) On checkout success, VERIFY the signature server-side BEFORE completing.
      handler: async (response) => {
        try {
          const res = await api.post('/integrations/razorpay/verify', {
            razorpay_order_id:   response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature:  response.razorpay_signature,
          });
          // Accept server-verified signature, or mock mode (no real signature exists).
          if (res?.data?.verified || isMock) {
            toast.success(`Payment captured: ${response.razorpay_payment_id}`);
            await onSuccess('card', effectiveAmount, response.razorpay_payment_id);
            onClose();
          } else {
            toast.error('Payment verification failed');
            setProcessing(false);
          }
        } catch (e) {
          // Verify failed (bad signature → 400, or network) → do NOT complete the order.
          toast.error(e?.message || 'Payment verification failed');
          setProcessing(false);
        }
      },
      modal: {
        ondismiss: () => setProcessing(false),
      },
    };

    // 5) Open checkout; handle gateway-side failures.
    try {
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (r) => {
        toast.error('Razorpay payment failed: ' + (r?.error?.description || 'unknown error'));
        setProcessing(false);
      });
      rzp.open();
    } catch (e) {
      toast.error('Could not open Razorpay');
      setProcessing(false);
    }
  };

  /* ── Confirm payment ── */
  const handleConfirm = async () => {
    if (method === 'due' && !customer) return toast.error('Attach a customer to record due payment');
    if (method === 'part' && (!partAmount || Number(partAmount) <= 0)) return toast.error('Enter partial amount');
    if (method === 'card' && razorpayEnabled && !isAU) return handleRazorpay();
    // AU + Square connected → charge the real card via the Web Payments SDK.
    if (method === 'card' && squareReady) return handleSquareCard();

    setProcessing(true);
    try {
      // For a part payment, surface the chosen tender type so the caller can
      // record it as a real partial tender (multi-tender) rather than a placeholder.
      await onSuccess(method, effectiveAmount, undefined, method === 'part' ? { partMethod } : undefined);
      onClose();
    } catch {
      // error handled by caller
    } finally {
      setProcessing(false);
    }
  };

  const remaining = method === 'part' && partAmount ? amount - Number(partAmount) : 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settle Payment" size="md">
      <div className="space-y-5">

        {/* Amount display */}
        <div className="text-center rounded-2xl p-5 border" style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)' }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-secondary)' }}>Amount Due</p>
          <p className="text-5xl font-black font-mono tracking-tight" style={{ color: 'var(--accent)' }}>
            {format(amount)}
          </p>
          {orderNumber && <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Order #{orderNumber}</p>}
        </div>

        {/* Method selector */}
        <div className="grid grid-cols-5 gap-2">
          {METHODS.map(({ id, label, icon: Icon, color }) => (
            <button
              key={id}
              onClick={() => setMethod(id)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all text-xs font-bold"
              style={{
                borderColor: method === id ? color : 'var(--border)',
                background:  method === id ? color + '18' : 'transparent',
                color:       method === id ? color : 'var(--text-secondary)',
              }}
            >
              <Icon className="w-5 h-5" />
              {label}
            </button>
          ))}
        </div>

        {/* ── UPI QR Panel (India only) ── */}
        {method === 'upi' && !isAU && (
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: '#7c3aed18', borderBottom: '1px solid var(--border)' }}>
              <span className="text-xs font-bold" style={{ color: '#7c3aed' }}>UPI Payment QR — GPay · PhonePe · Paytm</span>
              {upiPaid && <span className="flex items-center gap-1 text-xs font-bold text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /> Marked Paid</span>}
            </div>

            {upiVpa ? (
              <div className="p-5 flex gap-6 items-center">
                {/* QR */}
                <div className="p-3 rounded-xl bg-white border flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                  <QRCodeSVG
                    value={upiUri}
                    size={148}
                    level="M"
                    includeMargin={false}
                    imageSettings={{
                      src: '',
                      height: 0, width: 0, excavate: false,
                    }}
                  />
                </div>
                {/* Info */}
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>UPI ID</p>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-bold px-2 py-1 rounded-lg flex-1" style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>{upiVpa}</code>
                      <button onClick={copyUpi} className="p-1.5 rounded-lg transition-colors" style={{ background: 'var(--bg-hover)' }}>
                        {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />}
                      </button>
                    </div>
                  </div>
                  <div className="rounded-xl p-3 border" style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)' }}>
                    <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--text-secondary)' }}>Amount to pay</p>
                    <p className="text-2xl font-black" style={{ color: '#7c3aed' }}>{format(amount)}</p>
                  </div>
                  <div className="flex gap-2">
                    {['GPay', 'PhonePe', 'Paytm', 'BHIM'].map(app => (
                      <span key={app} className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{app}</span>
                    ))}
                  </div>
                  {!upiPaid && (
                    <button
                      onClick={() => setUpiPaid(true)}
                      className="w-full py-2 rounded-xl text-xs font-bold border-2 transition-all"
                      style={{ borderColor: '#16a34a', color: '#16a34a', background: '#16a34a10' }}
                    >
                      ✓ Customer Paid — Confirm
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-6 text-center">
                <Smartphone className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--text-secondary)', opacity: 0.4 }} />
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>UPI ID not configured</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Go to Settings → Payment → Add your UPI VPA</p>
              </div>
            )}
          </div>
        )}

        {/* ── EFTPOS Panel (Australia only) ── */}
        {method === 'eftpos' && isAU && (
          <div className="rounded-2xl border p-4 space-y-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}>
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" style={{ color: '#7c3aed' }} />
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>EFTPOS Payment</span>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Process payment via EFTPOS terminal. Tap, insert, or swipe the customer's card.
            </p>
          </div>
        )}

        {/* ── Card / Razorpay Panel ── */}
        {method === 'card' && (
          <div className="rounded-2xl border p-4 space-y-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}>
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" style={{ color: '#0ea5e9' }} />
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Card Payment</span>
              {squareReady && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#0ea5e918', color: '#0ea5e9' }}>
                  Square {squareCfg.environment === 'production' ? 'Live' : 'Sandbox'}
                </span>
              )}
            </div>

            {squareReady ? (
              /* AU + Square connected → real in-browser card field (PCI-safe) */
              sqError ? (
                <p className="text-xs" style={{ color: 'var(--danger)' }}>{sqError}</p>
              ) : (
                <>
                  <div id="square-card-container" className="rounded-xl border p-3 bg-white min-h-[52px]" style={{ borderColor: 'var(--border)' }} />
                  {sqLoading && (
                    <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                      <Loader className="w-3 h-3 animate-spin" /> Loading secure card field…
                    </p>
                  )}
                  <p className="text-[11px] flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                    <Shield className="w-3 h-3" /> Encrypted by Square — card details never touch our servers.
                  </p>
                </>
              )
            ) : !isAU && razorpayEnabled && razorpayKey ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border" style={{ background: 'color-mix(in srgb, #0ea5e9 8%, transparent)', borderColor: 'color-mix(in srgb, #0ea5e9 25%, transparent)' }}>
                <Shield className="w-4 h-4 flex-shrink-0" style={{ color: '#0ea5e9' }} />
                <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Razorpay Checkout will open — supports Card, UPI, NetBanking & Wallets</p>
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Manual card swipe.
                {!isAU && <> Enable Razorpay in <strong>Settings → Payment</strong> for digital checkout.</>}
                {isAU && <> Connect <strong>Square</strong> in Integrations to charge cards here.</>}
              </p>
            )}
          </div>
        )}

        {/* ── Part Payment Panel (multi-tender) ── */}
        {method === 'part' && (
          <div className="rounded-2xl border p-4 space-y-3" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Tender Type</p>
            <div className="flex flex-wrap gap-1.5">
              {(isAU
                ? [['cash', 'Cash'], ['eftpos', 'EFTPOS'], ['card', 'Card']]
                : [['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card']]
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setPartMethod(id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all"
                  style={{
                    borderColor: partMethod === id ? '#d97706' : 'var(--border)',
                    background: partMethod === id ? '#d9770618' : 'transparent',
                    color: partMethod === id ? '#d97706' : 'var(--text-secondary)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs font-bold pt-1" style={{ color: 'var(--text-secondary)' }}>Amount Collected Now</p>
            <input
              type="number"
              className="input text-2xl font-bold text-center py-3"
              placeholder={`Max ${symbol}${amount}`}
              value={partAmount}
              onChange={(e) => setPartAmount(e.target.value)}
              max={amount}
              autoFocus
            />
            {partAmount && Number(partAmount) > 0 && Number(partAmount) < amount && (
              <div className="flex justify-between text-sm px-1">
                <span style={{ color: 'var(--text-secondary)' }}>Collected</span>
                <span className="font-bold text-emerald-600">{format(partAmount)}</span>
              </div>
            )}
            {remaining > 0 && (
              <div className="flex justify-between text-sm px-1">
                <span style={{ color: 'var(--text-secondary)' }}>Remaining Due</span>
                <span className="font-bold" style={{ color: 'var(--danger)' }}>{format(remaining)}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Due Panel ── */}
        {method === 'due' && (
          <div className="rounded-2xl border p-4 space-y-2" style={{ background: 'rgba(220,38,38,0.05)', borderColor: 'rgba(220,38,38,0.2)' }}>
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--danger)' }} />
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--danger)' }}>Credit / Due Payment</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {customer ? `Linked to ${customer.full_name}` : '⚠️ Attach a customer before recording due'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Cash — change calculator ── */}
        {method === 'cash' && (
          <CashChangeCalculator amount={amount} />
        )}

        {/* Confirm button */}
        <button
          onClick={handleConfirm}
          disabled={
            processing ||
            (method === 'upi' && !!upiVpa && !upiPaid) ||
            (method === 'part' && (!partAmount || Number(partAmount) <= 0)) ||
            (method === 'due' && !customer) ||
            (method === 'card' && squareReady && (sqLoading || !!sqError))
          }
          className="w-full py-4 rounded-xl text-base font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ background: method === 'due' ? 'var(--danger)' : method === 'upi' ? '#7c3aed' : method === 'eftpos' ? '#7c3aed' : method === 'card' ? '#0ea5e9' : 'var(--success)' }}
        >
          {processing
            ? <><Loader className="w-5 h-5 animate-spin" /> Processing...</>
            : method === 'card' && squareReady
            ? <>Pay {format(effectiveAmount)} <ChevronRight className="w-4 h-4" /></>
            : method === 'card' && razorpayEnabled && razorpayKey && !isAU
            ? <>Open Razorpay Checkout <ChevronRight className="w-4 h-4" /></>
            : method === 'upi' && upiVpa && !upiPaid
            ? 'Waiting for UPI Confirmation…'
            : `Confirm ${method === 'part' ? format(partAmount || 0) : format(amount)} ${method.toUpperCase()}`
          }
        </button>

      </div>
    </Modal>
  );
}

/* ── Cash change calculator ── */
function CashChangeCalculator({ amount }) {
  const [tendered, setTendered] = useState('');
  const { format, symbol, locale, isAU } = useCurrency();
  // Quick-tender note denominations per region. AU real notes: 5/10/20/50/100.
  // IN: 10/20/50/100/200/500/2000.
  const QUICK = isAU ? [5, 10, 20, 50, 100] : [10, 20, 50, 100, 200, 500, 2000];
  const change = tendered && Number(tendered) >= amount ? Number(tendered) - amount : null;

  return (
    <div className="rounded-2xl border p-4 space-y-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}>
      <p className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Cash Tendered (optional)</p>
      <input
        type="number"
        className="input text-xl font-bold text-center py-3"
        placeholder="Enter amount received"
        value={tendered}
        onChange={(e) => setTendered(e.target.value)}
      />
      {/* Quick amounts */}
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map(v => (
          <button
            key={v}
            onClick={() => setTendered(String(v >= amount ? v : Math.ceil(amount / v) * v))}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            {symbol}{v}
          </button>
        ))}
        <button
          onClick={() => setTendered(String(Math.ceil(amount / 10) * 10))}
          className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all"
          style={{ background: 'color-mix(in srgb, var(--success) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--success) 25%, transparent)', color: 'var(--success)' }}
        >
          Exact
        </button>
      </div>
      {change !== null && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border" style={{ background: 'color-mix(in srgb, var(--success) 8%, transparent)', borderColor: 'color-mix(in srgb, var(--success) 20%, transparent)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Return Change</span>
          <span className="text-2xl font-black" style={{ color: 'var(--success)' }}>{format(change)}</span>
        </div>
      )}
      {tendered && Number(tendered) < amount && (
        <p className="text-xs text-center" style={{ color: 'var(--danger)' }}>
          Short by {format(amount - Number(tendered))}
        </p>
      )}
    </div>
  );
}
