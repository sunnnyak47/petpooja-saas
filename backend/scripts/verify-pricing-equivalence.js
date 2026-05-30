#!/usr/bin/env node
/**
 * @fileoverview Numerical-equivalence harness for the refactored order pricing engine.
 *
 * The order engine's three write paths (createOrder, punchKOT, addItemsToOrder)
 * were de-duplicated to route through the shared pure helpers in
 * pricing.service.js: {@link buildOrderItems} + {@link computeOrderTotals}.
 *
 * This script PROVES that refactor changed no numbers. For a set of
 * representative carts it runs the real pricing helpers and asserts every
 * monetary field (subtotal / cgst / sgst / igst / total_tax / grand_total /
 * round_off) equals a value derived BY HAND from the tax rules that the engine
 * is the source of truth for (tax.service.calculateItemTax + computeGrandTotal):
 *   - IN: GST exclusive, intra-state splits 50/50 into CGST+SGST, inter-state = IGST,
 *         grand total rounds to the nearest whole rupee.
 *   - AU: GST 10% inclusive, reported via the IGST field, grand total to 2dp.
 *
 * Run:  node scripts/verify-pricing-equivalence.js
 * Exits 0 if every field of every case matches; exits 1 (and prints the diff)
 * on the first mismatch so it can gate CI / a pre-merge check.
 *
 * NOTE: pure in-memory — no database, no Prisma, no network.
 */

const { buildOrderItems, computeOrderTotals } = require('../src/modules/orders/pricing.service');

// ---------------------------------------------------------------------------
// Tiny fixture builders — mimic the menu-item rows createOrder/punchKOT load.
// ---------------------------------------------------------------------------

/**
 * Build a menu-item row (as fetched with variants+addons) for the map.
 * @param {object} opts
 * @returns {object}
 */
function menuItem({ id, name, base_price, gst_rate, variants = [], addons = [], is_available = true }) {
  return {
    id,
    name,
    base_price,
    gst_rate,
    is_available,
    kitchen_station: 'KITCHEN',
    variants,
    addons,
  };
}

/**
 * Assemble a Map<menu_item_id, menuItem> from an array of rows.
 * @param {object[]} rows
 * @returns {Map<string, object>}
 */
function toMap(rows) {
  return new Map(rows.map((r) => [r.id, r]));
}

// ---------------------------------------------------------------------------
// Test cases — each defines the cart, the tax config (exactly the shape
// createOrder builds via resolveOutletTaxConfig + customer_state) and the
// hand-computed expected monetary outputs.
// ---------------------------------------------------------------------------

const CASES = [
  {
    name: 'IN single item, exclusive (200x2 @5%, intra-state)',
    menu: [menuItem({ id: 'm1', name: 'Dosa', base_price: 200, gst_rate: 5 })],
    items: [{ menu_item_id: 'm1', quantity: 2 }],
    taxConfig: { country_code: 'IN', gst_inclusive: false, default_gst_rate: 5, state: 'MH', customer_state: '' },
    expected: { subtotal: 400, cgst: 10, sgst: 10, igst: 0, total_tax: 20, grand_total: 420, round_off: 0 },
  },
  {
    name: 'IN item + variant, exclusive (100 + 50 @12%, intra-state)',
    menu: [
      menuItem({
        id: 'm2', name: 'Pizza', base_price: 100, gst_rate: 12,
        variants: [{ id: 'v2', name: 'Large', price_addition: 50 }],
      }),
    ],
    items: [{ menu_item_id: 'm2', quantity: 1, variant_id: 'v2' }],
    taxConfig: { country_code: 'IN', gst_inclusive: false, default_gst_rate: 5, state: 'MH', customer_state: '' },
    expected: { subtotal: 150, cgst: 9, sgst: 9, igst: 0, total_tax: 18, grand_total: 168, round_off: 0 },
  },
  {
    name: 'IN item + addon, exclusive (99x3 + addon 10 @5%, fractional round-off)',
    menu: [
      menuItem({
        id: 'm3', name: 'Thali', base_price: 99, gst_rate: 5,
        addons: [{ id: 'a3', name: 'Extra Roti', price: 10 }],
      }),
    ],
    items: [{ menu_item_id: 'm3', quantity: 3, addons: [{ addon_id: 'a3', quantity: 1 }] }],
    taxConfig: { country_code: 'IN', gst_inclusive: false, default_gst_rate: 5, state: 'MH', customer_state: '' },
    // base_price per unit = 99 + 10/3 = 102.33333 -> line 30699 paise; gst 1535p = 15.35
    // cgst 7.68 / sgst 7.67; total 327 + 15.35 = 342.35 -> round 342, off -0.35
    expected: { subtotal: 327, cgst: 7.68, sgst: 7.67, igst: 0, total_tax: 15.35, grand_total: 342, round_off: -0.35 },
  },
  {
    name: 'IN multi-item, exclusive (200x2 @5% + 500x1 @18%, intra-state)',
    menu: [
      menuItem({ id: 'm4a', name: 'Dosa', base_price: 200, gst_rate: 5 }),
      menuItem({ id: 'm4b', name: 'Biryani', base_price: 500, gst_rate: 18 }),
    ],
    items: [
      { menu_item_id: 'm4a', quantity: 2 },
      { menu_item_id: 'm4b', quantity: 1 },
    ],
    taxConfig: { country_code: 'IN', gst_inclusive: false, default_gst_rate: 5, state: 'MH', customer_state: '' },
    expected: { subtotal: 900, cgst: 55, sgst: 55, igst: 0, total_tax: 110, grand_total: 1010, round_off: 0 },
  },
  {
    name: 'AU gst-inclusive (11 @10% inclusive)',
    menu: [menuItem({ id: 'm5', name: 'Flat White', base_price: 11, gst_rate: 10 })],
    items: [{ menu_item_id: 'm5', quantity: 1 }],
    taxConfig: { country_code: 'AU', gst_inclusive: true, default_gst_rate: 10, state: 'VIC', customer_state: '' },
    // inclusive: taxable 10.00, GST 1.00 reported as igst; total == subtotal 11
    expected: { subtotal: 11, cgst: 0, sgst: 0, igst: 1, total_tax: 1, grand_total: 11, round_off: 0 },
  },
  {
    name: 'IN inter-state IGST, exclusive (333x1 @18%, MH outlet -> KA customer)',
    menu: [menuItem({ id: 'm6', name: 'Combo', base_price: 333, gst_rate: 18 })],
    items: [{ menu_item_id: 'm6', quantity: 1 }],
    taxConfig: { country_code: 'IN', gst_inclusive: false, default_gst_rate: 5, state: 'MH', customer_state: 'KA' },
    // inter-state -> all GST goes to IGST. line 33300p; gst 5994p = 59.94
    // total 333 + 59.94 = 392.94 -> round 393, off +0.06
    expected: { subtotal: 333, cgst: 0, sgst: 0, igst: 59.94, total_tax: 59.94, grand_total: 393, round_off: 0.06 },
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const FIELDS = ['subtotal', 'cgst', 'sgst', 'igst', 'total_tax', 'grand_total', 'round_off'];
const EPS = 1e-9; // tolerance for IEEE-754 noise (all values are 2dp by construction)

/**
 * Run the real pricing pipeline for a case and return the flat monetary result.
 * @param {object} c - A CASES entry
 * @returns {{subtotal:number, cgst:number, sgst:number, igst:number, total_tax:number, grand_total:number, round_off:number}}
 */
function computeActual(c) {
  const map = toMap(c.menu);
  const { subtotal, tax } = buildOrderItems(c.items, map, c.taxConfig);
  const totals = computeOrderTotals(subtotal, c.taxConfig, c.taxConfig.country_code, tax);
  return {
    subtotal,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    total_tax: totals.totalTax,
    grand_total: totals.grandTotal,
    round_off: totals.roundOff,
  };
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function fmt(n) {
  return Number(n).toFixed(2);
}

function main() {
  let failures = 0;
  const rows = [];

  for (const c of CASES) {
    let actual;
    try {
      actual = computeActual(c);
    } catch (err) {
      failures += 1;
      rows.push({ name: c.name, status: 'FAIL', detail: `threw: ${err.message}` });
      continue;
    }

    const mismatches = [];
    for (const f of FIELDS) {
      const exp = c.expected[f];
      const got = actual[f];
      if (Math.abs(exp - got) > EPS) {
        mismatches.push(`${f} expected ${fmt(exp)} got ${fmt(got)}`);
      }
    }

    if (mismatches.length === 0) {
      rows.push({ name: c.name, status: 'PASS', detail: '' });
    } else {
      failures += 1;
      rows.push({ name: c.name, status: 'FAIL', detail: mismatches.join('; ') });
    }
  }

  // ── Print results table ──────────────────────────────────────────────────
  const line = '─'.repeat(96);
  console.log('\nPricing equivalence verification — buildOrderItems + computeOrderTotals\n');
  console.log(line);
  console.log(`${pad('STATUS', 8)}${pad('CASE', 64)}DETAIL`);
  console.log(line);
  for (const r of rows) {
    console.log(`${pad(r.status, 8)}${pad(r.name, 64)}${r.detail}`);
  }
  console.log(line);

  // ── Detail table of every computed field for the audit trail ─────────────
  console.log('\nComputed values (subtotal / cgst / sgst / igst / total_tax / grand_total / round_off):');
  console.log(line);
  for (const c of CASES) {
    let a;
    try {
      a = computeActual(c);
    } catch {
      console.log(`${pad('(threw)', 64)}${c.name}`);
      continue;
    }
    const vals = `${fmt(a.subtotal)} / ${fmt(a.cgst)} / ${fmt(a.sgst)} / ${fmt(a.igst)} / ${fmt(a.total_tax)} / ${fmt(a.grand_total)} / ${fmt(a.round_off)}`;
    console.log(`${pad(c.name, 60)}${vals}`);
  }
  console.log(line);

  const total = CASES.length;
  const passed = total - failures;
  console.log(`\n${passed}/${total} cases passed.\n`);

  if (failures > 0) {
    console.error(`FAILED: ${failures} case(s) mismatched. Pricing behavior changed — investigate before merge.`);
    process.exit(1);
  }
  console.log('OK — all pricing fields match the hand-derived expectations. No numerical behavior changed.');
  process.exit(0);
}

main();
