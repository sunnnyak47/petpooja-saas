/**
 * @fileoverview Xero demo data seeder.
 * Seeds (and clears) 3 years of realistic restaurant financial demo data for an
 * outlet so the analytics dashboards have data to render. Extracted from
 * xero.service.js.
 * @module modules/xero/xero.demo.service
 */

const { getDbClient } = require('../../config/database');

/**
 * Seeds 3 years of realistic restaurant financial demo data for an outlet.
 * Idempotent — if a xero_connection already exists for the outlet, skips.
 */
async function seedDemoData(outletId) {
  const prisma = getDbClient();

  // Skip if already seeded
  const existing = await prisma.xeroConnection.findFirst({
    where: { outlet_id: outletId, is_deleted: false },
  });
  if (existing) return { skipped: true, connection_id: existing.id };

  // ── 1. Connection ────────────────────────────────────────────────────────
  const conn = await prisma.xeroConnection.create({
    data: {
      outlet_id:    outletId,
      org_name:     'Demo Restaurant Pty Ltd',
      abn:          '51 824 753 556',
      address:      '123 Collins St, Melbourne VIC 3000',
      currency:     'AUD',
      country_code: 'AU',
      timezone:     'Australia/Melbourne',
      is_connected: true,
      last_synced:  new Date(),
    },
  });

  // ── 2. Chart of Accounts ─────────────────────────────────────────────────
  const accounts = [
    { code: '200', name: 'Food & Beverage Revenue', type: 'REVENUE',  category: 'Revenue' },
    { code: '201', name: 'Catering Revenue',         type: 'REVENUE',  category: 'Revenue' },
    { code: '300', name: 'Cost of Sales – Food',     type: 'EXPENSE',  category: 'Cost of Sales' },
    { code: '301', name: 'Cost of Sales – Bev',      type: 'EXPENSE',  category: 'Cost of Sales' },
    { code: '400', name: 'Wages & Salaries',          type: 'EXPENSE',  category: 'Labour' },
    { code: '401', name: 'Casual Labour',             type: 'EXPENSE',  category: 'Labour' },
    { code: '450', name: 'Rent & Outgoings',          type: 'EXPENSE',  category: 'Occupancy' },
    { code: '451', name: 'Utilities',                 type: 'EXPENSE',  category: 'Occupancy' },
    { code: '500', name: 'Marketing & Advertising',   type: 'EXPENSE',  category: 'Marketing' },
    { code: '600', name: 'Repairs & Maintenance',     type: 'EXPENSE',  category: 'Operations' },
    { code: '601', name: 'Supplies & Consumables',    type: 'EXPENSE',  category: 'Operations' },
    { code: '700', name: 'Accounting & Legal',        type: 'EXPENSE',  category: 'Admin' },
    { code: '701', name: 'Insurance',                 type: 'EXPENSE',  category: 'Admin' },
    { code: '800', name: 'Depreciation',              type: 'EXPENSE',  category: 'Depreciation' },
  ];
  await prisma.xeroAccount.createMany({ data: accounts.map(a => ({ ...a, connection_id: conn.id })) });

  // ── 3. Transactions (36 months of daily aggregates) ──────────────────────
  // Monthly revenue baseline with seasonal factors, a growth trend AND realistic
  // month-to-month variance ("proper gaps") — without noise the data is a
  // perfectly smooth curve where every cost ratio is identical, which makes the
  // predictions look synthetic and leaves the expense-optimizer nothing to flag.
  const now       = new Date();
  const txnRows   = [];
  let   refSeq    = 1;

  // Seeded PRNG (mulberry32) keyed off the outletId so the generated data is
  // stable/reproducible per outlet rather than reshuffling on every re-seed.
  let seedState = 0;
  for (let i = 0; i < outletId.length; i++) seedState = (seedState * 31 + outletId.charCodeAt(i)) >>> 0;
  const rand = () => {
    seedState |= 0; seedState = (seedState + 0x6D2B79F5) | 0;
    let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Returns a multiplier in [1-spread, 1+spread] from the seeded stream.
  const jitter = (spread) => 1 + (rand() * 2 - 1) * spread;

  // Seasonal multipliers by month (index 0=Jan)
  const seasonal  = [0.85, 0.80, 0.95, 1.00, 1.05, 1.10, 1.15, 1.20, 1.05, 1.00, 1.10, 1.30];
  const baseRev   = 95000; // monthly revenue base

  for (let mo = 35; mo >= 0; mo--) {
    const d     = new Date(now.getFullYear(), now.getMonth() - mo, 1);
    const yr    = d.getFullYear();
    const mnth  = d.getMonth(); // 0-based
    const growth = 1 + (35 - mo) * 0.004; // ~15% growth over 3 years
    const sf    = seasonal[mnth];
    // Revenue noise: ±8% normal wobble, plus an occasional off month (dip/spike)
    // so the series has natural gaps instead of tracing a clean curve.
    let revNoise = jitter(0.08);
    const eventRoll = rand();
    if (eventRoll > 0.92) revNoise *= 1.12;       // ~8% chance of a standout month
    else if (eventRoll < 0.08) revNoise *= 0.86;  // ~8% chance of a soft month
    const rev   = Math.round(baseRev * sf * growth * revNoise);
    const dateStr = `${yr}-${String(mnth + 1).padStart(2,'0')}-15`; // mid-month date

    // Cost ratios drift around their target each month (relative ± spread) so
    // some months land over the industry benchmark — that's what gives the
    // predictive expense-optimizer real, actionable signal.
    const cogsFoodPct = 0.22 * jitter(0.12);
    const cogsBevPct  = 0.10 * jitter(0.12);
    const wagesPct    = 0.26 * jitter(0.14);   // labour is the most volatile line
    const casualPct   = 0.06 * jitter(0.20);
    const rentPct     = 0.10;                  // rent is fixed — no drift
    const utilPct     = 0.025 * jitter(0.15);
    const mktPct      = 0.03 * jitter(0.30);   // marketing spend is lumpy
    const repairsPct  = 0.02 * jitter(0.40);   // repairs are sporadic
    const suppliesPct = 0.02 * jitter(0.18);
    const acctPct     = 0.01 * jitter(0.10);
    const insPct      = 0.008;                 // insurance is fixed
    const depPct      = 0.015;                 // depreciation is fixed

    const addRow = (ref, acctCode, acctName, acctType, cat, amt, contact) => {
      const net = Math.round(amt);
      txnRows.push({
        connection_id:   conn.id,
        transaction_ref: `DEMO-${String(refSeq++).padStart(6,'0')}`,
        date:            new Date(dateStr),
        type:            acctType === 'REVENUE' ? 'ACCREC' : 'ACCPAY',
        reference:       ref,
        account_code:    acctCode,
        account_name:    acctName,
        account_type:    acctType,
        category:        cat,
        contact:         contact || null,
        amount_incl_gst: Math.round(net * 1.1 * 100) / 100,
        gst:             Math.round(net * 0.1 * 100) / 100,
        net_amount:      net,
        currency:        'AUD',
      });
    };

    // Revenue (positive) — split also wobbles a little
    const cateringShare = 0.12 * jitter(0.20);
    addRow(`REV-${yr}-${mnth+1}-A`, '200', 'Food & Beverage Revenue', 'REVENUE', 'Revenue', Math.round(rev * (1 - cateringShare)));
    addRow(`REV-${yr}-${mnth+1}-B`, '201', 'Catering Revenue',        'REVENUE', 'Revenue', Math.round(rev * cateringShare));

    // COGS ~32% of revenue (negative)
    addRow(`COGS-${yr}-${mnth+1}-F`, '300', 'Cost of Sales – Food', 'EXPENSE', 'Cost of Sales', -Math.round(rev * cogsFoodPct));
    addRow(`COGS-${yr}-${mnth+1}-B`, '301', 'Cost of Sales – Bev',  'EXPENSE', 'Cost of Sales', -Math.round(rev * cogsBevPct));

    // Labour ~32%
    addRow(`LAB-${yr}-${mnth+1}-W`, '400', 'Wages & Salaries', 'EXPENSE', 'Labour', -Math.round(rev * wagesPct), 'Payroll AUS');
    addRow(`LAB-${yr}-${mnth+1}-C`, '401', 'Casual Labour',    'EXPENSE', 'Labour', -Math.round(rev * casualPct), 'Workpac Staffing');

    // Occupancy ~12%
    addRow(`OCC-${yr}-${mnth+1}-R`, '450', 'Rent & Outgoings', 'EXPENSE', 'Occupancy', -Math.round(rev * rentPct), 'GPT Property Group');
    addRow(`OCC-${yr}-${mnth+1}-U`, '451', 'Utilities',        'EXPENSE', 'Occupancy', -Math.round(rev * utilPct), 'AGL Energy');

    // Marketing ~3%
    addRow(`MKT-${yr}-${mnth+1}`, '500', 'Marketing & Advertising', 'EXPENSE', 'Marketing', -Math.round(rev * mktPct), 'Meta Ads');

    // Operations ~4%
    addRow(`OPS-${yr}-${mnth+1}-R`, '600', 'Repairs & Maintenance',  'EXPENSE', 'Operations', -Math.round(rev * repairsPct), 'Local Repairs Co');
    addRow(`OPS-${yr}-${mnth+1}-S`, '601', 'Supplies & Consumables', 'EXPENSE', 'Operations', -Math.round(rev * suppliesPct), 'Bidfood Australia');

    // Admin ~2%
    addRow(`ADM-${yr}-${mnth+1}-A`, '700', 'Accounting & Legal', 'EXPENSE', 'Admin', -Math.round(rev * acctPct), 'Deloitte Accounting');
    addRow(`ADM-${yr}-${mnth+1}-I`, '701', 'Insurance',          'EXPENSE', 'Admin', -Math.round(rev * insPct), 'QBE Insurance');

    // Depreciation ~1.5%
    addRow(`DEP-${yr}-${mnth+1}`, '800', 'Depreciation', 'EXPENSE', 'Depreciation', -Math.round(rev * depPct));
  }

  // Batch insert transactions
  await prisma.xeroTransaction.createMany({ data: txnRows, skipDuplicates: true });

  // ── 4. Bank account ──────────────────────────────────────────────────────
  const bank = await prisma.xeroBankAccount.create({
    data: {
      connection_id:   conn.id,
      account_name:    'NAB Business Account',
      account_number:  '062-000-12345678',
      bsb:             '062-000',
      opening_balance: 45000,
      opening_date:    new Date(now.getFullYear() - 3, now.getMonth(), 1),
      current_balance: 82500,
    },
  });

  // ── 5. Balance sheet snapshots (quarterly for 3 years) ──────────────────
  const bsRows = [];
  for (let q = 11; q >= 0; q--) {
    const d         = new Date(now.getFullYear(), now.getMonth() - q * 3, 1);
    const asAt      = new Date(d.getFullYear(), d.getMonth() + 2, 28); // end of quarter
    const scale     = 1 + (11 - q) * 0.025;
    const bsLines   = [
      { code: 'BA01', name: 'NAB Business Account',  type: 'BANK',           sub_type: 'CurrentAssets',   balance: Math.round(82500 * scale * 0.7) },
      { code: 'AR01', name: 'Accounts Receivable',   type: 'CURRENT',        sub_type: 'CurrentAssets',   balance: Math.round(18000 * scale) },
      { code: 'INV1', name: 'Inventory',             type: 'CURRENT',        sub_type: 'CurrentAssets',   balance: Math.round(12000 * scale) },
      { code: 'FA01', name: 'Kitchen Equipment',     type: 'FIXED',          sub_type: 'NonCurrentAssets',balance: Math.round(120000 - q * 3500) },
      { code: 'FA02', name: 'Fit-out & Leasehold',   type: 'FIXED',          sub_type: 'NonCurrentAssets',balance: Math.round(85000 - q * 2000) },
      { code: 'AP01', name: 'Accounts Payable',      type: 'CURRENT',        sub_type: 'CurrentLiabilities', balance: -Math.round(22000 * scale * 0.6) },
      { code: 'GST1', name: 'GST Payable',           type: 'CURRENT',        sub_type: 'CurrentLiabilities', balance: -Math.round(8500 * scale) },
      { code: 'LN01', name: 'Bank Loan',             type: 'NON_CURRENT',    sub_type: 'NonCurrentLiabilities', balance: -Math.round(95000 - q * 2200) },
      { code: 'EQ01', name: 'Retained Earnings',     type: 'EQUITY',         sub_type: 'Equity',          balance: Math.round(55000 * scale) },
      { code: 'EQ02', name: 'Share Capital',         type: 'EQUITY',         sub_type: 'Equity',          balance: 50000 },
    ];
    bsRows.push(...bsLines.map(l => ({
      connection_id: conn.id,
      as_at_date:    asAt,
      account_code:  l.code,
      account_name:  l.name,
      account_type:  l.type,
      sub_type:      l.sub_type,
      balance:       l.balance,
    })));
  }
  await prisma.xeroBalanceSheetLine.createMany({ data: bsRows });

  // ── 6. Invoices (last 12 months) ─────────────────────────────────────────
  const invRows = [];
  const invoiceContacts = ['GPT Property Group', 'AGL Energy', 'Bidfood Australia', 'Workpac Staffing', 'QBE Insurance'];
  let invNum = 1001;
  for (let mo = 11; mo >= 0; mo--) {
    const d       = new Date(now.getFullYear(), now.getMonth() - mo, 10);
    const contact = invoiceContacts[mo % invoiceContacts.length];
    const total   = Math.round((8000 + Math.random() * 12000) * 100) / 100;
    const paid    = mo > 1 ? total : mo === 1 ? Math.round(total * 0.5 * 100) / 100 : 0;
    invRows.push({
      connection_id:  conn.id,
      invoice_number: `INV-${invNum++}`,
      contact,
      type:           'ACCPAY',
      status:         mo > 1 ? 'PAID' : mo === 1 ? 'AUTHORISED' : 'DRAFT',
      date:           d,
      due_date:       new Date(d.getFullYear(), d.getMonth(), d.getDate() + 30),
      total,
      amount_paid:    paid,
      amount_due:     Math.round((total - paid) * 100) / 100,
      currency:       'AUD',
    });
  }
  await prisma.xeroInvoice.createMany({ data: invRows });

  // ── 7. BAS Returns (last 12 quarters) ────────────────────────────────────
  const basRows = [];
  for (let q = 11; q >= 0; q--) {
    const qEnd  = new Date(now.getFullYear(), now.getMonth() - q * 3, 1);
    const yr    = qEnd.getFullYear();
    const qNum  = Math.floor(qEnd.getMonth() / 3) + 1;
    const qS    = new Date(yr, (qNum - 1) * 3, 1);
    const qE    = new Date(yr, qNum * 3, 0);
    const gstC  = Math.round(baseRev * 3 * 0.1 * (1 + q * 0.01));
    const gstP  = Math.round(gstC * 0.35);
    basRows.push({
      connection_id: conn.id,
      quarter:       qNum,
      year:          yr,
      period_start:  qS,
      period_end:    qE,
      gst_collected: gstC,
      gst_paid:      gstP,
      net_gst:       gstC - gstP,
      payg_withheld: Math.round(baseRev * 3 * 0.26 * 0.19),
      total_payable: Math.round((gstC - gstP) + baseRev * 3 * 0.26 * 0.19),
      status:        q > 0 ? 'LODGED' : 'PENDING',
      lodged_date:   q > 0 ? new Date(qE.getFullYear(), qE.getMonth() + 1, 28) : null,
      due_date:      new Date(qE.getFullYear(), qE.getMonth() + 1, 28),
    });
  }
  await prisma.xeroBASReturn.createMany({ data: basRows, skipDuplicates: true });

  // ── 8. Contacts ───────────────────────────────────────────────────────────
  const contactRows = [
    { name: 'Bidfood Australia',    contact_type: 'SUPPLIER', abn: '31 000 070 480', city: 'Melbourne', state: 'VIC', total_spend: 285000, transaction_count: 36 },
    { name: 'GPT Property Group',   contact_type: 'SUPPLIER', abn: '58 071 467 667', city: 'Sydney',    state: 'NSW', total_spend: 432000, transaction_count: 36 },
    { name: 'AGL Energy',           contact_type: 'SUPPLIER', abn: '74 115 061 375', city: 'Melbourne', state: 'VIC', total_spend: 86400,  transaction_count: 36 },
    { name: 'Workpac Staffing',     contact_type: 'SUPPLIER', abn: '67 117 688 831', city: 'Brisbane',  state: 'QLD', total_spend: 194400, transaction_count: 36 },
    { name: 'Meta Ads',             contact_type: 'SUPPLIER', abn: null,             city: 'Menlo Park', state: null, total_spend: 97200,  transaction_count: 36 },
    { name: 'QBE Insurance',        contact_type: 'SUPPLIER', abn: '28 008 485 014', city: 'Sydney',    state: 'NSW', total_spend: 34560,  transaction_count: 12 },
    { name: 'Deloitte Accounting',  contact_type: 'SUPPLIER', abn: '74 490 121 060', city: 'Melbourne', state: 'VIC', total_spend: 43200,  transaction_count: 12 },
    { name: 'Catering Corp AU',     contact_type: 'CUSTOMER', abn: '12 345 678 901', city: 'Melbourne', state: 'VIC', total_revenue: 145000, transaction_count: 18 },
  ];
  await prisma.xeroContact.createMany({
    data: contactRows.map(c => ({ ...c, connection_id: conn.id })),
    skipDuplicates: true,
  });

  // ── 9. Tracking (Dine-In vs Takeaway) ────────────────────────────────────
  // Name must be 'Service Type' — the predictions engine matches on it to build
  // channel-growth projections (xero.predictions.service.js §6).
  const trackCat = await prisma.xeroTrackingCategory.create({
    data: { connection_id: conn.id, name: 'Service Type' },
  });
  const optDineIn   = await prisma.xeroTrackingOption.create({ data: { category_id: trackCat.id, name: 'Dine-In' } });
  const optTakeaway = await prisma.xeroTrackingOption.create({ data: { category_id: trackCat.id, name: 'Takeaway' } });

  const trackRows = [];
  for (let mo = 35; mo >= 0; mo--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - mo, 1);
    const rev = Math.round(baseRev * seasonal[d.getMonth()] * (1 + (35 - mo) * 0.004) * jitter(0.08));
    // Channel mix shifts over time: takeaway share grows from ~28% to ~38%
    // across the 3 years, so the channel-growth prediction sees a real trend.
    const monthsElapsed = 35 - mo;
    const takeawayShare = Math.min(0.40, 0.28 + monthsElapsed * 0.003) * jitter(0.06);
    const dineRev = Math.round(rev * (1 - takeawayShare));
    const takeRev = Math.round(rev * takeawayShare);
    trackRows.push(
      { connection_id: conn.id, option_id: optDineIn.id,   year: d.getFullYear(), month: d.getMonth() + 1, revenue: dineRev, cost: Math.round(dineRev * 0.32 * jitter(0.08)), transaction_count: Math.round(dineRev / 45) },
      { connection_id: conn.id, option_id: optTakeaway.id, year: d.getFullYear(), month: d.getMonth() + 1, revenue: takeRev, cost: Math.round(takeRev * 0.28 * jitter(0.08)), transaction_count: Math.round(takeRev / 25) },
    );
  }
  await prisma.xeroTrackingSummary.createMany({ data: trackRows });

  return { skipped: false, connection_id: conn.id, transactions: txnRows.length };
}

/**
 * Removes all demo data for an outlet (so it can be re-seeded).
 */
async function clearDemoData(outletId) {
  const prisma = getDbClient();
  const conn = await prisma.xeroConnection.findFirst({
    where: { outlet_id: outletId, is_deleted: false },
  });
  if (!conn) return;
  // Hard-delete all child rows then the connection
  await prisma.xeroTrackingSummary.deleteMany({ where: { connection_id: conn.id } });
  await prisma.xeroTrackingOption.deleteMany({ where: { category: { connection_id: conn.id } } });
  await prisma.xeroTrackingCategory.deleteMany({ where: { connection_id: conn.id } });
  await prisma.xeroContact.deleteMany({ where: { connection_id: conn.id } });
  await prisma.xeroBASReturn.deleteMany({ where: { connection_id: conn.id } });
  await prisma.xeroInvoice.deleteMany({ where: { connection_id: conn.id } });
  await prisma.xeroBalanceSheetLine.deleteMany({ where: { connection_id: conn.id } });
  await prisma.xeroBankAccount.deleteMany({ where: { connection_id: conn.id } });
  await prisma.xeroTransaction.deleteMany({ where: { connection_id: conn.id } });
  await prisma.xeroAccount.deleteMany({ where: { connection_id: conn.id } });
  await prisma.xeroConnection.delete({ where: { id: conn.id } });
}

module.exports = { seedDemoData, clearDemoData };
