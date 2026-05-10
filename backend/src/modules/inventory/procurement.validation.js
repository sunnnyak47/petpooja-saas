/**
 * @fileoverview Joi validation schemas for procurement endpoints.
 * @module modules/inventory/procurement.validation
 */

const Joi = require('joi');

const createSupplierSchema = Joi.object({
  name: Joi.string().trim().max(150).required(),
  contact_person: Joi.string().trim().max(100),
  phone: Joi.string().pattern(/^[0-9]{10,15}$/),
  email: Joi.string().email().allow('', null),
  address: Joi.string().max(500),
  gstin: Joi.string().max(15).allow('', null),
  abn: Joi.string().max(11).allow('', null),
  payment_terms: Joi.string().max(100),
  outlet_id: Joi.string().uuid().required(),
});

const updateSupplierSchema = Joi.object({
  name: Joi.string().trim().max(150),
  contact_person: Joi.string().trim().max(100),
  phone: Joi.string().pattern(/^[0-9]{10,15}$/),
  email: Joi.string().email().allow('', null),
  address: Joi.string().max(500),
  gstin: Joi.string().max(15).allow('', null),
  abn: Joi.string().max(11).allow('', null),
  payment_terms: Joi.string().max(100),
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
  supplier_id: Joi.string().uuid().required(),
  items: Joi.array().items(Joi.object({
    inventory_item_id: Joi.string().uuid().required(),
    quantity: Joi.number().min(1).required(),
    unit_price: Joi.number().min(0).required(),
    unit: Joi.string(),
  })).min(1).required(),
  status: Joi.string().valid('draft', 'submitted', 'approved', 'received', 'cancelled'),
  reference_number: Joi.string().max(50),
  notes: Joi.string().max(500),
  terms: Joi.string().max(500),
  expected_date: Joi.date(),
  delivery_date: Joi.date(),
  discount_amount: Joi.number().min(0),
  outlet_id: Joi.string().uuid().required(),
});

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
  phone: Joi.string().pattern(/^[0-9]{10,15}$/).required(),
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
