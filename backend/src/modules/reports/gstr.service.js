/**
 * @fileoverview GST return exports — GSTR-1 (outward supplies) and GSTR-3B
 * (summary) generators for Indian restaurant outlets.
 *
 * Restaurants are almost entirely B2C (no customer GSTIN captured at POS), so
 * outward supplies are reported under B2C Small (B2CS) rate-wise + an HSN
 * summary, mirroring the GST portal's offline-utility shape.
 *
 * Heavy lifting is delegated to {@link module:modules/reports/reports.service}'s
 * `getGstDetailedReport`, which already aggregates rate-wise, HSN, and daily GST
 * (CGST/SGST/IGST/cess, taxable values, HSN codes) directly from orders. This
 * module only transforms that output into the return formats.
 *
 * @module modules/reports/gstr.service
 */

const { getGstDetailedReport } = require('./reports.service');
const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

/** Rounds a value to 2 decimal places, coercing null/undefined/NaN to 0. */
function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

/**
 * GST state codes (first two digits of a GSTIN) → state name. Used to label the
 * place of supply for B2CS lines when only the outlet's state name is on file.
 * @type {Record<string, string>}
 */
const GST_STATE_CODES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
  '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
  '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli',
  '27': 'Maharashtra', '28': 'Andhra Pradesh (Old)', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
};

/** Reverse map: lower-cased state name → GST state code (for outlets with no GSTIN). */
const STATE_NAME_TO_CODE = Object.entries(GST_STATE_CODES).reduce((acc, [code, name]) => {
  acc[name.toLowerCase()] = code;
  return acc;
}, {});

/**
 * Fetches an outlet's GST identity defensively. Never throws — on any lookup
 * failure (unseeded/missing outlet, DB hiccup) it returns nulled fields so the
 * returns still generate.
 * @param {object} prisma - Prisma client.
 * @param {string} outletId
 * @returns {Promise<{gstin: string|null, state: string|null, stateCode: string|null, placeOfSupply: string|null}>}
 */
async function getOutletGstIdentity(prisma, outletId) {
  let gstin = null;
  let state = null;
  try {
    const outlet = await prisma.outlet.findUnique({
      where: { id: outletId },
      select: { gstin: true, state: true },
    });
    gstin = outlet?.gstin || null;
    state = outlet?.state || null;
  } catch (err) {
    logger.warn('GSTR: outlet GST identity lookup failed', { error: err.message, outletId });
  }

  // Place of supply: prefer the state code embedded in the GSTIN (digits 1-2),
  // else map the outlet's state name to its GST code. Either may be null.
  let stateCode = null;
  if (gstin && /^\d{2}/.test(gstin)) {
    stateCode = gstin.slice(0, 2);
  } else if (state && STATE_NAME_TO_CODE[state.trim().toLowerCase()]) {
    stateCode = STATE_NAME_TO_CODE[state.trim().toLowerCase()];
  }

  let placeOfSupply = null;
  if (stateCode && GST_STATE_CODES[stateCode]) {
    placeOfSupply = `${stateCode}-${GST_STATE_CODES[stateCode]}`;
  } else if (state) {
    placeOfSupply = state; // best-effort label when no code resolvable
  }

  return { gstin, state, stateCode, placeOfSupply };
}

/**
 * Splits a rate-wise detail row into intra-state (CGST+SGST) vs inter-state
 * (IGST) components. `getGstDetailedReport` only emits CGST/SGST (it halves
 * total_tax), so IGST is treated as 0 here — correct for the typical
 * single-state restaurant. Cess is not tracked at item level, so it is 0.
 * @param {object} r - A `by_rate` or `hsn` row from getGstDetailedReport.
 * @returns {{cgst:number, sgst:number, igst:number, cess:number}}
 */
function taxComponents(r) {
  return {
    cgst: round2(r.cgst),
    sgst: round2(r.sgst),
    igst: round2(r.igst), // typically undefined → 0
    cess: round2(r.cess),
  };
}

/**
 * Builds a GSTR-1 (outward supplies) summary for an outlet over a date range.
 *
 * Restaurants capture no customer GSTIN, so all sales are reported under B2C
 * Small (B2CS), rate-wise, plus an HSN summary (Table 12) and a document
 * summary. Never throws on empty ranges — returns zeroed totals.
 *
 * @param {string} outletId - Outlet UUID.
 * @param {string} [from] - Start date (YYYY-MM-DD); defaults handled downstream.
 * @param {string} [to] - End date (YYYY-MM-DD).
 * @param {string} [tz] - Optional IANA timezone for day boundaries.
 * @returns {Promise<object>} GSTR-1 summary object.
 */
async function getGstr1(outletId, from, to, tz) {
  const prisma = getDbClient();
  const { gstin, placeOfSupply } = await getOutletGstIdentity(prisma, outletId);

  let detailed;
  try {
    detailed = await getGstDetailedReport(outletId, from, to, tz);
  } catch (err) {
    logger.error('GSTR-1 generation: detailed report failed', { error: err.message, outletId });
    detailed = null;
  }

  const byRate = Array.isArray(detailed?.by_rate) ? detailed.by_rate : [];
  const hsnRows = Array.isArray(detailed?.hsn) ? detailed.hsn : [];
  const totalsIn = detailed?.totals || {};

  // ── B2C Small — rate-wise outward supplies ──
  const b2cs = byRate.map((r) => {
    const tc = taxComponents(r);
    return {
      rate: Number(r.rate || 0),
      taxable_value: round2(r.taxable),
      igst: tc.igst,
      cgst: tc.cgst,
      sgst: tc.sgst,
      cess: tc.cess,
      place_of_supply: placeOfSupply,
    };
  });

  // ── HSN summary (GSTR-1 Table 12) ──
  const hsn = hsnRows.map((h) => {
    const tc = taxComponents(h);
    return {
      hsn_code: h.hsn_code || null,
      description: h.description || null,
      uqc: 'NOS',
      total_qty: Number(h.total_qty || 0),
      taxable_value: round2(h.taxable),
      igst: tc.igst,
      cgst: tc.cgst,
      sgst: tc.sgst,
      cess: tc.cess,
      rate: Number(h.gst_rate || 0),
    };
  });

  // ── Document summary ──
  const invoicesCount = Number(totalsIn.order_count || 0);
  const totalTax = round2(totalsIn.total_tax);
  const taxableValue = round2(totalsIn.taxable);
  const totalValue = round2(taxableValue + totalTax);

  // ── Grand totals ──
  const totals = {
    taxable_value: taxableValue,
    igst: round2(totalsIn.igst),
    cgst: round2(totalsIn.cgst),
    sgst: round2(totalsIn.sgst),
    cess: round2(totalsIn.cess),
    total_tax: totalTax,
  };

  return {
    period: { from: detailed?.period?.from ?? from ?? null, to: detailed?.period?.to ?? to ?? null },
    gstin,
    b2cs,
    hsn,
    docs: { invoices_count: invoicesCount, total_value: totalValue },
    totals,
  };
}

/**
 * Builds a GSTR-3B (monthly summary) for an outlet over a date range.
 *
 * Section 3.1(a) carries outward taxable supplies (other than zero/nil rated).
 * Section 3.1(c) carries nil-rated/exempt supplies — populated only if any
 * 0% items were sold, else nil. Section 4 (ITC) is zero by default: restaurants
 * taxed at 5% under Notification 46/2017 cannot claim Input Tax Credit. Never
 * throws on empty ranges — returns zeroed sections.
 *
 * @param {string} outletId - Outlet UUID.
 * @param {string} [from] - Start date (YYYY-MM-DD).
 * @param {string} [to] - End date (YYYY-MM-DD).
 * @param {string} [tz] - Optional IANA timezone for day boundaries.
 * @returns {Promise<object>} GSTR-3B summary object.
 */
async function getGstr3b(outletId, from, to, tz) {
  const prisma = getDbClient();
  const { gstin } = await getOutletGstIdentity(prisma, outletId);

  let detailed;
  try {
    detailed = await getGstDetailedReport(outletId, from, to, tz);
  } catch (err) {
    logger.error('GSTR-3B generation: detailed report failed', { error: err.message, outletId });
    detailed = null;
  }

  const byRate = Array.isArray(detailed?.by_rate) ? detailed.by_rate : [];

  // ── Section 3.1(a): taxable outward supplies (rate > 0) ──
  // ── Section 3.1(c): nil-rated / exempt (rate === 0) ──
  const taxable31a = { taxable_value: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 };
  let nilTaxable = 0;
  let hasNil = false;

  for (const r of byRate) {
    const rate = Number(r.rate || 0);
    const tc = taxComponents(r);
    if (rate > 0) {
      taxable31a.taxable_value += round2(r.taxable);
      taxable31a.igst += tc.igst;
      taxable31a.cgst += tc.cgst;
      taxable31a.sgst += tc.sgst;
      taxable31a.cess += tc.cess;
    } else {
      hasNil = true;
      nilTaxable += round2(r.taxable);
    }
  }

  // Round accumulated section 3.1(a) values.
  const section_3_1_a = {
    taxable_value: round2(taxable31a.taxable_value),
    igst: round2(taxable31a.igst),
    cgst: round2(taxable31a.cgst),
    sgst: round2(taxable31a.sgst),
    cess: round2(taxable31a.cess),
  };

  // 3.1(c) is null when no nil/exempt supplies were made in the period.
  const section_3_1_c = hasNil
    ? { taxable_value: round2(nilTaxable), igst: 0, cgst: 0, sgst: 0, cess: 0 }
    : null;

  // ── Section 4: ITC — restaurants at 5% have none ──
  const section_4_itc = { igst: 0, cgst: 0, sgst: 0, cess: 0 };

  // ── Tax payable = output tax (3.1a) − ITC (4, which is 0 here) ──
  const tax_payable = {
    igst: round2(section_3_1_a.igst - section_4_itc.igst),
    cgst: round2(section_3_1_a.cgst - section_4_itc.cgst),
    sgst: round2(section_3_1_a.sgst - section_4_itc.sgst),
    cess: round2(section_3_1_a.cess - section_4_itc.cess),
    total: 0,
  };
  tax_payable.total = round2(
    tax_payable.igst + tax_payable.cgst + tax_payable.sgst + tax_payable.cess
  );

  return {
    period: { from: detailed?.period?.from ?? from ?? null, to: detailed?.period?.to ?? to ?? null },
    gstin,
    section_3_1_a,
    section_3_1_c,
    section_4_itc,
    tax_payable,
    notes: [
      'Restaurant supplies at 5% GST carry no Input Tax Credit (ITC) per Notification 46/2017.',
      'All sales are B2C (no customer GSTIN); reported under B2C Small in GSTR-1.',
    ],
  };
}

module.exports = { getGstr1, getGstr3b };
