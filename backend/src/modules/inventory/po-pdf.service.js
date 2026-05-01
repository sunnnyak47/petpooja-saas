/**
 * @fileoverview Purchase Order PDF generation using PDFKit (pure Node.js).
 * No browser/Puppeteer needed — works on all platforms including Render Linux.
 * @module modules/inventory/po-pdf.service
 */

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const logger = require('../../config/logger');

const UPLOADS_DIR = path.join(__dirname, '../../../uploads/purchase-orders');

function ensureDir() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Color palette
const INDIGO   = '#4f46e5';
const INDIGO_L = '#6366f1';
const GRAY_900 = '#111827';
const GRAY_700 = '#374151';
const GRAY_500 = '#6b7280';
const GRAY_300 = '#d1d5db';
const GRAY_100 = '#f3f4f6';
const WHITE    = '#ffffff';
const GREEN    = '#059669';

const STATUS_COLORS = {
  draft:    { bg: '#f3f4f6', text: '#6b7280', label: 'DRAFT' },
  approved: { bg: '#ecfdf5', text: '#059669', label: 'APPROVED' },
  sent:     { bg: '#eff6ff', text: '#2563eb', label: 'SENT' },
  received: { bg: '#f0fdf4', text: '#16a34a', label: 'RECEIVED' },
};

/**
 * Generates a PDF for a Purchase Order and saves it to disk.
 * @param {object} po - Full PO object (with supplier, outlet, po_items)
 * @returns {Promise<string>} Absolute file path of the generated PDF
 */
/** Build and draw all PDF content onto a PDFDocument instance */
function _drawPO(doc, po) {
  const outlet   = po.outlet   || {};
  const supplier = po.supplier || {};
  const items    = po.po_items || [];
  const sc       = STATUS_COLORS[po.status] || STATUS_COLORS.draft;

    const W  = 595.28;  // A4 width in points
    const H  = 841.89;  // A4 height in points
    const ML = 36;      // margin left
    const MR = 36;      // margin right
    const CW = W - ML - MR; // content width

    let y = 0; // current Y cursor

    // ─── HEADER BAND ─────────────────────────────────────────────────────
    doc.rect(0, 0, W, 90).fill(WHITE);

    // Logo circle
    doc.roundedRect(ML, 18, 54, 54, 10).fill(INDIGO);
    const initial = (outlet.name || 'R').charAt(0).toUpperCase();
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(26)
       .text(initial, ML, 18 + 14, { width: 54, align: 'center' });

    // Outlet name + address
    const outletAddr = [outlet.address_line1, outlet.city, outlet.state].filter(Boolean).join(', ') || 'Address not configured';
    doc.fillColor(GRAY_900).font('Helvetica-Bold').fontSize(16)
       .text(outlet.name || 'Restaurant', ML + 64, 22, { width: 200 });
    doc.fillColor(GRAY_500).font('Helvetica').fontSize(8)
       .text(outletAddr, ML + 64, 42, { width: 210 });
    if (outlet.gstin) {
      doc.text(`GSTIN: ${outlet.gstin}`, ML + 64, 54, { width: 210 });
    }
    if (outlet.phone) {
      doc.text(`Ph: ${outlet.phone}`, ML + 64, 63, { width: 210 });
    }

    // PO Title (right side)
    doc.fillColor(INDIGO).font('Helvetica-Bold').fontSize(22)
       .text('PURCHASE ORDER', 330, 18, { width: W - 330 - MR, align: 'right' });
    doc.fillColor(GRAY_700).font('Helvetica-Bold').fontSize(10)
       .text(po.po_number || '', 330, 46, { width: W - 330 - MR, align: 'right' });

    // Status badge
    const statusLabel = sc.label;
    const badgeW = doc.widthOfString(statusLabel, { fontSize: 8 }) + 18;
    const badgeX = W - MR - badgeW;
    doc.roundedRect(badgeX, 60, badgeW, 16, 8).fill(sc.bg);
    doc.fillColor(sc.text).font('Helvetica-Bold').fontSize(8)
       .text(statusLabel, badgeX, 64, { width: badgeW, align: 'center' });

    // Header bottom border
    y = 90;
    doc.rect(0, y, W, 3).fill(INDIGO);
    y += 3;

    // ─── META DATES ROW ───────────────────────────────────────────────────
    y += 14;
    const metaCols = [
      { label: 'PO Date',           value: fmtDate(po.created_at) },
      { label: 'Expected Delivery', value: fmtDate(po.expected_date || po.delivery_date) },
      { label: 'Reference No.',     value: po.reference_number || '-' },
    ];
    const metaW = CW / 3;
    metaCols.forEach((col, i) => {
      const cx = ML + i * metaW;
      doc.rect(cx, y, metaW - 6, 38).fill(GRAY_100).stroke(GRAY_300);
      doc.fillColor(GRAY_500).font('Helvetica-Bold').fontSize(7)
         .text(col.label.toUpperCase(), cx + 8, y + 6, { width: metaW - 22 });
      doc.fillColor(GRAY_900).font('Helvetica-Bold').fontSize(10)
         .text(col.value, cx + 8, y + 17, { width: metaW - 22 });
    });
    y += 52;

    // ─── PARTIES (VENDOR / DELIVERY TO) ──────────────────────────────────
    const partyW = CW / 2 - 6;

    function drawPartyCard(title, lines, cx, py) {
      // header
      doc.rect(cx, py, partyW, 18).fill(INDIGO);
      doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(8)
         .text(title, cx + 8, py + 5, { width: partyW - 16 });
      // body
      const bodyH = Math.max(70, lines.length * 14 + 16);
      doc.rect(cx, py + 18, partyW, bodyH).fill(WHITE).stroke(GRAY_300);
      let ly = py + 24;
      lines.forEach((line, idx) => {
        if (!line) return;
        const isName = idx === 0;
        doc.fillColor(isName ? GRAY_900 : GRAY_700)
           .font(isName ? 'Helvetica-Bold' : 'Helvetica')
           .fontSize(isName ? 11 : 9)
           .text(line, cx + 8, ly, { width: partyW - 16 });
        ly += isName ? 14 : 12;
      });
      return bodyH + 18;
    }

    const vendorLines = [
      supplier.name || '-',
      supplier.contact_person ? `Contact: ${supplier.contact_person}` : null,
      supplier.phone  ? `Ph: ${supplier.phone}` : null,
      supplier.email  ? `Email: ${supplier.email}` : null,
      supplier.address ? `Addr: ${supplier.address}` : null,
      supplier.gstin  ? `GSTIN: ${supplier.gstin}` : null,
      supplier.payment_terms ? `Payment: ${supplier.payment_terms}` : null,
    ].filter(Boolean);

    const deliveryLines = [
      outlet.name || '-',
      outlet.address_line1 ? `Addr: ${[outlet.address_line1, outlet.address_line2, outlet.city, outlet.state, outlet.pincode].filter(Boolean).join(', ')}` : null,
      outlet.phone ? `Ph: ${outlet.phone}` : null,
      outlet.email ? `Email: ${outlet.email}` : null,
      outlet.gstin ? `GSTIN: ${outlet.gstin}` : null,
      outlet.fssai_number ? `FSSAI: ${outlet.fssai_number}` : null,
    ].filter(Boolean);

    const vendorH  = drawPartyCard('VENDOR / SUPPLIER', vendorLines,  ML, y);
    const delivH   = drawPartyCard('DELIVERY TO (BILL TO)', deliveryLines, ML + partyW + 12, y);
    y += Math.max(vendorH, delivH) + 14;

    // ─── ITEMS TABLE ──────────────────────────────────────────────────────
    // Column definitions
    const cols = [
      { label: '#',          width: 24,  align: 'center' },
      { label: 'Item Name',  width: 140, align: 'left'   },
      { label: 'HSN',        width: 52,  align: 'center' },
      { label: 'Unit',       width: 40,  align: 'center' },
      { label: 'Qty',        width: 40,  align: 'right'  },
      { label: 'Rate (Rs)', width: 65,  align: 'right'  },
      { label: 'GST%',      width: 40,  align: 'center' },
      { label: 'Amount (Rs)',width: 82,  align: 'right'  },
    ];
    // Adjust last col to fill remaining
    const usedW = cols.reduce((s, c) => s + c.width, 0);
    cols[cols.length - 1].width += CW - usedW;

    const ROW_H = 22;
    const HDR_H = 20;

    // Header row
    doc.rect(ML, y, CW, HDR_H).fill(INDIGO);
    let cx = ML;
    cols.forEach(col => {
      doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(8)
         .text(col.label.toUpperCase(), cx + 4, y + 6, { width: col.width - 8, align: col.align });
      cx += col.width;
    });
    y += HDR_H;

    // Item rows
    items.forEach((item, i) => {
      const qty      = Number(item.ordered_quantity || 0);
      const rate     = Number(item.unit_cost || 0);
      const taxRate  = Number(item.tax_rate || 0);
      const subtotal = qty * rate;
      const tax      = subtotal * taxRate / 100;
      const total    = subtotal + tax;

      const rowBg = i % 2 === 0 ? WHITE : GRAY_100;
      doc.rect(ML, y, CW, ROW_H).fill(rowBg).stroke(GRAY_300);

      const cells = [
        String(i + 1),
        item.item_name || '-',
        item.hsn_code  || '-',
        item.unit      || 'pcs',
        qty % 1 === 0 ? String(qty) : qty.toFixed(3),
        fmt(rate),
        taxRate > 0 ? `${taxRate}%` : '-',
        fmt(total),
      ];

      cx = ML;
      cells.forEach((cell, ci) => {
        const col = cols[ci];
        doc.fillColor(ci === 1 ? GRAY_900 : GRAY_700)
           .font(ci === 1 ? 'Helvetica-Bold' : 'Helvetica')
           .fontSize(9)
           .text(cell, cx + 4, y + 7, { width: col.width - 8, align: col.align, lineBreak: false });
        cx += col.width;
      });

      y += ROW_H;
    });

    // Table bottom border
    doc.rect(ML, y, CW, 1).fill(GRAY_300);
    y += 14;

    // ─── TOTALS ───────────────────────────────────────────────────────────
    const totalsX = ML + CW - 220;
    const totalsW = 220;

    function totalsRow(label, value, highlight) {
      const rH = highlight ? 26 : 20;
      doc.rect(totalsX, y, totalsW, rH).fill(highlight ? INDIGO : WHITE).stroke(highlight ? INDIGO : GRAY_300);
      doc.fillColor(highlight ? WHITE : GRAY_500).font('Helvetica').fontSize(highlight ? 11 : 9)
         .text(label, totalsX + 10, y + (rH - 11) / 2, { width: 110 });
      doc.fillColor(highlight ? WHITE : GRAY_900).font('Helvetica-Bold').fontSize(highlight ? 13 : 10)
         .text(`Rs ${value}`, totalsX + 120, y + (rH - (highlight ? 13 : 10)) / 2, { width: totalsW - 130, align: 'right' });
      y += rH;
    }

    totalsRow('Subtotal', fmt(po.total_amount), false);
    if (Number(po.tax_amount) > 0) totalsRow('GST / Tax', fmt(po.tax_amount), false);
    if (Number(po.discount_amount) > 0) totalsRow('Discount', `-${fmt(po.discount_amount)}`, false);
    totalsRow('GRAND TOTAL', fmt(po.grand_total), true);

    y += 18;

    // ─── TERMS & SIGNATORY ────────────────────────────────────────────────
    const halfW = CW / 2 - 6;
    const termsText = po.terms || 'Standard payment terms apply. Please deliver goods as per the schedule specified above. All items subject to quality inspection on receipt.';

    // Terms box
    doc.rect(ML, y, halfW, 80).fill(WHITE).stroke(GRAY_300);
    doc.fillColor(GRAY_500).font('Helvetica-Bold').fontSize(7)
       .text('TERMS & CONDITIONS', ML + 8, y + 8, { width: halfW - 16 });
    doc.fillColor(GRAY_700).font('Helvetica').fontSize(8.5)
       .text(termsText, ML + 8, y + 20, { width: halfW - 16, height: 52, lineGap: 2 });

    // Signatory box
    const sigX = ML + halfW + 12;
    doc.rect(sigX, y, halfW, 80).fill(WHITE).stroke(GRAY_300);
    doc.fillColor(GRAY_500).font('Helvetica-Bold').fontSize(7)
       .text('AUTHORISED SIGNATORY', sigX + 8, y + 8, { width: halfW - 16 });
    // dashed line
    doc.moveTo(sigX + 8, y + 58).lineTo(sigX + halfW - 8, y + 58).dash(3, { space: 3 }).stroke(GRAY_300);
    doc.undash();
    doc.fillColor(GRAY_900).font('Helvetica-Bold').fontSize(9)
       .text(outlet.name || 'Restaurant', sigX + 8, y + 62, { width: halfW - 16 });
    doc.fillColor(GRAY_500).font('Helvetica').fontSize(7)
       .text('Name & Stamp', sigX + 8, y + 74, { width: halfW - 16 });

    if (po.approved_at) {
      doc.fillColor(GREEN).font('Helvetica').fontSize(8)
         .text(`Approved on ${fmtDate(po.approved_at)}`, sigX + 8, y + 66, { width: halfW - 16 });
    }

    y += 94;

    // ─── FOOTER ───────────────────────────────────────────────────────────
    doc.rect(ML, y, CW, 1).fill(GRAY_300);
    y += 8;
    doc.fillColor(INDIGO).font('Helvetica-Bold').fontSize(9)
       .text('MS-RM Restaurant Management', ML, y, { width: CW / 3 });
    doc.fillColor(GRAY_500).font('Helvetica').fontSize(8)
       .text(`This is a computer-generated Purchase Order - ${fmtDate(new Date())}`, ML + CW / 3, y, { width: CW / 3, align: 'center' });
    doc.fillColor(GRAY_300).font('Helvetica').fontSize(8)
       .text('Page 1 of 1', ML, y, { width: CW, align: 'right' });

  doc.end();
}

/**
 * Generate PDF, save to disk, return absolute file path.
 * (Used by WhatsApp send which needs a public URL)
 */
async function generatePOPdf(po) {
  ensureDir();
  const filename = `${(po.po_number || 'PO').replace(/[^a-zA-Z0-9-]/g, '_')}_${Date.now()}.pdf`;
  const filePath = path.join(UPLOADS_DIR, filename);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Purchase Order ${po.po_number}` } });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    stream.on('finish', () => {
      logger.info('PO PDF generated (pdfkit)', { po_number: po.po_number, path: filePath });
      resolve(filePath);
    });
    stream.on('error', reject);
    _drawPO(doc, po);
  });
}

/**
 * Stream PDF directly to an HTTP response — no file saved, works on ephemeral filesystems.
 * @param {object} po - Full PO object
 * @param {object} res - Express response stream
 */
function streamPOPdf(po, res) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Purchase Order ${po.po_number}` } });
    doc.pipe(res);
    res.on('finish', () => {
      logger.info('PO PDF streamed (pdfkit)', { po_number: po.po_number });
      resolve();
    });
    res.on('error', reject);
    _drawPO(doc, po);
  });
}

/**
 * Returns the public URL path for a PDF file path.
 * @param {string} filePath - Absolute path
 * @param {string} baseUrl - e.g. https://petpooja-saas.onrender.com
 */
function getPdfUrl(filePath, baseUrl) {
  const filename = path.basename(filePath);
  return `${baseUrl}/uploads/purchase-orders/${filename}`;
}

// Kept for backward compat (no longer used but may be imported elsewhere)
function buildPOHtml() { return ''; }

module.exports = { generatePOPdf, streamPOPdf, getPdfUrl, buildPOHtml };
