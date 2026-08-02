/**
 * @fileoverview Proactive alerts — the "assistant that pings you".
 *
 * A registry of read-only ALERT RULES, each evaluated against the SAME services
 * the read tools use, permission-gated exactly like them. computeAlerts() runs
 * every rule the user may see and returns the active ones (severity-sorted).
 * Purely READ — alerts never mutate; they just surface what needs attention:
 *   • sales down vs the recent daily average
 *   • items running low / out of stock
 *   • GST (India) / BAS (Australia) return due soon
 *   • open fraud / loss-prevention alerts
 *
 * @module modules/assistant/assistant.alerts
 */

const logger = require('../../config/logger');
const reports = require('../reports/reports.service');
const inventory = require('../inventory/inventory.service');
const fraud = require('../fraud/fraud.service');

// ── permission (mirrors rbac.middleware.hasPermission) ───────────────────────
function userHasPerm(ctx, key) {
  if (!key) return true;
  if (ctx.role === 'super_admin' || ctx.role === 'owner') return true;
  return Array.isArray(ctx.permissions) && ctx.permissions.includes(key);
}

// ── date helpers ─────────────────────────────────────────────────────────────
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysBetween = (a, b) => Math.round((dateOnly(a) - dateOnly(b)) / 86400000);

/**
 * Next tax-return deadline for the region. AU → quarterly BAS (28 Oct / 28 Feb /
 * 28 Apr / 28 Jul). IN → monthly GSTR-3B (20th of the following month). `now`
 * injectable for tests.
 * @param {'AU'|'IN'} region
 * @param {Date} [now=new Date()]
 * @returns {{label:string, date:string, daysUntil:number}}
 */
function nextTaxDeadline(region, now = new Date()) {
  const from = dateOnly(now);
  if (region === 'AU') {
    const dueMonthDay = [[9, 28], [1, 28], [3, 28], [6, 28]]; // Oct, Feb, Apr, Jul (0-indexed months)
    let best = null;
    for (const yr of [now.getFullYear(), now.getFullYear() + 1]) {
      for (const [m, d] of dueMonthDay) {
        const dt = new Date(yr, m, d);
        if (dt >= from && (!best || dt < best)) best = dt;
      }
    }
    return { label: 'BAS', date: ymd(best), daysUntil: daysBetween(best, now) };
  }
  // India: GSTR-3B for a month is due on the 20th of the next month → next 20th.
  const due = now.getDate() <= 20 ? new Date(now.getFullYear(), now.getMonth(), 20)
    : new Date(now.getFullYear(), now.getMonth() + 1, 20);
  return { label: 'GST return', date: ymd(due), daysUntil: daysBetween(due, now) };
}

// ── ALERT RULES ──────────────────────────────────────────────────────────────
// evaluate(ctx) → { key, severity, title, message, cta? } | null
const RULES = [
  {
    key: 'low_stock',
    permission: 'VIEW_INVENTORY',
    async evaluate(ctx) {
      const items = await inventory.getLowStock(ctx.outletId);
      const list = Array.isArray(items) ? items : [];
      if (!list.length) return null;
      const out = list.filter((i) => (Number(i.current_stock) || 0) <= 0).length;
      const names = list.slice(0, 3).map((i) => i.name).filter(Boolean).join(', ');
      return {
        key: 'low_stock',
        severity: out > 0 ? 'high' : 'medium',
        title: `${list.length} item${list.length === 1 ? '' : 's'} running low`,
        message: `${out ? `${out} out of stock. ` : ''}${names ? `Low: ${names}${list.length > 3 ? '…' : ''}. ` : ''}Consider a purchase order.`,
        cta: 'Inventory',
      };
    },
  },
  {
    key: 'sales_drop',
    permission: 'VIEW_REPORTS',
    async evaluate(ctx, now = new Date()) {
      const yest = ymd(addDays(now, -1));
      const series = await reports.getRevenueTrendRange(ctx.outletId, ymd(addDays(now, -8)), yest);
      const byDate = {};
      for (const d of (Array.isArray(series) ? series : [])) byDate[d.date] = Number(d.revenue) || 0;
      const yestRev = byDate[yest] || 0;
      const priorVals = Object.keys(byDate).filter((k) => k !== yest).map((k) => byDate[k]).filter((v) => v > 0);
      if (yestRev <= 0 || priorVals.length < 3) return null; // not enough history / closed yesterday
      const avg = priorVals.reduce((s, v) => s + v, 0) / priorVals.length;
      if (avg <= 0) return null;
      const pct = Math.round(((yestRev - avg) / avg) * 100);
      if (pct > -20) return null; // only flag a meaningful drop
      return {
        key: 'sales_drop',
        severity: pct <= -35 ? 'high' : 'medium',
        title: `Sales down ${Math.abs(pct)}% yesterday`,
        message: `Yesterday's revenue was ${Math.abs(pct)}% below your recent daily average.`,
        cta: 'Reports',
      };
    },
  },
  {
    key: 'tax_due',
    permission: 'VIEW_REPORTS',
    async evaluate(ctx, now = new Date()) {
      const region = ctx.currency === 'AUD' ? 'AU' : 'IN';
      const d = nextTaxDeadline(region, now);
      if (d.daysUntil < 0 || d.daysUntil > 14) return null;
      return {
        key: 'tax_due',
        severity: d.daysUntil <= 3 ? 'high' : 'medium',
        title: `${d.label} due in ${d.daysUntil} day${d.daysUntil === 1 ? '' : 's'}`,
        message: `Your ${d.label} is due on ${d.date}. Get your numbers ready.`,
        cta: region === 'AU' ? 'GST & BAS' : 'GST returns',
      };
    },
  },
  {
    key: 'fraud_open',
    permission: 'VIEW_REPORTS',
    async evaluate(ctx) {
      const r = await fraud.listAlerts(ctx.outletId, { unread_only: true, limit: 5 });
      const total = r && (typeof r.total === 'number' ? r.total : (Array.isArray(r.items) ? r.items.length : 0));
      if (!total) return null;
      return {
        key: 'fraud_open',
        severity: 'high',
        title: `${total} fraud alert${total === 1 ? '' : 's'} to review`,
        message: `Loss-prevention flagged ${total} event${total === 1 ? '' : 's'} that need${total === 1 ? 's' : ''} your attention.`,
        cta: 'Fraud Detection',
      };
    },
  },
];

const SEV_ORDER = { high: 0, medium: 1, low: 2 };

/**
 * Evaluate every rule the user may see; return active alerts, severity-sorted.
 * A rule that throws is skipped (never breaks the whole set).
 * @param {{role, outletId, permissions, currency?}} ctx
 * @param {Date} [now]
 * @returns {Promise<Array<{key,severity,title,message,cta?}>>}
 */
async function computeAlerts(ctx, now = new Date()) {
  if (!ctx || !ctx.outletId) return [];
  const rules = RULES.filter((r) => userHasPerm(ctx, r.permission));
  const results = await Promise.all(rules.map(async (r) => {
    try { return await r.evaluate(ctx, now); }
    catch (e) { logger.warn('assistant alert rule failed', { key: r.key, error: e.message }); return null; }
  }));
  return results.filter(Boolean).sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
}

module.exports = { computeAlerts, nextTaxDeadline, RULES, userHasPerm };
