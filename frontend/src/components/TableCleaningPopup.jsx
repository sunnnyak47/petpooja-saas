/**
 * TableCleaningPopup — the dirty/cleaning lifecycle UI for a single table.
 *
 * After payment a dine-in table enters a 'dirty' (cleaning) state instead of
 * freeing immediately. This popup (surfaced from TablesPage by polling each
 * table's reminder timestamp) drives the whole loop:
 *
 *   mode="start"     → "Table is being cleaned — mark free" + 5/10/15/30 timer
 *   mode="reminder"  → timer elapsed → "Mark free?" verification:
 *                        (a) Mark Free  → table freed, loop stops
 *                        (b) Take more time → re-pick 5/10/15/30 → loop restarts
 *   From the 2nd reminder on (reminder_count ≥ 2) a "No more reminders" option
 *   appears (but a next-timer select is still offered).
 *
 * A hard "Mark as Free" frees the table immediately AND stops the loop.
 * Within the 10-minute cleaning window a "Seat next customer" action hands the
 * still-dirty table to a new order.
 */
import { useState, useEffect } from 'react';
import Modal from './Modal';
import { Sparkles, Check, Clock, BellOff, UserPlus, Loader2 } from 'lucide-react';

// Must mirror backend CLEANING_PRESET_MINUTES.
const TIMER_PRESETS = [5, 10, 15, 30];

export default function TableCleaningPopup({
  table,
  mode = 'start',
  withinWindow = false,
  busy = false,
  onPickTime,
  onMarkFree,
  onStopReminders,
  onAssign,
  onClose,
}) {
  const [takeMore, setTakeMore] = useState(false);

  // Reset the "take more time" sub-view whenever the popup target changes.
  useEffect(() => { setTakeMore(false); }, [table?.id, mode]);

  if (!table) return null;

  const reminderCount = Number(table.reminder_count || 0);
  const showNoMore = mode === 'reminder' && reminderCount >= 2;
  // In start mode the presets are always visible; in reminder mode only after
  // the operator chooses "Take more time".
  const showPresets = mode === 'start' || takeMore;

  const title = mode === 'reminder'
    ? `Table ${table.table_number} — still cleaning?`
    : `Table ${table.table_number} — being cleaned`;

  const TimerButtons = () => (
    <div className="grid grid-cols-4 gap-2">
      {TIMER_PRESETS.map((m) => (
        <button
          key={m}
          type="button"
          disabled={busy}
          onClick={() => onPickTime?.(m)}
          className="py-2.5 rounded-xl text-sm font-black transition-colors disabled:opacity-50"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = 'var(--accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
        >
          {m}m
        </button>
      ))}
    </div>
  );

  return (
    <Modal isOpen onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
          >
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              {mode === 'reminder'
                ? `Cleaning time is up${reminderCount > 1 ? ` · reminder ${reminderCount}` : ''}`
                : 'Table needs cleaning before the next guest'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {mode === 'reminder'
                ? 'Is the table ready? Mark it free, take more time, or seat the next customer.'
                : 'Set a reminder to mark it free, or free it now.'}
            </p>
          </div>
        </div>

        {/* Reminder-mode primary choices (before "take more time") */}
        {mode === 'reminder' && !takeMore && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onMarkFree?.()}
              className="py-2.5 rounded-xl text-sm font-black text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
              style={{ background: '#10b981' }}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Mark Free
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setTakeMore(true)}
              className="py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              <Clock className="w-4 h-4" /> Take more time
            </button>
          </div>
        )}

        {/* Timer presets (start mode always; reminder mode after "take more time") */}
        {showPresets && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              {mode === 'reminder' ? 'Remind me again in…' : 'Mark free in…'}
            </p>
            <TimerButtons />
          </div>
        )}

        {/* No more reminders — appears from the 2nd reminder on */}
        {showNoMore && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onStopReminders?.()}
            className="w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            <BellOff className="w-3.5 h-3.5" /> No more reminders (leave dirty)
          </button>
        )}

        {/* Seat next customer — only within the cleaning window */}
        {withinWindow && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAssign?.()}
            className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
            style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}
          >
            <UserPlus className="w-4 h-4" /> Seat next customer
          </button>
        )}

        {/* Hard mark-as-free — always available, frees now + stops the loop */}
        <div className="pt-1" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => onMarkFree?.()}
            className="w-full mt-3 py-2.5 rounded-xl text-sm font-black text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
            style={{ background: '#10b981' }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Mark as Free now
          </button>
        </div>
      </div>
    </Modal>
  );
}
