#!/usr/bin/env node
/**
 * @fileoverview Report shape verifier.
 *
 * Guards the reports subsystem against accidental output-shape regressions after
 * the groupBy/aggregate + caching refactor. For every exported report function it:
 *   1. asserts the export is a function;
 *   2. (where the function only touches the DB) RUNS it against a mocked, EMPTY
 *      Prisma client and asserts the returned object exposes the exact set of
 *      top-level keys the frontend/mobile consumers depend on.
 *
 * No live database or Redis is required: a stub Prisma client is injected by
 * overriding the `config/database` module in require.cache, and the real Redis
 * client already degrades to a safe no-op mock (every GET returns null → the
 * cache wrapper always runs the producer fn), so caching stays transparent here.
 *
 * Usage: `node scripts/verify-report-shapes.js`
 * Exit code 0 = all checks passed, 1 = at least one failure.
 */

/* eslint-disable no-console */

const path = require('path');

/* ─── 1. Inject a mocked, empty Prisma client ─────────────────────────────── */

// An empty result set for every delegate method. Returning sane "zero" values
// lets the JS reduction code run without NPEs and produce its normal shape.
function makeEmptyModel() {
  return {
    findMany: async () => [],
    findUnique: async () => null,
    findFirst: async () => null,
    count: async () => 0,
    aggregate: async () => ({ _count: { id: 0 }, _sum: {} }),
    groupBy: async () => [],
    upsert: async () => ({}),
  };
}

// Proxy so ANY model name (prisma.order, prisma.kOT, prisma.staffProfile, …)
// resolves to an empty model without us having to enumerate all 80 models.
const prismaStub = new Proxy(
  {
    // $queryRaw is used by getGstReport — return an empty row set.
    $queryRaw: async () => [],
    $queryRawUnsafe: async () => [],
    $disconnect: async () => {},
  },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'symbol') return undefined;
      // Lazily create (and cache) an empty model delegate per accessed name.
      const model = makeEmptyModel();
      target[prop] = model;
      return model;
    },
  }
);

// Override the database module BEFORE reports.service is required so its
// `getDbClient()` calls receive the stub.
const dbModulePath = require.resolve(path.join(__dirname, '..', 'src', 'config', 'database'));
require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: { getDbClient: () => prismaStub, disconnectDb: async () => {} },
};

/* ─── 2. Load the service under test ──────────────────────────────────────── */

const reports = require('../src/modules/reports/reports.service');

/* ─── 3. Expected top-level key contracts ─────────────────────────────────── */
// Keys are derived from the original return-object literals and confirmed
// against the frontend consumers (AdvancedReportsPage, ReportsPage,
// GSTCompliancePage, XeroAnalyticsPage) and the mobile app.

const OUTLET = '00000000-0000-0000-0000-000000000000';
const FROM = '2026-01-01';
const TO = '2026-01-31';

// Reports we can safely RUN against the empty stub and assert object keys.
const objectChecks = [
  {
    fn: 'getDailySales',
    call: (s) => s.getDailySales(OUTLET, FROM),
    keys: ['date', 'total_orders', 'total_revenue', 'total_tax', 'total_discount',
      'by_type', 'by_source', 'by_payment', 'paid_orders', 'unpaid_orders', 'avg_order_value'],
  },
  {
    fn: 'getItemWiseSales',
    call: (s) => s.getItemWiseSales(OUTLET, FROM, TO, 20),
    keys: ['period', 'total_items_sold', 'total_revenue', 'items'],
  },
  {
    fn: 'getDashboard',
    call: (s) => s.getDashboard(OUTLET),
    keys: ['today', 'comparison', 'live'],
  },
  {
    fn: 'getGstDetailedReport',
    call: (s) => s.getGstDetailedReport(OUTLET, FROM, TO),
    keys: ['period', 'totals', 'daily', 'by_rate', 'hsn'],
  },
  {
    fn: 'getFranchiseKPIs',
    call: (s) => s.getFranchiseKPIs(OUTLET, FROM, TO),
    keys: ['revenue', 'total_orders', 'covers', 'avg_check', 'total_items_sold',
      'revenue_growth', 'orders_growth', 'food_cost', 'food_cost_pct',
      'waste_value', 'waste_pct', 'gross_margin_pct'],
  },
  {
    fn: 'getInventoryValuation',
    call: (s) => s.getInventoryValuation(OUTLET),
    keys: ['total_value', 'total_items', 'by_category'],
  },
  {
    fn: 'getBASReport',
    call: (s) => s.getBASReport(OUTLET, FROM, TO),
    keys: ['period', 'g1_total_sales_incl_gst', 'g1_label', 'gst_collected',
      'gst_paid_on_purchases', 'net_gst_payable', 'net_sales_excl_gst', 'order_count'],
  },
  {
    fn: 'getAdvancedReport',
    call: (s) => s.getAdvancedReport(OUTLET, 'week'),
    keys: ['hourly_heatmap', 'category_breakdown', 'profit_loss', 'daily_revenue',
      'total_orders', 'period'],
  },
  {
    fn: 'getPaymentBreakdown',
    call: (s) => s.getPaymentBreakdown(OUTLET, FROM, TO),
    keys: ['breakdown', 'total'],
  },
];

// Nested-shape spot checks (only meaningful keys the frontend reads).
const nestedChecks = [
  {
    label: 'getDashboard.today',
    call: async (s) => (await s.getDashboard(OUTLET)).today,
    keys: ['orders', 'revenue', 'avg_order_value', 'paid_orders', 'running_orders',
      'open_tabs_value', 'gross_revenue'],
  },
  {
    label: 'getDashboard.live',
    call: async (s) => (await s.getDashboard(OUTLET)).live,
    keys: ['active_tables', 'total_tables', 'occupancy_pct', 'pending_kots'],
  },
  {
    label: 'getAdvancedReport.profit_loss',
    call: async (s) => (await s.getAdvancedReport(OUTLET, 'week')).profit_loss,
    keys: ['gross_revenue', 'discounts', 'refunds', 'net_revenue', 'food_cost',
      'staff_cost', 'overheads', 'total_expenses', 'gross_profit', 'tax', 'net_profit'],
  },
];

// Reports that return ARRAYS when empty — assert function + Array result only.
const arrayChecks = [
  { fn: 'getRevenueTrend', call: (s) => s.getRevenueTrend(OUTLET, FROM, TO) },
  { fn: 'getHourlyBreakdown', call: (s) => s.getHourlyBreakdown(OUTLET, FROM) },
  { fn: 'getCategoryWiseSales', call: (s) => s.getCategoryWiseSales(OUTLET, FROM, TO) },
  { fn: 'getGstReport', call: (s) => s.getGstReport(OUTLET, FROM, TO) },
  { fn: 'getStaffPerformance', call: (s) => s.getStaffPerformance(OUTLET, FROM, TO) },
  { fn: 'getTopSellingItems', call: (s) => s.getTopSellingItems(OUTLET, 5) },
  { fn: 'getRevenueTrendRange', call: (s) => s.getRevenueTrendRange(OUTLET, FROM, TO) },
];

// Functions that exist but aren't runtime-shaped here (CSV string / pure helper).
const presenceOnly = ['exportGstCsv', 'getFinancialYearRange'];

/* ─── 4. Run the checks ───────────────────────────────────────────────────── */

let passed = 0;
let failed = 0;
const failures = [];

function ok(msg) { passed++; console.log(`  PASS  ${msg}`); }
function bad(msg) { failed++; failures.push(msg); console.log(`  FAIL  ${msg}`); }

function sameKeySet(actual, expected) {
  const a = Object.keys(actual).sort();
  const e = [...expected].sort();
  const missing = e.filter((k) => !a.includes(k));
  const extra = a.filter((k) => !e.includes(k));
  return { equal: missing.length === 0 && extra.length === 0, missing, extra };
}

async function main() {
  console.log('\n=== Static export presence ===');
  const allExpected = [
    ...objectChecks.map((c) => c.fn),
    ...arrayChecks.map((c) => c.fn),
    ...presenceOnly,
  ];
  for (const name of allExpected) {
    if (typeof reports[name] === 'function') ok(`export ${name} is a function`);
    else bad(`export ${name} is MISSING or not a function`);
  }

  console.log('\n=== Object-shape checks (runtime, empty DB) ===');
  for (const c of objectChecks) {
    try {
      const out = await c.call(reports);
      if (out == null || typeof out !== 'object' || Array.isArray(out)) {
        bad(`${c.fn} did not return a plain object`);
        continue;
      }
      const r = sameKeySet(out, c.keys);
      if (r.equal) ok(`${c.fn} top-level keys match (${c.keys.length})`);
      else bad(`${c.fn} key mismatch — missing:[${r.missing}] extra:[${r.extra}]`);
    } catch (err) {
      bad(`${c.fn} threw at runtime: ${err.message}`);
    }
  }

  console.log('\n=== Nested-shape spot checks ===');
  for (const c of nestedChecks) {
    try {
      const out = await c.call(reports);
      if (out == null || typeof out !== 'object') { bad(`${c.label} not an object`); continue; }
      const r = sameKeySet(out, c.keys);
      if (r.equal) ok(`${c.label} keys match (${c.keys.length})`);
      else bad(`${c.label} key mismatch — missing:[${r.missing}] extra:[${r.extra}]`);
    } catch (err) {
      bad(`${c.label} threw: ${err.message}`);
    }
  }

  console.log('\n=== Array-returning report checks (runtime, empty DB) ===');
  for (const c of arrayChecks) {
    try {
      const out = await c.call(reports);
      if (Array.isArray(out)) ok(`${c.fn} returns an array (len ${out.length})`);
      else bad(`${c.fn} expected array, got ${typeof out}`);
    } catch (err) {
      bad(`${c.fn} threw at runtime: ${err.message}`);
    }
  }

  console.log('\n=== exportGstCsv returns a string ===');
  try {
    const csv = await reports.exportGstCsv(OUTLET, FROM, TO, 'gstr1');
    if (typeof csv === 'string' && csv.includes('GSTR-1')) ok('exportGstCsv returns CSV string');
    else bad(`exportGstCsv unexpected output (type ${typeof csv})`);
  } catch (err) {
    bad(`exportGstCsv threw: ${err.message}`);
  }

  console.log('\n=== getFinancialYearRange shape ===');
  try {
    const fy = reports.getFinancialYearRange(new Date('2026-05-30'), 'IN');
    const r = sameKeySet(fy, ['start', 'end', 'label']);
    if (r.equal) ok('getFinancialYearRange keys match (start,end,label)');
    else bad(`getFinancialYearRange key mismatch — missing:[${r.missing}] extra:[${r.extra}]`);
  } catch (err) {
    bad(`getFinancialYearRange threw: ${err.message}`);
  }

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Verifier crashed:', err);
  process.exit(1);
});
