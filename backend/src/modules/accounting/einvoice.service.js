/**
 * @fileoverview India GSTN e-invoicing (IRN) service for B2B sales invoices.
 *
 * GST e-invoicing applies to B2B supplies (buyer must have a registered GSTIN).
 * For each eligible CustomerInvoice we build the canonical IRP JSON (schema
 * "INV-01", version "1.1"), submit it to a GST Suvidha Provider (GSP) / Invoice
 * Registration Portal (IRP), and persist the returned IRN, Acknowledgement
 * number/date and the signed QR code back onto the invoice.
 *
 * GSP credentials differ from vendor to vendor, so the HTTP layer is kept
 * intentionally generic and is driven entirely by env vars (see gspHeaders()
 * and the GSP_* block in generateIrn). When no GSP is configured the service
 * falls back to a clearly-flagged MOCK result so the end-to-end flow can be
 * exercised without live credentials.
 *
 * Prisma Decimals arrive as strings/Decimal objects, so amounts are always
 * wrapped with Number() and rounded to 2dp before they enter the payload.
 *
 * @module modules/accounting/einvoice.service
 */

const crypto = require('crypto');
const prisma = require('../../config/database').getDbClient();
const logger = require('../../config/logger');
const { NotFoundError, BadRequestError, AppError } = require('../../utils/errors');

// Default GST rate (%) used when an invoice line carries no explicit rate.
// CustomerInvoiceLine has no per-line gst_rate column today, so we derive an
// effective rate from the invoice header (gst / subtotal) and fall back here.
const DEFAULT_GST_RATE = 18;

// Generic placeholder HSN/SAC for restaurant supply when a line omits one.
// 996331 = "Services provided by restaurants, cafes and similar eating
// facilities" — a sane default so the IRP payload is never missing HsnCd.
const DEFAULT_HSN = '996331';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Format a JS Date (or date-ish value) as dd/mm/yyyy, as required by the IRP. */
function formatDateDDMMYYYY(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    // Fall back to "now" rather than emitting an invalid date string.
    return formatDateDDMMYYYY(new Date());
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** First two characters of a GSTIN are the numeric State code (Stcd). */
function stateCodeFromGstin(gstin) {
  if (!gstin || typeof gstin !== 'string') return null;
  const code = gstin.trim().slice(0, 2);
  return code.length === 2 ? code : null;
}

/**
 * Build the GSP/IRP auth headers from env. GSPs differ widely, so we support
 * the two common shapes and send whatever is configured:
 *   - A pre-minted bearer token (GSP_AUTH_TOKEN), and/or
 *   - Username/password/client credential headers.
 * Header names below are the de-facto names used by most Indian GSPs; adjust to
 * your provider's spec if it differs.
 */
function gspHeaders() {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };

  if (process.env.GSP_AUTH_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GSP_AUTH_TOKEN}`;
  }
  if (process.env.GSP_USERNAME) headers.username = process.env.GSP_USERNAME;
  if (process.env.GSP_PASSWORD) headers.password = process.env.GSP_PASSWORD;
  if (process.env.GSP_CLIENT_ID) headers.client_id = process.env.GSP_CLIENT_ID;
  if (process.env.GSP_CLIENT_SECRET) headers.client_secret = process.env.GSP_CLIENT_SECRET;
  // Optional GSTIN of the requesting taxpayer; some GSPs require it as a header.
  if (process.env.GSP_GSTIN) headers.gstin = process.env.GSP_GSTIN;

  return headers;
}

/** True when enough GSP env is present to attempt a live call. */
function isGspConfigured() {
  return Boolean(
    process.env.GSP_BASE_URL &&
      (process.env.GSP_AUTH_TOKEN ||
        (process.env.GSP_USERNAME && process.env.GSP_PASSWORD) ||
        (process.env.GSP_CLIENT_ID && process.env.GSP_CLIENT_SECRET))
  );
}

/** Short deterministic hash used to make the MOCK IRN reproducible per invoice. */
function mockHash(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, 64).toUpperCase();
}

// ---------------------------------------------------------------------------
// Data load
// ---------------------------------------------------------------------------

async function loadInvoice(outletId, invoiceId) {
  return prisma.customerInvoice.findFirst({
    where: { id: invoiceId, outlet_id: outletId, is_deleted: false },
    include: { lines: true },
  });
}

// ---------------------------------------------------------------------------
// Payload builder (IRP schema INV-01, version 1.1)
// ---------------------------------------------------------------------------

/**
 * Construct the canonical GST e-invoice JSON for the IRP.
 *
 * Intra-state vs inter-state is decided by comparing the seller's state code
 * (first 2 chars of the seller GSTIN) with the Place of Supply. Same → CGST +
 * SGST; different → IGST. We split the invoice-level GST proportionally across
 * lines because CustomerInvoiceLine carries no per-line tax breakup.
 *
 * @param {object} invoice - CustomerInvoice with `lines`.
 * @param {object} outlet  - Owning Outlet (seller).
 * @returns {object} IRP-ready payload.
 */
function buildIrpPayload(invoice, outlet) {
  const inv = invoice || {};
  const out = outlet || {};
  const lines = Array.isArray(inv.lines) ? inv.lines : [];

  const sellerGstin = out.gstin || null;
  const sellerStcd = stateCodeFromGstin(sellerGstin);

  const buyerGstin = inv.buyer_gstin || null;
  // Place of supply governs IGST vs CGST/SGST. Prefer the explicit
  // place_of_supply, else the 2-char code embedded in the buyer GSTIN.
  const pos =
    inv.place_of_supply || stateCodeFromGstin(buyerGstin) || inv.buyer_state || sellerStcd || null;

  const isInterState = Boolean(sellerStcd && pos && String(pos) !== String(sellerStcd));

  // Effective header GST rate (%) — used as a per-line fallback when the line
  // has no rate of its own. subtotal 0 ⇒ no rate.
  const subtotal = round2(inv.subtotal);
  const headerGst = round2(inv.gst);
  const headerRate =
    subtotal > 0 ? round2((headerGst / subtotal) * 100) : 0;

  // Accumulators for ValDtls.
  let assTotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;

  const itemList = lines.map((ln, idx) => {
    const qty = num(ln.quantity, 1);
    const unitPrice = round2(ln.unit_price);
    // Assessable value for the line. Prefer the stored amount; fall back to
    // qty * unitPrice when amount is missing.
    const assAmt = round2(
      ln.amount != null && Number.isFinite(Number(ln.amount))
        ? ln.amount
        : qty * unitPrice
    );

    // Per-line GST rate: use line.gst_rate if a future column exists, else the
    // derived header rate, else the module default.
    const gstRt = round2(
      ln.gst_rate != null && Number.isFinite(Number(ln.gst_rate))
        ? ln.gst_rate
        : headerRate || DEFAULT_GST_RATE
    );

    const lineGst = round2((assAmt * gstRt) / 100);

    let igstAmt = 0;
    let cgstAmt = 0;
    let sgstAmt = 0;
    if (isInterState) {
      igstAmt = lineGst;
    } else {
      cgstAmt = round2(lineGst / 2);
      sgstAmt = round2(lineGst - cgstAmt); // keep halves summing exactly to lineGst
    }

    assTotal = round2(assTotal + assAmt);
    igstTotal = round2(igstTotal + igstAmt);
    cgstTotal = round2(cgstTotal + cgstAmt);
    sgstTotal = round2(sgstTotal + sgstAmt);

    const totItemVal = round2(assAmt + igstAmt + cgstAmt + sgstAmt);

    return {
      SlNo: String(idx + 1),
      PrdDesc: ln.description || `Item ${idx + 1}`,
      IsServc: 'N',
      HsnCd: ln.hsn_code || ln.hsn || DEFAULT_HSN,
      Qty: qty,
      Unit: 'NOS',
      UnitPrice: unitPrice,
      TotAmt: assAmt,
      AssAmt: assAmt,
      GstRt: gstRt,
      IgstAmt: igstAmt,
      CgstAmt: cgstAmt,
      SgstAmt: sgstAmt,
      TotItemVal: totItemVal,
    };
  });

  const totInvVal = round2(assTotal + igstTotal + cgstTotal + sgstTotal);

  return {
    Version: '1.1',
    TranDtls: {
      TaxSch: 'GST',
      SupTyp: 'B2B',
      RegRev: 'N',
    },
    DocDtls: {
      Typ: 'INV',
      No: inv.invoice_number || '',
      Dt: formatDateDDMMYYYY(inv.issue_date),
    },
    SellerDtls: {
      Gstin: sellerGstin,
      LglNm: out.name || '',
      Addr1: out.address_line1 || '',
      Addr2: out.address_line2 || undefined,
      Loc: out.city || out.state || '',
      Pin: out.pincode != null ? Number(out.pincode) : undefined,
      Stcd: sellerStcd,
    },
    BuyerDtls: {
      Gstin: buyerGstin,
      LglNm: inv.customer_name || '',
      Pos: pos != null ? String(pos) : undefined,
      Addr1: inv.buyer_address || inv.buyer_state || '',
      Loc: inv.buyer_state || '',
      Stcd: stateCodeFromGstin(buyerGstin) || (pos != null ? String(pos) : undefined),
    },
    ItemList: itemList,
    ValDtls: {
      AssVal: assTotal,
      CgstVal: cgstTotal,
      SgstVal: sgstTotal,
      IgstVal: igstTotal,
      TotInvVal: totInvVal,
    },
  };
}

// ---------------------------------------------------------------------------
// IRP submission
// ---------------------------------------------------------------------------

/**
 * Submit the payload to the configured GSP/IRP and normalise the response.
 * Returns { irn, ack_no, ack_date, qr, mock }. Throws AppError on GSP failure.
 *
 * NOTE: the exact endpoint path and response envelope vary per GSP. We POST to
 * `${GSP_BASE_URL}${GSP_GENERATE_PATH || '/eivital/v1.04/invoice'}` and read the
 * IRN/Ack fields from common locations (`data` envelope or top level). Adjust
 * GSP_GENERATE_PATH / parsing to your provider if needed.
 */
async function submitToIrp(payload, invoice) {
  if (!isGspConfigured()) {
    // ---- MOCK MODE -------------------------------------------------------
    // No GSP credentials present: return a clearly-flagged stub so the whole
    // generate → persist → status flow is testable without going live.
    logger.warn('[einvoice] GSP not configured — returning MOCK IRN', {
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
    });
    const seed = `${invoice.invoice_number || invoice.id}|${invoice.buyer_gstin || ''}`;
    return {
      mock: true,
      irn: 'MOCK-' + mockHash(seed),
      ack_no: 'MOCKACK' + Date.now(),
      ack_date: new Date(),
      qr: 'MOCK_QR',
    };
  }

  // ---- LIVE MODE ---------------------------------------------------------
  const base = process.env.GSP_BASE_URL.replace(/\/+$/, '');
  const path = process.env.GSP_GENERATE_PATH || '/eivital/v1.04/invoice';
  const url = `${base}${path.startsWith('/') ? '' : '/'}${path}`;

  let res;
  let body;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: gspHeaders(),
      body: JSON.stringify(payload),
    });
    body = await res.json().catch(() => ({}));
  } catch (err) {
    throw new AppError(`GSP request failed: ${err.message}`, 502);
  }

  // Most GSPs wrap the IRP result in a `data` object on success and surface
  // errors via a top-level message / status flag. Be liberal in what we read.
  const data = body && typeof body === 'object' && body.data ? body.data : body || {};
  const irn = data.Irn || data.irn || null;

  if (!res.ok || !irn) {
    const message =
      (data && (data.ErrorMessage || data.message || data.error)) ||
      (body && (body.message || body.error)) ||
      `IRP returned HTTP ${res.status} without an IRN`;
    throw new AppError(`e-invoice generation failed: ${message}`, 502);
  }

  return {
    mock: false,
    irn,
    ack_no: data.AckNo || data.ackNo || null,
    ack_date: data.AckDt ? new Date(data.AckDt) : new Date(),
    qr: data.SignedQRCode || data.signedQRCode || data.QRCode || null,
  };
}

// ---------------------------------------------------------------------------
// Public: generate IRN
// ---------------------------------------------------------------------------

/**
 * Generate (and persist) the IRN for a B2B customer invoice.
 * @param {string} outletId
 * @param {string} invoiceId
 * @returns {Promise<{invoice_id,irn,ack_no,ack_date,qr,mock}>}
 */
async function generateIrn(outletId, invoiceId) {
  const invoice = await loadInvoice(outletId, invoiceId);
  if (!invoice) throw new NotFoundError('Invoice not found');

  // Guard: e-invoicing is B2B only — a registered buyer GSTIN is mandatory.
  if (!invoice.buyer_gstin) {
    throw new BadRequestError(
      'e-invoicing applies to B2B supplies only — buyer_gstin is required'
    );
  }
  // Guard: do not re-generate an IRN that already exists.
  if (invoice.einvoice_irn) {
    throw new BadRequestError('e-invoice already generated for this invoice');
  }

  const outlet = await prisma.outlet.findUnique({ where: { id: outletId } });
  if (!outlet) throw new NotFoundError('Outlet not found');
  if (!outlet.gstin) {
    throw new BadRequestError('Seller (outlet) GSTIN is not configured');
  }

  const payload = buildIrpPayload(invoice, outlet);

  let result;
  try {
    result = await submitToIrp(payload, invoice);
  } catch (err) {
    // Mark the attempt as failed so the UI can surface it and allow a retry.
    await prisma.customerInvoice
      .update({ where: { id: invoice.id }, data: { einvoice_status: 'failed' } })
      .catch((e) =>
        logger.error('[einvoice] failed to mark invoice failed', { error: e.message })
      );
    logger.error('[einvoice] IRN generation failed', {
      invoice_id: invoice.id,
      error: err.message,
    });
    throw err;
  }

  await prisma.customerInvoice.update({
    where: { id: invoice.id },
    data: {
      einvoice_irn: result.irn,
      einvoice_ack_no: result.ack_no,
      einvoice_ack_date: result.ack_date ? new Date(result.ack_date) : null,
      einvoice_qr: result.qr,
      einvoice_status: 'generated',
    },
  });

  logger.info('[einvoice] IRN generated', {
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    mock: result.mock,
  });

  return {
    invoice_id: invoice.id,
    irn: result.irn,
    ack_no: result.ack_no,
    ack_date: result.ack_date,
    qr: result.qr,
    mock: result.mock,
  };
}

// ---------------------------------------------------------------------------
// Public: status
// ---------------------------------------------------------------------------

/**
 * Return the stored e-invoice fields for an invoice, or {status:'pending'} when
 * no IRN has been generated yet.
 */
async function getEinvoiceStatus(outletId, invoiceId) {
  const invoice = await loadInvoice(outletId, invoiceId);
  if (!invoice) throw new NotFoundError('Invoice not found');

  if (!invoice.einvoice_irn && !invoice.einvoice_status) {
    return { invoice_id: invoice.id, status: 'pending' };
  }

  return {
    invoice_id: invoice.id,
    status: invoice.einvoice_status || 'pending',
    irn: invoice.einvoice_irn || null,
    ack_no: invoice.einvoice_ack_no || null,
    ack_date: invoice.einvoice_ack_date || null,
    qr: invoice.einvoice_qr || null,
  };
}

// ---------------------------------------------------------------------------
// Public: cancel IRN
// ---------------------------------------------------------------------------

/**
 * Cancel a previously generated IRN. Calls the GSP cancel endpoint when
 * configured; otherwise simply flips local status (mock). The local invoice is
 * always set to einvoice_status='cancelled'.
 *
 * Per IRP rules an IRN can only be cancelled within 24h of generation, so a
 * live cancel may be rejected by the GSP — we surface that message but still
 * record the local intent.
 */
async function cancelIrn(outletId, invoiceId, reason) {
  const invoice = await loadInvoice(outletId, invoiceId);
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (!invoice.einvoice_irn) {
    throw new BadRequestError('No e-invoice IRN to cancel for this invoice');
  }

  let mock = true;
  if (isGspConfigured()) {
    mock = false;
    const base = process.env.GSP_BASE_URL.replace(/\/+$/, '');
    const path = process.env.GSP_CANCEL_PATH || '/eivital/v1.04/invoice/cancel';
    const url = `${base}${path.startsWith('/') ? '' : '/'}${path}`;
    const cancelPayload = {
      Irn: invoice.einvoice_irn,
      // 1 = Duplicate, 2 = Data entry mistake, etc. We default to 2.
      CnlRsn: '2',
      CnlRem: reason || 'Cancelled by merchant',
    };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: gspHeaders(),
        body: JSON.stringify(cancelPayload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const data = body && body.data ? body.data : body || {};
        const message =
          (data && (data.ErrorMessage || data.message)) ||
          (body && (body.message || body.error)) ||
          `IRP returned HTTP ${res.status}`;
        throw new AppError(`e-invoice cancellation failed: ${message}`, 502);
      }
    } catch (err) {
      logger.error('[einvoice] IRN cancel failed at GSP', {
        invoice_id: invoice.id,
        error: err.message,
      });
      throw err instanceof AppError
        ? err
        : new AppError(`e-invoice cancellation failed: ${err.message}`, 502);
    }
  } else {
    logger.warn('[einvoice] GSP not configured — cancelling locally (MOCK)', {
      invoice_id: invoice.id,
    });
  }

  await prisma.customerInvoice.update({
    where: { id: invoice.id },
    data: { einvoice_status: 'cancelled' },
  });

  return { invoice_id: invoice.id, status: 'cancelled', mock };
}

module.exports = {
  buildIrpPayload,
  generateIrn,
  getEinvoiceStatus,
  cancelIrn,
  // exported for testing / reuse
  gspHeaders,
  isGspConfigured,
};
