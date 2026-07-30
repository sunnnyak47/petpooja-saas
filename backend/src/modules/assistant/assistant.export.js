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
const acctExport = require('../accounting/accounting.export.service');
const statements = require('../accounting/accounting.statements.service');

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
  const wantsFile = /\b(download|export|generate|save|send me|give me|get me|pull|extract)\b/.test(q);
  const formatWord = /\b(pdf|excel|xlsx|xls|spreadsheet|csv)\b/.test(q);
  if (!wantsFile && !formatWord) return null;

  const format = /\bpdf\b/.test(q) ? 'pdf' : 'csv';
  let module = null;
  if (/(p\s*&\s*l|p and l|pnl|profit\s*(and|&)?\s*loss|income statement)/.test(q)) module = 'pnl';
  else if (/(eod|end[\s-]*of[\s-]*day|day\s*close|z[\s-]*report|daily\s*close|closing report)/.test(q)) module = 'eod';
  else if (/(sales|revenue|takings|turnover)/.test(q)) module = 'sales';

  // "export a report" with no explicit module → default to a sales report.
  if (!module) { if (/\breport\b/.test(q) && (wantsFile || formatWord)) module = 'sales'; else return null; }
  return { module, format };
}

const MODULE_LABEL = { eod: 'End-of-day', pnl: 'Profit & Loss', sales: 'Sales' };

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
  const ext = intent.format === 'pdf' ? 'pdf' : 'csv';
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

async function salesRows(outletId, from, to) {
  const series = await reports.getRevenueTrendRange(outletId, from, to);
  const header = ['Date', 'Orders', 'Revenue'];
  const rows = (series || []).map((s) => [s.date, s.orders || 0, n2(s.revenue)]);
  const totOrders = rows.reduce((s, r) => s + Number(r[1]), 0);
  const totRev = rows.reduce((s, r) => s + Number(r[2]), 0);
  return { title: 'Sales Report', header, rows, totals: ['Total', totOrders, n2(totRev)] };
}

async function eodRows(outletId, from, to) {
  const header = ['Date', 'Orders', 'Revenue', 'Tax', 'Discount', 'Cash', 'Card', 'Voids', 'Refunds'];
  const rows = [];
  const t = { orders: 0, rev: 0, tax: 0, disc: 0, cash: 0, card: 0, voids: 0, refunds: 0 };
  for (const day of dateList(from, to)) {
    const s = await eod.generateSnapshot(outletId, new Date(`${day}T12:00:00`)); // midday = safe inside the local day
    rows.push([day, s.total_orders, n2(s.total_revenue), n2(s.total_tax), n2(s.total_discount), n2(s.cash_system), n2(s.card_system), s.void_count, s.refund_count]);
    t.orders += s.total_orders; t.rev += Number(s.total_revenue); t.tax += Number(s.total_tax); t.disc += Number(s.total_discount);
    t.cash += Number(s.cash_system); t.card += Number(s.card_system); t.voids += s.void_count; t.refunds += s.refund_count;
  }
  return { title: 'End-of-Day Report', header, rows, totals: ['Total', t.orders, n2(t.rev), n2(t.tax), n2(t.disc), n2(t.cash), n2(t.card), t.voids, t.refunds] };
}

async function pnlTable(outletId, from, to) {
  const pl = await statements.getProfitAndLoss(outletId, from, to);
  const header = ['Code', 'Account', 'Amount'];
  const rows = [];
  rows.push(['', 'REVENUE', '']);
  for (const a of pl.revenue?.accounts || []) rows.push([a.code, a.name, n2(a.balance)]);
  rows.push(['', 'Total Revenue', n2(pl.revenue?.total)]);
  rows.push(['', 'EXPENSES', '']);
  for (const a of pl.expenses?.accounts || []) rows.push([a.code, a.name, n2(a.balance)]);
  rows.push(['', 'Total Expenses', n2(pl.expenses?.total)]);
  return { title: 'Profit & Loss', header, rows, totals: ['', `COGS ${n2(pl.cogs_total)} · Gross ${n2(pl.gross_profit)} · Net`, n2(pl.net_profit)] };
}

// ── CSV / PDF renderers ──────────────────────────────────────────────────────
function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function tableToCsv(t) {
  const lines = [t.header, ...t.rows, t.totals].map((r) => r.map(csvEscape).join(','));
  return '﻿' + `${t.title}\n` + lines.join('\n') + '\n';
}

function tableToPdf(t, meta) {
  const PDFDocument = require('pdfkit');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, layout: t.header.length > 5 ? 'landscape' : 'portrait' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text(t.title, { align: 'left' });
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor('#555').text(`${meta.outletName || 'Outlet'}  ·  ${meta.from} to ${meta.to}  ·  ${meta.currency || ''}`);
    doc.moveDown(0.6).fillColor('#000');

    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const cols = t.header.length;
    const colW = pageW / cols;
    const drawRow = (cells, opts = {}) => {
      const y = doc.y; const size = opts.size || 9;
      doc.fontSize(size).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica');
      cells.forEach((cell, i) => {
        doc.text(String(cell ?? ''), doc.page.margins.left + i * colW, y, { width: colW - 4, align: i === 0 ? 'left' : 'right', ellipsis: true });
      });
      doc.moveDown(0.3);
      if (doc.y > doc.page.height - doc.page.margins.bottom - 20) doc.addPage();
    };
    drawRow(t.header, { bold: true });
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown(0.2);
    for (const r of t.rows) drawRow(r);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#999').stroke();
    doc.moveDown(0.2);
    drawRow(t.totals, { bold: true });
    doc.end();
  });
}

/**
 * Generate the report file from a verified token payload.
 * @param {{outletId:string,module:string,from:string,to:string,format:string,currency:string}} p
 * @param {string} [outletName]
 * @returns {Promise<{filename:string, contentType:string, body:(string|Buffer)}>}
 */
async function generate(p, outletName) {
  const { outletId, module, from, to, format } = p;
  let table;
  if (module === 'pnl' && format !== 'pdf') {
    // Reuse the audited P&L CSV exporter verbatim for the spreadsheet path.
    const { filename, csv } = await acctExport.exportProfitLossCSV(outletId, from, to);
    return { filename, contentType: 'text/csv; charset=utf-8', body: '﻿' + csv };
  }
  if (module === 'pnl') table = await pnlTable(outletId, from, to);
  else if (module === 'eod') table = await eodRows(outletId, from, to);
  else table = await salesRows(outletId, from, to);

  const ext = format === 'pdf' ? 'pdf' : 'csv';
  const filename = `${module}-${from}-to-${to}.${ext}`;
  if (format === 'pdf') {
    const body = await tableToPdf(table, { from, to, currency: p.currency, outletName });
    return { filename, contentType: 'application/pdf', body };
  }
  return { filename, contentType: 'text/csv; charset=utf-8', body: tableToCsv(table) };
}

module.exports = {
  parseDateRange, detectExport, buildDescriptor,
  signExportToken, verifyExportToken, generate,
  MODULE_LABEL, MAX_RANGE_DAYS,
};
