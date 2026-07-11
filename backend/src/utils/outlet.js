/**
 * @fileoverview Outlet tax-config resolution shared by the order write paths.
 * Collapses the country/inclusive/default-rate detection that was copy-pasted
 * into createOrder and punchKOT. Reproduces the exact logic from
 * order.service.createOrder so totals and slabs stay byte-identical.
 * @module utils/outlet
 */

/**
 * Derive the outlet tax configuration from an already-fetched outlet row.
 *
 * The caller must have loaded the outlet WITH its `head_office` relation
 * (selecting at least `country_code`, `gst_inclusive`). Country code is detected
 * from multiple signals (head_office.country_code > AUD currency / Australia
 * country), AU GST is forced inclusive when head_office is absent, and the
 * default GST rate is 10% (AU) or 5% (IN).
 *
 * @param {object} outlet - Outlet row including `head_office`, `currency`, `country`, `state`
 * @returns {{ country_code: string, gst_inclusive: boolean, default_gst_rate: number, state: string }}
 */
function resolveOutletTaxConfig(outlet) {
  const ho = outlet.head_office;
  // Detect AU from EVERY available signal — must match the frontend (useRegion) so the
  // stored total equals the inclusive price shown at the POS. Self-signup set region but
  // left country_code null, so region/currency must be considered too.
  const hoCountry = ho?.country_code;
  const isAU = hoCountry === 'AU' || ho?.region === 'AU'
    || outlet.currency === 'AUD' || ho?.currency === 'AUD' || outlet.country === 'Australia';
  // ANY AU signal must win over a mis-seeded head_office.country_code='IN'
  // (matches getOutletTaxConfig) — otherwise a genuine AU outlet is taxed as
  // India (5% CGST/SGST) instead of a single 10% GST.
  const countryCode = isAU ? 'AU' : (hoCountry || 'IN');
  // AU GST is inclusive by law — ALWAYS true for AU, even if the DB column was left false
  // (self-signup defaulted gst_inclusive=false). ?? would keep that false, so use an
  // explicit ternary. Non-AU honours the stored flag (defaults false).
  const gstInclusive = isAU ? true : (ho?.gst_inclusive ?? false);
  // Default GST rate to apply when a menu item has no gst_rate configured (0 or null)
  const defaultGstRate = countryCode === 'AU' ? 10 : 5;

  return {
    country_code: countryCode,
    gst_inclusive: gstInclusive,
    default_gst_rate: defaultGstRate,
    state: outlet.state || '',
  };
}

module.exports = { resolveOutletTaxConfig };
