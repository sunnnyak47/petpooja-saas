/**
 * @fileoverview Purchase Order PDF — Ultra-Premium Design using PDFKit.
 * Pure Node.js, no browser needed. Works on Render Linux and macOS.
 * @module modules/inventory/po-pdf.service
 */

const PDFDocument = require('pdfkit');
const path = require('path');
const fs   = require('fs');
const logger = require('../../config/logger');

const UPLOADS_DIR = path.join(__dirname, '../../../uploads/purchase-orders');
function ensureDir() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmt(n) {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function hex(color) { return color; }

// ─── Design Tokens ──────────────────────────────────────────────────────────
const C = {
  navy:      '#0A0F1E',   // deep navy header bg
  navyMid:   '#111827',   // near-black text
  indigo:    '#4338CA',   // primary accent
  indigoL:   '#6366F1',   // lighter accent
  gold:      '#F59E0B',   // premium gold for highlights
  goldL:     '#FCD34D',   // gold light
  emerald:   '#059669',   // approved green
  red:       '#DC2626',   // draft / warning
  blue:      '#2563EB',   // sent blue
  white:     '#FFFFFF',
  offWhite:  '#F8FAFC',
  gray50:    '#F9FAFB',
  gray100:   '#F3F4F6',
  gray200:   '#E5E7EB',
  gray300:   '#D1D5DB',
  gray400:   '#9CA3AF',
  gray500:   '#6B7280',
  gray700:   '#374151',
  gray900:   '#111827',
};

const STATUS = {
  draft:    { bg: '#FEF3C7', text: '#92400E', dot: '#F59E0B', label: 'DRAFT' },
  approved: { bg: '#D1FAE5', text: '#065F46', dot: '#059669', label: 'APPROVED' },
  sent:     { bg: '#DBEAFE', text: '#1E40AF', dot: '#2563EB', label: 'SENT' },
  received: { bg: '#D1FAE5', text: '#065F46', dot: '#059669', label: 'RECEIVED' },
  cancelled:{ bg: '#FEE2E2', text: '#991B1B', dot: '#DC2626', label: 'CANCELLED' },
};

// ─── Drawing Utilities ───────────────────────────────────────────────────────
function rgbFromHex(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return [r,g,b];
}

function drawRoundedRect(doc, x, y, w, h, r, fillColor, strokeColor) {
  doc.save();
  doc.roundedRect(x, y, w, h, r);
  if (fillColor) doc.fillColor(fillColor);
  if (fillColor && strokeColor) {
    doc.fillAndStroke(fillColor, strokeColor);
  } else if (fillColor) {
    doc.fill();
  }
  doc.restore();
}

function drawLine(doc, x1, y1, x2, y2, color, width) {
  doc.save()
     .moveTo(x1, y1).lineTo(x2, y2)
     .strokeColor(color).lineWidth(width || 1).stroke()
     .restore();
}

function label(doc, text, x, y, opts = {}) {
  doc.save()
     .fillColor(opts.color || C.gray400)
     .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
     .fontSize(opts.size || 7)
     .text(text, x, y, { width: opts.width, align: opts.align || 'left', lineBreak: false })
     .restore();
}

// ─── MAIN DRAW FUNCTION ──────────────────────────────────────────────────────
function _drawPO(doc, po) {
  const W  = 595.28;
  const ML = 44;
  const MR = 44;
  const CW = W - ML - MR;

  const outlet   = po.outlet   || {};
  const supplier = po.supplier || {};
  const items    = (po.po_items || []).filter(Boolean);
  const sc       = STATUS[po.status] || STATUS.draft;

  let y = 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1 — DEEP NAVY HEADER BAND
  // ═══════════════════════════════════════════════════════════════════════════
  const HEADER_H = 108;
  doc.rect(0, 0, W, HEADER_H).fill(C.navy);

  // Gold accent bar at top
  doc.rect(0, 0, W, 4).fill(C.gold);

  // Logo circle — premium initials
  const logoX = ML;
  const logoY = 22;
  const logoR = 32;
  // Outer ring
  doc.save().circle(logoX + logoR, logoY + logoR, logoR + 2)
     .fillColor(C.indigo).fill().restore();
  // Inner circle
  doc.save().circle(logoX + logoR, logoY + logoR, logoR)
     .fillColor(C.indigoL).fill().restore();
  // Initial letter
  const initial = (outlet.name || 'R').charAt(0).toUpperCase();
  doc.save().fillColor(C.white).font('Helvetica-Bold').fontSize(28)
     .text(initial, logoX, logoY + 18, { width: logoR * 2, align: 'center', lineBreak: false })
     .restore();

  // Company name & info
  const textX = ML + logoR * 2 + 16;
  doc.save().fillColor(C.white).font('Helvetica-Bold').fontSize(15)
     .text(outlet.name || 'Restaurant', textX, logoY + 6, { width: 200, lineBreak: false })
     .restore();

  const addrParts = [outlet.address_line1, outlet.city, outlet.state, outlet.pincode].filter(Boolean);
  if (addrParts.length) {
    doc.save().fillColor(C.gray300).font('Helvetica').fontSize(8)
       .text(addrParts.join(', '), textX, logoY + 26, { width: 210, lineBreak: false })
       .restore();
  }
  const infoParts = [outlet.phone, outlet.email].filter(Boolean);
  if (infoParts.length) {
    doc.save().fillColor(C.gray400).font('Helvetica').fontSize(7.5)
       .text(infoParts.join('  ·  '), textX, logoY + 40, { width: 210, lineBreak: false })
       .restore();
  }
  if (outlet.gstin) {
    doc.save().fillColor(C.gray400).font('Helvetica').fontSize(7)
       .text(`GSTIN: ${outlet.gstin}`, textX, logoY + 54, { width: 210, lineBreak: false })
       .restore();
  }

  // Right side — PO title
  const rightX = W - MR - 170;
  doc.save().fillColor(C.gold).font('Helvetica-Bold').fontSize(9)
     .text('PURCHASE ORDER', rightX, logoY + 4, { width: 170, align: 'right', lineBreak: false })
     .restore();
  doc.save().fillColor(C.white).font('Helvetica-Bold').fontSize(20)
     .text(po.po_number || '', rightX, logoY + 18, { width: 170, align: 'right', lineBreak: false })
     .restore();

  // Status pill
  const statusText = sc.label;
  const pillW = 74, pillH = 20;
  const pillX = W - MR - pillW;
  const pillY = logoY + 48;
  drawRoundedRect(doc, pillX, pillY, pillW, pillH, 10, sc.bg);
  // Dot
  doc.save().circle(pillX + 14, pillY + 10, 4).fillColor(sc.dot).fill().restore();
  doc.save().fillColor(sc.text).font('Helvetica-Bold').fontSize(8)
     .text(statusText, pillX + 22, pillY + 6, { width: pillW - 26, align: 'left', lineBreak: false })
     .restore();

  y = HEADER_H;

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2 — GOLD DIVIDER + META ROW
  // ═══════════════════════════════════════════════════════════════════════════
  // Thin gold line
  doc.rect(0, y, W, 2).fill(C.gold);
  y += 2;

  // Light gray meta strip
  doc.rect(0, y, W, 52).fill(C.gray50);
  y += 10;

  // Three meta boxes
  const metaItems = [
    { label: 'PO DATE',           value: fmtDate(po.order_date || po.created_at) },
    { label: 'EXPECTED DELIVERY', value: fmtDate(po.expected_date || po.delivery_date) },
    { label: 'REFERENCE NO.',     value: po.reference_number || '—' },
  ];
  const metaW = CW / 3;

  metaItems.forEach((m, i) => {
    const mx = ML + i * metaW;
    // Divider between cols
    if (i > 0) drawLine(doc, mx, y - 4, mx, y + 36, C.gray200, 1);
    doc.save().fillColor(C.gray400).font('Helvetica-Bold').fontSize(6.5)
       .text(m.label, mx + (i === 0 ? 0 : 12), y, { width: metaW - 12, align: 'left', lineBreak: false })
       .restore();
    doc.save().fillColor(C.navy).font('Helvetica-Bold').fontSize(11)
       .text(m.value, mx + (i === 0 ? 0 : 12), y + 12, { width: metaW - 12, align: 'left', lineBreak: false })
       .restore();
  });

  y += 42 + 14;

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3 — PARTIES (VENDOR + BILL TO)
  // ═══════════════════════════════════════════════════════════════════════════
  const partyW = (CW - 14) / 2;

  function drawParty(title, icon, lines, px, py) {
    // Card shadow effect (darker bg offset)
    drawRoundedRect(doc, px + 2, py + 2, partyW, 110, 8, C.gray200);
    // Card bg
    drawRoundedRect(doc, px, py, partyW, 110, 8, C.white, C.gray200);
    // Title bar
    drawRoundedRect(doc, px, py, partyW, 26, 8, C.navy);
    // Fix bottom corners of title bar
    doc.rect(px, py + 18, partyW, 8).fill(C.navy);
    // Icon dot
    doc.save().circle(px + 16, py + 13, 6).fillColor(C.gold).fill().restore();
    doc.save().fillColor(C.white).font('Helvetica-Bold').fontSize(8)
       .text(title, px + 28, py + 8, { width: partyW - 36, lineBreak: false })
       .restore();

    let ly = py + 32;
    lines.forEach((line, i) => {
      if (!line || !line.value) return;
      doc.save().fillColor(i === 0 ? C.navy : C.gray500)
         .font(i === 0 ? 'Helvetica-Bold' : 'Helvetica')
         .fontSize(i === 0 ? 10.5 : 8.5)
         .text(line.value, px + 12, ly, { width: partyW - 24, lineBreak: false })
         .restore();
      ly += i === 0 ? 14 : 12;
    });
  }

  const vendorLines = [
    { value: supplier.name || '—' },
    supplier.contact_person && { value: `Contact: ${supplier.contact_person}` },
    supplier.phone  && { value: `☎  ${supplier.phone}` },
    supplier.email  && { value: `✉  ${supplier.email}` },
    supplier.address && { value: `\u{1F4CD}  ${supplier.address.substring(0,40)}` },
    supplier.gstin  && { value: `GSTIN: ${supplier.gstin}` },
    supplier.payment_terms && { value: `Terms: ${supplier.payment_terms}` },
  ].filter(Boolean);

  const billLines = [
    { value: outlet.name || '—' },
    outlet.address_line1 && { value: `\u{1F4CD}  ${[outlet.address_line1, outlet.city, outlet.state, outlet.pincode].filter(Boolean).join(', ').substring(0,44)}` },
    outlet.phone && { value: `☎  ${outlet.phone}` },
    outlet.email && { value: `✉  ${outlet.email}` },
    outlet.gstin && { value: `GSTIN: ${outlet.gstin}` },
    outlet.fssai_number && { value: `FSSAI: ${outlet.fssai_number}` },
  ].filter(Boolean);

  drawParty('VENDOR / SUPPLIER', '📦', vendorLines, ML, y);
  drawParty('BILL TO / DELIVER TO', '🏪', billLines, ML + partyW + 14, y);

  y += 120;

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4 — ITEMS TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  y += 10;

  // Table header
  const cols = [
    { label: '#',        w: 24,  align: 'center' },
    { label: 'ITEM DESCRIPTION', w: 148, align: 'left' },
    { label: 'HSN',      w: 48,  align: 'center' },
    { label: 'UNIT',     w: 40,  align: 'center' },
    { label: 'QTY',      w: 38,  align: 'right' },
    { label: 'RATE (₹)', w: 72,  align: 'right' },
    { label: 'GST%',     w: 40,  align: 'center' },
    { label: 'AMOUNT (₹)', w: 73, align: 'right' },
  ];
  const TABLE_H = 28;
  const ROW_H   = 26;

  // Header background
  doc.rect(ML, y, CW, TABLE_H).fill(C.navy);
  // Gold left accent stripe
  doc.rect(ML, y, 4, TABLE_H).fill(C.gold);

  // Header labels
  let cx = ML + 4;
  cols.forEach(col => {
    doc.save().fillColor(C.gray300).font('Helvetica-Bold').fontSize(7)
       .text(col.label, cx + 4, y + 10, { width: col.w - 8, align: col.align, lineBreak: false })
       .restore();
    cx += col.w;
  });
  y += TABLE_H;

  // Row border color
  doc.rect(ML, y, CW, 1).fill(C.indigo);

  // Rows
  items.forEach((item, i) => {
    const rowBg  = i % 2 === 0 ? C.white : C.gray50;
    const qty    = Number(item.ordered_quantity || item.quantity || 0);
    const rate   = Number(item.unit_cost || item.unit_rate || item.rate || 0);
    const taxPct = Number(item.tax_rate || 0);
    const sub    = qty * rate;
    const tax    = sub * taxPct / 100;
    const total  = sub + tax;

    doc.rect(ML, y, CW, ROW_H).fill(rowBg);
    // Left accent stripe on even rows
    if (i % 2 === 0) doc.rect(ML, y, 4, ROW_H).fill(C.gray100);
    else doc.rect(ML, y, 4, ROW_H).fill(C.gray200);

    const rowData = [
      { v: String(i + 1), align: 'center' },
      { v: item.item_name || '—', align: 'left', bold: true, sub: item.category || '' },
      { v: item.hsn_code || '—', align: 'center' },
      { v: item.unit || 'pcs', align: 'center' },
      { v: qty % 1 === 0 ? String(qty) : qty.toFixed(2), align: 'right' },
      { v: `₹${fmt(rate)}`, align: 'right' },
      { v: taxPct > 0 ? `${taxPct}%` : '—', align: 'center' },
      { v: `₹${fmt(total)}`, align: 'right', bold: true },
    ];

    let rx = ML + 4;
    cols.forEach((col, ci) => {
      const d = rowData[ci];
      const textY = d.sub ? y + 6 : y + 9;
      doc.save()
         .fillColor(d.bold ? C.navy : C.gray700)
         .font(d.bold ? 'Helvetica-Bold' : 'Helvetica')
         .fontSize(9)
         .text(d.v, rx + 4, textY, { width: col.w - 8, align: d.align, lineBreak: false })
         .restore();
      if (d.sub) {
        doc.save().fillColor(C.gray400).font('Helvetica').fontSize(7)
           .text(d.sub, rx + 4, y + 16, { width: col.w - 8, align: 'left', lineBreak: false })
           .restore();
      }
      // Col divider
      if (ci > 0) drawLine(doc, rx, y + 4, rx, y + ROW_H - 4, C.gray200, 0.5);
      rx += col.w;
    });

    // Bottom border
    drawLine(doc, ML, y + ROW_H, ML + CW, y + ROW_H, C.gray200, 0.5);
    y += ROW_H;
  });

  // Table bottom border
  doc.rect(ML, y, CW, 2).fill(C.indigo);
  y += 2;

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5 — TOTALS
  // ═══════════════════════════════════════════════════════════════════════════
  y += 16;

  const TOTALS_W = 220;
  const TOTALS_X = W - MR - TOTALS_W;

  // Shadow
  drawRoundedRect(doc, TOTALS_X + 2, y + 2, TOTALS_W, 110, 8, C.gray200);
  drawRoundedRect(doc, TOTALS_X, y, TOTALS_W, 110, 8, C.white, C.gray200);

  // Title bar
  drawRoundedRect(doc, TOTALS_X, y, TOTALS_W, 26, 8, C.navy);
  doc.rect(TOTALS_X, y + 18, TOTALS_W, 8).fill(C.navy);
  doc.rect(TOTALS_X, y, 4, 26).fill(C.gold);
  doc.save().fillColor(C.gray300).font('Helvetica-Bold').fontSize(8)
     .text('ORDER SUMMARY', TOTALS_X + 12, y + 9, { width: TOTALS_W - 16, lineBreak: false })
     .restore();

  let ty = y + 32;

  function totalRow(label, value, opts = {}) {
    doc.save().fillColor(opts.labelColor || C.gray500)
       .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 8.5)
       .text(label, TOTALS_X + 14, ty, { width: 110, lineBreak: false })
       .restore();
    doc.save().fillColor(opts.valueColor || C.navy)
       .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 8.5)
       .text(value, TOTALS_X + 14, ty, { width: TOTALS_W - 28, align: 'right', lineBreak: false })
       .restore();
    ty += opts.gap || 16;
  }

  totalRow('Subtotal', `₹${fmt(po.total_amount || po.subtotal)}`);
  if (Number(po.tax_amount) > 0) {
    totalRow('GST / Tax', `₹${fmt(po.tax_amount)}`);
  }
  if (Number(po.discount_amount) > 0) {
    totalRow('Discount', `−₹${fmt(po.discount_amount)}`, { valueColor: C.red });
  }

  // Divider above grand total
  const divY = ty + 2;
  drawLine(doc, TOTALS_X + 8, divY, TOTALS_X + TOTALS_W - 8, divY, C.gray200, 1);
  ty += 10;

  // Grand total highlight box
  drawRoundedRect(doc, TOTALS_X + 8, ty, TOTALS_W - 16, 30, 6, C.navy);
  doc.save().fillColor(C.gold).font('Helvetica-Bold').fontSize(10)
     .text('GRAND TOTAL', TOTALS_X + 18, ty + 10, { width: 90, lineBreak: false })
     .restore();
  doc.save().fillColor(C.white).font('Helvetica-Bold').fontSize(14)
     .text(`₹${fmt(po.grand_total)}`, TOTALS_X + 18, ty + 8, { width: TOTALS_W - 36, align: 'right', lineBreak: false })
     .restore();

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6 — TERMS + SIGNATURE (left of totals)
  // ═══════════════════════════════════════════════════════════════════════════
  const termsW = TOTALS_X - ML - 14;

  drawRoundedRect(doc, ML + 2, y + 2, termsW, 80, 8, C.gray200);
  drawRoundedRect(doc, ML, y, termsW, 80, 8, C.white, C.gray200);
  doc.rect(ML, y, 4, 80).fill(C.indigo);

  doc.save().fillColor(C.indigo).font('Helvetica-Bold').fontSize(7.5)
     .text('TERMS & CONDITIONS', ML + 12, y + 10, { width: termsW - 20, lineBreak: false })
     .restore();

  const termsText = po.terms || 'Payment due within 30 days of delivery. All items subject to quality inspection upon receipt. Please quote PO number on all invoices and correspondence.';
  doc.save().fillColor(C.gray500).font('Helvetica').fontSize(8)
     .text(termsText, ML + 12, y + 22, { width: termsW - 22, lineBreak: true, height: 40 })
     .restore();

  // Signature box below terms
  const sigY = y + 84;
  drawRoundedRect(doc, ML + 2, sigY + 2, termsW, 64, 8, C.gray200);
  drawRoundedRect(doc, ML, sigY, termsW, 64, 8, C.white, C.gray200);
  doc.rect(ML, sigY, 4, 64).fill(C.gold);

  doc.save().fillColor(C.gold).font('Helvetica-Bold').fontSize(7.5)
     .text('AUTHORISED SIGNATORY', ML + 12, sigY + 10, { width: termsW - 20, lineBreak: false })
     .restore();
  // Signature line
  drawLine(doc, ML + 12, sigY + 44, ML + termsW - 20, sigY + 44, C.gray300, 1);
  doc.save().fillColor(C.gray400).font('Helvetica').fontSize(7.5)
     .text(outlet.name || 'Restaurant', ML + 12, sigY + 48, { width: termsW - 22, lineBreak: false })
     .restore();
  if (po.approved_at) {
    doc.save().fillColor(C.emerald).font('Helvetica-Bold').fontSize(7.5)
       .text(`✓ Approved on ${fmtDate(po.approved_at)}`, ML + 12, sigY + 26, { width: termsW - 22, lineBreak: false })
       .restore();
  }

  y += 154;

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7 — PREMIUM FOOTER BAND
  // ═══════════════════════════════════════════════════════════════════════════
  y += 14;

  // Footer dark bar
  doc.rect(0, y, W, 46).fill(C.navy);
  doc.rect(0, y, W, 3).fill(C.gold);

  // Brand
  doc.save().fillColor(C.gold).font('Helvetica-Bold').fontSize(10)
     .text('MS-RM', ML, y + 14, { width: 60, lineBreak: false })
     .restore();
  doc.save().fillColor(C.gray400).font('Helvetica').fontSize(9)
     .text('Restaurant Management System', ML + 62, y + 15, { width: 170, lineBreak: false })
     .restore();

  // Center note
  doc.save().fillColor(C.gray500).font('Helvetica').fontSize(7.5)
     .text('This is a computer-generated document. No signature required.', ML, y + 29, { width: CW, align: 'center', lineBreak: false })
     .restore();

  // Right: page + date
  doc.save().fillColor(C.gray500).font('Helvetica').fontSize(7.5)
     .text(`Generated: ${fmtDate(new Date())}`, W - MR - 130, y + 14, { width: 130, align: 'right', lineBreak: false })
     .restore();
  doc.save().fillColor(C.gray600).font('Helvetica').fontSize(7.5)
     .text('Page 1 of 1', W - MR - 80, y + 28, { width: 80, align: 'right', lineBreak: false })
     .restore();

  // ═══════════════════════════════════════════════════════════════════════════
  // DIAGONAL WATERMARK
  // ═══════════════════════════════════════════════════════════════════════════
  doc.save()
     .fillColor('#4338CA').opacity(0.035)
     .font('Helvetica-Bold').fontSize(72)
     .rotate(-38, { origin: [W / 2, 420] })
     .text('PURCHASE ORDER', W / 2 - 220, 360, { lineBreak: false })
     .restore();

  doc.end();
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Save to disk — used by WhatsApp (needs a public URL) */
async function generatePOPdf(po) {
  ensureDir();
  const filename = `${(po.po_number || 'PO').replace(/[^a-zA-Z0-9-]/g, '_')}_${Date.now()}.pdf`;
  const filePath = path.join(UPLOADS_DIR, filename);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Purchase Order ${po.po_number}`, Author: 'MS-RM' } });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    stream.on('finish', () => {
      logger.info('PO PDF generated', { po_number: po.po_number, path: filePath });
      resolve(filePath);
    });
    stream.on('error', reject);
    _drawPO(doc, po);
  });
}

/** Stream directly to HTTP response — no disk write, works on ephemeral filesystems */
function streamPOPdf(po, res) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Purchase Order ${po.po_number}`, Author: 'MS-RM' } });
    doc.pipe(res);
    res.on('finish', () => {
      logger.info('PO PDF streamed', { po_number: po.po_number });
      resolve();
    });
    res.on('error', reject);
    _drawPO(doc, po);
  });
}

function getPdfUrl(filePath, baseUrl) {
  return `${baseUrl}/uploads/purchase-orders/${path.basename(filePath)}`;
}

function buildPOHtml() { return ''; }

/**
 * Generate PDF entirely in memory and return a Buffer.
 * No disk I/O — suitable for WhatsApp / email sends on ephemeral filesystems.
 * @param {object} po - purchase order object (same shape as generatePOPdf expects)
 * @returns {Promise<Buffer>}
 */
async function generatePOPdfBuffer(po) {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Purchase Order ${po.po_number}`, Author: 'MS-RM' } });
    const chunks = [];
    doc.on('data',  (chunk) => chunks.push(chunk));
    doc.on('end',   ()      => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    _drawPO(doc, po);
  });
}

module.exports = { generatePOPdf, streamPOPdf, getPdfUrl, buildPOHtml, generatePOPdfBuffer };
