/**
 * @fileoverview e-invoice controller — HTTP handlers for India GSTN IRN
 * generation, status lookup and cancellation on B2B customer invoices.
 * @module modules/accounting/einvoice.controller
 */

const einvoice = require('./einvoice.service');
const { sendSuccess } = require('../../utils/response');
const { BadRequestError } = require('../../utils/errors');

/** Resolve the outlet scope from body, query or the authenticated user. */
function resolveOutletId(req) {
  return (
    (req.body && req.body.outlet_id) ||
    (req.query && req.query.outlet_id) ||
    (req.user && req.user.outlet_id)
  );
}

/* ── POST /generate ─────────────────────────────── */
async function generate(req, res, next) {
  try {
    const outletId = resolveOutletId(req);
    const invoiceId = req.body && req.body.invoice_id;
    if (!invoiceId) throw new BadRequestError('invoice_id is required');

    const result = await einvoice.generateIrn(outletId, invoiceId);
    sendSuccess(res, result, 'e-invoice generated');
  } catch (error) {
    next(error);
  }
}

/* ── GET /:id ───────────────────────────────────── */
async function status(req, res, next) {
  try {
    const outletId = resolveOutletId(req);
    const invoiceId = req.params.id;

    const result = await einvoice.getEinvoiceStatus(outletId, invoiceId);
    sendSuccess(res, result, 'e-invoice status retrieved');
  } catch (error) {
    next(error);
  }
}

/* ── POST /cancel ───────────────────────────────── */
async function cancel(req, res, next) {
  try {
    const outletId = resolveOutletId(req);
    const invoiceId = req.body && req.body.invoice_id;
    if (!invoiceId) throw new BadRequestError('invoice_id is required');
    const reason = req.body && req.body.reason;

    const result = await einvoice.cancelIrn(outletId, invoiceId, reason);
    sendSuccess(res, result, 'e-invoice cancelled');
  } catch (error) {
    next(error);
  }
}

module.exports = { generate, status, cancel };
