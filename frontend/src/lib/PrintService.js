/**
 * PrintService — production-ready print abstraction for PetPooja receipts and KOTs.
 *
 * Supports three output paths:
 *   1. Browser print dialog  — window.open() + window.print() (universal fallback)
 *   2. ESC/POS thermal USB  — Web USB API (Chrome/Edge on supported hardware)
 *   3. Electron IPC         — window.electron.print() when running in desktop shell
 *
 * All HTML generators use inline styles only (no external CSS dependencies).
 * Paper widths: 58mm (narrow thermal) and 80mm (wide thermal / desk printers).
 */

// ---------------------------------------------------------------------------
// ESC/POS byte constants
// ---------------------------------------------------------------------------
const ESC = 0x1b; // Escape prefix for most commands
const GS  = 0x1d; // Group Separator prefix for advanced commands
const LF  = 0x0a; // Line Feed — advance one line

// Alignment modes (used after ESC a N)
const ALIGN_LEFT   = 0;
const ALIGN_CENTER = 1;
const ALIGN_RIGHT  = 2;

// Common thermal printer USB vendor IDs
const THERMAL_VENDOR_IDS = [
  0x0416, // Bixolon
  0x04b8, // Epson
  0x0525, // PLX Devices / Star
  0x1504, // Citizen
  0x6868, // Generic ESC/POS
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Zero-pad a number to given width. */
function pad(num, width = 2) {
  return String(num).padStart(width, '0');
}

/** Format a JS Date or ISO string as DD/MM/YYYY HH:MM */
function formatDateTime(date) {
  const d = new Date(date);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Right-align `right` within a fixed total width by padding `left` with spaces.
 * Used to produce "Item Name            ₹ 100" rows in ESC/POS text.
 */
function alignColumns(left, right, totalWidth = 32) {
  const gap = totalWidth - left.length - right.length;
  return left + ' '.repeat(Math.max(1, gap)) + right;
}

/**
 * Append an ESC/POS command sequence to a byte array.
 * Accepts numbers or nested arrays of numbers.
 */
function append(buf, ...bytes) {
  for (const b of bytes.flat(Infinity)) buf.push(b);
}

// ---------------------------------------------------------------------------
// HTML generators
// ---------------------------------------------------------------------------

/**
 * generateBillHTML — returns a full self-contained HTML string for a receipt.
 *
 * @param {object} order   — order object from backend (includes order_items, outlet, etc.)
 * @param {object} outlet  — outlet / branding object (name, address, phone, gstin, abn)
 * @param {object} options — { paperWidth: 58|80, region: 'IN'|'AU', currency: '₹'|'A$' }
 * @returns {string} HTML string ready for window.open + document.write
 */
function generateBillHTML(order, outlet, options = {}) {
  const {
    paperWidth = 58,
    region = outlet?.region ?? 'IN',
    currency = region === 'AU' ? 'A$' : '₹',
  } = options;

  const isAU = region === 'AU';
  const mmWidth = paperWidth === 80 ? '80mm' : '58mm';
  const fontSize = paperWidth === 80 ? '13px' : '11px';

  const outletName  = outlet?.name  ?? order?.outlet?.name  ?? 'Restaurant';
  const outletAddr  = outlet?.address ?? order?.outlet?.address ?? '';
  const outletPhone = outlet?.phone   ?? order?.outlet?.phone   ?? '';
  const outletGSTIN = outlet?.gstin   ?? order?.outlet?.gstin   ?? '';
  const outletABN   = outlet?.abn     ?? order?.outlet?.abn     ?? '';

  const items = order?.order_items ?? [];
  const subtotal   = Number(order?.subtotal   ?? 0);
  const discount   = Number(order?.discount   ?? 0);
  const cgst       = Number(order?.cgst       ?? 0);
  const sgst       = Number(order?.sgst       ?? 0);
  const igst       = Number(order?.igst       ?? order?.gst ?? 0);
  const grandTotal = Number(order?.grand_total ?? 0);
  const payMethod  = order?.payment_method ?? order?.payments?.[0]?.method ?? '';

  const divider = `<div style="border-top:1px dashed #555;margin:6px 0;"></div>`;

  const itemRows = items.map((item) => {
    const name   = item.name ?? item.menu_item?.name ?? '';
    const qty    = item.quantity ?? 1;
    const total  = Number(item.item_total ?? 0).toFixed(2);
    return `
      <tr>
        <td style="padding:2px 0;vertical-align:top;">${name}${
          item.variant_name ? `<br><span style="font-size:9px;opacity:.7"> - ${item.variant_name}</span>` : ''
        }${
          (item.addons ?? []).map((a) => `<br><span style="font-size:9px;opacity:.6">+ ${a.name}</span>`).join('')
        }</td>
        <td style="text-align:center;padding:2px 4px;vertical-align:top;">${qty}</td>
        <td style="text-align:right;padding:2px 0;vertical-align:top;">${currency}${total}</td>
      </tr>`;
  }).join('');

  const taxSection = isAU
    ? (igst > 0 ? `<tr><td colspan="2" style="opacity:.7">GST (10%) incl.</td><td style="text-align:right;opacity:.7">${currency}${igst.toFixed(2)}</td></tr>` : '')
    : `
      ${cgst > 0 ? `<tr><td colspan="2" style="opacity:.7">CGST (2.5%)</td><td style="text-align:right;opacity:.7">${currency}${cgst.toFixed(2)}</td></tr>` : ''}
      ${sgst > 0 ? `<tr><td colspan="2" style="opacity:.7">SGST (2.5%)</td><td style="text-align:right;opacity:.7">${currency}${sgst.toFixed(2)}</td></tr>` : ''}
    `;

  const taxId = isAU
    ? (outletABN ? `<p style="margin:2px 0;">ABN: ${outletABN}</p>` : '')
    : (outletGSTIN ? `<p style="margin:2px 0;">GSTIN: ${outletGSTIN}</p>` : '');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Bill - ${order?.invoice_number ?? ''}</title>
<style>
  @media print {
    body { margin: 0; }
    @page { margin: 4mm; size: ${mmWidth} auto; }
  }
  * { box-sizing: border-box; }
</style>
</head>
<body style="font-family:'Courier New',Courier,monospace;font-size:${fontSize};width:${mmWidth};margin:0 auto;padding:4px;color:#000;background:#fff;">

  <!-- Header -->
  <div style="text-align:center;margin-bottom:6px;">
    <div style="font-size:${paperWidth === 80 ? '16px' : '13px'};font-weight:bold;text-transform:uppercase;letter-spacing:1px;">${outletName}</div>
    ${outletAddr ? `<div style="margin-top:2px;font-size:9px;">${outletAddr}</div>` : ''}
    ${outletPhone ? `<div style="font-size:9px;">Tel: ${outletPhone}</div>` : ''}
    ${taxId}
  </div>

  ${divider}
  <div style="font-weight:bold;text-align:center;text-decoration:underline;margin-bottom:4px;">TAX INVOICE</div>
  ${divider}

  <!-- Order meta -->
  <table style="width:100%;font-size:${fontSize};border-collapse:collapse;">
    <tr>
      <td>Bill No: <b>${order?.invoice_number ?? '#—'}</b></td>
      <td style="text-align:right;">${formatDateTime(order?.created_at ?? new Date())}</td>
    </tr>
    <tr>
      <td>Table: ${order?.table?.table_number ?? order?.table_number ?? 'N/A'}</td>
      <td style="text-align:right;">Covers: ${order?.covers ?? 1}</td>
    </tr>
    ${order?.staff?.full_name || order?.staff_name ? `<tr><td colspan="2">Cashier: ${order?.staff?.full_name ?? order?.staff_name}</td></tr>` : ''}
  </table>

  ${divider}

  <!-- Items -->
  <table style="width:100%;font-size:${fontSize};border-collapse:collapse;">
    <thead>
      <tr style="font-weight:bold;font-size:9px;text-transform:uppercase;">
        <th style="text-align:left;padding-bottom:3px;">Item</th>
        <th style="text-align:center;padding-bottom:3px;">Qty</th>
        <th style="text-align:right;padding-bottom:3px;">Amt</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  ${divider}

  <!-- Totals -->
  <table style="width:100%;font-size:${fontSize};border-collapse:collapse;">
    <tr>
      <td colspan="2">Subtotal</td>
      <td style="text-align:right;">${currency}${subtotal.toFixed(2)}</td>
    </tr>
    ${discount > 0 ? `<tr><td colspan="2" style="opacity:.8;">Discount</td><td style="text-align:right;opacity:.8;">-${currency}${discount.toFixed(2)}</td></tr>` : ''}
    ${taxSection}
    <tr style="font-weight:bold;border-top:2px solid #000;">
      <td colspan="2" style="padding-top:4px;font-size:${paperWidth === 80 ? '15px' : '13px'};">TOTAL</td>
      <td style="text-align:right;padding-top:4px;font-size:${paperWidth === 80 ? '15px' : '13px'};">${currency}${grandTotal.toFixed(2)}</td>
    </tr>
  </table>

  ${divider}

  <!-- Payment method -->
  ${payMethod ? `<div style="margin:4px 0;font-size:${fontSize};">Payment: <b>${payMethod}</b></div>` : ''}
  ${divider}

  <!-- Footer -->
  <div style="text-align:center;margin-top:6px;font-size:9px;">
    <p style="font-weight:bold;text-transform:uppercase;letter-spacing:1px;">Thank You! Visit Again</p>
    <p>Order #${order?.order_number ?? ''}</p>
  </div>

</body>
</html>`;
}

/**
 * generateKOTHTML — returns HTML for a kitchen order ticket.
 *
 * @param {object} order          — order with table, covers, order_number
 * @param {Array}  kotItems       — subset of items being fired to kitchen
 * @param {string} kitchenStation — e.g. "Main Kitchen", "Grill", "Bakery"
 * @param {object} outlet         — outlet info (name)
 */
function generateKOTHTML(order, kotItems, kitchenStation, outlet) {
  const outletName = outlet?.name ?? order?.outlet?.name ?? 'Kitchen';
  const kotNumber  = order?.kot_number ?? order?.order_number ?? '—';
  const timeStr    = formatDateTime(new Date());

  const itemRows = (kotItems ?? []).map((item) => {
    const name  = item.name ?? item.menu_item?.name ?? '';
    const qty   = item.quantity ?? 1;
    const cat   = item.category ?? item.menu_item?.category?.name ?? '';
    const notes = item.notes ?? item.special_instructions ?? '';
    return `
      <tr>
        <td style="font-size:16px;font-weight:bold;padding:4px 0;">${qty}x ${name}</td>
        <td style="text-align:right;font-size:11px;opacity:.8;padding:4px 0;">${cat ? `[${cat}]` : ''}</td>
      </tr>
      ${notes ? `<tr><td colspan="2" style="font-size:11px;padding:0 0 4px 16px;opacity:.8;">${notes}</td></tr>` : ''}`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>KOT - ${kotNumber}</title>
<style>
  @media print {
    body { margin: 0; }
    @page { margin: 4mm; size: 80mm auto; }
  }
  * { box-sizing: border-box; }
</style>
</head>
<body style="font-family:'Courier New',Courier,monospace;font-size:13px;width:80mm;margin:0 auto;padding:4px;color:#000;background:#fff;">

  <div style="text-align:center;border:2px solid #000;padding:4px;margin-bottom:6px;">
    <div style="font-size:11px;opacity:.7;">${outletName}</div>
    <div style="font-size:17px;font-weight:bold;letter-spacing:2px;">KITCHEN ORDER</div>
    ${kitchenStation ? `<div style="font-size:11px;font-weight:bold;">${kitchenStation.toUpperCase()}</div>` : ''}
  </div>

  <table style="width:100%;font-size:13px;border-collapse:collapse;">
    <tr>
      <td>KOT #: <b>${kotNumber}</b></td>
      <td style="text-align:right;">Time: <b>${timeStr.split(' ')[1]}</b></td>
    </tr>
    <tr>
      <td>Table: <b>${order?.table?.table_number ?? order?.table_number ?? 'N/A'}</b></td>
      <td style="text-align:right;">Covers: <b>${order?.covers ?? 1}</b></td>
    </tr>
  </table>

  <div style="border-top:2px solid #000;border-bottom:2px solid #000;margin:6px 0;">
    <table style="width:100%;border-collapse:collapse;padding:4px 0;">
      ${itemRows}
    </table>
  </div>

  <div style="text-align:center;font-size:10px;margin-top:4px;opacity:.6;">${formatDateTime(new Date())}</div>

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// ESC/POS encoder
// ---------------------------------------------------------------------------

/**
 * encodeBillESCPOS — encodes a bill as raw ESC/POS bytes for thermal printers.
 *
 * Supports 58mm (32 chars/line) and 80mm (48 chars/line) paper widths.
 * Returns a Uint8Array ready to send via USB bulk transfer.
 *
 * @param {object} order
 * @param {object} outlet
 * @param {number} paperWidth — 58 or 80 (mm)
 * @returns {Uint8Array}
 */
function encodeBillESCPOS(order, outlet, paperWidth = 58) {
  const lineWidth  = paperWidth === 80 ? 48 : 32;
  const dividerStr = '-'.repeat(lineWidth);
  const currency   = outlet?.region === 'AU' ? 'A$' : 'Rs';

  const outletName  = (outlet?.name ?? order?.outlet?.name ?? 'Restaurant').toUpperCase();
  const outletAddr  = outlet?.address ?? order?.outlet?.address ?? '';
  const outletPhone = outlet?.phone   ?? order?.outlet?.phone   ?? '';
  const items       = order?.order_items ?? [];

  const buf = [];

  // -- Initialize printer: ESC @ --
  append(buf, ESC, 0x40);                     // ESC @ — reset to defaults

  // ---- Header: outlet name (centered, double height) ----
  append(buf, ESC, 0x61, ALIGN_CENTER);        // ESC a 1 — center align
  append(buf, GS,  0x21, 0x11);               // GS ! 0x11 — double width + double height
  append(buf, ESC, 0x45, 1);                  // ESC E 1 — bold on
  append(buf, ...encodeText(outletName), LF);
  append(buf, GS,  0x21, 0x00);               // GS ! 0x00 — normal size
  append(buf, ESC, 0x45, 0);                  // ESC E 0 — bold off

  if (outletAddr) {
    append(buf, ...encodeText(outletAddr), LF);
  }
  if (outletPhone) {
    append(buf, ...encodeText(`Tel: ${outletPhone}`), LF);
  }
  append(buf, ...encodeText(dividerStr), LF);

  // ---- Title ----
  append(buf, ESC, 0x45, 1);                  // ESC E 1 — bold on
  append(buf, ...encodeText('TAX INVOICE'), LF);
  append(buf, ESC, 0x45, 0);                  // ESC E 0 — bold off
  append(buf, ...encodeText(dividerStr), LF);

  // ---- Meta: left-aligned ----
  append(buf, ESC, 0x61, ALIGN_LEFT);          // ESC a 0 — left align
  append(buf, ...encodeText(`Bill: ${order?.invoice_number ?? '#'}`), LF);
  append(buf, ...encodeText(`Date: ${formatDateTime(order?.created_at ?? new Date())}`), LF);
  append(buf, ...encodeText(`Table: ${order?.table?.table_number ?? 'N/A'}  Covers: ${order?.covers ?? 1}`), LF);
  if (order?.staff?.full_name) {
    append(buf, ...encodeText(`Cashier: ${order.staff.full_name}`), LF);
  }
  append(buf, ...encodeText(dividerStr), LF);

  // ---- Items ----
  for (const item of items) {
    const name  = (item.name ?? item.menu_item?.name ?? '').substring(0, lineWidth - 10);
    const qty   = item.quantity ?? 1;
    const total = `${currency} ${Number(item.item_total ?? 0).toFixed(2)}`;
    append(buf, ...encodeText(alignColumns(`${qty}x ${name}`, total, lineWidth)), LF);
    if (item.variant_name) {
      append(buf, ...encodeText(`  - ${item.variant_name}`), LF);
    }
  }

  append(buf, ...encodeText(dividerStr), LF);

  // ---- Totals ----
  const subtotal   = Number(order?.subtotal   ?? 0);
  const discount   = Number(order?.discount   ?? 0);
  const cgst       = Number(order?.cgst       ?? 0);
  const sgst       = Number(order?.sgst       ?? 0);
  const igst       = Number(order?.igst       ?? order?.gst ?? 0);
  const grandTotal = Number(order?.grand_total ?? 0);
  const isAU       = outlet?.region === 'AU';

  append(buf, ...encodeText(alignColumns('Subtotal', `${currency} ${subtotal.toFixed(2)}`, lineWidth)), LF);

  if (discount > 0) {
    append(buf, ...encodeText(alignColumns('Discount', `-${currency} ${discount.toFixed(2)}`, lineWidth)), LF);
  }

  if (isAU) {
    if (igst > 0) {
      append(buf, ...encodeText(alignColumns('GST (10%) incl.', `${currency} ${igst.toFixed(2)}`, lineWidth)), LF);
    }
  } else {
    if (cgst > 0) append(buf, ...encodeText(alignColumns('CGST (2.5%)', `${currency} ${cgst.toFixed(2)}`, lineWidth)), LF);
    if (sgst > 0) append(buf, ...encodeText(alignColumns('SGST (2.5%)', `${currency} ${sgst.toFixed(2)}`, lineWidth)), LF);
  }

  append(buf, ...encodeText(dividerStr), LF);

  // Grand total — bold + large
  append(buf, ESC, 0x45, 1);                  // ESC E 1 — bold on
  append(buf, GS,  0x21, 0x11);               // GS ! 0x11 — double size
  append(buf, ...encodeText(alignColumns('TOTAL', `${currency} ${grandTotal.toFixed(2)}`, lineWidth)), LF);
  append(buf, GS,  0x21, 0x00);               // GS ! 0x00 — normal size
  append(buf, ESC, 0x45, 0);                  // ESC E 0 — bold off
  append(buf, ...encodeText(dividerStr), LF);

  // Payment method
  if (order?.payment_method) {
    append(buf, ...encodeText(`Payment: ${order.payment_method}`), LF);
  }

  // ---- Footer ----
  append(buf, ESC, 0x61, ALIGN_CENTER);        // ESC a 1 — center
  append(buf, LF);
  append(buf, ESC, 0x45, 1);                  // bold on
  append(buf, ...encodeText('Thank You! Visit Again'), LF);
  append(buf, ESC, 0x45, 0);                  // bold off
  append(buf, ...encodeText(`Order #${order?.order_number ?? ''}`), LF);
  append(buf, LF, LF, LF);                    // feed 3 lines before cut

  // ---- Cut: GS V 66 0 ----
  // GS V — select cut mode; 66 (0x42) = partial cut with feed; 0 = feed amount
  append(buf, GS, 0x56, 0x42, 0x00);

  return new Uint8Array(buf);
}

/**
 * Encode a JS string to Latin-1 bytes (covers most ASCII + basic symbols).
 * ESC/POS printers expect single-byte character encoding.
 */
function encodeText(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // Map common Unicode chars to their ESC/POS approximate equivalents
    if (code === 0x20b9) { bytes.push(0x60); continue; } // ₹ → backtick (fallback)
    bytes.push(code > 0xff ? 0x3f : code);                // ? for non-Latin chars
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// USB detection & send
// ---------------------------------------------------------------------------

/**
 * detectUSBPrinter — scans already-granted USB devices for known thermal printers.
 * Returns the first matching USBDevice, or null if none found / API unavailable.
 *
 * NOTE: To grant access the first time, call navigator.usb.requestDevice() from
 * a user gesture (button click). This function only checks already-granted devices.
 *
 * @returns {Promise<USBDevice|null>}
 */
async function detectUSBPrinter() {
  if (typeof navigator === 'undefined' || !navigator.usb) return null;
  try {
    const devices = await navigator.usb.getDevices();
    return devices.find((d) => THERMAL_VENDOR_IDS.includes(d.vendorId)) ?? null;
  } catch {
    return null;
  }
}

/**
 * printESCPOS — sends raw ESC/POS bytes to a USB thermal printer.
 *
 * Opens the device if not already open, claims interface 0, and performs
 * a bulk transfer OUT on endpoint 1 (standard for most thermal printers).
 *
 * @param {Uint8Array} data — ESC/POS byte array (e.g. from encodeBillESCPOS)
 * @returns {Promise<void>}
 * @throws if the device cannot be opened or transfer fails
 */
async function printESCPOS(data) {
  const device = await detectUSBPrinter();
  if (!device) throw new Error('No USB thermal printer detected');

  try {
    await device.open();
    if (device.configuration === null) await device.selectConfiguration(1);
    await device.claimInterface(0);
    // Endpoint number 1 is the bulk OUT endpoint on virtually all thermal printers
    await device.transferOut(1, data);
  } finally {
    try { await device.releaseInterface(0); } catch { /* ignore */ }
    try { await device.close(); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Public print methods
// ---------------------------------------------------------------------------

/**
 * printBill — open a browser print dialog for a bill/receipt.
 *
 * Tries ESC/POS USB first (if a printer is detected). Falls back to browser
 * window.open() print dialog automatically.
 *
 * @param {object} order
 * @param {object} outlet
 * @param {object} options — { paperWidth, region, currency }
 */
function printBill(order, outlet, options = {}) {
  const html = generateBillHTML(order, outlet, options);

  // Electron: delegate to IPC if available
  if (typeof window !== 'undefined' && window.electron?.print) {
    window.electron.print(html);
    return;
  }

  // Web USB ESC/POS: attempt thermal print, fall back on error
  detectUSBPrinter().then((device) => {
    if (device) {
      const bytes = encodeBillESCPOS(order, outlet, options.paperWidth ?? 58);
      return printESCPOS(bytes).catch(() => _browserPrint(html));
    }
    _browserPrint(html);
  }).catch(() => _browserPrint(html));
}

/**
 * printKOT — print a kitchen order ticket.
 *
 * Always uses browser print (KOTs don't need thermal ESC/POS formatting).
 *
 * @param {object} order
 * @param {Array}  kotItems
 * @param {string} kitchenStation
 * @param {object} outlet
 */
function printKOT(order, kotItems, kitchenStation, outlet) {
  const html = generateKOTHTML(order, kotItems, kitchenStation, outlet);

  if (typeof window !== 'undefined' && window.electron?.print) {
    window.electron.print(html);
    return;
  }

  _browserPrint(html);
}

/**
 * _browserPrint — internal helper: open a popup, write HTML, trigger print, close.
 * @param {string} html
 */
function _browserPrint(html) {
  if (typeof window === 'undefined') return; // SSR guard
  const popup = window.open('', '_blank', 'width=400,height=600');
  if (!popup) {
    console.error('[PrintService] window.open() was blocked. Allow popups for this site.');
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  // Small delay lets the browser finish rendering before print dialog opens
  setTimeout(() => {
    popup.print();
    popup.close();
  }, 500);
}

// ---------------------------------------------------------------------------
// Exported service object
// ---------------------------------------------------------------------------

export const PrintService = {
  /** Print a bill/receipt — tries ESC/POS USB then falls back to browser print */
  printBill,

  /** Print a KOT (Kitchen Order Ticket) via browser print */
  printKOT,

  /** Generate full receipt HTML string (useful for PDF or preview) */
  generateBillHTML,

  /** Generate KOT HTML string */
  generateKOTHTML,

  /** Check if a USB ESC/POS thermal printer is available via Web USB API */
  detectUSBPrinter,

  /**
   * Send raw ESC/POS bytes directly to a USB thermal printer.
   * Useful if you encode a custom layout with encodeBillESCPOS().
   */
  printESCPOS,

  /**
   * Encode a bill as ESC/POS bytes for 58mm or 80mm thermal paper.
   * Returns Uint8Array; pass to printESCPOS() or Electron IPC.
   */
  encodeBillESCPOS,
};
