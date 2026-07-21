/**
 * settlements — pure helpers for the Settlements screen (read-only payment /
 * aggregator settlement reconciliation). NO React / RN / api / expo imports, so
 * the /settlements contract is fully unit-testable. Consumed by useSettlements.js.
 *
 * Backend (backend/src/modules/settlements) is the source of truth:
 *   GET /settlements?outlet_id=&provider=&status=&from=&to=&page=&limit=
 *        → sendPaginated  body { success, data: rows[], message, meta:{ total, page, limit, totalPages } }
 *   GET /settlements/stats?outlet_id=&from=&to=
 *        → sendSuccess    body { success, data:{ total, by_status:{open,matched,variance,closed}, total_net, total_variance }, message }
 *   GET /settlements/:id?outlet_id=
 *        → sendSuccess    body { success, data: settlement + lines[], message }
 *
 * Settlement header fields: id, outlet_id, provider, reference, settlement_date,
 *   currency, gross_amount, fees, tax_on_fees, net_amount, status, matched_amount,
 *   variance_amount, line_count, matched_count, unmatched_count, notes, created_at.
 * Line fields (on detail): id, transaction_id, order_ref, type, amount, fee, net,
 *   match_status, variance, matched_payment_id.
 *
 * The mobile api interceptor returns the response BODY ({ success, data, message,
 * meta }), so every extractor accepts either that body OR a raw payload.
 */

// ─── Domain constants (mirror settlement.validation.js) ──────────────────────
export const SETTLEMENT_STATUSES = ['open', 'matched', 'variance', 'closed'];
export const SETTLEMENT_PROVIDERS = ['razorpay', 'card_acquirer', 'upi', 'bank', 'manual'];
export const LINE_TYPES = ['payment', 'refund', 'chargeback', 'adjustment'];

/** The shape stats defaults to before/without data. */
export const EMPTY_STATS = Object.freeze({
  total: 0,
  by_status: { open: 0, matched: 0, variance: 0, closed: 0 },
  total_net: 0,
  total_variance: 0,
});

/** Round to 2dp, NaN-safe. */
export function round2(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Unwrap an api response body to its payload (accepts body OR a raw payload). */
function payload(body) {
  return body?.data ?? body ?? null;
}

// ─── Extractors (accept the api BODY or a raw payload) ───────────────────────

/** The list rows from a paginated body (or a bare array / {items|rows}). */
export function extractSettlements(body) {
  if (Array.isArray(body)) return body;
  const d = body?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.rows)) return d.rows;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.rows)) return body.rows;
  return [];
}

/** Total count from paginated meta, falling back to the row count. */
export function extractTotal(body, fallbackRows) {
  const t = body?.meta?.total;
  if (t != null && Number.isFinite(Number(t))) return Number(t);
  if (Array.isArray(fallbackRows)) return fallbackRows.length;
  return extractSettlements(body).length;
}

/** The stats summary, always fully-shaped and numeric. */
export function extractStats(body) {
  const p = payload(body);
  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    return { ...EMPTY_STATS, by_status: { ...EMPTY_STATS.by_status } };
  }
  const by = p.by_status && typeof p.by_status === 'object' ? p.by_status : {};
  return {
    total: Number(p.total) || 0,
    by_status: {
      open: Number(by.open) || 0,
      matched: Number(by.matched) || 0,
      variance: Number(by.variance) || 0,
      closed: Number(by.closed) || 0,
    },
    total_net: round2(p.total_net),
    total_variance: round2(p.total_variance),
  };
}

/** A single settlement (detail) object, or null. */
export function extractSettlement(body) {
  const p = payload(body);
  return p && typeof p === 'object' && !Array.isArray(p) ? p : null;
}

/** The (non-deleted) lines of a settlement — accepts the body OR the settlement. */
export function extractLines(input) {
  const s = extractSettlement(input) ?? input;
  return Array.isArray(s?.lines) ? s.lines : [];
}

// ─── Derived stat helpers ────────────────────────────────────────────────────

/** Money actually settled (sum of net across the range). */
export function totalSettled(stats) {
  return round2(stats?.total_net);
}

/** "Pending" = settlements not yet reconciled/finalised (open + variance). */
export function pendingCount(stats) {
  const by = stats?.by_status || {};
  return (Number(by.open) || 0) + (Number(by.variance) || 0);
}

/** How many settlements in total. */
export function settlementCount(stats) {
  return Number(stats?.total) || 0;
}

/**
 * Fallback stats derived from a row set (used if /stats is unavailable).
 * @param {Array} rows
 */
export function summarizeRows(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const by_status = { open: 0, matched: 0, variance: 0, closed: 0 };
  let net = 0;
  let variance = 0;
  for (const s of list) {
    net += Number(s?.net_amount) || 0;
    variance += Number(s?.variance_amount) || 0;
    if (s && Object.prototype.hasOwnProperty.call(by_status, s.status)) by_status[s.status] += 1;
  }
  return { total: list.length, by_status, total_net: round2(net), total_variance: round2(variance) };
}

// ─── Field accessors (tolerant of drift) ─────────────────────────────────────

/** Best net amount for a settlement row. */
export function settlementAmount(s) {
  const n = Number(s?.net_amount);
  return Number.isFinite(n) ? n : 0;
}

/** Best timestamp for a settlement row. */
export function settlementDate(s) {
  return s?.settlement_date ?? s?.created_at ?? null;
}

/** A short reference / id label, never blank. */
export function settlementRef(s) {
  const ref = s?.reference && String(s.reference).trim();
  if (ref) return ref;
  const id = s?.id ? String(s.id) : '';
  return id ? id.slice(0, 8) : '';
}

// ─── Label + tone maps (tone is a semantic key the screen maps to a color) ───

/** Friendly provider / channel name. */
export function providerLabel(provider) {
  switch (String(provider || '').toLowerCase()) {
    case 'razorpay': return 'Razorpay';
    case 'card_acquirer': return 'Card acquirer';
    case 'upi': return 'UPI';
    case 'bank': return 'Bank transfer';
    case 'manual': return 'Manual';
    default: return titleCase(provider) || 'Unknown';
  }
}

/** Ionicons name for a provider / channel. */
export function providerIconName(provider) {
  switch (String(provider || '').toLowerCase()) {
    case 'razorpay': return 'flash-outline';
    case 'card_acquirer': return 'card-outline';
    case 'upi': return 'phone-portrait-outline';
    case 'bank': return 'business-outline';
    case 'manual': return 'create-outline';
    default: return 'cash-outline';
  }
}

/** { label, tone } for a settlement status. tone ∈ success|warning|error|muted. */
export function statusMeta(status) {
  switch (String(status || '').toLowerCase()) {
    case 'open': return { label: 'Open', tone: 'warning' };
    case 'matched': return { label: 'Matched', tone: 'success' };
    case 'variance': return { label: 'Variance', tone: 'error' };
    case 'closed': return { label: 'Closed', tone: 'muted' };
    default: return { label: titleCase(status) || 'Unknown', tone: 'muted' };
  }
}

/** { label, tone } for a settlement LINE match_status. */
export function matchStatusMeta(matchStatus) {
  switch (String(matchStatus || '').toLowerCase()) {
    case 'matched': return { label: 'Matched', tone: 'success' };
    case 'mismatch': return { label: 'Mismatch', tone: 'error' };
    case 'unmatched': return { label: 'Unmatched', tone: 'warning' };
    default: return { label: titleCase(matchStatus) || 'Unmatched', tone: 'muted' };
  }
}

/** Human label for a line type (payment / refund / chargeback / adjustment). */
export function lineTypeLabel(type) {
  return titleCase(type) || 'Payment';
}

/** Title-case a snake/kebab token: 'card_acquirer' → 'Card acquirer'. */
export function titleCase(v) {
  const s = String(v || '').trim().replace(/[_-]+/g, ' ');
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ─── Filters ─────────────────────────────────────────────────────────────────

/** Free-text match over provider / reference / currency / status / id. */
export function matchesSettlement(s = {}, q = '') {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return true;
  const hay = [s.provider, providerLabel(s.provider), s.reference, s.currency, s.status, s.id]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(needle);
}

/** Client-side filter by status + provider + free text. 'all' disables a facet. */
export function filterSettlements(rows = [], { status = 'all', provider = 'all', q = '' } = {}) {
  return (Array.isArray(rows) ? rows : []).filter(
    (s) =>
      (status === 'all' || s?.status === status) &&
      (provider === 'all' || s?.provider === provider) &&
      matchesSettlement(s, q)
  );
}

// ─── Formatters ──────────────────────────────────────────────────────────────

/**
 * Currency-aware money formatter (fallback; the screen prefers useCurrency).
 * Defaults to the backend's default currency (INR) when none is supplied.
 */
export function formatMoney(currency, amount) {
  const cur = currency || 'INR';
  const locale = cur === 'INR' ? 'en-IN' : 'en-AU';
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: 2,
    }).format(n);
  } catch (_) {
    return `${cur} ${n.toFixed(2)}`;
  }
}

/** Compact date: '20 Jul 2026'. Empty string for missing / invalid input. */
export function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (_) {
    return d.toISOString().slice(0, 10);
  }
}

/** Compact relative time. `now` is injectable for deterministic tests. */
export function timeAgo(ts, now = Date.now()) {
  if (!ts) return '';
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, now - t);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
