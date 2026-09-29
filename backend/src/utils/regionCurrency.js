/**
 * @fileoverview Write-time region ↔ currency consistency enforcement.
 *
 * AU-region rows have drifted to currency 'INR' before (see
 * scripts/fix-region-currency.js — the one-off repair). This module is the
 * PREVENTION half: it normalizes head-office / outlet writes so a row can no
 * longer be created or updated with a currency that contradicts its region.
 *
 * Style: AUTO-CORRECT + warning log (never reject). Every existing caller
 * (registration, superadmin onboarding, wizard, settings routes) keeps
 * working; the write simply lands consistent. Only the two launch regions are
 * enforced — anything else (US/UK/AE test data) is left untouched.
 *
 * Wired centrally as a Prisma query extension in config/database.js so every
 * service path is covered without touching each call site.
 *
 * @module utils/regionCurrency
 */

const logger = require('../config/logger');

/** region code → the only currency it may have */
const REGION_CURRENCY = Object.freeze({ AU: 'AUD', IN: 'INR' });

/** region code → sensible default IANA timezone */
const REGION_TIMEZONE = Object.freeze({ AU: 'Australia/Sydney', IN: 'Asia/Kolkata' });

/**
 * Derive a region code from an Outlet's `country` value (outlets store a
 * country name, not a region column).
 * @param {*} country e.g. 'Australia', 'AU', 'India'
 * @returns {'AU'|'IN'|null} null when the country maps to no enforced region
 */
function regionFromCountry(country) {
  if (typeof country !== 'string') return null;
  const c = country.trim().toLowerCase();
  if (c === 'au' || c === 'aus' || c === 'australia') return 'AU';
  if (c === 'in' || c === 'ind' || c === 'india') return 'IN';
  return null;
}

/** Unwrap Prisma's `{ set: value }` update shape to the plain value. */
function plain(v) {
  return v && typeof v === 'object' && 'set' in v ? v.set : v;
}

/**
 * Normalize one head-office data payload in place.
 * @param {object} data Prisma `data` object for headOffice create/update
 * @param {object} [opts]
 * @param {boolean} [opts.isCreate] create semantics: also fill timezone/country_code defaults
 * @param {string|null} [opts.knownRegion] region resolved from the existing row / where clause
 *   (used when the payload sets currency without region)
 * @param {string} [opts.source] label for the warning log
 * @returns {object} the same data object, corrected
 */
function enforceHeadOffice(data, { isCreate = false, knownRegion = null, source = 'headOffice' } = {}) {
  if (!data || typeof data !== 'object') return data;

  // Region: explicit in the payload, else (create only) the schema default 'IN'.
  const region = plain(data.region) || (isCreate ? 'IN' : knownRegion);
  const expected = REGION_CURRENCY[region];
  if (!expected) return data; // unenforced region — leave untouched

  const currency = plain(data.currency);
  if (currency && currency !== expected) {
    logger.warn('[regionCurrency] corrected inconsistent currency on write', {
      source, region, given: currency, corrected: expected,
    });
    data.currency = expected;
  } else if (!currency && (isCreate || plain(data.region))) {
    // Creating (or changing region) without a currency → pin the right one so
    // the schema default (INR) can never leak onto an AU row.
    data.currency = expected;
  }

  if (isCreate) {
    if (!plain(data.timezone)) data.timezone = REGION_TIMEZONE[region];
    if (!plain(data.country_code)) data.country_code = region; // AU→AU, IN→IN
  }
  return data;
}

/**
 * Normalize one outlet data payload in place. Outlets carry `country` (name)
 * instead of a region column.
 * @param {object} data Prisma `data` object for outlet create/update
 * @param {object} [opts]
 * @param {boolean} [opts.isCreate]
 * @param {string|null} [opts.knownRegion] region resolved from the existing row's
 *   country or the parent head office (when the payload itself has no country)
 * @param {string} [opts.source]
 * @returns {object} the same data object, corrected
 */
function enforceOutlet(data, { isCreate = false, knownRegion = null, source = 'outlet' } = {}) {
  if (!data || typeof data !== 'object') return data;

  const region = regionFromCountry(plain(data.country)) || knownRegion;
  const expected = REGION_CURRENCY[region];
  if (!expected) return data;

  const currency = plain(data.currency);
  if (currency && currency !== expected) {
    logger.warn('[regionCurrency] corrected inconsistent outlet currency on write', {
      source, region, given: currency, corrected: expected,
    });
    data.currency = expected;
  } else if (!currency && (isCreate || plain(data.country))) {
    data.currency = expected;
  }

  if (isCreate) {
    if (!plain(data.timezone)) data.timezone = REGION_TIMEZONE[region];
    if (!plain(data.country)) data.country = region === 'AU' ? 'Australia' : 'India';
  }
  return data;
}

module.exports = {
  REGION_CURRENCY,
  REGION_TIMEZONE,
  regionFromCountry,
  enforceHeadOffice,
  enforceOutlet,
};
