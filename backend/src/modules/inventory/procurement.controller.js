/**
 * @fileoverview Procurement controller — HTTP handlers for POs, Suppliers, and Presets.
 * @module modules/inventory/procurement.controller
 */

const procurementService = require('./procurement.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/response');
const path = require('path');

/* ── Suppliers ──────────────────────────────────── */

async function listSuppliers(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const suppliers = await procurementService.listSuppliers(outletId, req.query);
    sendSuccess(res, suppliers, 'Suppliers retrieved');
  } catch (error) { next(error); }
}

async function createSupplier(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const supplier = await procurementService.createSupplier(outletId, req.body);
    sendCreated(res, supplier, 'Supplier created');
  } catch (error) { next(error); }
}

async function updateSupplier(req, res, next) {
  try {
    const supplier = await procurementService.updateSupplier(req.params.id, req.body);
    sendSuccess(res, supplier, 'Supplier updated');
  } catch (error) { next(error); }
}

async function deleteSupplier(req, res, next) {
  try {
    await procurementService.deleteSupplier(req.params.id);
    sendSuccess(res, null, 'Supplier deleted');
  } catch (error) { next(error); }
}

/* ── Item Presets ──────────────────────────────── */

async function listItemPresets(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const presets = await procurementService.listItemPresets(outletId, req.query);
    sendSuccess(res, presets, 'Item presets retrieved');
  } catch (error) { next(error); }
}

async function createItemPreset(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const preset = await procurementService.createItemPreset(outletId, req.body);
    sendCreated(res, preset, 'Item preset created');
  } catch (error) { next(error); }
}

async function updateItemPreset(req, res, next) {
  try {
    const preset = await procurementService.updateItemPreset(req.params.id, req.body);
    sendSuccess(res, preset, 'Item preset updated');
  } catch (error) { next(error); }
}

async function deleteItemPreset(req, res, next) {
  try {
    await procurementService.deleteItemPreset(req.params.id);
    sendSuccess(res, null, 'Item preset deleted');
  } catch (error) { next(error); }
}

/* ── Purchase Orders ────────────────────────────── */

async function listPurchaseOrders(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await procurementService.listPurchaseOrders(outletId, req.query);
    sendPaginated(res, result.items, result.total, 'Purchase orders retrieved');
  } catch (error) { next(error); }
}

async function getPurchaseOrder(req, res, next) {
  try {
    const po = await procurementService.getPurchaseOrder(req.params.id);
    sendSuccess(res, po, 'Purchase order retrieved');
  } catch (error) { next(error); }
}

async function createPurchaseOrder(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const po = await procurementService.createPurchaseOrder(outletId, req.body, req.user.id);
    sendCreated(res, po, 'Purchase Order created');
  } catch (error) { next(error); }
}

async function updatePurchaseOrder(req, res, next) {
  try {
    const po = await procurementService.updatePurchaseOrder(req.params.id, req.body);
    sendSuccess(res, po, 'Purchase order updated');
  } catch (error) { next(error); }
}

async function approvePurchaseOrder(req, res, next) {
  try {
    const po = await procurementService.approvePurchaseOrder(req.params.id, req.user.id);
    sendSuccess(res, po, 'Purchase order approved');
  } catch (error) { next(error); }
}

async function deletePurchaseOrder(req, res, next) {
  try {
    await procurementService.deletePurchaseOrder(req.params.id);
    sendSuccess(res, null, 'Purchase order deleted');
  } catch (error) { next(error); }
}

async function receivePurchaseOrder(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const grn = await procurementService.receivePurchaseOrder(outletId, req.params.id, req.body, req.user.id);
    sendSuccess(res, grn, 'Goods Received Note created and stock updated');
  } catch (error) { next(error); }
}

/* ── PDF & WhatsApp ─────────────────────────────── */

async function generatePdf(req, res, next) {
  try {
    // Generate and stream PDF directly — never rely on stored file path
    const po = await procurementService.getPurchaseOrder(req.params.id);
    const { streamPOPdf } = require('./po-pdf.service');
    const filename = `PO-${po.po_number}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await streamPOPdf(po, res);
  } catch (error) { next(error); }
}

async function downloadPdf(req, res, next) {
  try {
    // Always generate fresh — Render's ephemeral FS means stored paths are unreliable
    const po = await procurementService.getPurchaseOrder(req.params.id);
    const { streamPOPdf } = require('./po-pdf.service');
    const filename = `PO-${po.po_number}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await streamPOPdf(po, res);
  } catch (error) { next(error); }
}

async function sendWhatsApp(req, res, next) {
  try {
    const { phone, outlet_id } = req.body;
    const outletId = outlet_id || req.user.outlet_id;
    const result = await procurementService.sendPOWhatsApp(req.params.id, outletId, phone);
    sendSuccess(res, result, result.method === 'meta_api' ? 'WhatsApp message sent' : 'WhatsApp link generated');
  } catch (error) { next(error); }
}

module.exports = {
  listSuppliers, createSupplier, updateSupplier, deleteSupplier,
  listItemPresets, createItemPreset, updateItemPreset, deleteItemPreset,
  listPurchaseOrders, getPurchaseOrder, createPurchaseOrder, updatePurchaseOrder,
  approvePurchaseOrder, deletePurchaseOrder, receivePurchaseOrder,
  generatePdf, downloadPdf, sendWhatsApp,
};
