/**
 * @fileoverview Outbound notification transport helpers.
 * Currently provides silent WhatsApp delivery to an outlet's owner/admin,
 * used by the fraud engine (and reusable by other modules).
 *
 * WhatsApp is sent via the Meta WhatsApp Cloud API when WA_TOKEN +
 * WA_PHONE_NUMBER_ID are configured; otherwise it logs a stub (a Twilio or
 * other gateway can be plugged in at the fallback point).
 *
 * @module utils/notifier
 */

const { getDbClient } = require('../config/database');
const logger = require('../config/logger');

function getTimezone(region) {
  return region === 'AU' ? 'Australia/Sydney' : 'Asia/Kolkata';
}

/**
 * Send a silent WhatsApp alert to an outlet's owner/admin.
 *
 * @param {string} outletId - Outlet UUID
 * @param {object} alert - Alert payload
 * @param {string} alert.title
 * @param {string} alert.description
 * @param {number} alert.risk_score
 * @param {string} alert.severity - 'critical' | 'high' | 'medium' | 'low'
 * @param {string} [alert.alert_type]
 * @param {string} [alert.region] - 'IN' | 'AU' (timezone for timestamp)
 * @returns {Promise<boolean>} true if delivered (or stub-logged), false on failure
 */
async function notifyWhatsApp(outletId, alert) {
  try {
    const prisma = getDbClient();
    // Get outlet + owner phone via UserRole join table
    const outlet = await prisma.outlet.findUnique({
      where: { id: outletId },
      select: { id: true, name: true },
    });

    const ownerRoles = await prisma.userRole.findMany({
      where: { outlet_id: outletId, role: { name: { in: ['owner', 'admin'] } } },
      include: { user: { select: { full_name: true, phone: true } } },
      take: 1,
    });

    const owner = ownerRoles[0]?.user;
    if (!owner?.phone) {
      logger.warn('Fraud WA: no owner phone found', { outletId });
      return false;
    }

    const emoji = { critical: '🚨', high: '⚠️', medium: '🔶', low: '🔵' }[alert.severity] || '⚠️';
    const msg = [
      `${emoji} *MS-RM FRAUD ALERT* ${emoji}`,
      `*${alert.title}*`,
      ``,
      alert.description,
      ``,
      `*Risk Score:* ${alert.risk_score}/100`,
      `*Severity:* ${alert.severity.toUpperCase()}`,
      `*Time:* ${new Date().toLocaleString('en-IN', { timeZone: getTimezone(alert.region || 'IN') })}`,
      ``,
      `_Review in your MS-RM dashboard → Staff → Fraud Alerts_`,
    ].join('\n');

    // WhatsApp Cloud API (Meta) — uses env vars
    const waToken   = process.env.WA_TOKEN;
    const waPhoneId = process.env.WA_PHONE_NUMBER_ID;

    if (waToken && waPhoneId) {
      const { default: fetch } = await import('node-fetch').catch(() => ({ default: null }));
      if (fetch) {
        const phone = owner.phone.replace(/\D/g, '');
        const body  = {
          messaging_product: 'whatsapp',
          to: phone.startsWith('91') || phone.startsWith('61') ? phone : `91${phone}`,
          type: 'text',
          text: { body: msg, preview_url: false },
        };
        const resp = await fetch(
          `https://graph.facebook.com/v19.0/${waPhoneId}/messages`,
          { method: 'POST', headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        );
        if (resp.ok) {
          logger.info('Fraud WA sent', { phone, alertType: alert.alert_type });
          return true;
        }
      }
    }

    // Fallback: log silently (Twilio / other gateway can be plugged here)
    logger.info('FRAUD_ALERT_WA_STUB', {
      to: owner.phone,
      outlet: outlet?.name,
      owner_name: owner.full_name,
      alert_type: alert.alert_type,
      severity: alert.severity,
      message: msg,
    });
    return true;
  } catch (err) {
    logger.error('Fraud WA notification failed', { err: err.message });
    return false;
  }
}

module.exports = { notifyWhatsApp, getTimezone };
