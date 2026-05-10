/**
 * @fileoverview Procurement routes — Suppliers, Item Presets, Purchase Orders.
 */

const express = require('express');
const router = express.Router();
const c = require('./procurement.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const {
  createSupplierSchema,
  updateSupplierSchema,
  createItemPresetSchema,
  updateItemPresetSchema,
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  receivePurchaseOrderSchema,
  sendWhatsAppSchema,
} = require('./procurement.validation');

const VIEW  = hasPermission('VIEW_INVENTORY');
const MANAGE = hasPermission('MANAGE_INVENTORY');

/* ── Suppliers ──────────────────────────────────── */
router.get('/suppliers', authenticate, VIEW, enforceOutletScope, c.listSuppliers);
router.post('/suppliers', authenticate, MANAGE, validate(createSupplierSchema), enforceOutletScope, c.createSupplier);
router.patch('/suppliers/:id', authenticate, MANAGE, validate(updateSupplierSchema), c.updateSupplier);
router.delete('/suppliers/:id', authenticate, MANAGE, c.deleteSupplier);

/* ── Item Presets ──────────────────────────────── */
router.get('/presets', authenticate, VIEW, enforceOutletScope, c.listItemPresets);
router.post('/presets', authenticate, MANAGE, validate(createItemPresetSchema), enforceOutletScope, c.createItemPreset);
router.patch('/presets/:id', authenticate, MANAGE, validate(updateItemPresetSchema), c.updateItemPreset);
router.delete('/presets/:id', authenticate, MANAGE, c.deleteItemPreset);

/* ── Purchase Orders ─────────────────────────────── */
router.get('/purchase-orders', authenticate, VIEW, enforceOutletScope, c.listPurchaseOrders);
router.post('/purchase-orders', authenticate, MANAGE, validate(createPurchaseOrderSchema), enforceOutletScope, c.createPurchaseOrder);
router.get('/purchase-orders/:id', authenticate, VIEW, c.getPurchaseOrder);
router.patch('/purchase-orders/:id', authenticate, MANAGE, validate(updatePurchaseOrderSchema), c.updatePurchaseOrder);
router.delete('/purchase-orders/:id', authenticate, MANAGE, c.deletePurchaseOrder);
router.post('/purchase-orders/:id/approve', authenticate, MANAGE, c.approvePurchaseOrder);
router.post('/purchase-orders/:id/receive', authenticate, MANAGE, validate(receivePurchaseOrderSchema), enforceOutletScope, c.receivePurchaseOrder);

/* ── PDF & WhatsApp ─────────────────────────────── */
router.post('/purchase-orders/:id/pdf', authenticate, VIEW, c.generatePdf);
router.get('/purchase-orders/:id/download', authenticate, VIEW, c.downloadPdf);
router.post('/purchase-orders/:id/whatsapp', authenticate, MANAGE, validate(sendWhatsAppSchema), c.sendWhatsApp);

module.exports = router;
