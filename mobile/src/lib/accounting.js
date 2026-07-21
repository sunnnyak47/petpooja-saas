/**
 * accounting — pure helpers for the read-only "Accounting" owner-books snapshot
 * screen (mobile). No React / RN / api / expo imports, so the /accounting
 * contract is unit-testable. Consumed by useAccounting.js + the screen.
 *
 * The mobile api interceptor returns the response BODY ({ success, data, message }),
 * so every extractor accepts EITHER the api body OR a raw payload.
 *
 * Source of truth (backend modules/accounting):
 *   GET /accounting/owner-dashboard   → owner.getOwnerDashboard(outletId)
 *   GET /accounting/profit-loss       → statements.getProfitAndLoss(outletId, from, to)
 *   GET /accounting/bas               → bas.getBASReport(outletId, from, to)
 *   GET /accounting/receivables-aging → aging.getReceivablesAging(outletId, as_of)
 * All are read-only and outlet-scoped (outlet_id query param).
 */

// ─── Primitives ──────────────────────────────────────────────────────────────

/** Unwrap the api body → its `data` payload (or the raw object / null). */
function payload(body) {
  return body?.data ?? body ?? null;
}

/** Coerce anything into a finite number, else `fallback`. */
export function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Round to 2dp (mirrors the backend's round2), always a finite number. */
export function round2(v) {
  return Math.round((toNumber(v) + Number.EPSILON) * 100) / 100;
}

// ─── Owner dashboard ─────────────────────────────────────────────────────────

/**
 * Normalise the owner-dashboard payload into a stable shape with safe defaults,
 * so the screen never has to null-check the wire format. Accepts body or payload.
 */
export function extractDashboard(body) {
  const p = payload(body) || {};
  const profit = p.profit || {};
  const tax = p.tax || null;
  const recv = p.receivables || {};
  const pay = p.payables || {};
  const exp = p.expenses || {};
  const period = p.period || {};

  return {
    currency: p.currency || 'AUD',
    region: p.region || 'AU',
    outlet_name: p.outlet_name ?? null,
    has_data: p.has_data === true,
    period: {
      month_label: period.month_label || '',
      from: period.from || null,
      to: period.to || null,
    },
    profit: {
      this_month: round2(profit.this_month),
      prev_month: round2(profit.prev_month),
      delta_pct: profit.delta_pct == null ? null : toNumber(profit.delta_pct),
      is_up: typeof profit.is_up === 'boolean' ? profit.is_up : null,
      revenue: round2(profit.revenue),
      gross_profit: round2(profit.gross_profit),
    },
    tax: tax
      ? {
          amount: round2(tax.amount),
          net_gst: round2(tax.net_gst),
          payable: tax.payable !== false,
          quarter_label: tax.quarter_label || '',
          due_date: tax.due_date || null,
          period_from: tax.period_from || null,
          period_to: tax.period_to || null,
        }
      : null,
    receivables: {
      total: round2(recv.total),
      count: toNumber(recv.count),
      overdue: round2(recv.overdue),
    },
    payables: {
      total: round2(pay.total),
      count: toNumber(pay.count),
    },
    expenses: {
      total: round2(exp.total),
      top: Array.isArray(exp.top)
        ? exp.top.map((e) => ({
            code: e?.code ?? null,
            name: e?.name || 'Other',
            amount: round2(e?.amount),
          }))
        : [],
    },
    generated_at: p.generated_at || null,
  };
}

/** Whether the outlet's books have any posted journals yet. */
export function hasBooks(dashboard) {
  return !!(dashboard && dashboard.has_data);
}

// ─── Profit & Loss ───────────────────────────────────────────────────────────

/** Normalise the profit-loss payload. Accepts body or payload. */
export function extractProfitLoss(body) {
  const p = payload(body) || {};
  const rev = p.revenue || {};
  const exp = p.expenses || {};
  return {
    from: p.from || null,
    to: p.to || null,
    revenue: round2(rev.total),
    expenses: round2(exp.total),
    cogs: round2(p.cogs_total),
    grossProfit: round2(p.gross_profit),
    netProfit: round2(p.net_profit),
    revenueAccounts: Array.isArray(rev.accounts) ? rev.accounts : [],
    expenseAccounts: Array.isArray(exp.accounts) ? exp.accounts : [],
  };
}

// ─── BAS / GST ───────────────────────────────────────────────────────────────

/** Normalise the BAS payload. `amount` is the absolute net GST. */
export function extractBas(body) {
  const p = payload(body) || {};
  const netGst = round2(p.net_gst);
  return {
    from: p.from || null,
    to: p.to || null,
    netGst,
    amount: round2(Math.abs(netGst)),
    payable: p.payable !== false,
    gstOnSales: round2(p.gst_on_sales_1A),
    gstOnPurchases: round2(p.gst_on_purchases_1B),
    totalSales: round2(p.G1_total_sales),
    purchases: round2(p.G11_purchases),
  };
}

/** Human label for a BAS/GST position. */
export function taxLabel(tax) {
  if (!tax) return 'BAS / GST';
  return tax.payable === false ? 'GST refund' : 'BAS / GST due';
}

// ─── Receivables aging ───────────────────────────────────────────────────────

const EMPTY_BUCKETS = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };

/** Raw receivables rows (aged unpaid orders). Accepts body or payload. */
export function receivablesItems(body) {
  const p = payload(body);
  return Array.isArray(p?.items) ? p.items : [];
}

/** Normalise the receivables-aging payload into a stable shape. */
export function extractReceivables(body) {
  const p = payload(body) || {};
  const buckets = { ...EMPTY_BUCKETS };
  if (p.buckets && typeof p.buckets === 'object') {
    for (const k of Object.keys(EMPTY_BUCKETS)) {
      buckets[k] = round2(p.buckets[k]);
    }
  }
  const items = receivablesItems(body).map(normalizeReceivable);
  return {
    as_of: p.as_of || null,
    total: round2(p.total),
    buckets,
    items,
  };
}

/** One receivable row → stable, display-ready fields. */
export function normalizeReceivable(item = {}) {
  const days = Math.max(0, Math.trunc(toNumber(item.days)));
  return {
    ref: item.ref != null ? String(item.ref) : '',
    customer: item.customer || 'Walk-in customer',
    date: item.date || null,
    amount: round2(item.amount),
    days,
  };
}

/** Which aging bucket a day-count falls into (mirrors the backend). */
export function agingBucket(days) {
  const d = Math.max(0, toNumber(days));
  if (d <= 30) return '0-30';
  if (d <= 60) return '31-60';
  if (d <= 90) return '61-90';
  return '90+';
}

/** Severity token + label for a receivable's age, for colour + copy. */
export function receivableSeverity(days) {
  switch (agingBucket(days)) {
    case '31-60': return { key: 'watch', tone: 'neutral', label: '31–60 days' };
    case '61-90': return { key: 'overdue', tone: 'negative', label: '61–90 days' };
    case '90+': return { key: 'critical', tone: 'negative', label: '90+ days' };
    default: return { key: 'current', tone: 'positive', label: 'Current' };
  }
}

/** Sum of the overdue buckets (anything older than 30 days). */
export function overdueTotal(buckets) {
  const b = buckets && typeof buckets === 'object' ? buckets : EMPTY_BUCKETS;
  return round2(toNumber(b['31-60']) + toNumber(b['61-90']) + toNumber(b['90+']));
}

/** Newest-debt-first isn't useful; sort most-overdue first, then biggest. */
export function sortReceivables(items) {
  return (Array.isArray(items) ? items.slice() : []).sort(
    (a, b) => (toNumber(b?.days) - toNumber(a?.days)) || (toNumber(b?.amount) - toNumber(a?.amount))
  );
}

/** The N most-pressing receivables for the short list. */
export function topReceivables(items, n = 5) {
  return sortReceivables(items).slice(0, Math.max(0, toNumber(n, 5)));
}

// ─── KPI card model ──────────────────────────────────────────────────────────

/**
 * Build the four KPI card descriptors (Profit, Revenue, BAS due, Receivables)
 * from a normalised dashboard. Amounts are plain numbers — the screen formats
 * them via useCurrency. `tone` ∈ 'positive' | 'negative' | 'neutral'.
 */
export function buildKpis(dashboard) {
  const d = dashboard || extractDashboard(null);
  const profit = d.profit || {};
  const tax = d.tax || null;
  const recv = d.receivables || {};

  return [
    {
      key: 'profit',
      label: 'Profit (this month)',
      amount: round2(profit.this_month),
      icon: 'trending-up-outline',
      tone: toNumber(profit.this_month) < 0 ? 'negative' : 'positive',
      caption: formatDeltaPct(profit.delta_pct),
      deltaTone: deltaTone(profit.is_up),
    },
    {
      key: 'revenue',
      label: 'Revenue',
      amount: round2(profit.revenue),
      icon: 'cash-outline',
      tone: 'neutral',
      caption: d.period?.month_label || '',
    },
    {
      key: 'bas',
      label: taxLabel(tax),
      amount: tax ? round2(tax.amount) : 0,
      icon: 'document-text-outline',
      tone: tax && tax.payable === false ? 'positive' : 'neutral',
      caption: tax ? (tax.quarter_label || '') : 'No BAS data',
      due: tax ? tax.due_date : null,
    },
    {
      key: 'receivables',
      label: 'Receivables',
      amount: round2(recv.total),
      icon: 'download-outline',
      tone: 'neutral',
      caption: unpaidCaption(recv.count),
    },
  ];
}

/** "3 unpaid" / "1 unpaid" / "None outstanding". */
export function unpaidCaption(count) {
  const n = Math.max(0, Math.trunc(toNumber(count)));
  if (n <= 0) return 'None outstanding';
  return `${n} unpaid`;
}

// ─── Formatters ──────────────────────────────────────────────────────────────

/** "+12%" / "-8%" / "—" (null when there's no prior period to compare). */
export function formatDeltaPct(pct) {
  if (pct == null) return '—';
  const n = toNumber(pct);
  if (n === 0) return '0%';
  return `${n > 0 ? '+' : ''}${n}%`;
}

/** Which colour a month-over-month move should read as. */
export function deltaTone(isUp) {
  if (isUp === true) return 'positive';
  if (isUp === false) return 'negative';
  return 'neutral';
}

/** "In 12 days" / "Due today" / "5 days overdue" — a due-date countdown. */
export function dueInLabel(due, now = Date.now()) {
  if (!due) return '';
  const t = new Date(due).getTime();
  if (Number.isNaN(t)) return '';
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.round((t - now) / dayMs);
  if (days === 0) return 'Due today';
  if (days > 0) return `In ${days} day${days === 1 ? '' : 's'}`;
  const overdue = Math.abs(days);
  return `${overdue} day${overdue === 1 ? '' : 's'} overdue`;
}

/** Compact relative time; `now` injectable for deterministic tests. */
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
