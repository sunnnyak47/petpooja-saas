/**
 * @fileoverview Usage-based SaaS billing — invoice collection via Razorpay.
 *
 * Creates a Razorpay Payment Link for an issued {@link SubscriptionInvoice} and
 * reconciles payment (via the success callback or the billing webhook), marking
 * the invoice paid and advancing the subscription. Falls back to a deterministic
 * mock when Razorpay keys are absent so the pilot flow works end-to-end without
 * live credentials. No secrets are ever stored in code — keys come from env.
 *
 * @module modules/headoffice/billing.collection.service
 */

const crypto = require('crypto');
const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const { BadRequestError, NotFoundError } = require('../../utils/errors');

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';

const NEXT_BILLING_DAYS = 30;

/**
 * Creates (or returns the existing) Razorpay Payment Link for an invoice.
 * @param {string} invoiceId
 * @returns {Promise<{invoice:object, payment_link_url:string, razorpay_order_id:string}>}
 */
async function createPaymentLink(invoiceId) {
  const prisma = getDbClient();
  const invoice = await prisma.subscriptionInvoice.findFirst({
    where: { id: invoiceId, is_deleted: false },
    include: { head_office: true },
  });
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.status === 'paid') throw new BadRequestError('Invoice is already paid');
  if (!['issued', 'overdue', 'draft'].includes(invoice.status)) {
    throw new BadRequestError(`Cannot collect a ${invoice.status} invoice`);
  }
  // Reuse a previously created link.
  if (invoice.payment_link_url && invoice.razorpay_order_id) {
    return { invoice, payment_link_url: invoice.payment_link_url, razorpay_order_id: invoice.razorpay_order_id };
  }

  const amountMinor = Math.round(Number(invoice.total) * 100);
  let linkId;
  let linkUrl;

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    logger.warn('Razorpay not configured — issuing mock payment link', { invoiceId });
    linkId = `plink_mock_${invoice.invoice_number}`;
    linkUrl = `https://rzp.io/i/mock/${invoice.invoice_number}`;
  } else {
    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount: amountMinor,
        currency: invoice.currency || 'INR',
        accept_partial: false,
        description: `MS-RM SaaS invoice ${invoice.invoice_number} (${invoice.billing_period})`,
        customer: {
          name: invoice.head_office?.name || 'Customer',
          email: invoice.head_office?.contact_email || undefined,
          contact: invoice.head_office?.contact_phone || undefined,
        },
        notify: { sms: false, email: false },
        reminder_enable: true,
        notes: { invoice_id: invoice.id, invoice_number: invoice.invoice_number, source: 'msrm_saas_billing' },
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new BadRequestError(`Razorpay error: ${err.error?.description || 'payment link failed'}`);
    }
    const data = await response.json();
    linkId = data.id;
    linkUrl = data.short_url;
  }

  const updated = await prisma.subscriptionInvoice.update({
    where: { id: invoice.id },
    data: { razorpay_order_id: linkId, payment_link_url: linkUrl },
  });
  logger.info('Invoice payment link created', { invoiceId, linkId });
  return { invoice: updated, payment_link_url: linkUrl, razorpay_order_id: linkId };
}

/**
 * Marks an invoice paid and advances its subscription. Idempotent.
 * @param {string} invoiceId
 * @param {object} [paymentRef] - { razorpay_payment_id }
 * @returns {Promise<object>} The updated invoice.
 */
async function markInvoicePaid(invoiceId, paymentRef = {}) {
  const prisma = getDbClient();
  const invoice = await prisma.subscriptionInvoice.findFirst({ where: { id: invoiceId } });
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.status === 'paid') return invoice; // idempotent

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const updated = await tx.subscriptionInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'paid',
        paid_at: now,
        razorpay_payment_id: paymentRef.razorpay_payment_id || invoice.razorpay_payment_id || null,
      },
    });

    if (invoice.subscription_id) {
      const nextBilling = new Date(now.getTime() + NEXT_BILLING_DAYS * 24 * 60 * 60 * 1000);
      await tx.subscription.update({
        where: { id: invoice.subscription_id },
        data: {
          status: 'active',
          last_payment_at: now,
          next_billing_at: nextBilling,
          grace_until: null,
          suspended_at: null,
        },
      });
    }
    logger.info('Invoice marked paid', { invoiceId, subscriptionId: invoice.subscription_id });
    return updated;
  });
}

/**
 * Verifies a billing webhook signature (Razorpay HMAC-SHA256 over the raw body).
 * @param {string} signature
 * @param {string|Buffer} rawBody
 * @returns {boolean}
 */
function verifyWebhookSignature(signature, rawBody) {
  if (!RAZORPAY_WEBHOOK_SECRET) return process.env.NODE_ENV !== 'production';
  const expected = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || ''));
  } catch {
    return false;
  }
}

/**
 * Acts on a verified billing webhook event. Resolves the invoice from the
 * payment notes / link id and marks it paid.
 * @param {object} event - Parsed Razorpay webhook payload.
 * @returns {Promise<{handled:boolean, invoiceId?:string}>}
 */
async function handleWebhookEvent(event) {
  const prisma = getDbClient();
  const type = event?.event;
  if (!['payment_link.paid', 'payment.captured', 'order.paid'].includes(type)) {
    return { handled: false };
  }

  const entity =
    event.payload?.payment_link?.entity ||
    event.payload?.payment?.entity ||
    event.payload?.order?.entity ||
    {};
  const notes = entity.notes || {};
  const paymentId = event.payload?.payment?.entity?.id || entity.id || null;

  let invoice = null;
  if (notes.invoice_id) {
    invoice = await prisma.subscriptionInvoice.findFirst({ where: { id: notes.invoice_id } });
  }
  if (!invoice && entity.id) {
    invoice = await prisma.subscriptionInvoice.findFirst({ where: { razorpay_order_id: entity.id } });
  }
  if (!invoice) {
    logger.warn('Billing webhook: no matching invoice', { type });
    return { handled: false };
  }
  await markInvoicePaid(invoice.id, { razorpay_payment_id: paymentId });
  return { handled: true, invoiceId: invoice.id };
}

module.exports = {
  createPaymentLink,
  markInvoicePaid,
  verifyWebhookSignature,
  handleWebhookEvent,
};
