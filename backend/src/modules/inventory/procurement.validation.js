/**
 * @fileoverview Joi validation schemas for procurement endpoints.
 * @module modules/inventory/procurement.validation
 */

const Joi = require('joi');
const { phoneRequired, phoneOptional } = require('../../utils/validators');

const createSupplierSchema = Joi.object({
  name: Joi.string().trim().max(150).required(),
  contact_person: Joi.string().trim().max(100).allow('', null),
  phone: phoneOptional,
  email: Joi.string().email().allow('', null),
  address: Joi.string().max(500).allow('', null),
  gstin: Joi.string().max(15).allow('', null),
  abn: Joi.string().max(11).allow('', null),
  payment_terms: Joi.string().max(100).allow('', null),
  outlet_id: Joi.string().uuid().required(),
});

const updateSupplierSchema = Joi.object({
  name: Joi.string().trim().max(150),
  contact_person: Joi.string().trim().max(100).allow('', null),
  phone: phoneOptional,
  email: Joi.string().email().allow('', null),
  address: Joi.string().max(500).allow('', null),
  gstin: Joi.string().max(15).allow('', null),
  abn: Joi.string().max(11).allow('', null),
  payment_terms: Joi.string().max(100).allow('', null),
  outlet_id: Joi.string().uuid(),
});

const createItemPresetSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  supplier_id: Joi.string().uuid().required(),
  name: Joi.string().trim().max(100).required(),
  sku: Joi.string().trim().max(50),
  unit: Joi.string().required(),
  unit_price: Joi.number().min(0).required(),
  category: Joi.string().trim().max(50),
  tax_rate: Joi.number().min(0).max(100),
});

const updateItemPresetSchema = Joi.object({
  outlet_id: Joi.string().uuid(),
  supplier_id: Joi.string().uuid(),
  name: Joi.string().trim().max(100),
  sku: Joi.string().trim().max(50),
  unit: Joi.string(),
  unit_price: Joi.number().min(0),
  category: Joi.string().trim().max(50),
  tax_rate: Joi.number().min(0).max(100),
});

const createPurchaseOrderSchema = Joi.object({
  // supplier_id is optional — POs can be created without a supplier
  supplier_id: Joi.string().uuid().allow(null, '').optional(),
  items: Joi.array().items(Joi.object({
    // Optional — PO line items can be free-text preset items not linked to an
    // inventory record. The service stores inventory_item_id as null in that case.
    inventory_item_id: Joi.string().uuid().allow(null, '').optional(),
    // Accept both 'quantity' (canonical) and legacy 'ordered_quantity' from older clients
    quantity: Joi.number().min(0).default(1),
    ordered_quantity: Joi.number().min(0),
    // Accept all unit-price aliases used across different UI screens
    unit_price: Joi.number().min(0).default(0),
    unit_cost: Joi.number().min(0),
    unit_rate: Joi.number().min(0),
    rate: Joi.number().min(0),
    unit: Joi.string().max(20),
    // Extra metadata fields sent by the frontend AI-build and PO-page flows
    item_name: Joi.string().max(200).allow('', null),
    category: Joi.string().max(100).allow('', null),
    preset_id: Joi.string().uuid().allow(null),
    tax_rate: Joi.number().min(0).max(100).default(0),
    hsn_code: Joi.string().max(20).allow('', null),
    notes: Joi.string().max(200).allow('', null),
  })).min(1).required(),
  status: Joi.string().valid('draft', 'submitted', 'approved', 'received', 'cancelled'),
  reference_number: Joi.string().max(50).allow('', null),
  notes: Joi.string().max(500).allow('', null),
  terms: Joi.string().max(500).allow('', null),
  expected_date: Joi.date().allow('', null),
  delivery_date: Joi.date().allow('', null),
  discount_amount: Joi.number().min(0),
  // Optional — controller falls back to req.user.outlet_id from the token.
  outlet_id: Joi.string().uuid().optional(),
  // Tolerate extra UI fields (order_date, preset_ids, etc.) without rejecting.
}).unknown(true);

const updatePurchaseOrderSchema = Joi.object({
  status: Joi.string().valid('draft', 'submitted', 'approved', 'received', 'cancelled'),
  notes: Joi.string().max(500),
  terms: Joi.string().max(500),
  expected_date: Joi.date(),
  items: Joi.array().items(Joi.object({
    inventory_item_id: Joi.string().uuid().required(),
    quantity: Joi.number().min(1),
    unit_price: Joi.number().min(0),
  })),
});

const receivePurchaseOrderSchema = Joi.object({
  received_items: Joi.array().items(Joi.object({
    item_id: Joi.string().uuid().required(),
    received_quantity: Joi.number().min(0).required(),
    notes: Joi.string().max(200),
  })),
});

const sendWhatsAppSchema = Joi.object({
  phone: phoneRequired,
});

module.exports = {
  createSupplierSchema,
  updateSupplierSchema,
  createItemPresetSchema,
  updateItemPresetSchema,
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  receivePurchaseOrderSchema,
  sendWhatsAppSchema,
};
