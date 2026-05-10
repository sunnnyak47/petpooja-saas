/**
 * @fileoverview Joi validation schemas for integration endpoints.
 * @module modules/integrations/integration.validation
 */

const Joi = require('joi');

const phoneRegex = /^[0-9]{10,15}$/;

/** POST /api/integrations/online-orders/:id/accept */
const acceptOnlineOrderSchema = Joi.object({});

/** POST /api/integrations/online-orders/:id/reject */
const rejectOnlineOrderSchema = Joi.object({
  reason: Joi.string().max(500).allow('', null),
});

/** POST /api/integrations/online-orders/:id/ready */
const markOrderReadySchema = Joi.object({});

/** POST /api/integrations/razorpay/create-order */
const createRazorpayOrderSchema = Joi.object({
  amount: Joi.number().min(1).required(),
  order_id: Joi.string().allow(null),
  customer_name: Joi.string().max(150),
  customer_phone: Joi.string().pattern(phoneRegex),
});

/** POST /api/integrations/razorpay/verify */
const verifyRazorpayPaymentSchema = Joi.object({
  razorpay_order_id: Joi.string().required(),
  razorpay_payment_id: Joi.string().required(),
  razorpay_signature: Joi.string().required(),
});

/** POST /api/integrations/razorpay/refund */
const razorpayRefundSchema = Joi.object({
  payment_id: Joi.string().required(),
  amount: Joi.number().min(1).required(),
  reason: Joi.string().max(255).allow('', null),
});

/** POST /api/integrations/notify/sms */
const sendSMSSchema = Joi.object({
  phone: Joi.string().required().pattern(phoneRegex),
  message: Joi.string().required().max(1000),
  template_id: Joi.string().max(50),
});

/** POST /api/integrations/notify/whatsapp */
const sendWhatsAppSchema = Joi.object({
  phone: Joi.string().required().pattern(phoneRegex),
  template_name: Joi.string().required().max(100),
  parameters: Joi.array(),
});

/** POST /api/integrations/notify/campaign */
const sendCampaignSchema = Joi.object({
  recipients: Joi.array().min(1).required(),
  template_name: Joi.string().required().max(100),
  parameters: Joi.array(),
});

/** PUT /api/integrations/config */
const updateIntegrationConfigSchema = Joi.object({
  outlet_id: Joi.string().uuid(),
  integration: Joi.string().required().max(50),
  config: Joi.object().required(),
});

module.exports = {
  acceptOnlineOrderSchema,
  rejectOnlineOrderSchema,
  markOrderReadySchema,
  createRazorpayOrderSchema,
  verifyRazorpayPaymentSchema,
  razorpayRefundSchema,
  sendSMSSchema,
  sendWhatsAppSchema,
  sendCampaignSchema,
  updateIntegrationConfigSchema,
};
