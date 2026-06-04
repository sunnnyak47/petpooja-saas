/**
 * @fileoverview Square cash-drawer fetcher — summarises a merchant's
 * cash-drawer shifts (expected vs actual cash, over/short) over a date range
 * for the Phase-2 analytics dashboard. Paginates `/v2/cash-drawers/shifts`
 * and aggregates the closed shifts.
 *
 * Square money amounts arrive in CENTS; normalise with toDollars(). Many
 * merchants lack the CASH_DRAWER_READ scope, so any failure is swallowed and
 * reported as `{ available: false }` — this never throws.
 *
 * @module modules/performance/square.fetch.cashdrawer
 */
const { sqGet, toDollars, MAX_PAGES } = require('./square.http');
const logger = require('../../config/logger');

module.exports = { fetchCashDrawer };

/**
 * Summarise cash-drawer shifts for a Square location/date range.
 * @param {object} ctx - Square API context { apiBase, accessToken, version, locationId, currency }.
 * @param {string} locationId - Square location id (required).
 * @param {string} beginISO - ISO timestamp for the start of the window.
 * @param {string} endISO - ISO timestamp for the end of the window.
 * @returns {Promise<object>} { available, shifts?, expected_total?, actual_total?, over_short? }.
 */
async function fetchCashDrawer(ctx, locationId, beginISO, endISO) {
  if (!locationId) return { available: false };

  try {
    // Accumulate cents across all closed shifts on every page.
    let shifts = 0;
    let expectedCents = 0;
    let actualCents = 0;
    let cursor;
    let pages = 0;

    do {
      let path =
        `/v2/cash-drawers/shifts?location_id=${encodeURIComponent(locationId)}` +
        `&begin_time=${encodeURIComponent(beginISO)}` +
        `&end_time=${encodeURIComponent(endISO)}&sort_order=ASC&limit=100`;
      if (cursor) path += `&cursor=${encodeURIComponent(cursor)}`;

      const data = await sqGet(ctx, path);
      const drawerShifts = data.cash_drawer_shifts || [];

      for (const s of drawerShifts) {
        // Only aggregate closed shifts (those with a closed_cash_money sum).
        if (!s.closed_cash_money) continue;
        shifts += 1;
        expectedCents += Number(s.expected_cash_money?.amount) || 0;
        actualCents += Number(s.closed_cash_money?.amount) || 0;
      }

      cursor = data.cursor;
      pages += 1;
    } while (cursor && pages < MAX_PAGES);

    if (shifts === 0) return { available: false };

    const expected_total = toDollars(expectedCents);
    const actual_total = toDollars(actualCents);
    const over_short = toDollars(actualCents - expectedCents);

    return { available: true, shifts, expected_total, actual_total, over_short };
  } catch (e) {
    logger.warn('[SquarePull] cash drawer unavailable', { error: e.message });
    return { available: false };
  }
}
