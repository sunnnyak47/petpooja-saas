/**
 * @fileoverview Public table-reservation page — accessed via QR code scan or a
 * shared link. No authentication required. Mobile-optimized, self-contained
 * (no Redux) — mirrors CustomerOrderPage.
 * URL format: /reserve?outlet=OUTLET_ID
 */
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CalendarDays, Clock, Users, Phone, User, NotebookPen,
  CheckCircle2, X, Utensils, Sparkles, MapPin,
} from 'lucide-react';

// Relative path — works with Vercel rewrites or direct proxy (same as ordering page)
const API_PREFIX = '/api';

/**
 * Client-side mirror of the server's best-fit ranking. Prefers the smallest
 * AVAILABLE table that still seats the party (least wasted seats); falls back to
 * the largest available, then any table.
 */
function rankTablesByFit(tables, partySize) {
  const size = Math.max(1, parseInt(partySize, 10) || 1);
  const byCapAsc = (a, b) =>
    (a.seating_capacity - b.seating_capacity) ||
    String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true });
  const byCapDesc = (a, b) => (b.seating_capacity - a.seating_capacity) || byCapAsc(a, b);
  const available = (tables || []).filter(t => (t.status || 'available') === 'available');
  const availableFits = available.filter(t => (t.seating_capacity || 0) >= size).sort(byCapAsc);
  if (availableFits.length) return availableFits;
  if (available.length) return available.slice().sort(byCapDesc);
  const anyFits = (tables || []).filter(t => (t.seating_capacity || 0) >= size).sort(byCapAsc);
  if (anyFits.length) return anyFits;
  return (tables || []).slice().sort(byCapDesc);
}

const todayStr = () => new Date().toISOString().split('T')[0];

export default function PublicReservationPage() {
  const [searchParams] = useSearchParams();
  const [outletId, setOutletId] = useState(null);
  const [info, setInfo] = useState(null);          // { outlet, tables, ... }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [confirmed, setConfirmed] = useState(null); // reservation returned on success

  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    party_size: 2,
    reservation_date: todayStr(),
    reservation_time: '',
    special_requests: '',
  });

  const isAU = info?.outlet?.currency === 'AUD';
  const phonePlaceholder = isAU ? '+61 412 345 678' : '+91 98765 43210';

  useEffect(() => {
    const oid = searchParams.get('outlet');
    if (!oid) {
      setError('Invalid reservation link. Please scan the QR code again.');
      setLoading(false);
      return;
    }
    setOutletId(oid);
    fetchInfo(oid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchInfo = async (id) => {
    try {
      const res = await fetch(`${API_PREFIX}/reservations/public/${id}/info`);
      const data = await res.json();
      if (data.success) {
        setInfo(data.data);
      } else {
        setError(data.message || 'This restaurant is not accepting reservations.');
      }
    } catch (err) {
      setError('Failed to load. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Auto table suggestion, recomputed as the party size changes.
  const suggestions = useMemo(
    () => rankTablesByFit(info?.tables || [], form.party_size).slice(0, 3),
    [info, form.party_size]
  );
  const topSuggestion = suggestions[0] || null;
  const suggestionFits =
    topSuggestion && (topSuggestion.seating_capacity || 0) >= (parseInt(form.party_size, 10) || 1);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const canSubmit =
    form.customer_name.trim() &&
    form.customer_phone.trim() &&
    form.reservation_date &&
    form.reservation_time &&
    Number(form.party_size) >= 1;

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const payload = {
        outlet_id: outletId,
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim(),
        party_size: Number(form.party_size),
        reservation_date: form.reservation_date,
        reservation_time: form.reservation_time,
        special_requests: form.special_requests || '',
        // Send the auto-suggested table as the preference; server re-validates.
        table_id: topSuggestion?.id || null,
      };
      const res = await fetch(`${API_PREFIX}/reservations/public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setConfirmed(data.data);
      } else {
        const fieldErrors = data.errors;
        setSubmitError(
          Array.isArray(fieldErrors) && fieldErrors.length
            ? fieldErrors.map(fe => fe.message).join(', ')
            : (data.message || 'Could not create your reservation. Please try again.')
        );
      }
    } catch (err) {
      setSubmitError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── LOADING ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-white">
      <div className="text-center">
        <div className="mx-auto h-14 w-14 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        <p className="mt-4 text-sm text-gray-500 font-medium">Loading…</p>
      </div>
    </div>
  );

  // ── ERROR ────────────────────────────────────────────────────────────────
  if (error) return (
    <div className="flex h-screen flex-col items-center justify-center p-8 bg-white text-center">
      <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mb-4">
        <X size={40} className="text-red-500" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Reservation unavailable</h2>
      <p className="text-gray-500 mb-6">{error}</p>
      <button onClick={() => window.location.reload()}
        className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold">
        Try Again
      </button>
    </div>
  );

  // ── SUCCESS ──────────────────────────────────────────────────────────────
  if (confirmed) return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8 bg-white text-center">
      <div className="w-24 h-24 rounded-full bg-green-50 flex items-center justify-center mb-6">
        <CheckCircle2 size={56} className="text-green-500" />
      </div>
      <h2 className="text-3xl font-extrabold text-gray-900 mb-2">Reservation requested!</h2>
      <p className="text-gray-500 mb-8 max-w-xs">
        {info?.outlet?.name || 'The restaurant'} has received your request and will confirm shortly.
      </p>
      <div className="w-full max-w-xs bg-gray-50 border border-gray-100 rounded-3xl p-6 text-left space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500 font-medium">Name</span>
          <span className="text-sm text-gray-900 font-black">{confirmed.customer_name}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500 font-medium">Party size</span>
          <span className="text-sm text-gray-900 font-black">{confirmed.party_size} guests</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500 font-medium">Date &amp; time</span>
          <span className="text-sm text-gray-900 font-black">
            {new Date(confirmed.reservation_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            {confirmed.reservation_time ? ` · ${confirmed.reservation_time}` : ''}
          </span>
        </div>
        {confirmed.table_number && (
          <div className="flex justify-between items-center pt-3 border-t border-gray-200/60">
            <span className="text-sm text-gray-500 font-medium">Suggested table</span>
            <span className="text-sm text-indigo-600 font-black">Table {confirmed.table_number}</span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500 font-medium">Status</span>
          <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
            {confirmed.status || 'pending'}
          </span>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-6 max-w-xs">
        Please arrive on time. The table shown is a suggestion — the restaurant may seat you at a
        different table on arrival.
      </p>
    </div>
  );

  // ── FORM ─────────────────────────────────────────────────────────────────
  const inputCls =
    'w-full px-3.5 py-3 rounded-2xl text-sm outline-none border border-gray-200 bg-gray-50 ' +
    'focus:border-indigo-400 focus:bg-white transition-colors text-gray-900';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-5 py-5 sticky top-0 z-10">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-black text-lg shrink-0">
            {info?.outlet?.name?.charAt(0) || 'R'}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold text-gray-900 truncate">
              {info?.outlet?.name || 'Reserve a Table'}
            </h1>
            <p className="text-xs text-gray-400 flex items-center gap-1 truncate">
              <MapPin size={11} />{info?.outlet?.city || 'Book your table online'}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 py-6 space-y-5">
        <div className="flex items-center gap-2 text-gray-900">
          <Utensils size={18} className="text-indigo-600" />
          <h2 className="font-bold">Book a table</h2>
        </div>

        {/* Name */}
        <div>
          <label className="text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1.5">
            <User size={13} /> Your name
          </label>
          <input className={inputCls} value={form.customer_name} placeholder="John Doe"
            onChange={e => set('customer_name', e.target.value)} maxLength={150} />
        </div>

        {/* Phone */}
        <div>
          <label className="text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1.5">
            <Phone size={13} /> Phone
          </label>
          <input className={inputCls} type="tel" value={form.customer_phone} placeholder={phonePlaceholder}
            onChange={e => set('customer_phone', e.target.value)} maxLength={20} />
        </div>

        {/* Party size */}
        <div>
          <label className="text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1.5">
            <Users size={13} /> Number of guests
          </label>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Fewer guests"
              onClick={() => set('party_size', Math.max(1, Number(form.party_size) - 1))}
              className="w-11 h-11 rounded-2xl border border-gray-200 bg-white text-gray-700 font-black text-lg active:scale-95">
              −
            </button>
            <input type="number" min={1} max={info?.max_party_size || 50} value={form.party_size}
              onChange={e => set('party_size', e.target.value)}
              className={`${inputCls} text-center flex-1 font-bold`} />
            <button type="button" aria-label="More guests"
              onClick={() => set('party_size', Math.min(info?.max_party_size || 50, Number(form.party_size) + 1))}
              className="w-11 h-11 rounded-2xl border border-gray-200 bg-white text-gray-700 font-black text-lg active:scale-95">
              +
            </button>
          </div>
        </div>

        {/* Auto table suggestion */}
        {topSuggestion && (
          <div className={`rounded-2xl p-4 border ${suggestionFits ? 'bg-indigo-50 border-indigo-100' : 'bg-amber-50 border-amber-100'}`}>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={15} className={suggestionFits ? 'text-indigo-600' : 'text-amber-600'} />
              <span className={`text-xs font-black uppercase tracking-wide ${suggestionFits ? 'text-indigo-700' : 'text-amber-700'}`}>
                Suggested table
              </span>
            </div>
            {suggestionFits ? (
              <p className="text-sm text-gray-700">
                <span className="font-black text-gray-900">Table {topSuggestion.table_number}</span>{' '}
                (seats {topSuggestion.seating_capacity}) is the best fit for {form.party_size} guests.
              </p>
            ) : (
              <p className="text-sm text-gray-700">
                No single table seats {form.party_size} right now — the restaurant will arrange seating
                (largest is Table {topSuggestion.table_number}, {topSuggestion.seating_capacity} seats).
              </p>
            )}
            {suggestions.length > 1 && suggestionFits && (
              <p className="text-[11px] text-gray-500 mt-1.5">
                Alternatives:{' '}
                {suggestions.slice(1).map(t => `T${t.table_number} (${t.seating_capacity})`).join(', ')}
              </p>
            )}
          </div>
        )}

        {/* Date + Time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1.5">
              <CalendarDays size={13} /> Date
            </label>
            <input className={inputCls} type="date" min={todayStr()} value={form.reservation_date}
              onChange={e => set('reservation_date', e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1.5">
              <Clock size={13} /> Time
            </label>
            <input className={inputCls} type="time" value={form.reservation_time}
              onChange={e => set('reservation_time', e.target.value)} />
          </div>
        </div>

        {/* Special requests */}
        <div>
          <label className="text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1.5">
            <NotebookPen size={13} /> Special requests <span className="text-gray-300 font-medium">(optional)</span>
          </label>
          <textarea className={`${inputCls} resize-none`} rows={2} value={form.special_requests}
            placeholder="Birthday, window seat, high chair…" maxLength={500}
            onChange={e => set('special_requests', e.target.value)} />
        </div>

        {submitError && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-2xl px-4 py-3">
            {submitError}
          </div>
        )}

        <button onClick={submit} disabled={!canSubmit || submitting}
          className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-black text-base disabled:opacity-40 active:scale-[0.99] transition-transform">
          {submitting ? 'Sending…' : 'Request Reservation'}
        </button>

        <p className="text-center text-[11px] text-gray-400 pb-6">
          Your reservation is a request and will be confirmed by the restaurant.
        </p>
      </div>
    </div>
  );
}
