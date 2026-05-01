/**
 * @fileoverview Procurement routes — Suppliers, Item Presets, Purchase Orders.
 */

const express = require('express');
const router = express.Router();
const c = require('./procurement.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');

const VIEW  = hasPermission('VIEW_INVENTORY');
const MANAGE = hasPermission('MANAGE_INVENTORY');

/* ── Suppliers ──────────────────────────────────── */
router.get('/suppliers', authenticate, VIEW, enforceOutletScope, c.listSuppliers);
router.post('/suppliers', authenticate, MANAGE, enforceOutletScope, c.createSupplier);
router.patch('/suppliers/:id', authenticate, MANAGE, c.updateSupplier);
router.delete('/suppliers/:id', authenticate, MANAGE, c.deleteSupplier);

/* ── Item Presets ──────────────────────────────── */
router.get('/presets', authenticate, VIEW, enforceOutletScope, c.listItemPresets);
router.post('/presets', authenticate, MANAGE, enforceOutletScope, c.createItemPreset);
router.patch('/presets/:id', authenticate, MANAGE, c.updateItemPreset);
router.delete('/presets/:id', authenticate, MANAGE, c.deleteItemPreset);

/* ── Purchase Orders ─────────────────────────────── */
router.get('/purchase-orders', authenticate, VIEW, enforceOutletScope, c.listPurchaseOrders);
router.post('/purchase-orders', authenticate, MANAGE, enforceOutletScope, c.createPurchaseOrder);
router.get('/purchase-orders/:id', authenticate, VIEW, c.getPurchaseOrder);
router.patch('/purchase-orders/:id', authenticate, MANAGE, c.updatePurchaseOrder);
router.delete('/purchase-orders/:id', authenticate, MANAGE, c.deletePurchaseOrder);
router.post('/purchase-orders/:id/approve', authenticate, MANAGE, c.approvePurchaseOrder);
router.post('/purchase-orders/:id/receive', authenticate, MANAGE, enforceOutletScope, c.receivePurchaseOrder);

/* ── PDF & WhatsApp ─────────────────────────────── */
router.post('/purchase-orders/:id/pdf', authenticate, VIEW, c.generatePdf);
router.get('/purchase-orders/:id/download', authenticate, VIEW, c.downloadPdf);
router.post('/purchase-orders/:id/whatsapp', authenticate, MANAGE, c.sendWhatsApp);

module.exports = router;
