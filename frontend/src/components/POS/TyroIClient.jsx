/**
 * TyroIClient — Headful iClient card-present integration.
 *
 * Flow this component owns:
 *   1. Parent renders <TyroIClient amountCents={} orderId={} onSuccess onCancel onError />
 *      (add mode="refund" to push money BACK to the card instead of charging it).
 *   2. Component POSTs /api/integrations/tyro/transactions to reserve a
 *      TerminalTransaction row (idempotent — same our_ref never re-creates).
 *      That call returns the iClient script URL + init params.
 *   3. Loads the Tyro-hosted iClient script fresh from Tyro's CDN
 *      (bundling would violate PCI — Tyro requires live CDN load).
 *   4. new TYRO.IClientWithUI(apiKey, {posProductVendor/Name/Version}) — the
 *      "Headful" variant renders Tyro's own iframe/modal for the transaction UI,
 *      which is what Tyro recommends and what shortens the certification path.
 *   5. iclient.initiatePurchase({amount, transactionId=our_ref, mid, tid}, {...cb})
 *      — or iclient.initiateRefund(same shape, same callbacks) in refund mode.
 *   6. On transactionCompleteCallback → PATCH /transactions/:id with the full
 *      raw response so the backend audit row is authoritative.
 *   7. Component calls onSuccess({tyro_reference, tip_cents, ...}) or onError.
 *
 * Terminal questions (signature checks etc.): questionCallback renders the
 * question text + its option buttons IN this component and only calls
 * answerCallback with what the operator actually tapped. We never auto-answer;
 * if nobody answers, the terminal times the question out itself.
 *
 * Mock mode: when backend cfg has mock_mode=true, we don't load iClient at all;
 * instead we call POST /transactions/:id/mock-complete to simulate an
 * APPROVAL locally. Lets devs work through the whole POS flow (purchase AND
 * refund) without real Tyro credentials.
 */

import { useEffect, useRef, useState } from 'react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { Loader2, CreditCard, XCircle, CheckCircle2 } from 'lucide-react';

// Load a script tag once. Returns a promise that resolves when the script loads.
// Multiple parallel callers with the same URL share the same load.
const scriptPromises = new Map();
function loadTyroScript(url) {
  if (scriptPromises.has(url)) return scriptPromises.get(url);
  const p = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-tyro-iclient="${url}"]`);
    if (existing) return resolve();
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.dataset.tyroIclient = url;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load iClient script: ${url}`));
    document.head.appendChild(s);
  });
  scriptPromises.set(url, p);
  return p;
}

// UUID-ish idempotency key that survives POS reloads for the current attempt.
function newOurRef() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `ref-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {object} props
 * @param {string} props.outletId
 * @param {string} props.orderId
 * @param {number} props.amountCents        — the grand total (or refund amount), in cents
 * @param {'purchase'|'refund'} [props.mode] — 'refund' pushes money back to the card
 * @param {(result) => void} props.onSuccess — called with { tyro_reference, tip_cents, surcharge_cents, transaction_id, receipt }
 * @param {() => void} props.onCancel        — user pressed cancel
 * @param {(err) => void} props.onError      — decline / system error
 */
export default function TyroIClient({ outletId, orderId, amountCents, mode = 'purchase', onSuccess, onCancel, onError }) {
  const [phase, setPhase] = useState('idle'); // idle | starting | prompting | running | done | failed
  const [statusMsg, setStatusMsg] = useState('');
  const [txn, setTxn] = useState(null);
  const [iclientCfg, setIclientCfg] = useState(null);
  // Terminal question awaiting an operator answer: { text, options, answer }.
  const [question, setQuestion] = useState(null);
  const iclientRef = useRef(null);
  const ourRefRef = useRef(newOurRef());
  const isRefund = mode === 'refund';

  // ── Step 1: Reserve backend row + get iClient params ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setPhase('starting');
        const res = await api.post('/integrations/tyro/transactions', {
          outlet_id: outletId,
          order_id: orderId,
          our_ref: ourRefRef.current,
          type: mode,
          amount_cents: amountCents,
        }).then(r => r.data?.data || r.data);
        if (cancelled) return;
        setTxn(res.transaction);
        setIclientCfg(res.iclient);
        setPhase('prompting');
      } catch (err) {
        if (cancelled) return;
        const msg = err?.response?.data?.message || err.message || 'Failed to start transaction';
        setPhase('failed');
        setStatusMsg(msg);
        toast.error(msg);
        onError?.(new Error(msg));
      }
    })();
    return () => { cancelled = true; };
  }, [outletId, orderId, amountCents, mode, onError]);

  // ── Step 2: On "Tap card at terminal" click, load iClient and initiatePurchase ──
  async function beginTransaction() {
    if (!txn || !iclientCfg) return;
    setPhase('running');

    // Mock mode: don't load iClient at all — simulate an approval on the backend.
    if (iclientCfg.mock_mode) {
      try {
        setStatusMsg(isRefund ? 'MOCK — simulating terminal refund approval…' : 'MOCK — simulating terminal approval…');
        const res = await api.post(`/integrations/tyro/transactions/${txn.id}/mock-complete`, {
          decline: false,
        }).then(r => r.data?.data || r.data);
        setPhase('done');
        onSuccess?.({
          tyro_reference: res.tyro_reference,
          tip_cents: res.tip_cents || 0,
          surcharge_cents: res.surcharge_cents || 0,
          transaction_id: res.id,
          receipt: { customer: res.customer_receipt, merchant: res.merchant_receipt },
          status: res.status,
        });
      } catch (err) {
        setPhase('failed');
        const msg = err?.response?.data?.message || err.message || 'Mock transaction failed';
        setStatusMsg(msg);
        onError?.(new Error(msg));
      }
      return;
    }

    // Real Tyro path.
    try {
      await loadTyroScript(iclientCfg.script_url);
      const TYRO = window.TYRO;
      if (!TYRO || !TYRO.IClientWithUI) {
        throw new Error('iClient loaded but TYRO.IClientWithUI is not on window — script blocked or wrong URL');
      }
      const iclient = new TYRO.IClientWithUI(iclientCfg.api_key || '', {
        posProductVendor: iclientCfg.pos_product_vendor || 'PetPooja',
        posProductName:   iclientCfg.pos_product_name   || 'PetPooja POS',
        posProductVersion: iclientCfg.pos_product_version || '1.0.0',
      });
      iclientRef.current = iclient;

      const callbacks = {
        statusMessageCallback: (message) => {
          setStatusMsg(String(message || ''));
        },
        questionCallback: (q, answerCallback) => {
          // Tyro asks the OPERATOR questions mid-transaction — most importantly
          // "Signature OK?" on signature card payments. Compliance requires a
          // real human decision, so render the question + its option buttons in
          // this modal and only answer with what the operator taps. If nobody
          // answers, we do nothing and the TERMINAL times the question out —
          // never fabricate an answer.
          const text = String(q?.text || q || '');
          const options = (Array.isArray(q?.options) && q.options.length > 0)
            ? q.options.map(String)
            : ['YES', 'NO'];
          setQuestion({
            text,
            options,
            answer: (choice) => {
              setQuestion(null);
              try { answerCallback?.(choice); } catch { /* terminal already moved on */ }
            },
          });
        },
        receiptCallback: (receipt) => {
          // eslint-disable-next-line no-console
          console.log('[iClient] receipt:', receipt);
        },
        transactionCompleteCallback: async (response) => {
          setQuestion(null); // txn is over — any unanswered question is moot
          try {
            const res = await api.patch(`/integrations/tyro/transactions/${txn.id}`, {
              outlet_id: outletId,
              raw: response,
            }).then(r => r.data?.data || r.data);

            if (res.status === 'approved') {
              setPhase('done');
              onSuccess?.({
                tyro_reference: res.tyro_reference,
                tip_cents: res.tip_cents || 0,
                surcharge_cents: res.surcharge_cents || 0,
                transaction_id: res.id,
                receipt: { customer: res.customer_receipt, merchant: res.merchant_receipt },
                status: res.status,
              });
            } else {
              setPhase('failed');
              setStatusMsg(res.error_message || `Terminal returned ${res.status}`);
              onError?.(Object.assign(new Error(res.error_message || res.status), { status: res.status, txn: res }));
            }
          } catch (err) {
            setPhase('failed');
            const msg = err?.response?.data?.message || err.message || 'Failed to record transaction';
            setStatusMsg(msg);
            onError?.(new Error(msg));
          }
        },
      };

      if (isRefund) {
        // iClient v1 canonical refund shape — same callback set as purchase.
        // Amounts are STRINGS of cents ("1050" = $10.50).
        iclient.initiateRefund({
          amount: String(amountCents),
          mid: iclientCfg.mid,
          tid: iclientCfg.tid,
          transactionId: txn.our_ref,   // our idempotency key = Tyro's transactionId
        }, callbacks);
      } else {
        // iClient v1 canonical purchase shape.
        iclient.initiatePurchase({
          amount: String(amountCents),
          cashout: '0',
          integratedReceipt: false, // Tyro terminal prints; POS optionally prints too
          mid: iclientCfg.mid,
          tid: iclientCfg.tid,
          transactionId: txn.our_ref,   // our idempotency key = Tyro's transactionId
        }, callbacks);
      }
    } catch (err) {
      setPhase('failed');
      const msg = err.message || 'Tyro iClient failed to start';
      setStatusMsg(msg);
      toast.error(msg);
      onError?.(err);
    }
  }

  function cancel() {
    // iClient v1 doesn't have a clean "cancel" during a running txn — the
    // operator cancels at the terminal. This button only closes the pre-flight
    // dialog (before beginTransaction was called). Once running, disable it.
    onCancel?.();
  }

  // ── Render ──
  const isMock = iclientCfg?.mock_mode;
  const canBegin = phase === 'prompting';
  const running = phase === 'running';
  const done = phase === 'done';
  const failed = phase === 'failed';

  return (
    <div className="p-6 space-y-4 bg-surface-900 rounded-2xl border border-surface-800 max-w-md w-full">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
          <CreditCard className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-white font-bold">Tyro EFTPOS{isRefund ? ' Refund' : ''} {isMock && <span className="text-xs text-yellow-400 ml-1">(mock)</span>}</h3>
          <p className="text-xs text-surface-400">
            {iclientCfg ? `MID ${iclientCfg.mid} · TID ${iclientCfg.tid} · ${iclientCfg.environment}` : 'Preparing terminal…'}
          </p>
        </div>
      </div>

      <div className="text-center py-6 border-y border-surface-800">
        <div className="text-xs text-surface-400 mb-1">{isRefund ? 'Amount to refund to card' : 'Amount to charge'}</div>
        <div className="text-3xl font-black text-white font-mono">
          ${(amountCents / 100).toFixed(2)}
        </div>
      </div>

      {(phase === 'starting' || !iclientCfg) && (
        <div className="flex items-center gap-2 text-sm text-surface-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Setting up terminal…
        </div>
      )}

      {canBegin && (
        <div className="space-y-2">
          <p className="text-sm text-surface-300">
            {isMock
              ? `Mock mode — clicking below will simulate a successful terminal ${isRefund ? 'refund ' : ''}approval.`
              : isRefund
              ? 'Present the original card at the Tyro terminal to receive the refund.'
              : 'Present the card at the Tyro terminal when ready.'}
          </p>
          <button onClick={beginTransaction} className="btn-primary w-full py-3">
            {isMock
              ? (isRefund ? 'Simulate refund approval' : 'Simulate approval')
              : (isRefund ? 'Refund to card at terminal' : 'Tap card at terminal')}
          </button>
          <button onClick={cancel} className="text-xs text-surface-500 hover:text-surface-300 w-full">Cancel</button>
        </div>
      )}

      {running && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300">
          <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
          <div>
            <div className="font-bold text-sm">Waiting on terminal…</div>
            <div className="text-xs opacity-80 font-mono">{statusMsg || 'Processing'}</div>
          </div>
        </div>
      )}

      {/* Terminal question (e.g. "Signature OK?") — the operator MUST answer
          with a real tap; no auto-answer. Leaving it unanswered lets the
          terminal time the question out on its own. */}
      {running && question && (
        <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/40 space-y-3">
          <div className="text-sm font-bold text-yellow-300">{question.text || 'Terminal is asking a question'}</div>
          <div className="flex gap-2">
            {question.options.map((opt) => (
              <button
                key={opt}
                onClick={() => question.answer(opt)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
                  /^(YES|APPROVE|ACCEPT|OK)$/i.test(opt)
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                    : 'bg-red-500/15 border-red-500/40 text-red-300 hover:bg-red-500/25'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-surface-500">
            No answer will let the terminal time out — nothing is answered automatically.
          </p>
        </div>
      )}

      {done && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <div>
            <div className="font-bold text-sm">{isRefund ? 'Refund approved' : 'Approved'}</div>
          </div>
        </div>
      )}

      {failed && (
        <div className="space-y-2">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300">
            <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-sm">Transaction failed</div>
              <div className="text-xs opacity-90">{statusMsg || 'Try again'}</div>
            </div>
          </div>
          <button onClick={onCancel} className="btn-secondary w-full py-2 text-sm">Close</button>
        </div>
      )}
    </div>
  );
}
