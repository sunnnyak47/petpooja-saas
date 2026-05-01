/**
 * @fileoverview Procurement service — Suppliers, Purchase Orders, Item Presets, GRNs.
 * @module modules/inventory/procurement.service
 */

const path = require('path');
const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const { NotFoundError, BadRequestError } = require('../../utils/errors');
const { parsePagination } = require('../../utils/helpers');
const { generatePOPdf } = require('./po-pdf.service');

const DEFAULT_PRESETS = [
  { name: 'Tomato',               category: 'Vegetables',  default_quantity: 5,   unit: 'kg',     default_rate: 40,  tax_rate: 0 },
  { name: 'Onion',                category: 'Vegetables',  default_quantity: 10,  unit: 'kg',     default_rate: 30,  tax_rate: 0 },
  { name: 'Potato',               category: 'Vegetables',  default_quantity: 10,  unit: 'kg',     default_rate: 25,  tax_rate: 0 },
  { name: 'Garlic',               category: 'Vegetables',  default_quantity: 2,   unit: 'kg',     default_rate: 120, tax_rate: 0 },
  { name: 'Ginger',               category: 'Vegetables',  default_quantity: 1,   unit: 'kg',     default_rate: 100, tax_rate: 0 },
  { name: 'Green Chilli',         category: 'Vegetables',  default_quantity: 0.5, unit: 'kg',     default_rate: 80,  tax_rate: 0 },
  { name: 'Capsicum',             category: 'Vegetables',  default_quantity: 2,   unit: 'kg',     default_rate: 60,  tax_rate: 0 },
  { name: 'Coriander (Dhaniya)',  category: 'Vegetables',  default_quantity: 1,   unit: 'bunch',  default_rate: 20,  tax_rate: 0 },
  { name: 'Lemon',                category: 'Vegetables',  default_quantity: 1,   unit: 'dozen',  default_rate: 40,  tax_rate: 0 },
  { name: 'Spinach (Palak)',      category: 'Vegetables',  default_quantity: 2,   unit: 'kg',     default_rate: 30,  tax_rate: 0 },
  { name: 'Cauliflower',          category: 'Vegetables',  default_quantity: 3,   unit: 'pcs',    default_rate: 40,  tax_rate: 0 },
  { name: 'Peas (Matar)',         category: 'Vegetables',  default_quantity: 2,   unit: 'kg',     default_rate: 50,  tax_rate: 0 },
  { name: 'Carrot',               category: 'Vegetables',  default_quantity: 3,   unit: 'kg',     default_rate: 35,  tax_rate: 0 },
  { name: 'Brinjal (Baingan)',    category: 'Vegetables',  default_quantity: 2,   unit: 'kg',     default_rate: 40,  tax_rate: 0 },
  { name: 'Lady Finger (Bhindi)', category: 'Vegetables',  default_quantity: 2,   unit: 'kg',     default_rate: 55,  tax_rate: 0 },
  { name: 'Milk',                 category: 'Dairy',       default_quantity: 10,  unit: 'l',      default_rate: 60,  tax_rate: 0 },
  { name: 'Paneer',               category: 'Dairy',       default_quantity: 2,   unit: 'kg',     default_rate: 320, tax_rate: 5 },
  { name: 'Butter (Amul)',        category: 'Dairy',       default_quantity: 0.5, unit: 'kg',     default_rate: 280, tax_rate: 12 },
  { name: 'Ghee',                 category: 'Dairy',       default_quantity: 1,   unit: 'l',      default_rate: 550, tax_rate: 12 },
  { name: 'Curd (Dahi)',          category: 'Dairy',       default_quantity: 2,   unit: 'kg',     default_rate: 80,  tax_rate: 0 },
  { name: 'Fresh Cream',          category: 'Dairy',       default_quantity: 0.5, unit: 'l',      default_rate: 180, tax_rate: 12 },
  { name: 'Basmati Rice',         category: 'Grains',      default_quantity: 10,  unit: 'kg',     default_rate: 80,  tax_rate: 5,  hsn_code: '1006' },
  { name: 'Regular Rice',         category: 'Grains',      default_quantity: 25,  unit: 'kg',     default_rate: 45,  tax_rate: 5,  hsn_code: '1006' },
  { name: 'Wheat Flour (Atta)',   category: 'Grains',      default_quantity: 25,  unit: 'kg',     default_rate: 35,  tax_rate: 0,  hsn_code: '1101' },
  { name: 'Maida',                category: 'Grains',      default_quantity: 10,  unit: 'kg',     default_rate: 40,  tax_rate: 0,  hsn_code: '1101' },
  { name: 'Besan (Gram Flour)',   category: 'Grains',      default_quantity: 5,   unit: 'kg',     default_rate: 70,  tax_rate: 0,  hsn_code: '1102' },
  { name: 'Toor Dal',             category: 'Grains',      default_quantity: 5,   unit: 'kg',     default_rate: 130, tax_rate: 0,  hsn_code: '0713' },
  { name: 'Chana Dal',            category: 'Grains',      default_quantity: 3,   unit: 'kg',     default_rate: 95,  tax_rate: 0,  hsn_code: '0713' },
  { name: 'Moong Dal',            category: 'Grains',      default_quantity: 3,   unit: 'kg',     default_rate: 110, tax_rate: 0,  hsn_code: '0713' },
  { name: 'Urad Dal',             category: 'Grains',      default_quantity: 2,   unit: 'kg',     default_rate: 120, tax_rate: 0,  hsn_code: '0713' },
  { name: 'Cumin Seeds (Jeera)',  category: 'Spices',      default_quantity: 0.5, unit: 'kg',     default_rate: 280, tax_rate: 5,  hsn_code: '0909' },
  { name: 'Mustard Seeds (Rai)',  category: 'Spices',      default_quantity: 0.5, unit: 'kg',     default_rate: 120, tax_rate: 5 },
  { name: 'Coriander Powder',     category: 'Spices',      default_quantity: 1,   unit: 'kg',     default_rate: 140, tax_rate: 5 },
  { name: 'Turmeric (Haldi)',     category: 'Spices',      default_quantity: 0.5, unit: 'kg',     default_rate: 140, tax_rate: 5 },
  { name: 'Red Chilli Powder',    category: 'Spices',      default_quantity: 0.5, unit: 'kg',     default_rate: 180, tax_rate: 5 },
  { name: 'Garam Masala',         category: 'Spices',      default_quantity: 0.5, unit: 'kg',     default_rate: 300, tax_rate: 5 },
  { name: 'Black Pepper',         category: 'Spices',      default_quantity: 0.25,unit: 'kg',     default_rate: 400, tax_rate: 5 },
  { name: 'Cardamom (Elaichi)',   category: 'Spices',      default_quantity: 0.1, unit: 'kg',     default_rate: 2500,tax_rate: 5 },
  { name: 'Chicken (Whole)',      category: 'Meat & Fish', default_quantity: 5,   unit: 'kg',     default_rate: 180, tax_rate: 5 },
  { name: 'Chicken (Boneless)',   category: 'Meat & Fish', default_quantity: 5,   unit: 'kg',     default_rate: 280, tax_rate: 5 },
  { name: 'Mutton',               category: 'Meat & Fish', default_quantity: 3,   unit: 'kg',     default_rate: 650, tax_rate: 5 },
  { name: 'Eggs',                 category: 'Meat & Fish', default_quantity: 2,   unit: 'tray',   default_rate: 180, tax_rate: 5 },
  { name: 'Fish (Rohu)',          category: 'Meat & Fish', default_quantity: 3,   unit: 'kg',     default_rate: 200, tax_rate: 5 },
  { name: 'Prawns',               category: 'Meat & Fish', default_quantity: 2,   unit: 'kg',     default_rate: 400, tax_rate: 5 },
  { name: 'Sunflower Oil',        category: 'Dry Goods',   default_quantity: 10,  unit: 'l',      default_rate: 140, tax_rate: 5,  hsn_code: '1512' },
  { name: 'Mustard Oil',          category: 'Dry Goods',   default_quantity: 5,   unit: 'l',      default_rate: 170, tax_rate: 5 },
  { name: 'Sugar',                category: 'Dry Goods',   default_quantity: 5,   unit: 'kg',     default_rate: 45,  tax_rate: 5,  hsn_code: '1701' },
  { name: 'Salt (Iodized)',       category: 'Dry Goods',   default_quantity: 2,   unit: 'kg',     default_rate: 20,  tax_rate: 0 },
  { name: 'Soy Sauce',            category: 'Dry Goods',   default_quantity: 1,   unit: 'l',      default_rate: 120, tax_rate: 12 },
  { name: 'Tomato Ketchup',       category: 'Dry Goods',   default_quantity: 2,   unit: 'kg',     default_rate: 220, tax_rate: 12 },
  { name: 'Mayonnaise',           category: 'Dry Goods',   default_quantity: 1,   unit: 'kg',     default_rate: 200, tax_rate: 12 },
  { name: 'Cashew Nuts',          category: 'Dry Goods',   default_quantity: 0.5, unit: 'kg',     default_rate: 700, tax_rate: 5 },
  { name: 'Disposable Containers',category: 'Packaging',   default_quantity: 1,   unit: 'packet', default_rate: 150, tax_rate: 18 },
  { name: 'Paper Bags (Medium)',  category: 'Packaging',   default_quantity: 1,   unit: 'packet', default_rate: 120, tax_rate: 18 },
  { name: 'Aluminium Foil Roll',  category: 'Packaging',   default_quantity: 2,   unit: 'pcs',    default_rate: 80,  tax_rate: 18 },
  { name: 'Tissue Paper',         category: 'Packaging',   default_quantity: 5,   unit: 'packet', default_rate: 40,  tax_rate: 18 },
  { name: 'Napkins',              category: 'Packaging',   default_quantity: 5,   unit: 'packet', default_rate: 50,  tax_rate: 18 },
  { name: 'Drinking Straws',      category: 'Packaging',   default_quantity: 2,   unit: 'packet', default_rate: 35,  tax_rate: 18 },
  { name: 'Tea Leaves (CTC)',     category: 'Beverages',   default_quantity: 1,   unit: 'kg',     default_rate: 280, tax_rate: 5 },
  { name: 'Coffee Powder',        category: 'Beverages',   default_quantity: 0.5, unit: 'kg',     default_rate: 400, tax_rate: 5 },
  { name: 'Mineral Water (1L)',   category: 'Beverages',   default_quantity: 1,   unit: 'crate',  default_rate: 300, tax_rate: 18 },
  { name: 'Cold Drinks (Assorted)',category:'Beverages',   default_quantity: 1,   unit: 'crate',  default_rate: 480, tax_rate: 28 },
];

function generatePONumber() {
  const now = new Date();
  const yr  = now.getFullYear().toString().slice(-2);
  const mo  = String(now.getMonth() + 1).padStart(2, '0');
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `PO-${yr}${mo}-${rnd}`;
}

function calcTotals(items) {
  let subtotal = 0, taxTotal = 0;
  for (const item of items) {
    const qty  = Number(item.ordered_quantity ?? item.quantity ?? 0);
    const rate = Number(item.unit_cost ?? item.unit_rate ?? item.rate ?? 0);
    const tax  = Number(item.tax_rate ?? 0);
    const line = qty * rate;
    subtotal  += line;
    taxTotal  += line * tax / 100;
  }
  return { subtotal, taxTotal, grandTotal: subtotal + taxTotal };
}

function buildPOItemData(item, poId) {
  const qty  = Number(item.ordered_quantity ?? item.quantity ?? 0);
  const rate = Number(item.unit_cost ?? item.unit_rate ?? item.rate ?? 0);
  const tax  = Number(item.tax_rate ?? 0);
  const lineSub = qty * rate;
  const lineTax = lineSub * tax / 100;
  return {
    purchase_order_id: poId,
    inventory_item_id: item.inventory_item_id || null,
    item_name:         String(item.item_name ?? item.name ?? ''),
    category:          item.category || null,
    ordered_quantity:  qty,
    unit:              item.unit || 'kg',
    unit_cost:         rate,
    tax_rate:          tax,
    tax_amount:        lineTax,
    total_cost:        lineSub + lineTax,
    hsn_code:          item.hsn_code || null,
    notes:             item.notes || null,
  };
}

// ─── SUPPLIERS ───────────────────────────────────────────

async function listSuppliers(outletId, query = {}) {
  const prisma = getDbClient();
  const where = { outlet_id: outletId, is_deleted: false };
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { contact_person: { contains: query.search, mode: 'insensitive' } },
      { phone: { contains: query.search } },
    ];
  }
  return prisma.supplier.findMany({ where, orderBy: { name: 'asc' } });
}

async function createSupplier(outletId, data) {
  return getDbClient().supplier.create({
    data: {
      outlet_id: outletId, name: data.name,
      contact_person: data.contact_person, phone: data.phone,
      email: data.email, address: data.address,
      gstin: data.gstin, pan: data.pan, payment_terms: data.payment_terms,
    },
  });
}

async function updateSupplier(id, outletId, data) {
  const prisma = getDbClient();
  const s = await prisma.supplier.findFirst({ where: { id, outlet_id: outletId, is_deleted: false } });
  if (!s) throw new NotFoundError('Supplier not found');
  const { outlet_id: _oid, id: _id, ...rest } = data;
  return prisma.supplier.update({ where: { id }, data: rest });
}

// ─── ITEM PRESETS ─────────────────────────────────────────

async function listItemPresets(outletId, query = {}) {
  const prisma = getDbClient();
  const where = { outlet_id: outletId, is_deleted: false, is_active: true };
  if (query.category) where.category = query.category;
  if (query.search)   where.name = { contains: query.search, mode: 'insensitive' };

  const count = await prisma.itemPreset.count({ where: { outlet_id: outletId, is_deleted: false } });
  if (count === 0) {
    await prisma.itemPreset.createMany({
      data: DEFAULT_PRESETS.map(p => ({ outlet_id: outletId, ...p })),
      skipDuplicates: true,
    });
  }

  return prisma.itemPreset.findMany({
    where,
    orderBy: [{ use_count: 'desc' }, { name: 'asc' }],
    include: { preferred_supplier: { select: { id: true, name: true } } },
  });
}

async function createItemPreset(outletId, data) {
  return getDbClient().itemPreset.create({
    data: {
      outlet_id: outletId, name: data.name, category: data.category,
      default_quantity: data.default_quantity || 1, unit: data.unit || 'kg',
      default_rate: data.default_rate || 0, sku: data.sku,
      hsn_code: data.hsn_code, tax_rate: data.tax_rate || 0,
      notes: data.notes, preferred_supplier_id: data.preferred_supplier_id || null,
    },
  });
}

async function updateItemPreset(id, outletId, data) {
  const prisma = getDbClient();
  const p = await prisma.itemPreset.findFirst({ where: { id, outlet_id: outletId, is_deleted: false } });
  if (!p) throw new NotFoundError('Item preset not found');
  const { outlet_id: _o, id: _i, ...rest } = data;
  return prisma.itemPreset.update({ where: { id }, data: rest });
}

async function deleteItemPreset(id, outletId) {
  const prisma = getDbClient();
  const p = await prisma.itemPreset.findFirst({ where: { id, outlet_id: outletId } });
  if (!p) throw new NotFoundError('Item preset not found');
  return prisma.itemPreset.update({ where: { id }, data: { is_deleted: true } });
}

// ─── PURCHASE ORDERS ─────────────────────────────────────

async function listPurchaseOrders(outletId, query = {}) {
  const prisma = getDbClient();
  const { offset, limit } = parsePagination(query);
  const where = { outlet_id: outletId, is_deleted: false };
  if (query.status)      where.status      = query.status;
  if (query.supplier_id) where.supplier_id = query.supplier_id;

  const [items, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where, skip: offset, take: limit,
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        _count: { select: { po_items: true } },
      },
      orderBy: { created_at: 'desc' },
    }),
    prisma.purchaseOrder.count({ where }),
  ]);
  return { items, total };
}

async function getPurchaseOrder(id, outletId) {
  const prisma = getDbClient();
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, outlet_id: outletId, is_deleted: false },
    include: {
      supplier: true,
      outlet: {
        select: {
          id: true, name: true, address_line1: true, address_line2: true,
          city: true, state: true, pincode: true, phone: true, email: true,
          gstin: true, fssai_number: true, logo_url: true,
        },
      },
      po_items: { where: { is_deleted: false }, orderBy: { created_at: 'asc' } },
      whatsapp_logs: { orderBy: { created_at: 'desc' }, take: 5 },
    },
  });
  if (!po) throw new NotFoundError('Purchase Order not found');
  return po;
}

async function createPurchaseOrder(outletId, data, userId) {
  const prisma = getDbClient();
  if (!data.supplier_id)             throw new BadRequestError('Supplier is required');
  if (!data.items || !data.items.length) throw new BadRequestError('Add at least one item');

  const { subtotal, taxTotal, grandTotal } = calcTotals(data.items);
  const discount = Number(data.discount_amount || 0);
  const poNumber = generatePONumber();

  const po = await prisma.purchaseOrder.create({
    data: {
      outlet_id: outletId, supplier_id: data.supplier_id,
      po_number: poNumber, status: data.status || 'draft',
      reference_number: data.reference_number || null,
      notes: data.notes || null, terms: data.terms || null,
      expected_date: data.expected_date ? new Date(data.expected_date) : null,
      delivery_date: data.delivery_date ? new Date(data.delivery_date) : null,
      total_amount: subtotal, tax_amount: taxTotal,
      discount_amount: discount, grand_total: grandTotal - discount,
      created_by: userId,
      po_items: {
        create: data.items.map(item => {
          const qty  = Number(item.ordered_quantity ?? item.quantity ?? 0);
          const rate = Number(item.unit_cost ?? item.unit_rate ?? item.rate ?? 0);
          const tax  = Number(item.tax_rate ?? 0);
          const lineSub = qty * rate;
          const lineTax = lineSub * tax / 100;
          return {
            inventory_item_id: item.inventory_item_id || null,
            item_name:  String(item.item_name ?? item.name ?? ''),
            category:   item.category || null,
            ordered_quantity: qty, unit: item.unit || 'kg',
            unit_cost: rate, tax_rate: tax,
            tax_amount: lineTax, total_cost: lineSub + lineTax,
            hsn_code: item.hsn_code || null, notes: item.notes || null,
          };
        }),
      },
    },
    include: {
      supplier: true,
      outlet: { select: { id: true, name: true, address_line1: true, city: true, state: true, pincode: true, phone: true, email: true, gstin: true, fssai_number: true, logo_url: true } },
      po_items: { where: { is_deleted: false } },
    },
  });

  // bump preset usage counts
  if (data.preset_ids?.length) {
    await prisma.itemPreset.updateMany({
      where: { id: { in: data.preset_ids }, outlet_id: outletId },
      data: { use_count: { increment: 1 } },
    });
  }

  logger.info('PO created', { poNumber, outletId, items: data.items.length });
  return po;
}

async function updatePurchaseOrder(id, outletId, data) {
  const prisma = getDbClient();
  const po = await prisma.purchaseOrder.findFirst({ where: { id, outlet_id: outletId, is_deleted: false } });
  if (!po) throw new NotFoundError('Purchase Order not found');
  if (po.status === 'received') throw new BadRequestError('Cannot edit a received PO');

  const upd = {};
  const scalar = ['notes','terms','reference_number','status','supplier_id'];
  scalar.forEach(k => { if (data[k] !== undefined) upd[k] = data[k]; });
  if (data.expected_date !== undefined) upd.expected_date = data.expected_date ? new Date(data.expected_date) : null;
  if (data.delivery_date !== undefined) upd.delivery_date = data.delivery_date ? new Date(data.delivery_date) : null;

  if (data.items?.length) {
    const { subtotal, taxTotal, grandTotal } = calcTotals(data.items);
    const discount = Number(data.discount_amount ?? po.discount_amount ?? 0);
    upd.total_amount = subtotal; upd.tax_amount = taxTotal;
    upd.discount_amount = discount; upd.grand_total = grandTotal - discount;

    await prisma.pOItem.updateMany({ where: { purchase_order_id: id }, data: { is_deleted: true } });
    await prisma.pOItem.createMany({ data: data.items.map(item => buildPOItemData(item, id)) });
  }

  return prisma.purchaseOrder.update({
    where: { id }, data: upd,
    include: { supplier: true, po_items: { where: { is_deleted: false } } },
  });
}

async function approvePurchaseOrder(id, outletId, userId) {
  const prisma = getDbClient();
  const po = await prisma.purchaseOrder.findFirst({ where: { id, outlet_id: outletId, is_deleted: false } });
  if (!po) throw new NotFoundError('Purchase Order not found');
  return prisma.purchaseOrder.update({
    where: { id },
    data: { status: 'approved', approved_at: new Date(), approved_by: userId },
  });
}

async function deletePurchaseOrder(id, outletId) {
  const prisma = getDbClient();
  const po = await prisma.purchaseOrder.findFirst({ where: { id, outlet_id: outletId, is_deleted: false } });
  if (!po) throw new NotFoundError('Purchase Order not found');
  if (po.status === 'received') throw new BadRequestError('Cannot delete a received PO');
  return prisma.purchaseOrder.update({ where: { id }, data: { is_deleted: true } });
}

// ─── PDF ─────────────────────────────────────────────────

async function generateAndSavePdf(id, outletId) {
  const po = await getPurchaseOrder(id, outletId);
  const filePath = await generatePOPdf(po);
  const relativePath = `/uploads/purchase-orders/${path.basename(filePath)}`;
  await getDbClient().purchaseOrder.update({ where: { id }, data: { pdf_path: relativePath } });
  return { filePath, relativePath };
}

// ─── WHATSAPP ─────────────────────────────────────────────

const WA_URL    = process.env.WHATSAPP_API_URL  || 'https://graph.facebook.com/v18.0';
const WA_TOKEN  = process.env.WHATSAPP_TOKEN    || '';
const WA_PHONE  = process.env.WHATSAPP_PHONE_ID || '';
const BASE_URL  = process.env.APP_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'https://petpooja-saas.onrender.com';

async function sendPOWhatsApp(id, outletId, phone, message) {
  const prisma = getDbClient();
  const po = await getPurchaseOrder(id, outletId);

  let pdfPath = po.pdf_path;
  if (!pdfPath) {
    const r = await generateAndSavePdf(id, outletId);
    pdfPath = r.relativePath;
  }

  const pdfUrl  = `${BASE_URL}${pdfPath}`;
  const waPhone = phone.replace(/\D/g, '').replace(/^0/, '');
  const fullPhone = waPhone.startsWith('91') ? waPhone : `91${waPhone}`;

  const text = message || `Hello!\nPurchase Order *${po.po_number}* from *${po.outlet?.name || 'Restaurant'}*.\nGrand Total: *₹${Number(po.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}*\nDelivery by: ${po.expected_date ? new Date(po.expected_date).toLocaleDateString('en-IN') : 'TBD'}\n\nPDF: ${pdfUrl}\n\nKindly confirm receipt. Thank you! 🙏`;

  let waMessageId = null;
  let status = 'sent';
  let error  = null;
  let waLink = null;

  if (WA_TOKEN && WA_PHONE) {
    try {
      const resp = await fetch(`${WA_URL}/${WA_PHONE}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WA_TOKEN}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: fullPhone, type: 'document',
          document: { link: pdfUrl, caption: text, filename: `${po.po_number}.pdf` },
        }),
      });
      const result = await resp.json();
      if (result.error) throw new Error(result.error.message || 'Meta API error');
      waMessageId = result.messages?.[0]?.id || null;
      logger.info('PO WhatsApp sent', { po_id: id, waMessageId });
    } catch (err) {
      status = 'failed'; error = err.message;
      logger.error('WhatsApp send failed', { error: err.message });
    }
  } else {
    status = 'link_generated';
    waLink = `https://wa.me/${fullPhone}?text=${encodeURIComponent(text)}`;
    logger.info('[DEV] WhatsApp fallback link generated', { po_id: id });
  }

  await prisma.whatsAppSendLog.create({
    data: { outlet_id: outletId, po_id: id, phone: fullPhone, message: text, status, wa_message_id: waMessageId, error },
  });

  if ((status === 'sent' || status === 'link_generated') && po.status === 'approved') {
    await prisma.purchaseOrder.update({ where: { id }, data: { status: 'sent', sent_at: new Date() } });
  }

  return { status, waMessageId, pdfUrl, waLink, message: text };
}

// ─── GRN ─────────────────────────────────────────────────

async function receivePurchaseOrder(outletId, poId, data, userId) {
  const prisma = getDbClient();
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findFirst({ where: { id: poId, outlet_id: outletId }, include: { po_items: true } });
    if (!po) throw new NotFoundError('Purchase Order not found');
    if (po.status === 'received') throw new BadRequestError('PO already received');

    const grnNumber = `GRN-${Date.now().toString().slice(-6)}`;
    const grn = await tx.goodsReceivedNote.create({
      data: {
        outlet_id: outletId, purchase_order_id: poId,
        grn_number: grnNumber, received_by: userId, notes: data.notes,
        grn_items: {
          create: data.items.map(item => ({
            inventory_item_id: item.inventory_item_id,
            received_quantity: item.quantity,
            unit_cost: item.unit_cost,
            quality_status: item.quality_status || 'accepted',
          })),
        },
      },
    });

    for (const item of data.items) {
      if (!item.inventory_item_id) continue;
      await tx.inventoryStock.upsert({
        where: { outlet_id_inventory_item_id: { outlet_id: outletId, inventory_item_id: item.inventory_item_id } },
        create: { outlet_id: outletId, inventory_item_id: item.inventory_item_id, current_stock: item.quantity },
        update: { current_stock: { increment: item.quantity } },
      });
      await tx.stockTransaction.create({
        data: {
          outlet_id: outletId, inventory_item_id: item.inventory_item_id,
          transaction_type: 'receipt', quantity: item.quantity, unit_cost: item.unit_cost,
          reference_type: 'grn', reference_id: grn.id, performed_by: userId,
        },
      });
    }
    await tx.purchaseOrder.update({ where: { id: poId }, data: { status: 'received' } });
    return grn;
  });
}

module.exports = {
  listSuppliers, createSupplier, updateSupplier,
  listItemPresets, createItemPreset, updateItemPreset, deleteItemPreset,
  listPurchaseOrders, getPurchaseOrder, createPurchaseOrder,
  updatePurchaseOrder, approvePurchaseOrder, deletePurchaseOrder,
  generateAndSavePdf, sendPOWhatsApp, receivePurchaseOrder,
};
