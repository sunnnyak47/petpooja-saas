/**
 * @fileoverview Shared report helpers — date boundaries, rounding, payment-method
 * classification, and a canonical "valid order" WHERE clause. Centralising these
 * removes the date/round/payment boilerplate that was duplicated ~10× across
 * reports.service.js and prep-analytics.service.js.
 *
 * @module modules/reports/report-helpers
 */

/**
 * Round a number to 2 decimal places (currency precision).
 * Mirrors the `Math.round(n * 100) / 100` idiom used throughout the reports code.
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/**
 * Classify a raw payment method string into one of four canonical buckets.
 * Consolidates the duplicated `method === 'cash' / includes('card') / includes('upi')`
 * logic from getDailySales and getPaymentBreakdown.
 * @param {string} method - Raw method/split method string.
 * @returns {'cash'|'card'|'upi'|'other'}
 */
function classifyPaymentMethod(method) {
  const m = String(method || '').toLowerCase();
  if (m === 'cash') return 'cash';
  if (m.includes('card')) return 'card';
  if (m.includes('upi')) return 'upi';
  return 'other';
}

/**
 * Compute a consistent date range for report queries.
 *
 * Preferred semantics are a half-open interval `[gte start, lt nextDay)` which
 * avoids the millisecond edge cases of the legacy `lte <day>T23:59:59.999`
 * pattern while selecting the same rows. When only one bound is supplied the
 * other defaults to "today".
 *
 * TIMEZONE: boundaries are currently computed in the *server* local timezone via
 * Date#setHours, matching all pre-existing report behaviour. An `outletTz`
 * (IANA name, e.g. "Asia/Kolkata") may be passed; it is accepted and surfaced on
 * the return value so callers can thread it through, but day boundaries are NOT
 * yet shifted into that zone. Centralising the calculation here means the
 * timezone fix can be applied in exactly one place later.
 * TODO(reports-tz): honour `outletTz` when bucketing day boundaries (requires a
 * tz library or Intl-based offset calc) so IST outlets on a UTC server get
 * correct day cut-offs and non-shifted heatmaps.
 *
 * @param {string|Date} [from] - Start date (YYYY-MM-DD or Date). Defaults to today.
 * @param {string|Date} [to] - End date (inclusive day). Defaults to today.
 * @param {string} [outletTz] - Optional IANA outlet timezone (currently informational).
 * @returns {{ start: Date, end: Date, tz: (string|null) }} Half-open range:
 *   `start` (inclusive, 00:00:00) and `end` (exclusive, next day 00:00:00).
 */
function getDateRange(from, to, outletTz) {
  const start = from ? new Date(from) : new Date();
  start.setHours(0, 0, 0, 0);

  // `end` is the EXCLUSIVE upper bound = start of the day after `to`.
  const end = to ? new Date(to) : new Date(start);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);

  return { start, end, tz: outletTz || null };
}

/**
 * Canonical WHERE clause for "valid revenue-bearing" orders within a range.
 * Standardises the inconsistent status filters scattered across reports — some
 * omitted `voided` or `is_deleted`. Uses the half-open `[gte, lt)` boundary.
 *
 * @param {string} outletId - Outlet UUID.
 * @param {string|Date} [from] - Start date.
 * @param {string|Date} [to] - End date (inclusive day).
 * @param {string} [outletTz] - Optional outlet timezone (forwarded to getDateRange).
 * @returns {object} Prisma `where` fragment for the Order model.
 */
function validOrderWhere(outletId, from, to, outletTz) {
  const { start, end } = getDateRange(from, to, outletTz);
  return {
    outlet_id: outletId,
    is_deleted: false,
    status: { notIn: ['cancelled', 'voided'] },
    created_at: { gte: start, lt: end },
  };
}

module.exports = {
  round2,
  classifyPaymentMethod,
  getDateRange,
  validOrderWhere,
};
