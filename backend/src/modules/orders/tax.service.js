/**
 * @fileoverview Tax calculation engine for GST across Australian and Indian tax regimes.
 *
 * Supports:
 *   - Australia: flat 10% GST with inclusive/exclusive pricing
 *   - India: multi-slab GST (5/12/18/28%) with CGST+SGST (intra-state) or IGST (inter-state) split, plus cess
 *
 * All internal arithmetic uses integer paise/cents to eliminate floating-point errors.
 * Inputs and outputs are in standard currency units (rupees/dollars) with 2-decimal precision.
 *
 * @module modules/orders/tax.service
 */

// ---------------------------------------------------------------------------
// Helpers — integer math
// ---------------------------------------------------------------------------

/**
 * Convert a currency amount (dollars/rupees) to the smallest unit (cents/paise).
 * @param {number} amount - Amount in major currency units
 * @returns {number} Amount in minor currency units (integer)
 */
function toPaise(amount) {
  return Math.round(Number(amount) * 100);
}

/**
 * Convert paise/cents back to major currency units, rounded to 2 decimals.
 * @param {number} paise - Amount in minor currency units
 * @returns {number} Amount in major currency units
 */
function toMajor(paise) {
  return Math.round(paise) / 100;
}

// ---------------------------------------------------------------------------
// Default GST rate lookup
// ---------------------------------------------------------------------------

/**
 * Indian GST rate table keyed by food type.
 * @type {Record<string, number>}
 */
const INDIA_GST_RATES = {
  restaurant_food: 5,   // 5% — no ITC for restaurant services
  packed_food: 12,      // 12% — branded/packed food items
  beverage: 18,         // 18% — non-alcoholic beverages, processed foods
  alcohol: 28,          // 28% — alcohol, tobacco, luxury items
};

/**
 * Cess rates for specific categories in India (percent on base price).
 * Only alcohol/tobacco currently attracts cess.
 * @type {Record<string, number>}
 */
const INDIA_CESS_RATES = {
  alcohol: 12,   // compensation cess on alcohol/tobacco
};

/**
 * Lookup the default GST rate for a food type and country.
 *
 * @param {string} food_type - One of 'restaurant_food' | 'packed_food' | 'beverage' | 'alcohol'
 * @param {string} country_code - 'AU' or 'IN'
 * @returns {{ gst_rate: number, cess_rate: number, description: string }}
 *   gst_rate  — percentage (e.g. 5, 10, 18)
 *   cess_rate — additional cess percentage (0 for AU)
 *   description — human-readable label
 * @throws {Error} If country_code or food_type is unsupported
 *
 * @example
 * getGSTRate('restaurant_food', 'IN');
 * // => { gst_rate: 5, cess_rate: 0, description: 'Restaurant food — 5% GST (no ITC)' }
 */
function getGSTRate(food_type, country_code) {
  const code = (country_code || '').toUpperCase();

  if (code === 'AU') {
    return {
      gst_rate: 10,
      cess_rate: 0,
      description: 'Australian GST — flat 10%',
    };
  }

  if (code === 'IN') {
    const rate = INDIA_GST_RATES[food_type];
    if (rate === undefined) {
      throw new Error(`Unknown food_type "${food_type}" for Indian GST lookup`);
    }
    const cess = INDIA_CESS_RATES[food_type] || 0;

    const labels = {
      restaurant_food: `Restaurant food — ${rate}% GST (no ITC)`,
      packed_food: `Packed/branded food — ${rate}% GST`,
      beverage: `Beverage/processed food — ${rate}% GST`,
      alcohol: `Alcohol/tobacco — ${rate}% GST + ${cess}% cess`,
    };

    return {
      gst_rate: rate,
      cess_rate: cess,
      description: labels[food_type],
    };
  }

  throw new Error(`Unsupported country_code "${country_code}". Use "AU" or "IN".`);
}

// ---------------------------------------------------------------------------
// Single-item tax calculation
// ---------------------------------------------------------------------------

/**
 * Calculate tax components for a single order item.
 *
 * @param {Object} item - Item details
 * @param {number} item.base_price      - Unit price in major currency (rupees/dollars)
 * @param {number} item.quantity         - Number of units (defaults to 1)
 * @param {number} item.gst_rate        - GST percentage (e.g. 5, 10, 18, 28)
 * @param {boolean} [item.is_inclusive=false] - Whether base_price already includes GST
 * @param {number} [item.cess_rate=0]   - Additional cess percentage (India only)
 * @param {string} [item.food_type]     - Used to auto-lookup cess if cess_rate not provided
 *
 * @param {Object} outletConfig - Outlet/restaurant configuration
 * @param {string} outletConfig.country_code - 'AU' or 'IN'
 * @param {string} [outletConfig.state]      - Outlet state (used for CGST/SGST vs IGST split in India)
 * @param {string} [outletConfig.outlet_state] - Alias for state (checked if state is absent)
 *
 * @returns {{
 *   taxable_amount: number,
 *   cgst: number,
 *   sgst: number,
 *   igst: number,
 *   cess: number,
 *   total_tax: number,
 *   tax_inclusive_price: number
 * }}
 *
 * @example
 * // AU inclusive item: $11 meal includes 10% GST
 * calculateItemTax(
 *   { base_price: 11, quantity: 1, gst_rate: 10, is_inclusive: true },
 *   { country_code: 'AU' }
 * );
 * // => { taxable_amount: 10, cgst: 0, sgst: 0, igst: 0, cess: 0, total_tax: 1, tax_inclusive_price: 11 }
 */
function calculateItemTax(item, outletConfig) {
  const country = (outletConfig.country_code || '').toUpperCase();
  const qty = Number(item.quantity) || 1;
  const gstRate = Number(item.gst_rate) || 0;
  const isInclusive = Boolean(item.is_inclusive);

  // Determine cess rate (India only)
  let cessRate = 0;
  if (country === 'IN') {
    if (item.cess_rate !== undefined && item.cess_rate !== null) {
      cessRate = Number(item.cess_rate);
    } else if (item.food_type && INDIA_CESS_RATES[item.food_type]) {
      cessRate = INDIA_CESS_RATES[item.food_type];
    }
  }

  // Work in paise/cents
  const lineTotalPaise = toPaise(item.base_price) * qty;

  let taxableAmountPaise;
  let gstAmountPaise;
  let cessAmountPaise;

  if (isInclusive) {
    // Price already includes GST (and cess for IN)
    // taxable = total / (1 + combined_rate/100)
    const combinedRate = gstRate + cessRate;
    taxableAmountPaise = Math.round((lineTotalPaise * 10000) / (10000 + combinedRate * 100));
    gstAmountPaise = Math.round((taxableAmountPaise * gstRate * 100) / 10000);
    cessAmountPaise = Math.round((taxableAmountPaise * cessRate * 100) / 10000);
  } else {
    taxableAmountPaise = lineTotalPaise;
    gstAmountPaise = Math.round((taxableAmountPaise * gstRate * 100) / 10000);
    cessAmountPaise = Math.round((taxableAmountPaise * cessRate * 100) / 10000);
  }

  // Split GST into components based on country and state
  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;

  if (country === 'AU') {
    // Australia: no CGST/SGST split — report as single GST via igst field
    igstPaise = gstAmountPaise;
  } else if (country === 'IN') {
    // India: determine inter-state vs intra-state
    const outletState = (outletConfig.state || outletConfig.outlet_state || '').toUpperCase();
    const customerState = (outletConfig.customer_state || '').toUpperCase();

    const isInterState = customerState && customerState !== outletState;

    if (isInterState) {
      igstPaise = gstAmountPaise;
    } else {
      // Intra-state: split 50/50 into CGST + SGST
      cgstPaise = Math.round(gstAmountPaise / 2);
      sgstPaise = gstAmountPaise - cgstPaise; // avoids rounding loss
    }
  } else {
    // Fallback for any other country — treat as single tax
    igstPaise = gstAmountPaise;
  }

  const totalTaxPaise = gstAmountPaise + cessAmountPaise;
  const taxInclusivePricePaise = taxableAmountPaise + totalTaxPaise;

  return {
    taxable_amount: toMajor(taxableAmountPaise),
    cgst: toMajor(cgstPaise),
    sgst: toMajor(sgstPaise),
    igst: toMajor(igstPaise),
    cess: toMajor(cessAmountPaise),
    total_tax: toMajor(totalTaxPaise),
    tax_inclusive_price: toMajor(taxInclusivePricePaise),
  };
}

// ---------------------------------------------------------------------------
// Full order tax calculation
// ---------------------------------------------------------------------------

/**
 * Calculate tax for an entire order (array of items).
 *
 * @param {Array<Object>} items - Array of item objects (same shape as {@link calculateItemTax} `item` param)
 * @param {Object} outletConfig - Outlet configuration (same shape as {@link calculateItemTax} `outletConfig`)
 *
 * @returns {{
 *   items: Array<{
 *     item: Object,
 *     taxable_amount: number,
 *     cgst: number,
 *     sgst: number,
 *     igst: number,
 *     cess: number,
 *     total_tax: number,
 *     tax_inclusive_price: number
 *   }>,
 *   totals: {
 *     taxable: number,
 *     cgst: number,
 *     sgst: number,
 *     igst: number,
 *     cess: number,
 *     total_tax: number
 *   }
 * }}
 *
 * @example
 * calculateOrderTax(
 *   [
 *     { base_price: 200, quantity: 2, gst_rate: 5 },
 *     { base_price: 500, quantity: 1, gst_rate: 18 },
 *   ],
 *   { country_code: 'IN', state: 'MH' }
 * );
 */
function calculateOrderTax(items, outletConfig) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      items: [],
      totals: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total_tax: 0 },
    };
  }

  // Accumulate totals in paise to avoid repeated float addition drift
  let totalTaxablePaise = 0;
  let totalCgstPaise = 0;
  let totalSgstPaise = 0;
  let totalIgstPaise = 0;
  let totalCessPaise = 0;
  let totalTaxPaise = 0;

  const itemResults = items.map((item) => {
    const tax = calculateItemTax(item, outletConfig);

    totalTaxablePaise += toPaise(tax.taxable_amount);
    totalCgstPaise += toPaise(tax.cgst);
    totalSgstPaise += toPaise(tax.sgst);
    totalIgstPaise += toPaise(tax.igst);
    totalCessPaise += toPaise(tax.cess);
    totalTaxPaise += toPaise(tax.total_tax);

    return {
      item,
      ...tax,
    };
  });

  return {
    items: itemResults,
    totals: {
      taxable: toMajor(totalTaxablePaise),
      cgst: toMajor(totalCgstPaise),
      sgst: toMajor(totalSgstPaise),
      igst: toMajor(totalIgstPaise),
      cess: toMajor(totalCessPaise),
      total_tax: toMajor(totalTaxPaise),
    },
  };
}

// ---------------------------------------------------------------------------
// Receipt formatting
// ---------------------------------------------------------------------------

/**
 * Format a tax calculation result into a human-readable receipt breakdown.
 *
 * @param {{
 *   items?: Array<Object>,
 *   totals?: Object,
 *   taxable_amount?: number,
 *   cgst?: number,
 *   sgst?: number,
 *   igst?: number,
 *   cess?: number,
 *   total_tax?: number,
 *   tax_inclusive_price?: number
 * }} taxResult - Output from {@link calculateItemTax} or {@link calculateOrderTax}
 *
 * @returns {{
 *   lines: string[],
 *   summary: string
 * }} lines — individual receipt lines; summary — concatenated multi-line string
 *
 * @example
 * const result = calculateItemTax({ base_price: 100, quantity: 1, gst_rate: 5 }, { country_code: 'IN', state: 'MH' });
 * formatTaxBreakdown(result);
 * // => { lines: ['Taxable Amount: ₹100.00', 'CGST (2.5%): ₹2.50', ...], summary: '...' }
 */
function formatTaxBreakdown(taxResult) {
  const lines = [];

  // Detect whether this is a single-item result or a full-order result
  const isOrder = Boolean(taxResult.totals);

  if (isOrder) {
    // Per-item lines
    if (Array.isArray(taxResult.items)) {
      taxResult.items.forEach((entry, idx) => {
        const label = entry.item.name || `Item ${idx + 1}`;
        const qty = entry.item.quantity || 1;
        lines.push(`${label} x${qty}`);
        lines.push(`  Taxable: ${fmtCurrency(entry.taxable_amount)}`);
        if (entry.cgst > 0) lines.push(`  CGST: ${fmtCurrency(entry.cgst)}`);
        if (entry.sgst > 0) lines.push(`  SGST: ${fmtCurrency(entry.sgst)}`);
        if (entry.igst > 0) lines.push(`  GST: ${fmtCurrency(entry.igst)}`);
        if (entry.cess > 0) lines.push(`  Cess: ${fmtCurrency(entry.cess)}`);
        lines.push(`  Tax: ${fmtCurrency(entry.total_tax)}`);
        lines.push('');
      });
    }

    // Totals
    lines.push('--- Tax Summary ---');
    lines.push(`Taxable Amount: ${fmtCurrency(taxResult.totals.taxable)}`);
    if (taxResult.totals.cgst > 0) lines.push(`CGST: ${fmtCurrency(taxResult.totals.cgst)}`);
    if (taxResult.totals.sgst > 0) lines.push(`SGST: ${fmtCurrency(taxResult.totals.sgst)}`);
    if (taxResult.totals.igst > 0) lines.push(`GST: ${fmtCurrency(taxResult.totals.igst)}`);
    if (taxResult.totals.cess > 0) lines.push(`Cess: ${fmtCurrency(taxResult.totals.cess)}`);
    lines.push(`Total Tax: ${fmtCurrency(taxResult.totals.total_tax)}`);
  } else {
    // Single-item result
    lines.push(`Taxable Amount: ${fmtCurrency(taxResult.taxable_amount)}`);
    if (taxResult.cgst > 0) lines.push(`CGST: ${fmtCurrency(taxResult.cgst)}`);
    if (taxResult.sgst > 0) lines.push(`SGST: ${fmtCurrency(taxResult.sgst)}`);
    if (taxResult.igst > 0) lines.push(`GST: ${fmtCurrency(taxResult.igst)}`);
    if (taxResult.cess > 0) lines.push(`Cess: ${fmtCurrency(taxResult.cess)}`);
    lines.push(`Total Tax: ${fmtCurrency(taxResult.total_tax)}`);
    lines.push(`Price (incl. tax): ${fmtCurrency(taxResult.tax_inclusive_price)}`);
  }

  return {
    lines,
    summary: lines.join('\n'),
  };
}

/**
 * Format a number as a currency string with 2 decimal places.
 * @param {number} amount
 * @returns {string}
 */
function fmtCurrency(amount) {
  return Number(amount).toFixed(2);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  calculateItemTax,
  calculateOrderTax,
  getGSTRate,
  formatTaxBreakdown,
};
