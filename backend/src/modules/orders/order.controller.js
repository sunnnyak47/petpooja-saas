/**
 * @fileoverview Order controller — HTTP handlers for order endpoints.
 * @module modules/orders/order.controller
 */

const orderService = require('./order.service');
const splitService = require('./order.split.service');
const { sendSuccess, sendCreated, sendPaginated, sendError } = require('../../utils/response');
const { getDbClient } = require('../../config/database');
const { calculateItemTax } = require('./tax.service');
const { computeGrandTotal } = require('./pricing.service');
const { resolveOutletTaxConfig } = require('../../utils/outlet');
const { round2 } = require('../../utils/money');

/**
 * Recompute an order's tax + grand total from its surviving items, applying a
 * discount to the *taxable* base so GST is charged on the post-discount amount
 * (matches the order-creation path). Reuses the shared tax engine
 * (calculateItemTax), the region-aware rounding (computeGrandTotal) and the
 * outlet tax-config resolver (resolveOutletTaxConfig) — no divergent formulas.
 *
 * The discount is spread proportionally across items via a single factor so the
 * inclusive (AU) vs exclusive (IN) semantics of calculateItemTax are preserved.
 *
 * @param {object} tx - Prisma client / transaction
 * @param {string} orderId - Order UUID
 * @param {object} outlet - Outlet row including `head_office`, `currency`, `country`, `state`
 * @param {number} requestedDiscount - Discount amount before clamping
 * @param {number} loyaltyDiscount - Existing loyalty discount (left as-is)
 * @returns {Promise<{subtotal:number, discount_amount:number, cgst:number, sgst:number, igst:number, total_tax:number, total_amount:number, grand_total:number, round_off:number}>}
 */
async function recomputeOrderWithDiscount(tx, orderId, outlet, requestedDiscount, loyaltyDiscount) {
  const taxConfig = resolveOutletTaxConfig(outlet);

  const items = await tx.orderItem.findMany({
    where: { order_id: orderId, is_deleted: false },
  });

  let subtotalPaise = 0;
  for (const oi of items) subtotalPaise += Math.round(Number(oi.item_total) * 100);
  const subtotal = subtotalPaise / 100;

  // Clamp discount to the subtotal so the total can never go negative, and clamp
  // loyalty against whatever is left.
  const discount = Math.min(Math.max(Number(requestedDiscount) || 0, 0), subtotal);
  const loyalty = Math.min(Math.max(Number(loyaltyDiscount) || 0, 0), Math.max(subtotal - discount, 0));

  // Proportional factor applied to each item's taxable base so tax is computed
  // on the discounted amount (combined discount + loyalty reduce the base).
  const reduction = discount + loyalty;
  const factor = subtotal > 0 ? Math.max(subtotal - reduction, 0) / subtotal : 0;

  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;
  let totalTaxPaise = 0;

  for (const oi of items) {
    const qty = Number(oi.quantity) || 1;
    const gstRate = Number(oi.gst_rate) || taxConfig.default_gst_rate || 0;
    const discountedUnitBase = (Number(oi.item_total) * factor) / qty;
    const tax = calculateItemTax(
      { base_price: discountedUnitBase, quantity: qty, gst_rate: gstRate, is_inclusive: taxConfig.gst_inclusive },
      { country_code: taxConfig.country_code, state: taxConfig.state }
    );
    cgstPaise += Math.round(tax.cgst * 100);
    sgstPaise += Math.round(tax.sgst * 100);
    igstPaise += Math.round(tax.igst * 100);
    totalTaxPaise += Math.round(tax.total_tax * 100);
  }

  const totalTax = totalTaxPaise / 100;
  const discountedSubtotal = round2(Math.max(subtotal - reduction, 0));

  // Inclusive (AU): price already contains tax, so total = discounted subtotal.
  // Exclusive (IN): add tax on top of the discounted base.
  const totalAmount = taxConfig.gst_inclusive ? discountedSubtotal : round2(discountedSubtotal + totalTax);

  const { grandTotal, roundOff } = computeGrandTotal(totalAmount, taxConfig.country_code);

  return {
    subtotal,
    discount_amount: round2(discount),
    cgst: cgstPaise / 100,
    sgst: sgstPaise / 100,
    igst: igstPaise / 100,
    total_tax: totalTax,
    total_amount: totalAmount,
    grand_total: grandTotal,
    round_off: roundOff,
  };
}

/** POST /api/orders */
async function createOrder(req, res, next) {
  try {
    const order = await orderService.createOrder(req.body, req.user.id);
    sendCreated(res, order, 'Order created successfully');
  } catch (error) { next(error); }
}

/** GET /api/orders */
async function listOrders(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { orders, total, page, limit } = await orderService.listOrders(outletId, req.query);
    sendPaginated(res, orders, total, page, limit, 'Orders retrieved');
  } catch (error) { next(error); }
}

/** GET /api/orders/:id */
async function getOrder(req, res, next) {
  try {
    const order = await orderService.getOrderById(req.params.id);
    sendSuccess(res, order, 'Order retrieved');
  } catch (error) { next(error); }
}

/** POST /api/orders/:id/items */
async function addItems(req, res, next) {
  try {
    const order = await orderService.addItemsToOrder(req.params.id, req.body.items, req.user.id);
    sendSuccess(res, order, 'Items added to order');
  } catch (error) { next(error); }
}

/** POST /api/orders/:id/kot */
async function generateKOT(req, res, next) {
  try {
    const kots = await orderService.generateKOT(req.params.id);
    sendCreated(res, kots, `${kots.length} KOT(s) generated`);
  } catch (error) { next(error); }
}

/** PATCH /api/orders/:id/status */
async function updateStatus(req, res, next) {
  try {
    const order = await orderService.updateOrderStatus(req.params.id, req.body.status, req.user.id);
    // Broadcast real-time update to connected WebSocket clients in the same outlet
    if (typeof global.broadcastOrderUpdate === 'function') {
      global.broadcastOrderUpdate(order);
    }
    sendSuccess(res, order, 'Order status updated');
  } catch (error) { next(error); }
}

/** POST /api/orders/:id/payment */
async function processPayment(req, res, next) {
  try {
    const result = await orderService.processPayment(req.params.id, req.body, req.user.id);
    sendSuccess(res, result, 'Payment processed successfully');
  } catch (error) { next(error); }
}

/** GET /api/orders/:id/bill-summary — total, tendered, balance, payments */
async function getBillSummary(req, res, next) {
  try {
    const result = await splitService.getBillSummary(req.params.id, req.user.outlet_id || null);
    sendSuccess(res, result, 'Bill summary');
  } catch (error) { next(error); }
}

/** POST /api/orders/:id/split-preview — compute equal/custom split portions */
async function splitPreview(req, res, next) {
  try {
    const summary = await splitService.getBillSummary(req.params.id, req.user.outlet_id || null);
    const result = splitService.computeSplit(summary.balance_due > 0 ? summary.balance_due : summary.grand_total, req.body);
    sendSuccess(res, result, 'Split preview');
  } catch (error) { next(error); }
}

/**
 * POST /api/orders/:id/tender — record one tender (multi-tender / split bill).
 * Records a partial payment, or finalises the order when the balance is covered.
 */
async function recordTender(req, res, next) {
  try {
    const result = await splitService.recordTender(req.params.id, req.body, req.user.id, req.user.outlet_id || null);
    sendSuccess(res, result, result.closed ? 'Payment completed' : 'Partial payment recorded');
  } catch (error) { next(error); }
}

/** POST /api/orders/:id/bill */
async function generateBill(req, res, next) {
  try {
    const order = await orderService.generateBill(req.params.id, req.user.id);
    sendSuccess(res, order, 'Bill generated successfully');
  } catch (error) { next(error); }
}

/** POST /api/orders/:id/cancel */
async function cancelOrder(req, res, next) {
  try {
    const order = await orderService.cancelOrder(req.params.id, req.body.reason, req.user.id);
    sendSuccess(res, order, 'Order cancelled');
  } catch (error) { next(error); }
}

/** POST /api/orders/:id/void */
async function voidOrder(req, res, next) {
  try {
    const order = await orderService.voidOrder(req.params.id, req.body.manager_pin, req.body.reason, req.user.id);
    sendSuccess(res, order, 'Order voided');
  } catch (error) { next(error); }
}

/** POST /api/orders/:id/refund */
async function refundOrder(req, res, next) {
  try {
    const result = await orderService.refundOrder(req.params.id, req.body, req.user.id);
    sendSuccess(res, result, 'Refund processed');
  } catch (error) { next(error); }
}

/** POST /api/orders/:id/transfer-table */
async function transferTable(req, res, next) {
  try {
    const result = await orderService.transferTable(req.params.id, req.body.target_table_id, req.user.id);
    sendSuccess(res, result, 'Table transferred');
  } catch (error) { next(error); }
}

/** POST /api/orders/:id/merge */
async function mergeOrder(req, res, next) {
  try {
    const result = await orderService.mergeOrder(req.params.id, req.body.target_order_id, req.user.id);
    sendSuccess(res, result, 'Orders merged');
  } catch (error) { next(error); }
}

/** POST /api/orders/sync */
async function syncOfflineOrders(req, res, next) {
  try {
    const results = await orderService.syncOfflineOrders(req.body.orders || [req.body], req.user.id);
    sendSuccess(res, results, 'Orders synced');
  } catch (error) { next(error); }
}

/** POST /api/orders/:id/ebill */
async function sendEBill(req, res, next) {
  try {
    const { method, phone, email } = req.body;
    if (!method) return res.status(400).json({ success: false, message: 'method is required' });
    if ((method === 'sms' || method === 'whatsapp') && !phone) {
      return res.status(400).json({ success: false, message: 'phone is required for sms/whatsapp' });
    }
    if (method === 'email' && !email) {
      return res.status(400).json({ success: false, message: 'email is required for email channel' });
    }
    const result = await orderService.sendEBill(req.params.id, { method, phone, email });
    sendSuccess(res, result, 'eBill processed');
  } catch (error) { next(error); }
}

/** POST /api/orders/:id/apply-discount */
async function applyDiscount(req, res, next) {
  try {
    const prisma = getDbClient();
    const { id } = req.params;
    const { discount_type, discount_value, discount_reason, coupon_code } = req.body;

    const order = await prisma.order.findFirst({
      where: { id, is_deleted: false },
      include: { outlet: { include: { head_office: { select: { country_code: true, gst_inclusive: true, currency: true } } } } },
    });
    if (!order) return sendError(res, 404, 'Order not found');

    const ALLOWED_STATUSES = ['created', 'confirmed', 'held'];
    if (!ALLOWED_STATUSES.includes(order.status)) {
      return sendError(res, 422, `Cannot apply discount on an order with status '${order.status}'`);
    }

    const subtotal = Number(order.subtotal) || 0;
    let discount_amount = 0;
    if (discount_type === 'percentage') {
      // Cap percentage at 100% (defence-in-depth; Joi also enforces .max(100)).
      discount_amount = subtotal * (Math.min(Number(discount_value) || 0, 100) / 100);
    } else {
      discount_amount = Number(discount_value) || 0;
    }
    // Never let the discount exceed the bill — prevents a negative grand_total.
    discount_amount = Math.min(discount_amount, subtotal);

    const loyalty_discount = Number(order.loyalty_discount) || 0;

    // Recompute tax on the DISCOUNTED base and refresh round_off / grand_total via
    // the shared tax engine so GST is no longer over-collected and the total stays
    // a whole rupee in IN (whole cent in AU).
    const totals = await recomputeOrderWithDiscount(prisma, id, order.outlet, discount_amount, loyalty_discount);

    const updated = await prisma.order.update({
      where: { id },
      data: {
        discount_type,
        discount_value,
        discount_amount: totals.discount_amount,
        discount_reason: discount_reason || null,
        coupon_code: coupon_code || null,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        total_tax: totals.total_tax,
        total_amount: totals.total_amount,
        round_off: totals.round_off,
        grand_total: totals.grand_total,
      },
    });

    sendSuccess(res, updated, 'Discount applied successfully');
  } catch (error) { next(error); }
}

/** PATCH /api/orders/:id/notes */
async function updateNotes(req, res, next) {
  try {
    const prisma = getDbClient();
    const { id } = req.params;
    const { notes } = req.body;

    const order = await prisma.order.findFirst({
      where: { id, is_deleted: false },
      select: { id: true },
    });
    if (!order) return sendError(res, 404, 'Order not found');

    const updated = await prisma.order.update({
      where: { id },
      data: { notes: notes || null },
    });

    sendSuccess(res, updated, 'Order notes updated');
  } catch (error) { next(error); }
}

/**
 * POST /api/orders/:id/tip
 * Adds (or replaces) a gratuity on the bill. The tip is folded into total_amount /
 * grand_total on top of the freshly-recomputed clean base, so tax + round_off stay
 * correct and re-tipping is idempotent. The recompute helper is passed into the
 * service so the tax engine / region rounding remain the single source of truth.
 */
async function addTip(req, res, next) {
  try {
    const { id } = req.params;
    const { amount } = req.body;
    const updated = await orderService.addTip(id, amount, recomputeOrderWithDiscount);
    sendSuccess(res, updated, 'Tip added to bill');
  } catch (error) { next(error); }
}

/** POST /api/orders/:id/void-item */
async function voidItem(req, res, next) {
  try {
    const prisma = getDbClient();
    const { id } = req.params;
    const { item_id, manager_pin, reason, void_type } = req.body;

    // 1. Fetch order — must be in an editable state
    const order = await prisma.order.findFirst({
      where: { id, is_deleted: false },
      include: {
        order_items: { where: { is_deleted: false } },
        outlet: { include: { head_office: { select: { country_code: true, gst_inclusive: true, currency: true } } } },
      },
    });
    if (!order) return sendError(res, 404, 'Order not found');

    const ALLOWED_STATUSES = ['created', 'confirmed', 'held'];
    if (!ALLOWED_STATUSES.includes(order.status)) {
      return sendError(res, 422, `Cannot void item on an order with status '${order.status}'`);
    }

    // 2. Verify manager PIN scoped to THIS order's outlet (shared with voidOrder/refund).
    // PINs aren't unique across outlets, so an unscoped lookup was non-deterministic —
    // the same PIN could pass for comp and fail for void.
    let manager;
    try {
      manager = await orderService.authorizeManagerPin(prisma, manager_pin, order.outlet_id);
    } catch (e) {
      return sendError(res, 403, e.message || 'PIN does not belong to an authorized manager');
    }

    // 3. Find the OrderItem — must belong to this order and not already deleted
    const orderItem = order.order_items.find((i) => i.id === item_id);
    if (!orderItem) return sendError(res, 404, 'Order item not found or already removed');

    // 4 & 5. Apply void or comp in a transaction, then recalculate totals
    const updatedOrder = await prisma.$transaction(async (tx) => {
      if (void_type === 'comp') {
        // Comp: keep item visible but zero out its price
        await tx.orderItem.update({
          where: { id: item_id },
          data: {
            discount_amount: orderItem.item_total,
            item_total: 0,
          },
        });
      } else {
        // Void: soft-delete the item
        await tx.orderItem.update({
          where: { id: item_id },
          data: { is_deleted: true },
        });
      }

      // 6. Recalculate order totals from surviving items via the shared tax engine.
      // The previous discount may now exceed the smaller subtotal, so re-clamp it;
      // recompute tax (dropped before for IN exclusive orders) and round_off so the
      // grand_total stays consistent with the order-creation formula.
      const loyalty_discount = Number(order.loyalty_discount) || 0;
      const totals = await recomputeOrderWithDiscount(
        tx, id, order.outlet, Number(order.discount_amount) || 0, loyalty_discount
      );

      const updated = await tx.order.update({
        where: { id },
        data: {
          subtotal: totals.subtotal,
          discount_amount: totals.discount_amount,
          cgst: totals.cgst,
          sgst: totals.sgst,
          igst: totals.igst,
          total_tax: totals.total_tax,
          total_amount: totals.total_amount,
          round_off: totals.round_off,
          grand_total: totals.grand_total,
        },
        include: { order_items: { where: { is_deleted: false } } },
      });

      // Audit trail
      await tx.auditLog.create({
        data: {
          user_id: req.user.id,
          outlet_id: order.outlet_id,
          action: void_type === 'comp' ? 'ORDER_ITEM_COMPED' : 'ORDER_ITEM_VOIDED',
          entity_type: 'order',
          entity_id: id,
          new_values: {
            item_id,
            reason,
            void_type,
            authorized_by: manager.user_id,
          },
        },
      });

      return updated;
    });

    // 7. Emit socket event if available
    if (typeof global.broadcastOrderUpdate === 'function') {
      global.broadcastOrderUpdate({ event: 'order_item_voided', order: updatedOrder });
    }

    // 8. Return updated order
    sendSuccess(res, updatedOrder, void_type === 'comp' ? 'Item comped successfully' : 'Item voided successfully');
  } catch (error) { next(error); }
}

/** POST /api/orders/punch-kot */
async function punchKOT(req, res, next) {
  try {
    const result = await orderService.punchKOT(req.body, req.user.id);
    sendCreated(res, result, 'Order punched & KOT sent to kitchen');
  } catch (error) { next(error); }
}

/** PATCH /api/orders/:id/assign-staff */
async function assignStaff(req, res, next) {
  try {
    const prisma = getDbClient();
    const { id } = req.params;
    const { staff_id } = req.body;

    const order = await prisma.order.findFirst({
      where: { id, is_deleted: false },
      select: { id: true, outlet_id: true },
    });
    if (!order) return sendError(res, 404, 'Order not found');

    if (staff_id !== null) {
      const staff = await prisma.user.findFirst({
        where: { id: staff_id, outlet_id: order.outlet_id, is_deleted: false },
        select: { id: true },
      });
      if (!staff) return sendError(res, 404, 'Staff member not found in this outlet');
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { staff_id: staff_id || null },
    });

    sendSuccess(res, updated, staff_id ? 'Staff assigned to order' : 'Staff unassigned from order');
  } catch (error) { next(error); }
}

module.exports = {
  createOrder, listOrders, getOrder, addItems,
  generateKOT, generateBill, updateStatus, processPayment,
  getBillSummary, splitPreview, recordTender,
  cancelOrder, voidOrder, refundOrder, transferTable, mergeOrder, syncOfflineOrders,
  sendEBill, applyDiscount, updateNotes, assignStaff, voidItem, punchKOT, addTip,
};
