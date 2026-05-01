/**
 * @fileoverview WhatsApp Web routes — send PO PDFs directly from a connected WhatsApp number.
 * Uses Baileys (WhatsApp Web) — no Meta Business API approval required.
 *
 * Endpoints:
 *   GET  /api/whatsapp/status      → connection status + QR code if pending
 *   POST /api/whatsapp/connect     → trigger connection / return QR
 *   POST /api/whatsapp/disconnect  → logout
 *   POST /api/whatsapp/send-po     → { po_id, phone } → generate PDF and send via WhatsApp
 *
 * @module modules/integrations/whatsapp.routes
 */

const express  = require('express');
const router   = express.Router();
const { authenticate } = require('../../middleware/auth.middleware');
const { sendSuccess }  = require('../../utils/response');
const logger           = require('../../config/logger');

const waService  = require('./whatsapp.service');
const { getPurchaseOrder } = require('../inventory/procurement.service');
const { generatePOPdfBuffer } = require('../inventory/po-pdf.service');

// ─── GET /api/whatsapp/status ─────────────────────────────────────────────────
router.get('/status', authenticate, async (req, res, next) => {
  try {
    const status = await waService.getConnectionStatus();
    sendSuccess(res, status, 'WhatsApp connection status');
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/whatsapp/connect ───────────────────────────────────────────────
router.post('/connect', authenticate, async (req, res, next) => {
  try {
    const status = await waService.initConnect();
    const message = status.connected
      ? 'WhatsApp already connected'
      : status.status === 'qr_pending'
        ? 'Scan the QR code to connect WhatsApp'
        : 'WhatsApp connection initiated — retry in a moment for QR code';
    sendSuccess(res, status, message);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/whatsapp/disconnect ────────────────────────────────────────────
router.post('/disconnect', authenticate, async (req, res, next) => {
  try {
    await waService.disconnect();
    sendSuccess(res, { status: 'disconnected' }, 'WhatsApp disconnected');
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/whatsapp/send-po ───────────────────────────────────────────────
/**
 * Body: { po_id: string, phone: string }
 * Fetches the PO from DB, generates a PDF buffer in memory, and sends it via WhatsApp.
 */
router.post('/send-po', authenticate, async (req, res, next) => {
  try {
    const { po_id, phone } = req.body;

    if (!po_id) {
      return res.status(400).json({ success: false, message: 'po_id is required' });
    }
    if (!phone) {
      return res.status(400).json({ success: false, message: 'phone is required' });
    }

    // 1. Check WhatsApp is connected
    const { connected } = await waService.getConnectionStatus();
    if (!connected) {
      return res.status(503).json({
        success: false,
        message: 'WhatsApp is not connected. Call POST /api/whatsapp/connect first and scan the QR code.',
      });
    }

    // 2. Fetch PO from database
    const outletId = req.user?.outlet_id;
    const po = await getPurchaseOrder(po_id, outletId);
    if (!po) {
      return res.status(404).json({ success: false, message: 'Purchase order not found' });
    }

    // 3. Generate PDF as in-memory buffer
    const pdfBuffer = await generatePOPdfBuffer(po);

    // 4. Format phone number and send
    const digits = String(phone).replace(/\D/g, '');
    const normalizedPhone = digits.startsWith('91') ? digits : `91${digits}`;
    const filename = `PO_${(po.po_number || po_id).replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
    const caption  = `Purchase Order ${po.po_number || po_id}\nSupplier: ${po.supplier?.name || ''}\nTotal: ₹${po.grand_total || po.total_amount || 0}`;

    await waService.sendPdfToWhatsApp(normalizedPhone, pdfBuffer, filename, caption);

    logger.info('WhatsApp PO sent', { po_id, phone: normalizedPhone });

    sendSuccess(res, {
      po_id,
      po_number: po.po_number,
      sent_to: normalizedPhone,
      filename,
    }, `Purchase order sent to WhatsApp: ${normalizedPhone}`);
  } catch (err) {
    logger.error('WhatsApp send-po error', { error: err.message });
    next(err);
  }
});

module.exports = router;
