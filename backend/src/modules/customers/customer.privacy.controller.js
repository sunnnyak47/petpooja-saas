/**
 * @fileoverview India DPDP Act 2023 data-rights controller for customers.
 * @module modules/customers/customer.privacy.controller
 */

const privacyService = require('./customer.privacy.service');
const { sendSuccess } = require('../../utils/response');

/**
 * PATCH consent — record or withdraw a customer's marketing consent.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function setConsent(req, res, next) {
  try {
    // Pass the caller so the service can tenant-scope the lookup (prevents
    // cross-tenant consent tampering by UUID).
    const result = await privacyService.setConsent(req.params.id, {
      marketing_consent: req.body.marketing_consent,
      source: req.body.source,
    }, req.user);
    sendSuccess(res, result, 'Consent updated');
  } catch (e) { next(e); }
}

/**
 * GET export — return everything held about the customer (right to access).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function exportData(req, res, next) {
  try {
    // Pass the caller so the service can tenant-scope the lookup (prevents
    // cross-tenant PII export by UUID).
    const result = await privacyService.exportCustomerData(req.params.id, req.user);
    sendSuccess(res, result, 'Customer data exported');
  } catch (e) { next(e); }
}

/**
 * POST erase — anonymise the customer's PII in place (right to erasure).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function eraseCustomer(req, res, next) {
  try {
    // Pass the caller so the service can tenant-scope the lookup (prevents
    // cross-tenant erasure by UUID).
    const result = await privacyService.eraseCustomer(req.params.id, req.user);
    sendSuccess(res, result, 'Customer data erased');
  } catch (e) { next(e); }
}

module.exports = { setConsent, exportData, eraseCustomer };
