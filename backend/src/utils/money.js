/**
 * @fileoverview Money/rounding helpers shared across the order engine.
 * All currency arithmetic in the order/pricing services accumulates in integer
 * paise/cents and rounds back to 2 decimals via {@link round2}. Centralising the
 * rounding rule guarantees byte-identical totals across every write path.
 * @module utils/money
 */

/**
 * Round a currency amount to 2 decimal places (nearest paise/cent).
 * Equivalent to the inline `Math.round(x * 100) / 100` used throughout the order
 * service — kept identical so totals do not shift.
 * @param {number} n - Amount in major currency units
 * @returns {number} Amount rounded to 2 decimals
 */
function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Convert a currency amount (major units) to integer minor units (paise/cents).
 * @param {number} n - Amount in major currency units
 * @returns {number} Integer minor units
 */
function toCents(n) {
  return Math.round(Number(n) * 100);
}

/**
 * Convert integer minor units (paise/cents) back to major currency units.
 * @param {number} cents - Amount in minor units
 * @returns {number} Amount in major currency units
 */
function fromCents(cents) {
  return Math.round(cents) / 100;
}

module.exports = { round2, toCents, fromCents };
