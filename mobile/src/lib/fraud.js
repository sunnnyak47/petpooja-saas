/**
 * fraud — pure helpers for the "Fraud & Risk" owner monitoring screen.
 *
 * No React / RN / api / expo imports, so the /fraud/alerts + /fraud/stats +
 * /fraud/staff-risks contract is unit-testable. Consumed by useFraud.js.
 *
 * The mobile api interceptor returns the response BODY ({ success, data, message }),
 * so every extractor accepts EITHER the api body OR an already-unwrapped payload.
 *
 * Backend source of truth: backend/src/modules/fraud/fraud.service.js
 *   listAlerts()        → { items:[], total, page, limit, pages }
 *   getAlertStats()     → { total, unread, by_severity:{sev:n}, by_type:[{type,count}], trend_7d:[] }
 *   getStaffRiskProfiles() → [{ id, full_name, role, alert_count, unresolved, max_risk_score, risk_level, alert_types }]
 *   a fraudAlert row    → { id, alert_type, severity, title, description, evidence, risk_score,
 *                           is_read, is_dismissed, is_resolved, created_at, staff:{ id, full_name } }
 */

function payload(body) {
  return body?.data ?? body ?? null;
}

/* ─── Extractors (accept api BODY or a raw payload) ───────────────────────── */

/** Alert rows from GET /fraud/alerts. Tolerates body / payload / bare array. */
export function extractAlerts(body) {
  const p = payload(body);
  if (Array.isArray(p)) return p;
  if (Array.isArray(p?.items)) return p.items;
  return [];
}

/** Pagination meta for the alerts list (safe defaults). */
export function extractAlertsMeta(body) {
  const p = payload(body) || {};
  return {
    total: Number(p.total) || 0,
    page: Number(p.page) || 1,
    limit: Number(p.limit) || 20,
    pages: Number(p.pages) || 0,
  };
}

/** Summary stats from GET /fraud/stats (normalised, never null fields). */
export function extractStats(body) {
  const p = payload(body) || {};
  return {
    total: Number(p.total) || 0,
    unread: Number(p.unread) || 0,
    by_severity: p.by_severity && typeof p.by_severity === 'object' ? p.by_severity : {},
    by_type: Array.isArray(p.by_type) ? p.by_type : [],
    trend_7d: Array.isArray(p.trend_7d) ? p.trend_7d : [],
  };
}

/** Staff risk profiles from GET /fraud/staff-risks (bare array payload). */
export function extractStaffRisks(body) {
  const p = payload(body);
  if (Array.isArray(p)) return p;
  if (Array.isArray(p?.items)) return p.items;
  return [];
}

/* ─── Severity ─────────────────────────────────────────────────────────────
   Backend severity ladder: low < medium < high < critical. */
export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

const SEVERITY_COLORS = {
  critical: '#dc2626', // red-600
  high: '#ea580c',     // orange-600
  medium: '#d97706',   // amber-600
  low: '#2563eb',      // blue-600 (informational)
};

/** Hex colour for a severity (theme-agnostic; unknown → slate). */
export function severityColor(severity) {
  return SEVERITY_COLORS[String(severity || '').toLowerCase()] || '#64748b';
}

/** Title-cased severity label ('' → 'Unknown'). */
export function severityLabel(severity) {
  const s = String(severity || '').toLowerCase();
  if (!s) return 'Unknown';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Sortable rank: critical=4 … low=1, unknown=0. */
export function severityRank(severity) {
  switch (String(severity || '').toLowerCase()) {
    case 'critical': return 4;
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
    default: return 0;
  }
}

/* ─── Alert types ──────────────────────────────────────────────────────────
   The 7 detection rules in fraud.service.js. Fallback title-cases any SNAKE. */
const TYPE_LABELS = {
  EXCESSIVE_CANCELLATIONS: 'Excessive cancellations',
  KOT_WITHOUT_BILL: 'KOT without bill',
  DISCOUNT_ABUSE: 'Discount abuse',
  VOID_ABUSE: 'Void abuse',
  QUICK_CANCEL: 'Quick cancellations',
  LATE_NIGHT_ANOMALY: 'Late-night anomaly',
  REFUND_PATTERN: 'Refund pattern',
};

const TYPE_ICONS = {
  EXCESSIVE_CANCELLATIONS: 'close-circle-outline',
  KOT_WITHOUT_BILL: 'receipt-outline',
  DISCOUNT_ABUSE: 'pricetag-outline',
  VOID_ABUSE: 'trash-outline',
  QUICK_CANCEL: 'flash-outline',
  LATE_NIGHT_ANOMALY: 'moon-outline',
  REFUND_PATTERN: 'cash-outline',
};

/** Human label for an alert_type. */
export function alertTypeLabel(type) {
  const key = String(type || '').toUpperCase();
  if (TYPE_LABELS[key]) return TYPE_LABELS[key];
  if (!key) return 'Alert';
  return key
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Ionicons name for an alert_type (unknown → generic warning). */
export function alertTypeIcon(type) {
  return TYPE_ICONS[String(type || '').toUpperCase()] || 'alert-circle-outline';
}

/* ─── Per-alert accessors ──────────────────────────────────────────────────
   Money at risk is not a column — it lives inside evidence and the key differs
   per rule (total_amount / total_voided / total_refunded). Returns a number, or
   null when the rule carries no monetary value (e.g. quick-cancel counts). */
export function alertAmount(alert) {
  const ev = alert?.evidence;
  if (!ev || typeof ev !== 'object') return null;
  const candidates = [ev.total_amount, ev.total_voided, ev.total_refunded, ev.amount, ev.total];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/** Best staff name for an alert (joined staff → evidence → fallback). */
export function alertStaffName(alert) {
  const joined = alert?.staff?.full_name && String(alert.staff.full_name).trim();
  if (joined) return joined;
  const ev = alert?.evidence?.staff_name && String(alert.evidence.staff_name).trim();
  if (ev) return ev;
  return 'Unknown staff';
}

/** Creation timestamp for an alert (or null). */
export function alertTime(alert) {
  return alert?.created_at ?? null;
}

/** Unread = not yet read AND not resolved (resolved implies read on backend). */
export function isUnread(alert) {
  return !!alert && !alert.is_read;
}

/* ─── Filtering ────────────────────────────────────────────────────────────
   'all' → every (non-dismissed, server-filtered) alert; 'unread' → is_read=false. */
export function filterAlerts(rows = [], filter = 'all') {
  const list = Array.isArray(rows) ? rows : [];
  if (filter === 'unread') return list.filter(isUnread);
  return list;
}

/** Sort alerts by severity desc, then newest first — matches backend orderBy. */
export function sortAlerts(rows = []) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  return list.sort((a, b) => {
    const bySev = severityRank(b?.severity) - severityRank(a?.severity);
    if (bySev !== 0) return bySev;
    const ta = new Date(a?.created_at || 0).getTime() || 0;
    const tb = new Date(b?.created_at || 0).getTime() || 0;
    return tb - ta;
  });
}

/* ─── Stats-derived ────────────────────────────────────────────────────────*/

/** Count for one severity from a stats object (0 when absent). */
export function severityCount(stats, severity) {
  const map = stats?.by_severity;
  if (!map || typeof map !== 'object') return 0;
  return Number(map[severity]) || 0;
}

/** Ordered [{ severity, count, color }] for the stats strip (drops zeros). */
export function severityBreakdown(stats) {
  return SEVERITY_ORDER.map((sev) => ({
    severity: sev,
    label: severityLabel(sev),
    count: severityCount(stats, sev),
    color: severityColor(sev),
  })).filter((r) => r.count > 0);
}

/** Unread count — prefer the server's number, fall back to counting rows. */
export function unreadCount(stats, rows = []) {
  if (stats && Number.isFinite(Number(stats.unread))) return Number(stats.unread);
  return (Array.isArray(rows) ? rows : []).filter(isUnread).length;
}

/* ─── Staff risk-level presentation ────────────────────────────────────────
   Backend risk_level ∈ high | medium | low | clean. */
export function riskLevelColor(level) {
  switch (String(level || '').toLowerCase()) {
    case 'high': return '#dc2626';
    case 'medium': return '#d97706';
    case 'low': return '#2563eb';
    case 'clean': return '#16a34a';
    default: return '#64748b';
  }
}

export function riskLevelLabel(level) {
  const l = String(level || '').toLowerCase();
  if (l === 'clean') return 'Clean';
  if (!l) return 'Unknown';
  return l.charAt(0).toUpperCase() + l.slice(1) + ' risk';
}

/* ─── Relative time (injectable `now` for deterministic tests) ─────────────*/
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
