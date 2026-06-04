/**
 * @fileoverview Square staff performance fetcher — computes sales, tips and
 * order counts per team member from a merchant's payments over a date range,
 * for the Phase-2 analytics dashboard. Paginates `/v2/payments`, attributes
 * each COMPLETED/APPROVED payment to its team/employee id, then resolves
 * human-readable names via `/v2/team-members/search`.
 *
 * Square money amounts arrive in CENTS; normalise with toDollars(). Many
 * merchants lack PAYMENTS_READ or EMPLOYEES_READ scope, so any failure is
 * swallowed and reported as `{ available: false }` — this never throws.
 *
 * @module modules/performance/square.fetch.staff
 */
const { sqGet, sqPost, toDollars, MAX_PAGES } = require('./square.http');
const logger = require('../../config/logger');

module.exports = { fetchStaffPerformance };

/**
 * Summarise sales & tips per staff member for a Square location/date range.
 * @param {object} ctx - Square API context { apiBase, accessToken, version, locationId, currency }.
 * @param {string} locationId - Square location id (reserved; payments are filtered by time).
 * @param {string} beginISO - ISO timestamp for the start of the window.
 * @param {string} endISO - ISO timestamp for the end of the window.
 * @returns {Promise<object>} { available, top_staff?: [{ name, sales, orders, tips }] }.
 */
async function fetchStaffPerformance(ctx, locationId, beginISO, endISO) {
  try {
    // Accumulate cents per staff id across all payment pages.
    const byStaff = new Map(); // sid -> { sales, tips, orders }
    let cursor;
    let pages = 0;

    do {
      let path =
        `/v2/payments?begin_time=${encodeURIComponent(beginISO)}` +
        `&end_time=${encodeURIComponent(endISO)}&sort_order=ASC&limit=100`;
      if (cursor) path += `&cursor=${encodeURIComponent(cursor)}`;

      const data = await sqGet(ctx, path);
      const payments = data.payments || [];

      for (const p of payments) {
        if (p.status !== 'COMPLETED' && p.status !== 'APPROVED') continue;
        const sid = p.team_member_id || p.employee_id || 'unattributed';
        const acc = byStaff.get(sid) || { sales: 0, tips: 0, orders: 0 };
        acc.sales += Number(p.amount_money?.amount) || 0;
        acc.tips += Number(p.tip_money?.amount) || 0;
        acc.orders += 1;
        byStaff.set(sid, acc);
      }

      cursor = data.cursor;
      pages += 1;
    } while (cursor && pages < MAX_PAGES);

    if (byStaff.size === 0) return { available: false };

    // Resolve staff ids → display names. Best-effort; tolerate a 403.
    const nameById = new Map();
    try {
      const data = await sqPost(ctx, '/v2/team-members/search', {
        query: { filter: {} },
        limit: 200,
      });
      for (const m of data.team_members || []) {
        if (!m.id) continue;
        nameById.set(m.id, `${m.given_name || ''} ${m.family_name || ''}`.trim());
      }
    } catch (e) {
      logger.warn('[SquarePull] team-members lookup unavailable', { error: e.message });
    }

    const topStaff = [];
    for (const [sid, acc] of byStaff) {
      let name;
      if (sid === 'unattributed') {
        name = 'Unattributed';
      } else {
        name = nameById.get(sid) || sid || 'Staff';
      }
      topStaff.push({
        name,
        sales: toDollars(acc.sales),
        orders: acc.orders,
        tips: toDollars(acc.tips),
      });
    }

    topStaff.sort((a, b) => b.sales - a.sales);

    return { available: true, top_staff: topStaff.slice(0, 8) };
  } catch (e) {
    logger.warn('[SquarePull] staff performance unavailable', { error: e.message });
    return { available: false };
  }
}
