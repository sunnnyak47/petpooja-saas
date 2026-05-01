/**
 * @fileoverview Purchase Order PDF generation using Puppeteer.
 * Generates a professional, print-ready PDF for Indian restaurant POs.
 * @module modules/inventory/po-pdf.service
 */

const puppeteer = require('puppeteer');
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
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Builds the HTML string for a Purchase Order PDF.
 * @param {object} po - Full PO object with supplier, outlet, po_items relations
 * @returns {string} HTML string
 */
function buildPOHtml(po) {
  const outlet   = po.outlet   || {};
  const supplier = po.supplier || {};
  const items    = po.po_items || [];

  const statusColors = {
    draft:    { bg: '#f3f4f6', color: '#6b7280', label: 'DRAFT' },
    approved: { bg: '#ecfdf5', color: '#059669', label: 'APPROVED' },
    sent:     { bg: '#eff6ff', color: '#2563eb', label: 'SENT' },
    received: { bg: '#f0fdf4', color: '#16a34a', label: 'RECEIVED' },
  };
  const sc = statusColors[po.status] || statusColors.draft;

  const itemRows = items.map((item, i) => {
    const qty     = Number(item.ordered_quantity || 0);
    const rate    = Number(item.unit_cost || 0);
    const taxRate = Number(item.tax_rate || 0);
    const subtotal = qty * rate;
    const tax      = subtotal * taxRate / 100;
    const total    = subtotal + tax;
    return `
      <tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}">
        <td class="center">${i + 1}</td>
        <td>
          <div class="item-name">${item.item_name || '—'}</div>
          ${item.category ? `<div class="item-cat">${item.category}</div>` : ''}
          ${item.hsn_code ? `<div class="item-hsn">HSN: ${item.hsn_code}</div>` : ''}
        </td>
        <td class="center">${item.unit || 'pcs'}</td>
        <td class="right">${qty % 1 === 0 ? qty : qty.toFixed(3)}</td>
        <td class="right">₹${fmt(rate)}</td>
        <td class="center">${taxRate > 0 ? taxRate + '%' : '—'}</td>
        <td class="right">₹${fmt(total)}</td>
        ${item.notes ? `<td class="note-col">${item.notes}</td>` : ''}
      </tr>
    `;
  }).join('');

  const hasNotes = items.some(i => i.notes);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 11px;
    color: #1a1a2e;
    background: #fff;
    padding: 36px 40px;
  }

  /* ── HEADER ── */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 20px;
    border-bottom: 3px solid #4f46e5;
    margin-bottom: 24px;
  }
  .brand-block { display: flex; align-items: center; gap: 14px; }
  .logo-circle {
    width: 52px; height: 52px; border-radius: 12px;
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 22px; font-weight: 900; flex-shrink: 0;
  }
  .brand-name { font-size: 20px; font-weight: 800; color: #1e1b4b; letter-spacing: -0.3px; }
  .brand-sub  { font-size: 10px; color: #6b7280; margin-top: 2px; }
  .brand-gstin { font-size: 9px; color: #9ca3af; margin-top: 1px; }

  .po-header-right { text-align: right; }
  .po-title { font-size: 26px; font-weight: 900; color: #4f46e5; letter-spacing: -0.5px; }
  .po-number { font-size: 13px; font-weight: 700; color: #374151; margin-top: 4px; }
  .po-status {
    display: inline-block; padding: 3px 12px; border-radius: 20px;
    font-size: 9px; font-weight: 800; letter-spacing: 0.08em;
    background: ${sc.bg}; color: ${sc.color};
    margin-top: 6px; text-transform: uppercase;
  }

  /* ── META GRID ── */
  .meta-grid {
    display: grid; grid-template-columns: 1fr 1fr 1fr;
    gap: 16px; margin-bottom: 22px;
  }
  .meta-card {
    background: #f9fafb; border: 1px solid #e5e7eb;
    border-radius: 8px; padding: 12px 14px;
  }
  .meta-label { font-size: 9px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.07em; color: #9ca3af; margin-bottom: 4px; }
  .meta-value { font-size: 11px; font-weight: 600; color: #111827; }
  .meta-sub   { font-size: 10px; color: #6b7280; margin-top: 2px; line-height: 1.5; }

  /* ── PARTIES ── */
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 22px; }
  .party-card {
    border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;
  }
  .party-header {
    background: #4f46e5; color: #fff;
    padding: 6px 14px; font-size: 9px; font-weight: 800;
    text-transform: uppercase; letter-spacing: 0.07em;
  }
  .party-body { padding: 12px 14px; }
  .party-name { font-size: 13px; font-weight: 800; color: #111827; margin-bottom: 5px; }
  .party-line { font-size: 10px; color: #4b5563; line-height: 1.7; }
  .party-gstin { font-size: 10px; color: #6b7280; margin-top: 4px; }

  /* ── ITEMS TABLE ── */
  .table-wrap { margin-bottom: 20px; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; }
  table { width: 100%; border-collapse: collapse; }
  thead tr {
    background: linear-gradient(135deg, #4f46e5, #6366f1);
    color: #fff;
  }
  th {
    padding: 10px 12px; font-size: 9px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.07em;
  }
  th.center { text-align: center; }
  th.right  { text-align: right; }

  .row-even td { background: #ffffff; }
  .row-odd  td { background: #f9fafb; }
  td { padding: 9px 12px; border-bottom: 1px solid #f3f4f6; font-size: 10.5px; vertical-align: top; }
  .center { text-align: center; }
  .right  { text-align: right; }
  .item-name { font-weight: 600; color: #111827; }
  .item-cat  { font-size: 9px; color: #9ca3af; margin-top: 2px; text-transform: capitalize; }
  .item-hsn  { font-size: 9px; color: #d1d5db; margin-top: 1px; }
  .note-col  { font-size: 9px; color: #6b7280; max-width: 100px; }

  /* ── TOTALS ── */
  .totals-wrap {
    display: flex; justify-content: flex-end; margin-bottom: 24px;
  }
  .totals-box {
    width: 280px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;
  }
  .totals-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 8px 14px; border-bottom: 1px solid #f3f4f6;
    font-size: 10.5px;
  }
  .totals-row:last-child { border-bottom: none; }
  .totals-label { color: #6b7280; }
  .totals-val   { font-weight: 600; color: #111827; }
  .totals-grand {
    background: #4f46e5; color: #fff;
    padding: 11px 14px; display: flex; justify-content: space-between;
  }
  .totals-grand-label { font-size: 12px; font-weight: 800; }
  .totals-grand-val   { font-size: 14px; font-weight: 900; }

  /* ── TERMS ── */
  .terms-sig { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .terms-box {
    border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px;
  }
  .terms-title { font-size: 9px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.07em; color: #9ca3af; margin-bottom: 8px; }
  .terms-text { font-size: 10px; color: #4b5563; line-height: 1.7; }
  .sig-box {
    border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .sig-space { height: 48px; border-bottom: 1px dashed #d1d5db; margin-bottom: 8px; }
  .sig-label { font-size: 9px; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; }

  /* ── FOOTER ── */
  .footer {
    border-top: 1px solid #e5e7eb; padding-top: 14px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .footer-brand { font-size: 11px; font-weight: 700; color: #4f46e5; }
  .footer-note  { font-size: 9px; color: #9ca3af; }
  .footer-page  { font-size: 9px; color: #d1d5db; }

  /* ── WATERMARK ── */
  .watermark {
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-35deg);
    font-size: 90px; font-weight: 900; color: rgba(79,70,229,0.04);
    pointer-events: none; z-index: 0; letter-spacing: -2px;
    white-space: nowrap;
  }
</style>
</head>
<body>
<div class="watermark">PURCHASE ORDER</div>

<!-- HEADER -->
<div class="header">
  <div class="brand-block">
    <div class="logo-circle">${(outlet.name || 'R').charAt(0).toUpperCase()}</div>
    <div>
      <div class="brand-name">${outlet.name || 'Restaurant'}</div>
      <div class="brand-sub">${[outlet.address_line1, outlet.city, outlet.state].filter(Boolean).join(', ') || 'Address not configured'}</div>
      ${outlet.gstin ? `<div class="brand-gstin">GSTIN: ${outlet.gstin}</div>` : ''}
      ${outlet.phone ? `<div class="brand-gstin">📞 ${outlet.phone}</div>` : ''}
    </div>
  </div>
  <div class="po-header-right">
    <div class="po-title">PURCHASE ORDER</div>
    <div class="po-number">${po.po_number}</div>
    <div class="po-status">${sc.label}</div>
  </div>
</div>

<!-- META DATES -->
<div class="meta-grid">
  <div class="meta-card">
    <div class="meta-label">PO Date</div>
    <div class="meta-value">${fmtDate(po.created_at)}</div>
  </div>
  <div class="meta-card">
    <div class="meta-label">Expected Delivery</div>
    <div class="meta-value">${fmtDate(po.expected_date || po.delivery_date)}</div>
  </div>
  <div class="meta-card">
    <div class="meta-label">Reference No.</div>
    <div class="meta-value">${po.reference_number || '—'}</div>
  </div>
</div>

<!-- PARTIES -->
<div class="parties">
  <div class="party-card">
    <div class="party-header">📦 Vendor / Supplier</div>
    <div class="party-body">
      <div class="party-name">${supplier.name || '—'}</div>
      ${supplier.contact_person ? `<div class="party-line">👤 ${supplier.contact_person}</div>` : ''}
      ${supplier.phone ? `<div class="party-line">📞 ${supplier.phone}</div>` : ''}
      ${supplier.email ? `<div class="party-line">✉ ${supplier.email}</div>` : ''}
      ${supplier.address ? `<div class="party-line">📍 ${supplier.address}</div>` : ''}
      ${supplier.gstin ? `<div class="party-gstin">GSTIN: ${supplier.gstin}</div>` : ''}
      ${supplier.payment_terms ? `<div class="party-gstin">Payment: ${supplier.payment_terms}</div>` : ''}
    </div>
  </div>
  <div class="party-card">
    <div class="party-header">🏪 Delivery To (Bill To)</div>
    <div class="party-body">
      <div class="party-name">${outlet.name || '—'}</div>
      ${outlet.address_line1 ? `<div class="party-line">📍 ${[outlet.address_line1, outlet.address_line2, outlet.city, outlet.state, outlet.pincode].filter(Boolean).join(', ')}</div>` : ''}
      ${outlet.phone ? `<div class="party-line">📞 ${outlet.phone}</div>` : ''}
      ${outlet.email ? `<div class="party-line">✉ ${outlet.email}</div>` : ''}
      ${outlet.gstin ? `<div class="party-gstin">GSTIN: ${outlet.gstin}</div>` : ''}
      ${outlet.fssai_number ? `<div class="party-gstin">FSSAI: ${outlet.fssai_number}</div>` : ''}
    </div>
  </div>
</div>

<!-- ITEMS TABLE -->
<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th class="center" style="width:32px">#</th>
        <th>Item Description</th>
        <th class="center" style="width:50px">Unit</th>
        <th class="right"  style="width:60px">Qty</th>
        <th class="right"  style="width:72px">Rate (₹)</th>
        <th class="center" style="width:48px">GST</th>
        <th class="right"  style="width:80px">Amount (₹)</th>
        ${hasNotes ? '<th style="width:90px">Notes</th>' : ''}
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>
</div>

<!-- TOTALS -->
<div class="totals-wrap">
  <div class="totals-box">
    <div class="totals-row">
      <span class="totals-label">Subtotal</span>
      <span class="totals-val">₹${fmt(po.total_amount)}</span>
    </div>
    ${Number(po.tax_amount) > 0 ? `
    <div class="totals-row">
      <span class="totals-label">GST / Tax</span>
      <span class="totals-val">₹${fmt(po.tax_amount)}</span>
    </div>` : ''}
    ${Number(po.discount_amount) > 0 ? `
    <div class="totals-row">
      <span class="totals-label">Discount</span>
      <span class="totals-val" style="color:#dc2626">−₹${fmt(po.discount_amount)}</span>
    </div>` : ''}
    <div class="totals-grand">
      <span class="totals-grand-label">Grand Total</span>
      <span class="totals-grand-val">₹${fmt(po.grand_total)}</span>
    </div>
  </div>
</div>

<!-- TERMS & SIGNATURE -->
<div class="terms-sig">
  <div class="terms-box">
    <div class="terms-title">Terms & Notes</div>
    <div class="terms-text">${po.terms || 'Standard payment terms apply. Please deliver goods as per the schedule specified above. All items subject to quality inspection on receipt. Prices are inclusive of taxes unless mentioned separately.'}</div>
    ${po.notes ? `<div class="terms-text" style="margin-top:8px; padding-top:8px; border-top:1px solid #f3f4f6; color:#374151"><strong>Notes:</strong> ${po.notes}</div>` : ''}
  </div>
  <div class="sig-box">
    <div>
      <div class="terms-title">Authorised Signatory</div>
      <div class="sig-space"></div>
      <div class="sig-label">${outlet.name || 'Restaurant'}</div>
      <div style="font-size:9px; color:#9ca3af; margin-top:2px;">Name & Stamp</div>
    </div>
    ${po.approved_at ? `<div style="font-size:9px; color:#059669; margin-top:8px;">✓ Approved on ${fmtDate(po.approved_at)}</div>` : ''}
  </div>
</div>

<!-- FOOTER -->
<div class="footer">
  <div class="footer-brand">MS-RM Restaurant Management</div>
  <div class="footer-note">This is a computer-generated Purchase Order — ${fmtDate(new Date())}</div>
  <div class="footer-page">Page 1 of 1</div>
</div>

</body>
</html>`;
}

/**
 * Generates a PDF for a Purchase Order and saves it to disk.
 * @param {object} po - Full PO object (with supplier, outlet, po_items)
 * @returns {Promise<string>} Absolute file path of the generated PDF
 */
async function generatePOPdf(po) {
  ensureDir();
  const filename = `${po.po_number.replace(/[^a-zA-Z0-9-]/g, '_')}_${Date.now()}.pdf`;
  const filePath = path.join(UPLOADS_DIR, filename);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    const html = buildPOHtml(po);
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: filePath,
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    logger.info('PO PDF generated', { po_number: po.po_number, path: filePath });
    return filePath;
  } finally {
    await browser.close();
  }
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

module.exports = { generatePOPdf, getPdfUrl, buildPOHtml };
