/**
 * @fileoverview Owner Mode dashboard — a plain-language summary of the books for
 * non-accountant owners. Aggregates the existing double-entry reports (P&L, BAS,
 * receivables/payables aging) into the five questions an owner actually asks:
 * "how am I doing?", "what tax do I owe?", "who owes me?", "what do I owe?",
 * "where does my money go?". Read-only; adds no new posting logic.
 *
 * AU-first: the double-entry ledger is AU-only today, so this reads meaningfully
 * for Australian outlets. It degrades gracefully (zeros + has_data:false) when a
 * chart/ledger hasn't been seeded yet.
 * @module modules/accounting/accounting.owner.service
 */

const { getDbClient } = require('../../config/database');
const statements = require('./accounting.statements.service');
const bas = require('./accounting.bas.service');
const aging = require('./accounting.aging.service');
const logger = require('../../config/logger');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Local YYYY-MM-DD (report services accept plain date strings). */
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthLabel(d) {
  return d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

/**
 * Australian BAS quarter (financial year runs Jul–Jun) for the given date,
 * with the standard quarterly lodgement due date.
 */
function basQuarter(now) {
  const m = now.getMonth(); // 0–11
  const y = now.getFullYear();
  if (m >= 6 && m <= 8) return { qStart: new Date(y, 6, 1), qEnd: new Date(y, 8, 30), dueDate: new Date(y, 9, 28), label: `Jul–Sep ${y}` };
  if (m >= 9 && m <= 11) return { qStart: new Date(y, 9, 1), qEnd: new Date(y, 11, 31), dueDate: new Date(y + 1, 1, 28), label: `Oct–Dec ${y}` };
  if (m >= 0 && m <= 2) return { qStart: new Date(y, 0, 1), qEnd: new Date(y, 2, 31), dueDate: new Date(y, 3, 28), label: `Jan–Mar ${y}` };
  return { qStart: new Date(y, 3, 1), qEnd: new Date(y, 5, 30), dueDate: new Date(y, 6, 28), label: `Apr–Jun ${y}` };
}

/**
 * Builds the Owner Mode dashboard payload for an outlet.
 * @param {string} outletId
 * @returns {Promise<object>}
 */
async function getOwnerDashboard(outletId) {
  const prisma = getDbClient();
  const now = new Date();

  // This month, month-to-date.
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  // Previous month over the SAME span (fair MTD comparison), clamped so a
  // day-of-month that doesn't exist in the previous month rolls back to its end.
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const prevSameDay = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  const prevEnd = prevSameDay > prevMonthEnd ? prevMonthEnd : prevSameDay;

  const q = basQuarter(now);

  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId },
    select: { name: true, currency: true, country: true, head_office: { select: { region: true } } },
  }).catch(() => null);

  const [pl, plPrev, basRep, recv, pay, journalCount] = await Promise.all([
    statements.getProfitAndLoss(outletId, ymd(monthStart), ymd(now)).catch((e) => { logger.warn('owner: P&L failed', { error: e.message }); return null; }),
    statements.getProfitAndLoss(outletId, ymd(prevMonthStart), ymd(prevEnd)).catch(() => null),
    bas.getBASReport(outletId, ymd(q.qStart), ymd(q.qEnd)).catch((e) => { logger.warn('owner: BAS failed', { error: e.message }); return null; }),
    aging.getReceivablesAging(outletId).catch(() => null),
    aging.getPayablesAging(outletId).catch(() => null),
    prisma.journalEntry.count({ where: { outlet_id: outletId, is_deleted: false } }).catch(() => 0),
  ]);

  const netThis = round2(pl?.net_profit ?? 0);
  const netPrev = round2(plPrev?.net_profit ?? 0);
  const deltaPct = netPrev !== 0 ? Math.round(((netThis - netPrev) / Math.abs(netPrev)) * 100) : null;

  const topExpenses = (pl?.expenses?.accounts || [])
    .filter((a) => Number(a.amount) > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((a) => ({ code: a.code, name: a.name, amount: round2(a.amount) }));

  const recvOverdue = recv?.buckets
    ? round2((recv.buckets['31-60'] || 0) + (recv.buckets['61-90'] || 0) + (recv.buckets['90+'] || 0))
    : 0;

  return {
    currency: outlet?.currency || 'AUD',
    region: outlet?.head_office?.region || (outlet?.country === 'Australia' ? 'AU' : 'IN'),
    outlet_name: outlet?.name || null,
    has_data: journalCount > 0,
    period: { month_label: monthLabel(now), from: ymd(monthStart), to: ymd(now) },
    profit: {
      this_month: netThis,
      prev_month: netPrev,
      delta_pct: deltaPct,
      is_up: deltaPct === null ? null : deltaPct >= 0,
      revenue: round2(pl?.revenue?.total ?? 0),
      gross_profit: round2(pl?.gross_profit ?? 0),
    },
    tax: basRep ? {
      amount: round2(Math.abs(basRep.net_gst)),
      net_gst: round2(basRep.net_gst),
      payable: basRep.payable,
      quarter_label: q.label,
      due_date: ymd(q.dueDate),
      period_from: ymd(q.qStart),
      period_to: ymd(q.qEnd),
    } : null,
    receivables: { total: round2(recv?.total ?? 0), count: recv?.items?.length ?? 0, overdue: recvOverdue },
    payables: { total: round2(pay?.total ?? 0), count: pay?.items?.length ?? 0 },
    expenses: { top: topExpenses, total: round2(pl?.expenses?.total ?? 0) },
    generated_at: now.toISOString(),
  };
}

module.exports = { getOwnerDashboard, basQuarter, ymd };
