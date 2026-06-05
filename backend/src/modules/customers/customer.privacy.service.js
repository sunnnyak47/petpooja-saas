/**
 * @fileoverview India DPDP Act 2023 data-rights service for customers.
 * Implements consent management, the right to access / data portability
 * (export), and the right to erasure (anonymisation-in-place so that
 * statutorily-retained transaction records survive).
 * @module modules/customers/customer.privacy.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const { NotFoundError } = require('../../utils/errors');

/** Max number of order rows included in a data export (most recent first). */
const EXPORT_ORDER_CAP = 500;

/**
 * Builds a unique, non-PII phone placeholder that fits the VarChar(15) /
 * UNIQUE constraints on `customers.phone`.
 *
 * The customer id is a UUID (e.g. `3f0a...-...-b2c9`). We strip the dashes,
 * take the last 9 hex chars and prefix `ERASED` → 6 + 9 = 15 chars exactly.
 * Because UUIDs are unique, the derived suffix is effectively unique too, so
 * the placeholder satisfies the UNIQUE constraint without colliding with real
 * (digit-only) phone numbers.
 * @param {string} customerId - The customer UUID.
 * @returns {string} A placeholder of length <= 15.
 */
function erasedPhonePlaceholder(customerId) {
  const compact = String(customerId).replace(/-/g, '');
  const suffix = compact.slice(-9);
  return `ERASED${suffix}`.slice(0, 15);
}

/**
 * Record or withdraw a customer's marketing consent (DPDP "consent" basis).
 * Sets `consent_at` to now() when consent is granted and clears it when
 * withdrawn. `consent_source` defaults to 'pos'.
 * @param {string} customerId - The customer UUID.
 * @param {{ marketing_consent: boolean, source?: string }} params - Consent payload.
 * @returns {Promise<{ marketing_consent: boolean, consent_at: (Date|null), consent_source: string }>}
 * @throws {NotFoundError} If the customer does not exist or is deleted.
 */
async function setConsent(customerId, { marketing_consent, source } = {}) {
  const prisma = getDbClient();
  const existing = await prisma.customer.findFirst({
    where: { id: customerId, is_deleted: false },
  });
  if (!existing) throw new NotFoundError('Customer not found');

  const consent = !!marketing_consent;
  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: {
      marketing_consent: consent,
      consent_at: consent ? new Date() : null,
      consent_source: source || 'pos',
    },
    select: { marketing_consent: true, consent_at: true, consent_source: true },
  });

  logger.info('Customer consent updated', { id: customerId, marketing_consent: consent, source: updated.consent_source });
  return updated;
}

/**
 * Export everything held about a customer (DPDP "right to access" /
 * data portability). Returns the full customer row (all PII), their
 * addresses, loyalty balance + transactions, and a lightweight summary of
 * their most recent orders (capped at {@link EXPORT_ORDER_CAP}).
 * @param {string} customerId - The customer UUID.
 * @returns {Promise<object>} A JSON-serialisable data bundle.
 * @throws {NotFoundError} If the customer does not exist or is deleted.
 */
async function exportCustomerData(customerId) {
  const prisma = getDbClient();

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, is_deleted: false },
    include: {
      addresses: { where: { is_deleted: false } },
      loyalty_points: true,
      loyalty_transactions: {
        orderBy: { created_at: 'desc' },
        include: {
          outlet: { select: { name: true } },
          order: { select: { order_number: true, grand_total: true } },
        },
      },
    },
  });
  if (!customer) throw new NotFoundError('Customer not found');

  // Orders are summarised separately so we can cap the volume and avoid
  // pulling full nested line-item trees into the export.
  const orders = await prisma.order.findMany({
    where: { customer_id: customerId, is_deleted: false },
    orderBy: { created_at: 'desc' },
    take: EXPORT_ORDER_CAP,
    select: { id: true, order_number: true, created_at: true, grand_total: true },
  });

  const { addresses, loyalty_points, loyalty_transactions, ...customerRow } = customer;

  return {
    generated_at: new Date(),
    customer: customerRow,
    addresses,
    loyalty: {
      points: loyalty_points,
      transactions: loyalty_transactions,
    },
    orders: {
      count: orders.length,
      capped_at: EXPORT_ORDER_CAP,
      items: orders,
    },
  };
}

/**
 * Erase a customer's identity (DPDP "right to erasure"), done in a way that
 * is compatible with tax-law retention of transaction records: we do NOT
 * hard-delete. Instead we anonymise the PII in place and leave the order rows
 * (which reference customer_id) untouched — scrubbing identity, not financial
 * history.
 *
 * Fields scrubbed: full_name → '[erased]', email/date_of_birth/anniversary/
 * gender/allergens/notes → null, marketing_consent → false, consent_at → null,
 * phone → a unique non-PII placeholder, anonymised_at → now(), is_deleted → true.
 * @param {string} customerId - The customer UUID.
 * @returns {Promise<{ erased: boolean, anonymised_at: Date }>}
 * @throws {NotFoundError} If the customer does not exist or is already erased.
 */
async function eraseCustomer(customerId) {
  const prisma = getDbClient();
  const existing = await prisma.customer.findFirst({
    where: { id: customerId, is_deleted: false },
  });
  if (!existing) throw new NotFoundError('Customer not found');

  const anonymisedAt = new Date();
  await prisma.customer.update({
    where: { id: customerId },
    data: {
      full_name: '[erased]',
      email: null,
      phone: erasedPhonePlaceholder(customerId),
      date_of_birth: null,
      anniversary: null,
      gender: null,
      allergens: null,
      notes: null,
      marketing_consent: false,
      consent_at: null,
      anonymised_at: anonymisedAt,
      is_deleted: true,
    },
  });

  logger.info('Customer erased (anonymised in place)', { id: customerId, anonymised_at: anonymisedAt });
  return { erased: true, anonymised_at: anonymisedAt };
}

module.exports = { setConsent, exportCustomerData, eraseCustomer };
