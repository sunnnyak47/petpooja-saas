/**
 * @fileoverview Mail service — sends transactional emails via SMTP.
 *
 * Transport selection order:
 *   1. SMTP_HOST + SMTP_USER + SMTP_PASS  → real SMTP (Gmail, SES, Mailgun SMTP, etc.)
 *   2. SENDGRID_API_KEY (set, not placeholder) → SendGrid SMTP relay
 *   3. NODE_ENV === 'development'         → Ethereal (free fake inbox with preview URL)
 *   4. Last resort                         → console-only (logged loudly)
 *
 * Add to .env to enable real email:
 *   MAIL_FROM=noreply@yourdomain.com
 *   MAIL_FROM_NAME=MS-RM System
 *
 *   # Option A — Gmail (use an App Password, not your account password)
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=587
 *   SMTP_USER=youraddress@gmail.com
 *   SMTP_PASS=your_16_char_app_password
 *
 *   # Option B — SendGrid
 *   SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxx
 *
 * @module utils/mail.service
 */

const nodemailer = require('nodemailer');
const logger = require('../config/logger');

let cachedTransport = null;
let transportKind   = null; // 'smtp' | 'sendgrid' | 'ethereal' | 'console'

const PLACEHOLDER_SG = ['your_sendgrid_api_key', 'YOUR_SENDGRID_API_KEY', '', undefined];

/**
 * Build / cache the transport for this process.
 * Falls back gracefully if SMTP/SendGrid aren't configured.
 */
async function getTransporter() {
  if (cachedTransport) return cachedTransport;

  const {
    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE,
    SENDGRID_API_KEY,
    NODE_ENV,
  } = process.env;

  // 1. Custom SMTP (preferred)
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    const port = parseInt(SMTP_PORT || '587', 10);
    cachedTransport = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: SMTP_SECURE === 'true' || port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    transportKind = 'smtp';
    logger.info(`📮 Mail transport: SMTP (${SMTP_HOST}:${port})`);
    return cachedTransport;
  }

  // 2. SendGrid via SMTP relay
  if (SENDGRID_API_KEY && !PLACEHOLDER_SG.includes(SENDGRID_API_KEY)) {
    cachedTransport = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: { user: 'apikey', pass: SENDGRID_API_KEY },
    });
    transportKind = 'sendgrid';
    logger.info('📮 Mail transport: SendGrid');
    return cachedTransport;
  }

  // 3. Dev fallback — Ethereal (auto-create test inbox)
  if (NODE_ENV !== 'production') {
    try {
      const testAcc = await nodemailer.createTestAccount();
      cachedTransport = nodemailer.createTransport({
        host: testAcc.smtp.host,
        port: testAcc.smtp.port,
        secure: testAcc.smtp.secure,
        auth: { user: testAcc.user, pass: testAcc.pass },
      });
      transportKind = 'ethereal';
      logger.info(`📮 Mail transport: Ethereal (dev preview)  user=${testAcc.user}`);
      return cachedTransport;
    } catch (e) {
      logger.warn('Ethereal unavailable — falling back to console-only mail', { error: e.message });
    }
  }

  // 4. Last resort — console only
  transportKind = 'console';
  logger.warn('📮 Mail transport: CONSOLE ONLY (no SMTP/SendGrid configured)');
  return null;
}

/**
 * Send an email via the configured transport.
 * @returns {Promise<{messageId?: string, previewUrl?: string, transport: string}>}
 */
async function sendMail({ to, subject, html, text }) {
  const fromEmail = process.env.MAIL_FROM || process.env.SENDGRID_FROM_EMAIL || 'noreply@ms-rm.local';
  const fromName  = process.env.MAIL_FROM_NAME || 'MS-RM System';
  const from = `"${fromName}" <${fromEmail}>`;

  const transporter = await getTransporter();

  // Console-only fallback
  if (!transporter) {
    console.log('\n' + '─'.repeat(72));
    console.log(`📧  EMAIL (console-only — no SMTP configured)`);
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log('─'.repeat(72));
    console.log((text || html || '').slice(0, 1200));
    console.log('─'.repeat(72) + '\n');
    return { transport: 'console', previewUrl: null };
  }

  const info = await transporter.sendMail({ from, to, subject, html, text });
  const previewUrl = transportKind === 'ethereal' ? nodemailer.getTestMessageUrl(info) : null;

  logger.info('📧 Email sent', {
    to, subject, messageId: info.messageId, transport: transportKind, previewUrl,
  });

  if (previewUrl) {
    console.log('\n' + '─'.repeat(72));
    console.log(`📧  EMAIL PREVIEW (Ethereal): ${previewUrl}`);
    console.log(`    To:      ${to}`);
    console.log(`    Subject: ${subject}`);
    console.log('─'.repeat(72) + '\n');
  }

  return { transport: transportKind, messageId: info.messageId, previewUrl };
}

/* ────────────────── Templates ────────────────── */

function passwordResetHtml({ resetLink, platformName }) {
  const safe = (s) => String(s).replace(/[<>"&]/g, (c) => ({ '<':'&lt;','>':'&gt;','"':'&quot;','&':'&amp;' }[c]));
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reset your password</title></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 4px 18px rgba(15,23,42,0.06);">
        <!-- header -->
        <tr><td style="background:linear-gradient(135deg,#1e40af 0%,#2563eb 60%,#3b82f6 100%);padding:32px 36px;color:#fff;">
          <div style="font-size:13px;font-weight:600;letter-spacing:0.08em;opacity:0.7;text-transform:uppercase;">${safe(platformName)}</div>
          <div style="font-size:24px;font-weight:800;letter-spacing:-0.02em;margin-top:6px;">Reset your password</div>
        </td></tr>
        <!-- body -->
        <tr><td style="padding:32px 36px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#334155;">Hi there,</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#334155;">
            We received a request to reset the password on your <strong>${safe(platformName)}</strong> account.
            Click the button below to choose a new one. This link is valid for <strong>1 hour</strong>.
          </p>
          <p style="margin:28px 0;text-align:center;">
            <a href="${safe(resetLink)}" style="display:inline-block;padding:14px 28px;background:#2563eb;color:#fff;text-decoration:none;font-size:15px;font-weight:700;border-radius:10px;box-shadow:0 4px 14px rgba(37,99,235,0.3);">
              Reset password →
            </a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#64748b;">
            Or paste this link into your browser:
          </p>
          <p style="margin:0 0 24px;word-break:break-all;font-size:12.5px;line-height:1.55;color:#2563eb;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">
            ${safe(resetLink)}
          </p>
          <div style="margin-top:24px;padding:14px 16px;background:#fef3c7;border:1px solid #fde68a;border-radius:10px;font-size:13px;color:#92400e;line-height:1.55;">
            <strong>Didn't request this?</strong> You can safely ignore this email — your password will stay the same.
          </div>
        </td></tr>
        <!-- footer -->
        <tr><td style="padding:20px 36px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
          <div style="font-size:11.5px;color:#94a3b8;line-height:1.6;">
            © ${new Date().getFullYear()} ${safe(platformName)} · All rights reserved<br>
            This is an automated message. Replies aren't monitored.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function passwordResetText({ resetLink, platformName }) {
  return `Reset your ${platformName} password\n\n` +
         `We received a request to reset the password on your account.\n` +
         `Open this link to choose a new password (valid for 1 hour):\n\n` +
         `${resetLink}\n\n` +
         `Didn't request this? You can safely ignore this email.\n\n` +
         `— ${platformName}`;
}

/* ────────────────── Public API ────────────────── */

/**
 * Sends the password-reset email.
 * @param {string} email
 * @param {string} resetLink   Full URL including the token
 * @param {string} platformName
 */
async function sendPasswordResetEmail(email, resetLink, platformName = 'MS-RM System') {
  try {
    const result = await sendMail({
      to: email,
      subject: `Reset your ${platformName} password`,
      html:  passwordResetHtml({ resetLink, platformName }),
      text:  passwordResetText({ resetLink, platformName }),
    });
    return result;
  } catch (error) {
    logger.error('Failed to send password reset email', { error: error.message, email });
    throw error;
  }
}

module.exports = {
  sendPasswordResetEmail,
  sendMail, // exported for other transactional emails later
};
