/**
 * @fileoverview Order routes — maps endpoints to controllers with auth + validation.
 * @module modules/orders/order.routes
 */

const express = require('express');
const router = express.Router();
const orderController = require('./order.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission, enforceOutletScope, checkLicense } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { createOrderSchema, addItemsSchema, processPaymentSchema, voidOrderSchema, cancelOrderSchema, refundOrderSchema } = require('./order.validation');
const { auditLog } = require('../../middleware/audit.middleware');
const { sendSuccess, sendError } = require('../../utils/response');
const taxService = require('./tax.service');

router.post('/', authenticate, checkLicense, hasPermission('CREATE_ORDER'), validate(createOrderSchema), auditLog('order'), orderController.createOrder);
router.get('/', authenticate, checkLicense, enforceOutletScope, hasPermission('VIEW_ORDERS'), orderController.listOrders);

/** GET /api/orders/tax-preview — preview tax breakdown for a set of items */
router.get('/tax-preview', authenticate, async (req, res, next) => {
  try {
    // Accept items + config from query string (JSON) or request body
    let items, country_code, state, customer_state;

    if (req.body && req.body.items) {
      ({ items, country_code, state, customer_state } = req.body);
    } else if (req.query.items) {
      try {
        items = JSON.parse(req.query.items);
      } catch (_) {
        return sendError(res, 400, 'Invalid JSON in "items" query parameter');
      }
      country_code = req.query.country_code;
      state = req.query.state;
      customer_state = req.query.customer_state;
    } else {
      return sendError(res, 400, 'Missing required "items" parameter');
    }

    if (!Array.isArray(items) || items.length === 0) {
      return sendError(res, 400, '"items" must be a non-empty array');
    }

    if (!country_code) {
      return sendError(res, 400, 'Missing required "country_code" parameter (AU or IN)');
    }

    const outletConfig = {
      country_code,
      state: state || '',
      customer_state: customer_state || '',
    };

    const result = taxService.calculateOrderTax(items, outletConfig);
    const formatted = taxService.formatTaxBreakdown(result);

    sendSuccess(res, { ...result, formatted: formatted.lines }, 'Tax preview calculated');
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticate, enforceOutletScope, hasPermission('VIEW_ORDERS'), orderController.getOrder);
router.post('/:id/items', authenticate, checkLicense, hasPermission('MANAGE_ORDERS'), validate(addItemsSchema), auditLog('order'), orderController.addItems);
router.post('/:id/kot', authenticate, checkLicense, hasPermission('MANAGE_ORDERS'), auditLog('order'), orderController.generateKOT);
router.patch('/:id/status', authenticate, checkLicense, hasPermission('MANAGE_ORDERS'), auditLog('order'), orderController.updateStatus);
router.post('/:id/payment', authenticate, checkLicense, hasPermission('MANAGE_PAYMENTS'), validate(processPaymentSchema), auditLog('payment'), orderController.processPayment);
router.post('/:id/bill', authenticate, checkLicense, hasPermission('MANAGE_ORDERS'), auditLog('order'), orderController.generateBill);
router.post('/:id/cancel', authenticate, checkLicense, hasPermission('MANAGE_ORDERS'), validate(cancelOrderSchema), auditLog('order'), orderController.cancelOrder);
router.post('/:id/void', authenticate, checkLicense, hasPermission('VOID_ORDER'), validate(voidOrderSchema), auditLog('order'), orderController.voidOrder);
router.post('/:id/refund', authenticate, checkLicense, hasPermission('MANAGE_PAYMENTS'), validate(refundOrderSchema), auditLog('payment'), orderController.refundOrder);
router.post('/:id/transfer-table', authenticate, checkLicense, hasPermission('MANAGE_ORDERS'), auditLog('order'), orderController.transferTable);
router.post('/:id/merge', authenticate, checkLicense, hasPermission('MANAGE_ORDERS'), auditLog('order'), orderController.mergeOrder);
router.post('/sync', authenticate, checkLicense, hasPermission('CREATE_ORDER'), auditLog('order'), orderController.syncOfflineOrders);

module.exports = router;
