/**
 * @fileoverview Shared report helpers — date boundaries, rounding, payment-method
 * classification, and a canonical "valid order" WHERE clause. Centralising these
 * removes the date/round/payment boilerplate that was duplicated ~10× across
 * reports.service.js and prep-analytics.service.js.
 *
 * @module modules/reports/report-helpers
 */

/**
 * Default IANA timezone for report day/hour bucketing. Overridable per-deploy via
 * REPORT_TZ. Most outlets are IST; Australian markets can set REPORT_TZ or pass an
 * explicit `tz` per call. Mirrors the Outlet.timezone schema default.
 * @type {string}
 */
const DEFAULT_TZ = process.env.REPORT_TZ || 'Asia/Kolkata';

/**
 * Validate an IANA timezone name for safe embedding in raw SQL (`AT TIME ZONE`).
 * Accepts simple `Area/Location` names (e.g. "Asia/Kolkata", "Australia/Sydney")
 * and bare UTC. Anything else falls back to DEFAULT_TZ to avoid SQL injection.
 * @param {string} [tz]
 * @returns {string} A safe tz name.
 */
function safeTz(tz) {
  const t = String(tz || '').trim();
  if (t === 'UTC' || /^[A-Za-z_]+\/[A-Za-z_]+$/.test(t)) return t;
  return DEFAULT_TZ;
}

/**
 * Format a Date as a `YYYY-MM-DD` local day key in the given timezone.
 * Replaces the legacy `date.toISOString().split('T')[0]` (UTC) bucketing so orders
 * near midnight land on the correct local day. Guards invalid dates.
 * @param {Date|string|number} d
 * @param {string} [tz=DEFAULT_TZ]
 * @returns {string|null} `YYYY-MM-DD` or null if the date is invalid.
 */
function dayKeyInTz(d, tz = DEFAULT_TZ) {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return null;
  // en-CA renders ISO-style YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz(tz), year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

/**
 * Get the local hour-of-day (0–23) for a Date in the given timezone.
 * Replaces legacy `new Date(...).getHours()` (server-local) bucketing.
 * @param {Date|string|number} d
 * @param {string} [tz=DEFAULT_TZ]
 * @returns {number|null} 0–23, or null if the date is invalid.
 */
function hourInTz(d, tz = DEFAULT_TZ) {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return null;
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: safeTz(tz), hour: '2-digit', hour12: false,
  }).format(date);
  // en-GB can render "24" at midnight in some runtimes; normalise to 0.
  const n = parseInt(h, 10);
  return Number.isFinite(n) ? n % 24 : null;
}

/**
 * Get the local day-of-week (0=Sun … 6=Sat) for a Date in the given timezone.
 * Replaces legacy `new Date(...).getDay()` (server-local) bucketing for heatmaps.
 * @param {Date|string|number} d
 * @param {string} [tz=DEFAULT_TZ]
 * @returns {number|null} 0–6, or null if the date is invalid.
 */
function weekdayInTz(d, tz = DEFAULT_TZ) {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return null;
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz(tz), weekday: 'short',
  }).format(date);
  const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
  return idx === -1 ? null : idx;
}

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
 * TIMEZONE: day boundaries are computed in `outletTz` (IANA name, e.g.
 * "Asia/Kolkata"), defaulting to DEFAULT_TZ. The returned `start`/`end` are real
 * UTC instants corresponding to local-midnight cut-offs in that zone, so an IST
 * outlet on a UTC server gets the correct day window (e.g. "2026-06-05" →
 * 2026-06-04T18:30:00Z .. 2026-06-05T18:30:00Z). The calculation is centralised
 * here so every report shares the same correct boundaries.
 *
 * @param {string|Date} [from] - Start date (YYYY-MM-DD or Date). Defaults to today.
 * @param {string|Date} [to] - End date (inclusive day). Defaults to today.
 * @param {string} [outletTz=DEFAULT_TZ] - IANA outlet timezone for day cut-offs.
 * @returns {{ start: Date, end: Date, tz: string }} Half-open range:
 *   `start` (inclusive, local 00:00) and `end` (exclusive, next local day 00:00).
 */
function getDateRange(from, to, outletTz) {
  const tz = safeTz(outletTz);
  // Anchor on the *local* calendar day in `tz` rather than the server's clock so
  // a date string like "2026-06-05" means that day in the outlet's timezone.
  const fromKey = dayKeyInTz(from || new Date(), tz);
  const toKey = dayKeyInTz(to || from || new Date(), tz);

  const start = zonedDayStart(fromKey, tz);
  // `end` is the EXCLUSIVE upper bound = start of the day AFTER `to`.
  const end = zonedDayStart(nextDayKey(toKey), tz);

  return { start, end, tz };
}

/**
 * Given a `YYYY-MM-DD` day key and an IANA tz, return the UTC Date instant that
 * corresponds to local 00:00:00 of that day in that zone.
 * @param {string} dayKey - `YYYY-MM-DD`.
 * @param {string} tz - IANA timezone (already validated upstream).
 * @returns {Date}
 */
function zonedDayStart(dayKey, tz) {
  // Provisional UTC midnight for the day, then correct by the zone's offset at
  // that moment (handles +05:30, DST-aware AU zones, etc.).
  const provisional = new Date(`${dayKey}T00:00:00Z`);
  const offsetMin = tzOffsetMinutes(provisional, tz);
  return new Date(provisional.getTime() - offsetMin * 60 * 1000);
}

/**
 * Offset (minutes) of `tz` from UTC at instant `date`: local = utc + offset.
 * Computed via Intl so it is DST-aware without external libraries.
 * @param {Date} date
 * @param {string} tz
 * @returns {number}
 */
function tzOffsetMinutes(date, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  return Math.round((asUTC - date.getTime()) / 60000);
}

/**
 * Advance a `YYYY-MM-DD` day key by one calendar day.
 * @param {string} dayKey
 * @returns {string} `YYYY-MM-DD`
 */
function nextDayKey(dayKey) {
  const d = new Date(`${dayKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
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
  DEFAULT_TZ,
  safeTz,
  dayKeyInTz,
  hourInTz,
  weekdayInTz,
  round2,
  classifyPaymentMethod,
  getDateRange,
  validOrderWhere,
};
