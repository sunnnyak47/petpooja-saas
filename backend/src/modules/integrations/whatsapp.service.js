/**
 * @fileoverview WhatsApp Web integration via Baileys.
 * Allows sending PO PDFs directly from a connected WhatsApp number — no Meta Business API needed.
 * Auth credentials are persisted in /backend/wa-auth/ so reconnection is automatic.
 * @module modules/integrations/whatsapp.service
 */

const path = require('path');
const fs   = require('fs');
const EventEmitter = require('events');
const logger = require('../../config/logger');

// ─── Auth directory ──────────────────────────────────────────────────────────
const WA_AUTH_DIR = path.join(__dirname, '../../../../wa-auth');

// ─── Internal state ──────────────────────────────────────────────────────────
let sock         = null;
let currentQR    = null;   // latest QR string from Baileys
let qrBase64     = null;   // base64 PNG of QR
let connStatus   = 'disconnected'; // 'disconnected' | 'qr_pending' | 'connected'
let isConnecting = false;

const emitter = new EventEmitter();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureAuthDir() {
  if (!fs.existsSync(WA_AUTH_DIR)) fs.mkdirSync(WA_AUTH_DIR, { recursive: true });
}

/** Format an E.164-style phone number to a WhatsApp JID. */
function toJid(phone) {
  // Strip everything except digits
  const digits = String(phone).replace(/\D/g, '');
  // Prepend country code 91 if not already present (10-digit Indian numbers)
  const normalized = digits.startsWith('91') ? digits : `91${digits}`;
  return `${normalized}@s.whatsapp.net`;
}

/** Convert QR string to base64 PNG using the qrcode package. */
async function qrToBase64(qrString) {
  try {
    const QRCode = require('qrcode');
    return await QRCode.toDataURL(qrString, { type: 'image/png', width: 300, margin: 2 });
  } catch (err) {
    logger.error('WhatsApp: failed to generate QR base64', { error: err.message });
    return null;
  }
}

// ─── Core connection logic ────────────────────────────────────────────────────

async function connect() {
  if (isConnecting) return;
  isConnecting = true;

  try {
    ensureAuthDir();

    const {
      default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      fetchLatestBaileysVersion,
    } = require('@whiskeysockets/baileys');
    const { Boom } = require('@hapi/boom');

    const { state, saveCreds } = await useMultiFileAuthState(WA_AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: {
        level: 'silent',
        trace: () => {},
        debug: () => {},
        info:  () => {},
        warn:  (msg) => logger.warn('Baileys:', msg),
        error: (msg) => logger.error('Baileys:', msg),
        fatal: (msg) => logger.error('Baileys fatal:', msg),
        child: () => ({ level: 'silent', trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {}, child: () => ({}) }),
      },
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        currentQR  = qr;
        qrBase64   = await qrToBase64(qr);
        connStatus = 'qr_pending';
        logger.info('WhatsApp: QR code ready — scan to authenticate');
        emitter.emit('status', { status: connStatus, qr: qrBase64 });
      }

      if (connection === 'open') {
        connStatus   = 'connected';
        currentQR    = null;
        qrBase64     = null;
        isConnecting = false;
        logger.info('WhatsApp: connected successfully');
        emitter.emit('status', { status: connStatus });
      }

      if (connection === 'close') {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const shouldReconnect = reason !== DisconnectReason.loggedOut;

        connStatus   = 'disconnected';
        isConnecting = false;
        logger.warn('WhatsApp: connection closed', { reason, shouldReconnect });
        emitter.emit('status', { status: connStatus });

        if (shouldReconnect) {
          logger.info('WhatsApp: reconnecting in 3 s…');
          setTimeout(() => connect(), 3000);
        } else {
          // Logged out — remove stored credentials so next connect() starts fresh
          logger.warn('WhatsApp: logged out — clearing auth state');
          try { fs.rmSync(WA_AUTH_DIR, { recursive: true, force: true }); } catch (_) {}
          sock = null;
        }
      }
    });
  } catch (err) {
    isConnecting = false;
    logger.error('WhatsApp: connect() error', { error: err.message });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns current connection status and QR code if pending.
 * @returns {Promise<{status: string, connected: boolean, qr_base64?: string}>}
 */
async function getConnectionStatus() {
  return {
    status:    connStatus,
    connected: connStatus === 'connected',
    ...(qrBase64 ? { qr_base64: qrBase64 } : {}),
  };
}

/**
 * Triggers a connection attempt and returns the current status (+ QR if needed).
 * Safe to call multiple times.
 */
async function initConnect() {
  if (connStatus !== 'connected' && !isConnecting) {
    connect(); // fire and forget — status updates come via events
  }
  // Give it a short moment so a cached QR is returned if already pending
  await new Promise((r) => setTimeout(r, 500));
  return getConnectionStatus();
}

/**
 * Returns the current QR code as a base64 PNG data URL, or null if not in QR state.
 * @returns {string|null}
 */
function getQRCode() {
  return qrBase64;
}

/**
 * Send a PDF document to a WhatsApp number.
 * @param {string} phone    - recipient phone number (any format)
 * @param {Buffer} pdfBuffer - PDF file content
 * @param {string} filename  - filename shown in WhatsApp
 * @param {string} caption   - message caption
 */
async function sendPdfToWhatsApp(phone, pdfBuffer, filename, caption) {
  if (connStatus !== 'connected' || !sock) {
    throw new Error('WhatsApp is not connected. Please scan the QR code first.');
  }

  const jid = toJid(phone);
  logger.info('WhatsApp: sending PDF', { jid, filename });

  await sock.sendMessage(jid, {
    document: pdfBuffer,
    mimetype: 'application/pdf',
    fileName: filename,
    caption:  caption || '',
  });

  logger.info('WhatsApp: PDF sent', { jid, filename });
}

/**
 * Disconnect and log out from WhatsApp Web.
 */
async function disconnect() {
  if (sock) {
    try {
      await sock.logout();
    } catch (_) {
      // ignore errors on logout
    }
    sock       = null;
    connStatus = 'disconnected';
    currentQR  = null;
    qrBase64   = null;
    logger.info('WhatsApp: disconnected');
    emitter.emit('status', { status: connStatus });
  }
}

/** Subscribe to connection status changes. */
function onStatusChange(cb) {
  emitter.on('status', cb);
}

module.exports = {
  connect,
  initConnect,
  getConnectionStatus,
  getQRCode,
  sendPdfToWhatsApp,
  disconnect,
  onStatusChange,
};
