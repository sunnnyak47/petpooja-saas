/**
 * Seed script: Phase 3 — Bank Accounts, Balance Sheet, Invoices, BAS, Contacts, Tracking
 *
 * Seeds 6 new Xero data tables using realistic mock data derived from existing transactions.
 * MUST run AFTER seed-xero.js (needs existing XeroConnection + XeroTransactions).
 *
 * Usage: node scripts/seed-xero-phase3.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// The outlet_id that matches the JWT user
const TARGET_OUTLET_ID = '718e40f0-e2fc-4c7f-879e-09c8651e2774';

async function main() {
  console.log('Phase 3 Xero seed — starting...\n');

  // ── Find connection ──────────────────────────────────────────────
  const conn = await prisma.xeroConnection.findFirst({
    where: { outlet_id: TARGET_OUTLET_ID, is_deleted: false },
  });
  if (!conn) throw new Error(`No XeroConnection for outlet ${TARGET_OUTLET_ID}`);
  const CID = conn.id;
  console.log(`Connection: ${conn.org_name} (${CID})\n`);

  // ── Load all existing transactions for calculations ──────────────
  const txns = await prisma.xeroTransaction.findMany({
    where: { connection_id: CID },
    orderBy: { date: 'asc' },
  });
  console.log(`Found ${txns.length} existing transactions\n`);

  // ── 1. BANK ACCOUNT ──────────────────────────────────────────────
  console.log('1/6  Seeding XeroBankAccount...');
  await prisma.xeroBankAccount.deleteMany({ where: { connection_id: CID } });

  // Compute current balance from all transactions (opening = 50000)
  const openingBalance = 50000;
  let runningBalance = openingBalance;
  for (const t of txns) {
    runningBalance += Number(t.net_amount); // revenue positive, expenses negative
  }

  await prisma.xeroBankAccount.create({
    data: {
      connection_id: CID,
      account_name: 'Business Cheque Account',
      account_number: '4821-7390',
      bsb: '066-000',
      opening_balance: openingBalance,
      opening_date: new Date('2022-01-01'),
      current_balance: Math.round(runningBalance * 100) / 100,
      is_active: true,
    },
  });
  console.log(`   Created bank account — opening: $${openingBalance}, current: $${Math.round(runningBalance * 100) / 100}`);

  // ── 2. BALANCE SHEET LINES ───────────────────────────────────────
  console.log('2/6  Seeding XeroBalanceSheetLine...');
  await prisma.xeroBalanceSheetLine.deleteMany({ where: { connection_id: CID } });

  // Generate monthly balance sheet snapshots
  const bsLines = [];
  // Group transactions by month to compute running totals
  const monthlyNetCash = {};
  let cumulativeProfit = 0;

  for (const t of txns) {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyNetCash[key]) monthlyNetCash[key] = 0;
    monthlyNetCash[key] += Number(t.net_amount);
  }

  const sortedMonths = Object.keys(monthlyNetCash).sort();
  let bankBalance = openingBalance;
  let equipmentValue = 85000; // starting equipment value
  let fitoutValue = 120000; // starting fitout value
  let gstPayable = 0;
  let superPayable = 0;
  let loanBalance = 180000; // starting loan

  for (const mk of sortedMonths) {
    const [yr, mo] = mk.split('-').map(Number);
    const asAt = new Date(yr, mo - 1, 28); // end of month (approx)
    const monthNet = monthlyNetCash[mk];
    bankBalance += monthNet;
    cumulativeProfit += monthNet;

    // Depreciation reduces asset values
    equipmentValue = Math.max(equipmentValue - 520, 20000);
    fitoutValue = Math.max(fitoutValue - 780, 30000);

    // Loan reduces monthly
    loanBalance = Math.max(loanBalance - 2500, 0);

    // GST and super fluctuate with revenue
    const monthTxns = txns.filter(t => {
      const d = new Date(t.date);
      return d.getFullYear() === yr && d.getMonth() + 1 === mo;
    });
    gstPayable = 0;
    superPayable = 0;
    for (const t of monthTxns) {
      gstPayable += Math.abs(Number(t.gst));
      if (t.category === 'Labour' && t.account_name === 'Superannuation') {
        superPayable += Math.abs(Number(t.net_amount));
      }
    }

    // ASSETS
    bsLines.push({ connection_id: CID, as_at_date: asAt, account_code: '090', account_name: 'Business Cheque Account', account_type: 'ASSET', sub_type: 'CURRENT', balance: Math.round(bankBalance * 100) / 100 });
    bsLines.push({ connection_id: CID, as_at_date: asAt, account_code: '091', account_name: 'Cash Float', account_type: 'ASSET', sub_type: 'CURRENT', balance: 2000 });
    bsLines.push({ connection_id: CID, as_at_date: asAt, account_code: '092', account_name: 'Accounts Receivable', account_type: 'ASSET', sub_type: 'CURRENT', balance: Math.round(Math.random() * 3000 + 1000) });
    bsLines.push({ connection_id: CID, as_at_date: asAt, account_code: '093', account_name: 'Inventory on Hand', account_type: 'ASSET', sub_type: 'CURRENT', balance: Math.round(4000 + Math.random() * 2000) });
    bsLines.push({ connection_id: CID, as_at_date: asAt, account_code: '094', account_name: 'Kitchen Equipment', account_type: 'ASSET', sub_type: 'FIXED', balance: Math.round(equipmentValue * 100) / 100 });
    bsLines.push({ connection_id: CID, as_at_date: asAt, account_code: '095', account_name: 'Restaurant Fit-out', account_type: 'ASSET', sub_type: 'FIXED', balance: Math.round(fitoutValue * 100) / 100 });

    // LIABILITIES
    bsLines.push({ connection_id: CID, as_at_date: asAt, account_code: '820', account_name: 'GST Payable', account_type: 'LIABILITY', sub_type: 'CURRENT', balance: Math.round(gstPayable * 100) / 100 });
    bsLines.push({ connection_id: CID, as_at_date: asAt, account_code: '821', account_name: 'PAYG Withholding Payable', account_type: 'LIABILITY', sub_type: 'CURRENT', balance: Math.round(gstPayable * 0.3 * 100) / 100 });
    bsLines.push({ connection_id: CID, as_at_date: asAt, account_code: '822', account_name: 'Superannuation Payable', account_type: 'LIABILITY', sub_type: 'CURRENT', balance: Math.round(superPayable * 100) / 100 });
    bsLines.push({ connection_id: CID, as_at_date: asAt, account_code: '823', account_name: 'Accounts Payable', account_type: 'LIABILITY', sub_type: 'CURRENT', balance: Math.round(2000 + Math.random() * 5000) });
    bsLines.push({ connection_id: CID, as_at_date: asAt, account_code: '850', account_name: 'Business Loan', account_type: 'LIABILITY', sub_type: 'LONG_TERM', balance: Math.round(loanBalance * 100) / 100 });

    // EQUITY
    bsLines.push({ connection_id: CID, as_at_date: asAt, account_code: '310', account_name: 'Owner Capital', account_type: 'EQUITY', sub_type: 'EQUITY', balance: 100000 });
    bsLines.push({ connection_id: CID, as_at_date: asAt, account_code: '320', account_name: 'Retained Earnings', account_type: 'EQUITY', sub_type: 'EQUITY', balance: Math.round(cumulativeProfit * 100) / 100 });
  }

  // Batch insert
  const BS_BATCH = 500;
  for (let i = 0; i < bsLines.length; i += BS_BATCH) {
    await prisma.xeroBalanceSheetLine.createMany({ data: bsLines.slice(i, i + BS_BATCH) });
  }
  console.log(`   Created ${bsLines.length} balance sheet lines (${sortedMonths.length} months × 13 accounts)`);

  // ── 3. INVOICES ──────────────────────────────────────────────────
  console.log('3/6  Seeding XeroInvoice...');
  await prisma.xeroInvoice.deleteMany({ where: { connection_id: CID } });

  const invoices = [];
  let invNum = 1001;

  // Group sales invoices by transaction
  const salesTxns = txns.filter(t => t.type === 'Sales Invoice' && t.account_type === 'REVENUE');
  const billTxns = txns.filter(t => t.type === 'Bill' && (t.account_type === 'EXPENSE' || t.account_type === 'DIRECTCOSTS'));

  // Create sales invoices (ACCREC) — sample every 3rd to keep count reasonable
  for (let i = 0; i < salesTxns.length; i += 3) {
    const t = salesTxns[i];
    const d = new Date(t.date);
    const dueDate = new Date(d);
    dueDate.setDate(dueDate.getDate() + 14);

    // Most are paid, some recent ones are outstanding
    const isRecent = d >= new Date('2024-10-01');
    const daysSinceDue = (new Date('2024-12-31') - dueDate) / 86400000;
    let status = 'PAID';
    let amount_paid = Math.abs(Number(t.net_amount));
    let amount_due = 0;

    if (isRecent && Math.random() < 0.25) {
      if (daysSinceDue > 0) {
        status = 'OVERDUE';
        amount_paid = Math.round(Math.abs(Number(t.net_amount)) * Math.random() * 0.5 * 100) / 100;
        amount_due = Math.round((Math.abs(Number(t.net_amount)) - amount_paid) * 100) / 100;
      } else {
        status = 'AUTHORISED';
        amount_paid = 0;
        amount_due = Math.abs(Number(t.net_amount));
      }
    }

    invoices.push({
      connection_id: CID,
      invoice_number: `INV-${String(invNum++).padStart(5, '0')}`,
      contact: t.contact || 'Walk-in Customer',
      type: 'ACCREC',
      status,
      date: d,
      due_date: dueDate,
      total: Math.abs(Number(t.amount_incl_gst)),
      amount_paid: status === 'PAID' ? Math.abs(Number(t.amount_incl_gst)) : Math.round(amount_paid * 1.1 * 100) / 100,
      amount_due: status === 'PAID' ? 0 : Math.round(amount_due * 1.1 * 100) / 100,
      currency: 'AUD',
    });
  }

  // Create bill invoices (ACCPAY) — sample every 5th
  for (let i = 0; i < billTxns.length; i += 5) {
    const t = billTxns[i];
    const d = new Date(t.date);
    const dueDate = new Date(d);
    dueDate.setDate(dueDate.getDate() + 30);

    const isRecent = d >= new Date('2024-10-01');
    const daysSinceDue = (new Date('2024-12-31') - dueDate) / 86400000;
    let status = 'PAID';
    let amount_paid = Math.abs(Number(t.net_amount));
    let amount_due = 0;

    if (isRecent && Math.random() < 0.2) {
      if (daysSinceDue > 0) {
        status = 'OVERDUE';
        amount_paid = 0;
        amount_due = Math.abs(Number(t.net_amount));
      } else {
        status = 'AUTHORISED';
        amount_paid = 0;
        amount_due = Math.abs(Number(t.net_amount));
      }
    }

    invoices.push({
      connection_id: CID,
      invoice_number: `BILL-${String(invNum++).padStart(5, '0')}`,
      contact: t.contact || 'Unknown Supplier',
      type: 'ACCPAY',
      status,
      date: d,
      due_date: dueDate,
      total: Math.abs(Number(t.amount_incl_gst)),
      amount_paid: status === 'PAID' ? Math.abs(Number(t.amount_incl_gst)) : Math.round(amount_paid * 1.1 * 100) / 100,
      amount_due: status === 'PAID' ? 0 : Math.round(amount_due * 1.1 * 100) / 100,
      currency: 'AUD',
    });
  }

  for (let i = 0; i < invoices.length; i += 500) {
    await prisma.xeroInvoice.createMany({ data: invoices.slice(i, i + 500) });
  }
  console.log(`   Created ${invoices.length} invoices (ACCREC + ACCPAY)`);

  // ── 4. BAS RETURNS ───────────────────────────────────────────────
  console.log('4/6  Seeding XeroBASReturn...');
  await prisma.xeroBASReturn.deleteMany({ where: { connection_id: CID } });

  const basReturns = [];
  // Generate quarterly BAS from 2022Q1 to 2024Q4
  for (let yr = 2022; yr <= 2024; yr++) {
    for (let q = 1; q <= 4; q++) {
      const startMonth = (q - 1) * 3; // 0,3,6,9
      const endMonth = startMonth + 2;  // 2,5,8,11
      const periodStart = new Date(yr, startMonth, 1);
      const periodEnd = new Date(yr, endMonth + 1, 0); // last day of end month

      // Calculate GST from transactions in this quarter
      let gstCollected = 0;
      let gstPaid = 0;
      let labourTotal = 0;

      for (const t of txns) {
        const td = new Date(t.date);
        if (td >= periodStart && td <= periodEnd) {
          const gst = Number(t.gst);
          if (t.account_type === 'REVENUE') {
            gstCollected += Math.abs(gst);
          } else {
            gstPaid += Math.abs(gst);
          }
          if (t.category === 'Labour') {
            labourTotal += Math.abs(Number(t.net_amount));
          }
        }
      }

      const netGst = gstCollected - gstPaid;
      const paygWithheld = Math.round(labourTotal * 0.22 * 100) / 100; // ~22% withholding rate
      const totalPayable = Math.round((netGst + paygWithheld) * 100) / 100;

      // Due date: 28th of month after quarter end
      const dueDate = new Date(yr, endMonth + 2, 28);

      // Status: all past quarters are lodged, last one might be DUE
      const isLast = yr === 2024 && q === 4;
      const status = isLast ? 'DUE' : 'LODGED';
      const lodgedDate = isLast ? null : new Date(yr, endMonth + 2, Math.floor(Math.random() * 20) + 1);

      basReturns.push({
        connection_id: CID,
        quarter: q,
        year: yr,
        period_start: periodStart,
        period_end: periodEnd,
        gst_collected: Math.round(gstCollected * 100) / 100,
        gst_paid: Math.round(gstPaid * 100) / 100,
        net_gst: Math.round(netGst * 100) / 100,
        payg_withheld: paygWithheld,
        total_payable: totalPayable,
        status,
        lodged_date: lodgedDate,
        due_date: dueDate,
      });
    }
  }

  await prisma.xeroBASReturn.createMany({ data: basReturns });
  console.log(`   Created ${basReturns.length} BAS returns (${2022}-${2024})`);

  // ── 5. CONTACTS ──────────────────────────────────────────────────
  console.log('5/6  Seeding XeroContact...');
  await prisma.xeroContact.deleteMany({ where: { connection_id: CID } });

  // Extract unique contacts from transactions
  const contactMap = {};
  for (const t of txns) {
    const name = t.contact;
    if (!name) continue;
    if (!contactMap[name]) {
      contactMap[name] = {
        spend: 0,
        revenue: 0,
        count: 0,
        firstDate: t.date,
        lastDate: t.date,
        isSupplier: false,
        isCustomer: false,
      };
    }
    contactMap[name].count += 1;
    if (new Date(t.date) < new Date(contactMap[name].firstDate)) contactMap[name].firstDate = t.date;
    if (new Date(t.date) > new Date(contactMap[name].lastDate)) contactMap[name].lastDate = t.date;

    if (t.account_type === 'REVENUE') {
      contactMap[name].revenue += Math.abs(Number(t.net_amount));
      contactMap[name].isCustomer = true;
    } else {
      contactMap[name].spend += Math.abs(Number(t.net_amount));
      contactMap[name].isSupplier = true;
    }
  }

  // Realistic contact details
  const supplierDetails = {
    'Lion Nathan': { abn: '13008596370', email: 'orders@lionnathan.com.au', phone: '08 9200 1234', address: '15 Mounts Bay Rd', city: 'Perth', state: 'WA', postcode: '6000' },
    'Carlton & United': { abn: '76004056106', email: 'supply@cub.com.au', phone: '08 9300 5678', address: '77 Southbank Blvd', city: 'Perth', state: 'WA', postcode: '6000' },
    'Coca-Cola Amatil': { abn: '26004139397', email: 'customerservice@ccamatil.com', phone: '08 9250 4321', address: '40 Mount St', city: 'Perth', state: 'WA', postcode: '6000' },
    'Bidfood': { abn: '21073503230', email: 'wa.orders@bidfood.com.au', phone: '08 9350 8765', address: '12 Bannister Rd', city: 'Canning Vale', state: 'WA', postcode: '6155' },
    'PFD Foods': { abn: '11004698657', email: 'orders.wa@pfrfoods.com.au', phone: '08 9350 2222', address: '5 Frobisher St', city: 'Osborne Park', state: 'WA', postcode: '6017' },
    'ADP Payroll': { abn: '70002756588', email: 'support@adp.com.au', phone: '1300 237 237', address: '601 Pacific Hwy', city: 'Perth', state: 'WA', postcode: '6000' },
    'Synergy Energy': { abn: '58673889140', email: 'business@synergy.net.au', phone: '13 13 53', address: '219 St Georges Tce', city: 'Perth', state: 'WA', postcode: '6000' },
    'Water Corporation': { abn: '28003434917', email: 'accounts@watercorporation.com.au', phone: '13 13 85', address: '629 Newcastle St', city: 'Leederville', state: 'WA', postcode: '6007' },
    'Telstra Business': { abn: '33051775556', email: 'business@telstra.com.au', phone: '13 22 00', address: '363 Wellington St', city: 'Perth', state: 'WA', postcode: '6000' },
    'Spotless Group': { abn: '92054846962', email: 'service@spotless.com.au', phone: '08 9411 3300', address: '32 Delhi St', city: 'West Perth', state: 'WA', postcode: '6005' },
    'Facebook Ads': { abn: '11124729088', email: 'adsupport@meta.com', phone: null, address: '1 Hacker Way', city: 'Menlo Park', state: 'CA', postcode: '94025' },
    'Google Ads': { abn: '33102417032', email: 'ads-noreply@google.com', phone: null, address: '48 Pirrama Rd', city: 'Pyrmont', state: 'NSW', postcode: '2009' },
    'Square POS': { abn: '38164065906', email: 'support@squareup.com', phone: '1300 564 828', address: '580 George St', city: 'Sydney', state: 'NSW', postcode: '2000' },
    'BankWest': { abn: '31087651607', email: 'merchant@bankwest.com.au', phone: '13 17 19', address: '300 Murray St', city: 'Perth', state: 'WA', postcode: '6000' },
    'Statewest Insurance': { abn: '42003229424', email: 'claims@statewest.com.au', phone: '08 9441 7000', address: '100 Stirling Hwy', city: 'Nedlands', state: 'WA', postcode: '6009' },
    'City of Perth': { abn: '83780118628', email: 'rates@cityofperth.wa.gov.au', phone: '08 9461 3333', address: '27 St Georges Tce', city: 'Perth', state: 'WA', postcode: '6000' },
    'RSM Accountants': { abn: '43115088631', email: 'perth@rsm.com.au', phone: '08 9261 9100', address: 'Level 32, Exchange Tower', city: 'Perth', state: 'WA', postcode: '6000' },
  };

  const customerDetails = {
    'Corporate Functions': { email: 'events@corpfunctions.com.au', phone: '08 9320 1111', city: 'Perth', state: 'WA', postcode: '6000' },
    'Wedding Receptions': { email: 'bookings@weddingperth.com.au', phone: '08 9321 2222', city: 'Perth', state: 'WA', postcode: '6000' },
    'Uber Eats': { abn: '62605572498', email: 'restaurants@ubereats.com', phone: '1800 253 293', city: 'Sydney', state: 'NSW', postcode: '2000' },
    'Menulog': { abn: '20151944063', email: 'partners@menulog.com.au', phone: '1300 966 647', city: 'Sydney', state: 'NSW', postcode: '2000' },
    'DoorDash': { abn: '49636937401', email: 'merchant@doordash.com', phone: '1800 958 316', city: 'Melbourne', state: 'VIC', postcode: '3000' },
  };

  const contactRecords = [];
  for (const [name, data] of Object.entries(contactMap)) {
    const details = supplierDetails[name] || customerDetails[name] || {};
    const contactType = data.isSupplier && !data.isCustomer ? 'SUPPLIER'
                       : !data.isSupplier && data.isCustomer ? 'CUSTOMER'
                       : 'SUPPLIER'; // dual → default supplier

    contactRecords.push({
      connection_id: CID,
      name,
      contact_type: contactType,
      abn: details.abn || null,
      email: details.email || null,
      phone: details.phone || null,
      address: details.address || null,
      city: details.city || null,
      state: details.state || null,
      postcode: details.postcode || null,
      is_active: true,
      total_spend: Math.round(data.spend * 100) / 100,
      total_revenue: Math.round(data.revenue * 100) / 100,
      transaction_count: data.count,
      first_transaction: new Date(data.firstDate),
      last_transaction: new Date(data.lastDate),
    });
  }

  await prisma.xeroContact.createMany({ data: contactRecords });
  console.log(`   Created ${contactRecords.length} contacts`);

  // ── 6. TRACKING CATEGORIES & SUMMARIES ───────────────────────────
  console.log('6/6  Seeding XeroTrackingCategory + Options + Summaries...');
  // Clean up in dependency order
  await prisma.xeroTrackingSummary.deleteMany({ where: { connection_id: CID } });
  // Need to find category IDs to delete options
  const existingCats = await prisma.xeroTrackingCategory.findMany({ where: { connection_id: CID } });
  for (const cat of existingCats) {
    await prisma.xeroTrackingOption.deleteMany({ where: { category_id: cat.id } });
  }
  await prisma.xeroTrackingCategory.deleteMany({ where: { connection_id: CID } });

  // Create two tracking categories
  const serviceType = await prisma.xeroTrackingCategory.create({
    data: { connection_id: CID, name: 'Service Type' },
  });
  const mealPeriod = await prisma.xeroTrackingCategory.create({
    data: { connection_id: CID, name: 'Meal Period' },
  });

  // Service Type options with revenue split percentages
  const serviceOptions = [
    { name: 'Dine-in', revPct: 0.55 },
    { name: 'Takeaway', revPct: 0.15 },
    { name: 'Delivery', revPct: 0.18 },
    { name: 'Private Events', revPct: 0.12 },
  ];

  // Meal Period options with revenue split percentages
  const mealOptions = [
    { name: 'Breakfast', revPct: 0.08 },
    { name: 'Lunch', revPct: 0.30 },
    { name: 'Dinner', revPct: 0.52 },
    { name: 'Late Night', revPct: 0.10 },
  ];

  const createdServiceOptions = [];
  for (const opt of serviceOptions) {
    const o = await prisma.xeroTrackingOption.create({
      data: { category_id: serviceType.id, name: opt.name },
    });
    createdServiceOptions.push({ ...o, revPct: opt.revPct });
  }

  const createdMealOptions = [];
  for (const opt of mealOptions) {
    const o = await prisma.xeroTrackingOption.create({
      data: { category_id: mealPeriod.id, name: opt.name },
    });
    createdMealOptions.push({ ...o, revPct: opt.revPct });
  }

  // Generate monthly summaries from revenue transactions
  const monthlyRevenue = {};
  const monthlyCost = {};
  const monthlyTxnCount = {};

  for (const t of txns) {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    if (t.account_type === 'REVENUE') {
      if (!monthlyRevenue[key]) monthlyRevenue[key] = 0;
      if (!monthlyTxnCount[key]) monthlyTxnCount[key] = 0;
      monthlyRevenue[key] += Number(t.net_amount);
      monthlyTxnCount[key] += 1;
    }
    if (t.account_type === 'DIRECTCOSTS') {
      if (!monthlyCost[key]) monthlyCost[key] = 0;
      monthlyCost[key] += Math.abs(Number(t.net_amount));
    }
  }

  const summaries = [];
  for (const [key, rev] of Object.entries(monthlyRevenue)) {
    const [yr, mo] = key.split('-').map(Number);
    const cost = monthlyCost[key] || 0;
    const txnCount = monthlyTxnCount[key] || 0;

    // Seasonal adjustments for service types
    const isWinter = [6, 7, 8].includes(mo);
    const isSummer = [12, 1, 2].includes(mo);
    const isDecember = mo === 12;

    for (const opt of createdServiceOptions) {
      let pct = opt.revPct;
      // Winter: delivery increases, dine-in decreases
      if (isWinter && opt.name === 'Delivery') pct += 0.05;
      if (isWinter && opt.name === 'Dine-in') pct -= 0.05;
      // Summer: dine-in increases
      if (isSummer && opt.name === 'Dine-in') pct += 0.03;
      if (isSummer && opt.name === 'Delivery') pct -= 0.03;
      // December: events spike
      if (isDecember && opt.name === 'Private Events') pct += 0.08;
      if (isDecember && opt.name === 'Dine-in') pct -= 0.05;
      if (isDecember && opt.name === 'Takeaway') pct -= 0.03;

      // YoY growth: 2023 +10%, 2024 +8%
      let growthFactor = 1;
      if (yr === 2023) growthFactor = 1.0;
      if (yr === 2024) growthFactor = 1.0;
      // Delivery grows faster YoY
      if (opt.name === 'Delivery' && yr === 2023) growthFactor = 1.05;
      if (opt.name === 'Delivery' && yr === 2024) growthFactor = 1.1;

      const optRev = Math.round(rev * pct * growthFactor * 100) / 100;
      const optCost = Math.round(cost * pct * 100) / 100;
      const optCount = Math.max(1, Math.round(txnCount * pct));

      summaries.push({
        connection_id: CID,
        option_id: opt.id,
        year: yr,
        month: mo,
        revenue: optRev,
        cost: optCost,
        transaction_count: optCount,
      });
    }

    for (const opt of createdMealOptions) {
      let pct = opt.revPct;
      // Weekend effect: dinner and late night slightly higher
      // (applied uniformly since we don't have day-level data)
      if (isDecember && opt.name === 'Late Night') pct += 0.03;
      if (isDecember && opt.name === 'Dinner') pct += 0.02;
      if (isDecember && opt.name === 'Breakfast') pct -= 0.02;
      if (isDecember && opt.name === 'Lunch') pct -= 0.03;

      const optRev = Math.round(rev * pct * 100) / 100;
      const optCost = Math.round(cost * pct * 100) / 100;
      const optCount = Math.max(1, Math.round(txnCount * pct));

      summaries.push({
        connection_id: CID,
        option_id: opt.id,
        year: yr,
        month: mo,
        revenue: optRev,
        cost: optCost,
        transaction_count: optCount,
      });
    }
  }

  for (let i = 0; i < summaries.length; i += 500) {
    await prisma.xeroTrackingSummary.createMany({ data: summaries.slice(i, i + 500) });
  }
  console.log(`   Created ${summaries.length} tracking summaries`);

  // ── Summary ──────────────────────────────────────────────────────
  console.log('\n=== Phase 3 Seed Summary ===');
  console.log(`  XeroBankAccount       : 1`);
  console.log(`  XeroBalanceSheetLine  : ${bsLines.length}`);
  console.log(`  XeroInvoice           : ${invoices.length}`);
  console.log(`  XeroBASReturn         : ${basReturns.length}`);
  console.log(`  XeroContact           : ${contactRecords.length}`);
  console.log(`  XeroTrackingCategory  : 2`);
  console.log(`  XeroTrackingOption    : ${createdServiceOptions.length + createdMealOptions.length}`);
  console.log(`  XeroTrackingSummary   : ${summaries.length}`);
  console.log('============================\n');
}

main()
  .catch((err) => {
    console.error('\nSeed failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
