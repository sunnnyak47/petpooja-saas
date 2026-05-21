/**
 * VoiceConfirmModal — review-before-add screen for Voice POS.
 *
 * Shown when useVoiceOrder.pendingOrder is non-null and the setting
 * `confirmBeforeAdding` is on. The operator can:
 *   • bump quantity per item
 *   • edit notes / variant name inline
 *   • remove a misheard item
 *   • say more (re-arms the mic; new utterance replaces/extends the stage)
 *   • cancel (drops the staged order entirely)
 *   • confirm (pushes to Redux cart)
 */
import { useEffect } from 'react';
import { useCurrency } from '../../hooks/useCurrency';
import {
  Mic, MicOff, Plus, Minus, Trash2, Check, X, Loader,
  AlertCircle, MessageCircle,
} from 'lucide-react';

export default function VoiceConfirmModal({ voice }) {
  const { symbol, format } = useCurrency();
  const open = !!voice.pendingOrder;

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') voice.cancelPendingOrder(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, voice]);

  if (!open) return null;

  const items = voice.pendingOrder.items || [];
  const subtotal = items.reduce((s, it) => s + (Number(it.unit_price) || 0) * (Number(it.quantity) || 0), 0);
  const isListening = voice.isListening;
  const isThinking = voice.isThinking;
  const lastTranscript = voice.pendingOrder.transcripts?.slice(-1)[0] || '';
  const response = voice.pendingOrder.response || '';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.55)' }}
         role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
           style={{ background: 'var(--bg-card)' }}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                 style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
              <Mic className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
                Review voice order
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Fix any mistakes the mic misheard, then confirm to add to cart.
              </p>
            </div>
          </div>
          <button onClick={voice.cancelPendingOrder}
                  className="p-1.5 rounded-lg hover:opacity-70 flex-shrink-0"
                  style={{ color: 'var(--text-secondary)' }}
                  aria-label="Cancel">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Transcript + LLM response ────────────────────────────────── */}
        {(lastTranscript || response) && (
          <div className="px-5 py-3 border-b text-xs space-y-1" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
            {lastTranscript && (
              <div className="flex gap-2">
                <span className="font-semibold flex-shrink-0" style={{ color: 'var(--accent)' }}>You said:</span>
                <span className="italic" style={{ color: 'var(--text-primary)' }}>"{lastTranscript}"</span>
              </div>
            )}
            {response && (
              <div className="flex gap-2">
                <MessageCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
                <span style={{ color: 'var(--text-secondary)' }}>{response}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Items list (scrollable) ──────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <AlertCircle className="w-8 h-8 opacity-40" style={{ color: 'var(--text-secondary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                No items captured. Try saying it again with item names and quantities.
              </p>
            </div>
          ) : items.map((item, idx) => (
            <ItemRow
              key={idx}
              item={item}
              idx={idx}
              symbol={symbol}
              onChange={(patch) => voice.updatePendingItem(idx, patch)}
              onRemove={() => voice.removePendingItem(idx)}
            />
          ))}
        </div>

        {/* ── Subtotal ─────────────────────────────────────────────────── */}
        <div className="px-5 py-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <span className="text-xs uppercase font-bold tracking-wider" style={{ color: 'var(--text-secondary)' }}>
            Subtotal · {items.length} item{items.length === 1 ? '' : 's'}
          </span>
          <span className="text-xl font-black" style={{ color: 'var(--accent)' }}>
            {format(subtotal)}
          </span>
        </div>

        {/* ── Footer actions ───────────────────────────────────────────── */}
        <div className="p-4 border-t flex flex-wrap items-center gap-2" style={{ borderColor: 'var(--border)' }}>
          <button onClick={voice.cancelPendingOrder}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold border flex items-center gap-1.5"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            <X className="w-4 h-4" /> Cancel
          </button>

          <button onClick={voice.listenMoreOnPending}
                  disabled={isThinking || isListening}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold border flex items-center gap-1.5 disabled:opacity-50"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
            {isListening
              ? <><Mic className="w-4 h-4 animate-pulse" /> Listening…</>
              : isThinking
                ? <><Loader className="w-4 h-4 animate-spin" /> Processing…</>
                : <><MicOff className="w-4 h-4" /> Say more</>}
          </button>

          <div className="flex-1" />

          <button onClick={voice.confirmPendingOrder}
                  disabled={items.length === 0 || isThinking}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1.5 shadow-md disabled:opacity-50"
                  style={{ background: 'var(--accent)', color: '#fff' }}>
            <Check className="w-4 h-4" /> Confirm &amp; add to cart
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Per-item row
   ───────────────────────────────────────────────────────────────────── */
function ItemRow({ item, idx, symbol, onChange, onRemove }) {
  const lineTotal = (Number(item.unit_price) || 0) * (Number(item.quantity) || 0);
  return (
    <div className="rounded-xl border p-3 flex items-start gap-3"
         style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
      {/* qty stepper */}
      <div className="flex flex-col items-center gap-1">
        <button onClick={() => onChange({ quantity: (Number(item.quantity)||1) + 1 })}
                className="w-8 h-8 rounded-lg flex items-center justify-center border hover:opacity-70"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                aria-label="Increase quantity">
          <Plus className="w-4 h-4" />
        </button>
        <span className="text-lg font-black tabular-nums w-8 text-center"
              style={{ color: 'var(--text-primary)' }}>{item.quantity}</span>
        <button onClick={() => onChange({ quantity: Math.max(1, (Number(item.quantity)||1) - 1) })}
                disabled={item.quantity <= 1}
                className="w-8 h-8 rounded-lg flex items-center justify-center border hover:opacity-70 disabled:opacity-30"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                aria-label="Decrease quantity">
          <Minus className="w-4 h-4" />
        </button>
      </div>

      {/* details */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <input type="text" value={item.name}
               onChange={(e) => onChange({ name: e.target.value })}
               className="w-full font-bold text-sm bg-transparent border-0 p-0 focus:outline-none focus:ring-0"
               style={{ color: 'var(--text-primary)' }} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{symbol}{Number(item.unit_price).toFixed(2)} each</span>
          {item.variant_name && (
            <input type="text" value={item.variant_name}
                   onChange={(e) => onChange({ variant_name: e.target.value })}
                   className="text-xs px-2 py-0.5 rounded-full border bg-transparent focus:outline-none focus:ring-0"
                   style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                   placeholder="size / variant" />
          )}
        </div>
        <input type="text" value={item.notes || ''}
               onChange={(e) => onChange({ notes: e.target.value })}
               placeholder="Add a note (e.g. extra spicy, no onion)"
               className="w-full text-xs px-2 py-1 rounded-md border bg-transparent focus:outline-none"
               style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
      </div>

      {/* line total + remove */}
      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        <span className="font-bold text-sm tabular-nums" style={{ color: 'var(--text-primary)' }}>
          {symbol}{lineTotal.toFixed(2)}
        </span>
        <button onClick={onRemove}
                className="p-1.5 rounded-lg hover:opacity-70"
                style={{ color: 'var(--danger, #ef4444)' }}
                aria-label={`Remove ${item.name}`}>
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
