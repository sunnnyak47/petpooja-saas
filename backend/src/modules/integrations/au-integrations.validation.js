/**
 * @fileoverview Joi validation schemas for Australian franchise integration endpoints.
 * @module modules/integrations/au-integrations.validation
 */

const Joi = require('joi');

/** POST /au/xero/connect — Legacy direct-credential connect (kept for backward compat) */
const xeroConnectSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  client_id: Joi.string().required(),
  client_secret: Joi.string().required(),
  org_name: Joi.string().max(150),
});

/** POST /au/xero/export-sales — Sync daily sales to Xero */
const xeroExportSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  from_date: Joi.date().required(),
  to_date: Joi.date().required(),
  itemised: Joi.boolean().optional(),
  channel_tracking: Joi.boolean().optional(),
  reconcile: Joi.boolean().optional(),
  per_order: Joi.boolean().optional(),
});

/** POST /au/xero/sync-po — Sync a purchase order to Xero as a Bill */
const xeroSyncPOSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  po_id: Joi.string().uuid().required(),
});

/** GET /au/xero/gst-summary */
const xeroGSTSummarySchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  from_date: Joi.date().required(),
  to_date: Joi.date().required(),
});

/** POST /au/square/connect */
const squareConnectSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  access_token: Joi.string().required(),
  merchant_name: Joi.string().max(150),
  location_id: Joi.string(),
});

/** POST /au/square/process-payment */
const squarePaymentSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  amount: Joi.number().min(1).required(),
  order_id: Joi.string(),
  source_id: Joi.string(),
});

/** POST /au/myob/connect */
const myobConnectSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  api_key: Joi.string().required(),
  company_file_id: Joi.string().required(),
  company_name: Joi.string().max(150),
});

/** POST /au/myob/export */
const myobExportSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  from_date: Joi.date(),
  to_date: Joi.date(),
  type: Joi.string().valid('sales', 'expenses', 'payroll', 'all'),
});

/** POST /au/google-reviews/connect */
const googleReviewsConnectSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  api_key: Joi.string().required(),
  place_id: Joi.string().required(),
  business_name: Joi.string().max(150),
});

/** POST /au/google-reviews/reply */
const googleReviewReplySchema = Joi.object({
  review_id: Joi.string().required(),
  reply_text: Joi.string().required().max(1000),
});

/** POST /au/pronto/connect */
const prontoConnectSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  api_endpoint: Joi.string().required().uri(),
  site_id: Joi.string().required(),
  api_key: Joi.string().required(),
});

/** POST /au/pronto/sync */
const prontoSyncSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
});

module.exports = {
  xeroConnectSchema,
  xeroExportSchema,
  xeroSyncPOSchema,
  xeroGSTSummarySchema,
  squareConnectSchema,
  squarePaymentSchema,
  myobConnectSchema,
  myobExportSchema,
  googleReviewsConnectSchema,
  googleReviewReplySchema,
  prontoConnectSchema,
  prontoSyncSchema,
};
