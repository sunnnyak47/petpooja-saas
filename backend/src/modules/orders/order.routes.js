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
const { createOrderSchema, addItemsSchema, processPaymentSchema, voidOrderSchema, cancelOrderSchema, refundOrderSchema, generateKOTSchema, updateOrderStatusSchema, generateBillSchema, transferTableSchema, mergeOrderSchema, syncOfflineOrdersSchema } = require('./order.validation');
const { auditLog } = require('../../middleware/audit.middleware');
const { sendSuccess, sendError } = require('../../utils/response');
const taxService = require('./tax.service');

/**
 * Ownership guard — verifies the requested order belongs to the requesting outlet.
 * super_admin bypasses this check (they manage all outlets).
 */
async function assertOrderOwnership(req, res, next) {
  try {
    const outletId = req.user?.outlet_id;
    if (!outletId) return next(); // super_admin or roles without outlet scope — bypass

    const orderId = req.params.id || req.params.orderId || req.body?.order_id;
    if (!orderId) return next();

    const { getDbClient } = require('../../config/database');
    const prisma = getDbClient();
    const order = await prisma.order.findFirst({
      where: { id: orderId, is_deleted: false },
      select: { outlet_id: true },
    });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.outlet_id !== outletId) {
      return res.status(403).json({ success: false, message: 'Access denied: order belongs to a different outlet' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

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

router.get('/:id', authenticate, enforceOutletScope, hasPermission('VIEW_ORDERS'), assertOrderOwnership, orderController.getOrder);
router.post('/:id/items', authenticate, checkLicense, hasPermission('MANAGE_ORDERS'), assertOrderOwnership, validate(addItemsSchema), auditLog('order'), orderController.addItems);
router.post('/:id/kot', authenticate, checkLicense, hasPermission('MANAGE_ORDERS'), assertOrderOwnership, validate(generateKOTSchema), auditLog('order'), orderController.generateKOT);
router.patch('/:id/status', authenticate, checkLicense, hasPermission('MANAGE_ORDERS'), assertOrderOwnership, validate(updateOrderStatusSchema), auditLog('order'), orderController.updateStatus);
router.post('/:id/payment', authenticate, checkLicense, hasPermission('MANAGE_PAYMENTS'), assertOrderOwnership, validate(processPaymentSchema), auditLog('payment'), orderController.processPayment);
router.post('/:id/bill', authenticate, checkLicense, hasPermission('MANAGE_ORDERS'), validate(generateBillSchema), auditLog('order'), orderController.generateBill);
router.post('/:id/cancel', authenticate, checkLicense, hasPermission('MANAGE_ORDERS'), validate(cancelOrderSchema), auditLog('order'), orderController.cancelOrder);
router.post('/:id/void', authenticate, checkLicense, hasPermission('VOID_ORDER'), validate(voidOrderSchema), auditLog('order'), orderController.voidOrder);
router.post('/:id/refund', authenticate, checkLicense, hasPermission('MANAGE_PAYMENTS'), validate(refundOrderSchema), auditLog('payment'), orderController.refundOrder);
router.post('/:id/transfer-table', authenticate, checkLicense, hasPermission('MANAGE_ORDERS'), validate(transferTableSchema), auditLog('order'), orderController.transferTable);
router.post('/:id/merge', authenticate, checkLicense, hasPermission('MANAGE_ORDERS'), validate(mergeOrderSchema), auditLog('order'), orderController.mergeOrder);
router.post('/sync', authenticate, checkLicense, hasPermission('CREATE_ORDER'), validate(syncOfflineOrdersSchema), auditLog('order'), orderController.syncOfflineOrders);

module.exports = router;
