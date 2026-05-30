/**
 * @fileoverview Order controller — HTTP handlers for order endpoints.
 * @module modules/orders/order.controller
 */

const orderService = require('./order.service');
const { sendSuccess, sendCreated, sendPaginated, sendError } = require('../../utils/response');
const { getDbClient } = require('../../config/database');

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
    });
    if (!order) return sendError(res, 404, 'Order not found');

    const ALLOWED_STATUSES = ['created', 'confirmed', 'held'];
    if (!ALLOWED_STATUSES.includes(order.status)) {
      return sendError(res, 422, `Cannot apply discount on an order with status '${order.status}'`);
    }

    const subtotal = Number(order.subtotal) || 0;
    let discount_amount = 0;
    if (discount_type === 'percentage') {
      discount_amount = subtotal * (discount_value / 100);
    } else {
      discount_amount = discount_value;
    }

    const loyalty_discount = Number(order.loyalty_discount) || 0;
    const round_off = Number(order.round_off) || 0;
    const total_amount = Number(order.total_amount) || 0;
    const grand_total = total_amount - discount_amount - loyalty_discount + round_off;

    const updated = await prisma.order.update({
      where: { id },
      data: {
        discount_type,
        discount_value,
        discount_amount,
        discount_reason: discount_reason || null,
        coupon_code: coupon_code || null,
        grand_total,
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
        items: { where: { is_deleted: false } },
      },
    });
    if (!order) return sendError(res, 404, 'Order not found');

    const ALLOWED_STATUSES = ['created', 'confirmed', 'held'];
    if (!ALLOWED_STATUSES.includes(order.status)) {
      return sendError(res, 422, `Cannot void item on an order with status '${order.status}'`);
    }

    // 2. Verify manager PIN via StaffProfile (same pattern as voidOrder service)
    const manager = await prisma.staffProfile.findFirst({
      where: { manager_pin, is_deleted: false },
      include: { user: { include: { user_roles: { include: { role: true } } } } },
    });
    if (!manager) return sendError(res, 403, 'Invalid manager PIN');

    const hasManagerRole = manager.user.user_roles.some(
      (ur) => ['super_admin', 'owner', 'manager'].includes(ur.role.name)
    );
    if (!hasManagerRole) return sendError(res, 403, 'PIN does not belong to an authorized manager');

    // 3. Find the OrderItem — must belong to this order and not already deleted
    const orderItem = order.items.find((i) => i.id === item_id);
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

      // 6. Recalculate order totals from surviving items
      const remainingItems = await tx.orderItem.findMany({
        where: { order_id: id, is_deleted: false },
      });

      const subtotal = remainingItems.reduce((sum, i) => sum + Number(i.item_total), 0);
      const discount_amount = Number(order.discount_amount) || 0;
      const loyalty_discount = Number(order.loyalty_discount) || 0;
      const round_off = Number(order.round_off) || 0;
      const grand_total = subtotal - discount_amount - loyalty_discount + round_off;

      const updated = await tx.order.update({
        where: { id },
        data: { subtotal, grand_total },
        include: { items: { where: { is_deleted: false } } },
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
  cancelOrder, voidOrder, refundOrder, transferTable, mergeOrder, syncOfflineOrders,
  sendEBill, applyDiscount, updateNotes, assignStaff, voidItem, punchKOT,
};
