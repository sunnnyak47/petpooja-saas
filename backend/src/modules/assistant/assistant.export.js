/**
 * @fileoverview Assistant report export — lets the read-only assistant hand back a
 * downloadable EOD / P&L / Sales report (CSV/Excel or PDF) for a date range.
 *
 * How it stays safe: the assistant NEVER streams a file itself. When it detects an
 * export request it mints a short-lived signed token (scope 'assistant_export',
 * bound to the user's outlet + the exact module/range/format) and returns a
 * download PATH. The public `/api/assistant/report` route verifies that token and
 * regenerates the file from the same permission-checked read services. The token
 * is the authorisation (so a plain browser click works, no bearer header needed);
 * it expires in 20 min and can't be widened to another outlet or module.
 *
 * @module modules/assistant/assistant.export
 */

const jwt = require('jsonwebtoken');
const appConfig = require('../../config/app');
const logger = require('../../config/logger');

const reports = require('../reports/reports.service');
const eod = require('../reports/eod.service');
const statements = require('../accounting/accounting.statements.service');
const bas = require('../accounting/accounting.bas.service');
const payroll = require('../payroll/payroll.service');

const MAX_RANGE_DAYS = 92; // cap per-day EOD iteration so a huge range can't hammer the DB

// ── date helpers ─────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

/**
 * Parse a date range from natural language. Supports ISO pairs, "dd Mon"/"dd/mm",
 * and relative phrases (today, yesterday, this/last week/month/year, last N days).
 * Falls back to the current month. Returns YMD strings + a human label.
 * @param {string} question
 * @param {Date} [now=new Date()]
 * @returns {{from:string,to:string,label:string}}
 */
function parseDateRange(question, now = new Date()) {
  const q = String(question || '').toLowerCase();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Relative phrases first.
  if (/\btoday\b/.test(q)) return { from: ymd(today), to: ymd(today), label: 'today' };
  if (/\byesterday\b/.test(q)) { const y = addDays(today, -1); return { from: ymd(y), to: ymd(y), label: 'yesterday' }; }
  // "last / past / previous / prior N days|weeks|months" — also matches
  // "for the past 58 days", "over the last 3 weeks", "58 days ago", etc.
  const lastN = q.match(/(?:last|past|previous|prior)\s+(?:the\s+)?(\d{1,3})\s*(days?|weeks?|months?)/) ||
                q.match(/(\d{1,3})\s*(days?|weeks?|months?)\s+ago/);
  if (lastN) {
    const n = parseInt(lastN[1], 10);
    const unit = lastN[2].replace(/s$/, '') + 's';
    const mult = unit.startsWith('week') ? 7 : unit.startsWith('month') ? 30 : 1;
    const from = addDays(today, -(n * mult) + 1);
    return { from: ymd(from), to: ymd(today), label: `last ${n} ${unit}` };
  }
  if (/this\s+week/.test(q)) { const from = addDays(today, -((today.getDay() + 6) % 7)); return { from: ymd(from), to: ymd(today), label: 'this week' }; }
  if (/last\s+week/.test(q)) { const endLast = addDays(today, -((today.getDay() + 6) % 7) - 1); const from = addDays(endLast, -6); return { from: ymd(from), to: ymd(endLast), label: 'last week' }; }
  if (/last\s+month/.test(q)) { const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); return { from: ymd(startOfMonth(lm)), to: ymd(endOfMonth(lm)), label: 'last month' }; }
  if (/this\s+month/.test(q)) { return { from: ymd(startOfMonth(now)), to: ymd(today), label: 'this month' }; }
  if (/this\s+year/.test(q)) { return { from: `${now.getFullYear()}-01-01`, to: ymd(today), label: 'this year' }; }
  if (/last\s+year/.test(q)) { const y = now.getFullYear() - 1; return { from: `${y}-01-01`, to: `${y}-12-31`, label: 'last year' }; }

  // ISO pair: yyyy-mm-dd ... yyyy-mm-dd
  const iso = q.match(/(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/);
  if (iso) return { from: iso[1], to: iso[2], label: `${iso[1]} to ${iso[2]}` };

  // "dd Mon" or "dd Month" pair, optionally with a year.
  const dm = [...q.matchAll(/(\d{1,2})\s*(?:st|nd|rd|th)?\s+([a-z]{3,9})(?:\s+(\d{4}))?/g)];
  if (dm.length >= 2) {
    const toDate = (m) => {
      const day = parseInt(m[1], 10);
      const mon = MONTHS.findIndex((x) => m[2].startsWith(x));
      const yr = m[3] ? parseInt(m[3], 10) : now.getFullYear();
      return mon >= 0 ? new Date(yr, mon, day) : null;
    };
    const a = toDate(dm[0]); const b = toDate(dm[1]);
    if (a && b) return { from: ymd(a), to: ymd(b), label: `${ymd(a)} to ${ymd(b)}` };
  }

  // dd/mm[/yyyy] pair
  const slash = [...q.matchAll(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/g)];
  if (slash.length >= 2) {
    const toDate = (m) => {
      const day = parseInt(m[1], 10); const mon = parseInt(m[2], 10) - 1;
      let yr = m[3] ? parseInt(m[3], 10) : now.getFullYear(); if (yr < 100) yr += 2000;
      return new Date(yr, mon, day);
    };
    const a = toDate(slash[0]); const b = toDate(slash[1]);
    return { from: ymd(a), to: ymd(b), label: `${ymd(a)} to ${ymd(b)}` };
  }

  // Default: current month to date.
  return { from: ymd(startOfMonth(now)), to: ymd(today), label: 'this month' };
}

/**
 * Detect an export request and which report + format it wants.
 * @param {string} question
 * @returns {{module:'eod'|'pnl'|'sales', format:'pdf'|'csv'}|null}
 */
function detectExport(question) {
  const q = String(question || '').toLowerCase();
  // Tiered intent: STRONG verbs (download/export) unambiguously mean "a file".
  // WEAK verbs ("give me", "get me", …) are everyday data-question words — they
  // only mean a file when paired with a format word (pdf/excel/csv) or a file-ish
  // noun (report/file/statement). Without the tier, "give me today's sales"
  // returned a download link instead of an answer.
  const strongVerb = /\b(download|export)\b/.test(q);
  const weakVerb = /\b(generate|save|send me|give me|get me|pull|extract)\b/.test(q);
  const formatWord = /\b(pdf|excel|xlsx|xls|spreadsheet|csv)\b/.test(q);
  const fileNoun = /\b(report|file|statement)\b/.test(q);
  const wantsFile = strongVerb || formatWord || (weakVerb && fileNoun);
  if (!wantsFile) return null;

  const format = /\bpdf\b/.test(q) ? 'pdf' : (/\b(xlsx|xls|excel|spreadsheet)\b/.test(q) ? 'xlsx' : 'csv');
  let module = null;
  if (/(p\s*&\s*l|p and l|pnl|prof\w*\s*(and|&|n)?\s*loss|income statement)/.test(q)) module = 'pnl';
  else if (/balance[\s-]*sheet/.test(q)) module = 'balance_sheet';
  else if (/\b(gst|bas)\b/.test(q) && /(report|return|summary|statement|figures?|owed?)/.test(q)) module = 'bas';
  else if (/(inventory|stock)\s*(valuation|value|worth)|valuation\s*report/.test(q)) module = 'inventory_valuation';
  else if (/(payroll|payslip|pay[\s-]*run|wage[\s-]*bill)/.test(q)) module = 'payroll';
  else if (/(item[\s-]*wise|item[\s-]*level|sales?\s*by\s*item|by[\s-]*item|top\s*items?\s*report|product\s*sales|item\s*sales)/.test(q)) module = 'item_wise';
  else if (/(eod|end[\s-]*of[\s-]*day|day[\s-]*close|z[\s-]*report|daily[\s-]*close|closing report)/.test(q)) module = 'eod';
  else if (/(sales|revenue|takings|turnover)/.test(q)) module = 'sales';

  // "export a report" with no explicit module → default to a sales report — but
  // NOT when the report clearly belongs to another domain we don't export as a
  // file (staff hours report, inventory report, …): let the data tools answer.
  const otherDomain = /\b(staff|hours|attendance|timesheet|inventory|stock|customer|payroll|wage|fraud|purchase|supplier|menu|reservation)\b/.test(q);
  if (!module) { if (/\breport\b/.test(q) && !otherDomain) module = 'sales'; else return null; }
  return { module, format };
}

const MODULE_LABEL = {
  eod: 'End-of-day', pnl: 'Profit & Loss', sales: 'Sales',
  item_wise: 'Item-wise Sales', inventory_valuation: 'Inventory Valuation',
  balance_sheet: 'Balance Sheet', bas: 'GST / BAS', payroll: 'Payroll',
};

// ── token sign / verify ──────────────────────────────────────────────────────
function signExportToken(payload) {
  return jwt.sign({ scope: 'assistant_export', ...payload }, appConfig.jwt.secret, { expiresIn: '20m' });
}
function verifyExportToken(token) {
  const decoded = jwt.verify(token, appConfig.jwt.secret);
  if (decoded.scope !== 'assistant_export') throw new Error('wrong token scope');
  return decoded;
}

/**
 * Build the chat download descriptor for an export request, or null if the
 * question isn't an export. `path` is relative to the API base (VITE_API_URL).
 * @param {{outletId:string, currency?:string}} ctx
 * @param {string} question
 * @param {Date} [now]
 */
function buildDescriptor(ctx, question, now = new Date()) {
  const intent = detectExport(question);
  if (!intent || !ctx.outletId) return null;
  const { from, to, label } = parseDateRange(question, now);
  const token = signExportToken({ outletId: ctx.outletId, module: intent.module, from, to, format: intent.format, currency: ctx.currency || 'AUD' });
  const ext = intent.format === 'pdf' ? 'pdf' : intent.format === 'xlsx' ? 'xlsx' : 'csv';
  const filename = `${intent.module}-${from}-to-${to}.${ext}`;
  return {
    module: intent.module,
    module_label: MODULE_LABEL[intent.module],
    format: intent.format,
    from, to, range_label: label,
    filename,
    path: `/assistant/report?t=${encodeURIComponent(token)}`,
  };
}

// ── data → rows ──────────────────────────────────────────────────────────────
const n2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

function dateList(from, to) {
  const out = [];
  let d = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  for (let i = 0; i < MAX_RANGE_DAYS && d <= end; i += 1) { out.push(ymd(d)); d = addDays(d, 1); }
  return out;
}

/** Currency with 2 decimals + thousands separators, for display (PDF). */
function fmtMoney(cur, n) {
  const c = cur || 'AUD';
  const locale = c === 'INR' ? 'en-IN' : 'en-AU';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: c, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
  } catch (_) { return `${c} ${(Number(n) || 0).toFixed(2)}`; }
}

/*
 * Table model consumed by both renderers:
 *   { title, columns: [{label, align:'left'|'right', money?:bool, w?:number}],
 *     rows: [{type:'data'|'total'|'grand', cells:[...]} | {type:'section', label}] }
 * Cells hold RAW numbers; each renderer formats (PDF → $ display, CSV → plain 2dp).
 */
async function salesRows(outletId, from, to) {
  const series = await reports.getRevenueTrendRange(outletId, from, to);
  const columns = [
    { label: 'Date', align: 'left' },
    { label: 'Orders', align: 'right' },
    { label: 'Revenue', align: 'right', money: true },
  ];
  const rows = (series || []).map((s) => ({ type: 'data', cells: [s.date, s.orders || 0, n2(s.revenue)] }));
  const totOrders = rows.reduce((s, r) => s + Number(r.cells[1]), 0);
  const totRev = rows.reduce((s, r) => s + Number(r.cells[2]), 0);
  rows.push({ type: 'total', cells: ['Total', totOrders, n2(totRev)] });
  return { title: 'Sales Report', columns, rows };
}

async function eodRows(outletId, from, to) {
  // Guard: EOD builds one snapshot per day and dateList() hard-caps iteration at
  // MAX_RANGE_DAYS, so a longer range would silently sum only the first
  // MAX_RANGE_DAYS days while the filename/header still claim the full period.
  // Reject over-long ranges so the label always matches the computed data.
  const days = Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000) + 1;
  if (days > MAX_RANGE_DAYS) throw new Error(`EOD export range is limited to ${MAX_RANGE_DAYS} days — please request a shorter period.`);
  const columns = [
    { label: 'Date', align: 'left' },
    { label: 'Orders', align: 'right' },
    { label: 'Revenue', align: 'right', money: true },
    { label: 'Tax', align: 'right', money: true },
    { label: 'Discount', align: 'right', money: true },
    { label: 'Cash', align: 'right', money: true },
    { label: 'Card', align: 'right', money: true },
    { label: 'Voids', align: 'right' },
    { label: 'Refunds', align: 'right' },
  ];
  const rows = [];
  const t = { orders: 0, rev: 0, tax: 0, disc: 0, cash: 0, card: 0, voids: 0, refunds: 0 };
  for (const day of dateList(from, to)) {
    const s = await eod.generateSnapshot(outletId, new Date(`${day}T12:00:00`)); // midday = safe inside the local day
    rows.push({ type: 'data', cells: [day, s.total_orders, n2(s.total_revenue), n2(s.total_tax), n2(s.total_discount), n2(s.cash_system), n2(s.card_system), s.void_count, s.refund_count] });
    t.orders += s.total_orders; t.rev += Number(s.total_revenue); t.tax += Number(s.total_tax); t.disc += Number(s.total_discount);
    t.cash += Number(s.cash_system); t.card += Number(s.card_system); t.voids += s.void_count; t.refunds += s.refund_count;
  }
  rows.push({ type: 'total', cells: ['Total', t.orders, n2(t.rev), n2(t.tax), n2(t.disc), n2(t.cash), n2(t.card), t.voids, t.refunds] });
  return { title: 'End-of-Day Report', columns, rows };
}

async function pnlTable(outletId, from, to) {
  const pl = await statements.getProfitAndLoss(outletId, from, to);
  const columns = [
    { label: 'Code', align: 'left', w: 55 },
    { label: 'Account', align: 'left' },
    { label: 'Amount', align: 'right', money: true },
  ];
  const rows = [];
  rows.push({ type: 'section', label: 'Revenue' });
  for (const a of pl.revenue?.accounts || []) rows.push({ type: 'data', cells: [a.code, a.name, n2(a.balance)] });
  rows.push({ type: 'total', cells: ['', 'Total Revenue', n2(pl.revenue?.total)] });
  rows.push({ type: 'section', label: 'Expenses' });
  for (const a of pl.expenses?.accounts || []) rows.push({ type: 'data', cells: [a.code, a.name, n2(a.balance)] });
  rows.push({ type: 'total', cells: ['', 'Total Expenses', n2(pl.expenses?.total)] });
  rows.push({ type: 'total', cells: ['', 'Cost of Goods Sold', n2(pl.cogs_total)] });
  rows.push({ type: 'total', cells: ['', 'Gross Profit', n2(pl.gross_profit)] });
  rows.push({ type: 'grand', cells: ['', 'Net Profit', n2(pl.net_profit)] });
  return { title: 'Profit & Loss', columns, rows };
}

async function itemWiseTable(outletId, from, to) {
  const r = await reports.getItemWiseSales(outletId, from, to, 100);
  const columns = [
    { label: 'Item', align: 'left' },
    { label: 'Qty', align: 'right' },
    { label: 'Revenue', align: 'right', money: true },
  ];
  const items = (r && r.items) || [];
  const rows = items.map((i) => ({ type: 'data', cells: [i.name, n2(i.total_quantity), n2(i.total_revenue)] }));
  const totQty = rows.reduce((s, x) => s + Number(x.cells[1]), 0);
  const totRev = rows.reduce((s, x) => s + Number(x.cells[2]), 0);
  rows.push({ type: 'total', cells: ['Total', n2(totQty), n2(totRev)] });
  return { title: 'Item-wise Sales', columns, rows };
}

async function inventoryValuationTable(outletId) {
  const r = await reports.getInventoryValuation(outletId);
  const columns = [
    { label: 'Category', align: 'left' },
    { label: 'Items', align: 'right' },
    { label: 'Stock Value', align: 'right', money: true },
  ];
  const cats = (r && r.by_category) || [];
  const rows = cats.map((c) => ({ type: 'data', cells: [c.category || 'Uncategorised', c.count || 0, n2(c.value)] }));
  rows.push({ type: 'total', cells: ['Total', (r && r.total_items) || 0, n2(r && r.total_value)] });
  return { title: 'Inventory Valuation', columns, rows };
}

async function balanceSheetTable(outletId, asOf) {
  const bsheet = await statements.getBalanceSheet(outletId, asOf);
  const columns = [
    { label: 'Code', align: 'left', w: 55 },
    { label: 'Account', align: 'left' },
    { label: 'Amount', align: 'right', money: true },
  ];
  const rows = [];
  const section = (label, grp) => {
    rows.push({ type: 'section', label });
    for (const a of (grp && grp.accounts) || []) rows.push({ type: 'data', cells: [a.code, a.name, n2(a.amount)] });
    rows.push({ type: 'total', cells: ['', `Total ${label}`, n2(grp && grp.total)] });
  };
  section('Assets', bsheet.assets);
  section('Liabilities', bsheet.liabilities);
  section('Equity', bsheet.equity);
  rows.push({ type: 'grand', cells: ['', 'Liabilities + Equity', n2(((bsheet.liabilities && bsheet.liabilities.total) || 0) + ((bsheet.equity && bsheet.equity.total) || 0))] });
  return { title: 'Balance Sheet', columns, rows };
}

async function basTable(outletId, from, to) {
  const r = await bas.getBASReport(outletId, from, to);
  const columns = [
    { label: 'Item', align: 'left' },
    { label: 'Amount', align: 'right', money: true },
  ];
  const rows = [
    { type: 'data', cells: ['Total sales (G1)', n2(r.G1_total_sales)] },
    { type: 'data', cells: ['Total purchases (G11)', n2(r.G11_purchases)] },
    { type: 'data', cells: ['GST collected on sales (1A)', n2(r.gst_on_sales_1A)] },
    { type: 'data', cells: ['GST paid on purchases (1B)', n2(r.gst_on_purchases_1B)] },
    { type: 'grand', cells: [r.payable ? 'Net GST payable' : 'Net GST refund', n2(Math.abs(Number(r.net_gst) || 0))] },
  ];
  return { title: 'GST / BAS Summary', columns, rows };
}

async function payrollTable(outletId) {
  const runs = await payroll.listPayRuns(outletId);
  const columns = [
    { label: 'Period', align: 'left' },
    { label: 'Status', align: 'left' },
    { label: 'Gross', align: 'right', money: true },
    { label: 'PAYG', align: 'right', money: true },
    { label: 'Super', align: 'right', money: true },
    { label: 'Net', align: 'right', money: true },
    { label: 'Payslips', align: 'right' },
  ];
  const list = (Array.isArray(runs) ? runs : []).slice(0, 24);
  const day = (x) => (x ? new Date(x).toISOString().slice(0, 10) : '');
  const rows = list.map((r) => ({ type: 'data', cells: [`${day(r.period_start)}–${day(r.period_end)}`, r.status, n2(r.gross_total), n2(r.paye_total), n2(r.super_total), n2(r.net_total), (r._count && r._count.payslips) || 0] }));
  const sum = (k) => list.reduce((s, r) => s + Number(r[k] || 0), 0);
  rows.push({ type: 'total', cells: ['Total', '', n2(sum('gross_total')), n2(sum('paye_total')), n2(sum('super_total')), n2(sum('net_total')), list.reduce((s, r) => s + ((r._count && r._count.payslips) || 0), 0)] });
  return { title: 'Payroll Report', columns, rows };
}

// ── CSV / PDF renderers ──────────────────────────────────────────────────────
function csvEscape(v) {
  let s = String(v ?? '');
  // Neutralise spreadsheet formula injection (CWE-1236): a staff-editable name
  // like "=HYPERLINK(...)" would execute when the owner opens the export. Prefix
  // a single quote on cells starting with a formula trigger — but NOT on plain
  // numbers, so negative money cells (e.g. "-5.00") aren't corrupted.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Professional CSV: a metadata block, then the table. Money cells stay plain
 *  2-decimal numbers (no symbols) so Excel treats them as numbers it can sum. */
function tableToCsv(t, meta) {
  const out = [];
  out.push([t.title]);
  if (meta.outletName) out.push([meta.outletName]);
  out.push(['Period', `${meta.from} to ${meta.to}`]);
  out.push(['Currency', meta.currency || 'AUD']);
  out.push([]);
  out.push(t.columns.map((c) => c.label));
  for (const r of t.rows) {
    if (r.type === 'section') { out.push([String(r.label).toUpperCase()]); continue; }
    out.push(t.columns.map((c, i) => (c.money ? (Number(r.cells[i]) || 0).toFixed(2) : (r.cells[i] == null ? '' : r.cells[i]))));
  }
  return '﻿' + out.map((r) => r.map(csvEscape).join(',')).join('\n') + '\n';
}

/** Polished A4 report with a header band, zebra rows, section + total styling,
 *  right-aligned currency, and a footer. Manual y-cursor so nothing overlaps. */
function tableToPdf(t, meta) {
  const PDFDocument = require('pdfkit');
  return new Promise((resolve, reject) => {
    const landscape = t.columns.length > 5;
    const doc = new PDFDocument({ size: 'A4', margin: 40, layout: landscape ? 'landscape' : 'portrait' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    // Title block.
    doc.font('Helvetica-Bold').fontSize(19).fillColor('#0f172a').text(meta.outletName || 'Report', left, doc.page.margins.top);
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#2563eb').text(t.title);
    doc.font('Helvetica').fontSize(9).fillColor('#64748b')
      .text(`${meta.from} to ${meta.to}   ·   Currency ${meta.currency || 'AUD'}${meta.generated ? `   ·   Generated ${meta.generated}` : ''}`);
    let y = doc.y + 14;

    // Column widths: fixed for numeric / explicit-w columns, flex for the rest.
    const NUMW = landscape ? 66 : 95;
    const widths = t.columns.map((c) => (c.w ? c.w : (c.align === 'right' ? NUMW : null)));
    const fixed = widths.reduce((s, w) => s + (w || 0), 0);
    const flexN = widths.filter((w) => w == null).length || 1;
    const flexW = (width - fixed) / flexN;
    const colW = widths.map((w) => (w == null ? flexW : w));
    const colX = []; let acc = left; for (const w of colW) { colX.push(acc); acc += w; }

    const ROW = 18;
    const cell = (text, x, w, align, o = {}) => {
      doc.font(o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(o.size || 9).fillColor(o.color || '#0f172a')
        .text(text == null ? '' : String(text), x + 6, y + 5, { width: w - 12, align, lineBreak: false, ellipsis: true });
    };
    const fmt = (val, c) => (c.money ? fmtMoney(meta.currency, val) : (val == null ? '' : String(val)));

    const drawHead = () => {
      doc.rect(left, y, width, ROW).fill('#0f172a');
      t.columns.forEach((c, i) => cell(c.label, colX[i], colW[i], c.align, { bold: true, color: '#ffffff' }));
      y += ROW;
    };
    drawHead();

    let zebra = false;
    for (const r of t.rows) {
      if (y + ROW > doc.page.height - doc.page.margins.bottom - 24) { doc.addPage(); y = doc.page.margins.top; drawHead(); zebra = false; }
      if (r.type === 'section') {
        doc.rect(left, y, width, ROW).fill('#eef2ff');
        cell(String(r.label).toUpperCase(), colX[0], width, 'left', { bold: true, color: '#3730a3' });
        y += ROW; zebra = false; continue;
      }
      const isTotal = r.type === 'total' || r.type === 'grand';
      if (r.type === 'grand') doc.rect(left, y, width, ROW).fill('#dbeafe');
      else if (isTotal) { doc.rect(left, y, width, ROW).fill('#f1f5f9'); doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor('#94a3b8').stroke(); }
      else if (zebra) doc.rect(left, y, width, ROW).fill('#f8fafc');
      t.columns.forEach((c, i) => cell(fmt(r.cells[i], c), colX[i], colW[i], c.align, { bold: isTotal, color: r.type === 'grand' ? '#1e3a8a' : '#0f172a' }));
      y += ROW; zebra = isTotal ? false : !zebra;
    }
    // Footer flows right under the table (NOT pinned to the page bottom — that
    // would push text past the margin and spawn a blank trailing page).
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
    y += 8;
    if (y > doc.page.height - doc.page.margins.bottom) { doc.addPage(); y = doc.page.margins.top; }
    doc.font('Helvetica').fontSize(7).fillColor('#94a3b8')
      .text('Generated by MS-RM System', left, y, { width, align: 'center', lineBreak: false });
    doc.end();
  });
}

/** Real .xlsx via exceljs: title block, styled header, money cells as NUMBERS
 *  with a currency number-format (so Excel sums them), section + total shading. */
async function tableToXlsx(t, meta) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MS-RM System';
  const ws = wb.addWorksheet((t.title || 'Report').slice(0, 31));
  const nCols = t.columns.length;
  const moneyFmt = (meta.currency === 'INR' ? '₹' : '$') + '#,##0.00';

  let r = 1;
  ws.mergeCells(r, 1, r, nCols); ws.getCell(r, 1).value = t.title; ws.getCell(r, 1).font = { bold: true, size: 14 }; r += 1;
  if (meta.outletName) { ws.mergeCells(r, 1, r, nCols); ws.getCell(r, 1).value = meta.outletName; ws.getCell(r, 1).font = { bold: true }; r += 1; }
  ws.getCell(r, 1).value = 'Period'; ws.getCell(r, 2).value = `${meta.from} to ${meta.to}`; r += 1;
  ws.getCell(r, 1).value = 'Currency'; ws.getCell(r, 2).value = meta.currency || 'AUD'; r += 2; // blank row after

  const headerRow = ws.getRow(r);
  t.columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    cell.alignment = { horizontal: c.align === 'right' ? 'right' : 'left' };
  });
  r += 1;

  for (const row of t.rows) {
    const xr = ws.getRow(r);
    if (row.type === 'section') {
      ws.mergeCells(r, 1, r, nCols);
      const cell = xr.getCell(1);
      cell.value = String(row.label).toUpperCase();
      cell.font = { bold: true, color: { argb: 'FF3730A3' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
      r += 1; continue;
    }
    const isTotal = row.type === 'total' || row.type === 'grand';
    t.columns.forEach((c, i) => {
      const cell = xr.getCell(i + 1);
      const val = row.cells[i];
      if (c.money) { cell.value = Number(val) || 0; cell.numFmt = moneyFmt; }
      else if (typeof val === 'number') cell.value = val;
      else cell.value = val == null ? '' : val;
      cell.alignment = { horizontal: c.align === 'right' ? 'right' : 'left' };
      if (isTotal) cell.font = { bold: true };
      if (row.type === 'grand') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
      else if (isTotal) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    });
    r += 1;
  }

  t.columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.money ? 16 : (c.align === 'left' ? 24 : 12); });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/**
 * Generate the report file from a verified token payload.
 * @param {{outletId:string,module:string,from:string,to:string,format:string,currency:string}} p
 * @param {string} [outletName]
 * @param {string} [generated] display timestamp for the PDF header
 * @returns {Promise<{filename:string, contentType:string, body:(string|Buffer)}>}
 */
async function generate(p, outletName, generated) {
  const { outletId, module, from, to, format } = p;
  const table = module === 'pnl' ? await pnlTable(outletId, from, to)
    : module === 'eod' ? await eodRows(outletId, from, to)
      : module === 'item_wise' ? await itemWiseTable(outletId, from, to)
        : module === 'inventory_valuation' ? await inventoryValuationTable(outletId)
          : module === 'balance_sheet' ? await balanceSheetTable(outletId, to)
            : module === 'bas' ? await basTable(outletId, from, to)
              : module === 'payroll' ? await payrollTable(outletId)
                : await salesRows(outletId, from, to);

  const meta = { from, to, currency: p.currency, outletName, generated };
  const ext = format === 'pdf' ? 'pdf' : format === 'xlsx' ? 'xlsx' : 'csv';
  const filename = `${module}-${from}-to-${to}.${ext}`;
  if (format === 'pdf') {
    return { filename, contentType: 'application/pdf', body: await tableToPdf(table, meta) };
  }
  if (format === 'xlsx') {
    return { filename, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: await tableToXlsx(table, meta) };
  }
  return { filename, contentType: 'text/csv; charset=utf-8', body: tableToCsv(table, meta) };
}

module.exports = {
  parseDateRange, detectExport, buildDescriptor,
  signExportToken, verifyExportToken, generate,
  MODULE_LABEL, MAX_RANGE_DAYS,
};
