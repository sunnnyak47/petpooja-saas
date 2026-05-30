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
  const hoCountry = outlet.head_office?.country_code;
  const isAU = hoCountry === 'AU' || outlet.currency === 'AUD' || outlet.country === 'Australia';
  const countryCode = hoCountry || (isAU ? 'AU' : 'IN');
  // AU GST is inclusive by law — default true when head_office is missing
  const gstInclusive = outlet.head_office?.gst_inclusive ?? (isAU ? true : false);
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
