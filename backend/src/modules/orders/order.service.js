/**
 * @fileoverview Order service — creates orders, manages items, generates KOTs, processes payments.
 * Region-aware tax engine: AU 10% GST inclusive, IN multi-slab GST exclusive.
 * @module modules/orders/order.service
 */

const { getDbClient } = require('../../config/database');
const { getIO } = require('../../socket/index');
const logger = require('../../config/logger');
const { NotFoundError, BadRequestError, ForbiddenError, ConflictError } = require('../../utils/errors');
const { generateOrderNumber, parsePagination, getFinancialYear, generateInvoiceNumber: formatInvoiceNumber } = require('../../utils/helpers');
const { calculateItemTax } = require('./tax.service');
const { round2 } = require('../../utils/money');
const { resolveOutletTaxConfig } = require('../../utils/outlet');
const { buildOrderItems, computeOrderTotals, computeGrandTotal } = require('./pricing.service');
const customerService = require('../customers/customer.service');
const { sendOrderReadySms } = require('../../utils/sms.service');
const autoFreeService = require('./autofree.service');

/**
 * Fetch the tax configuration for an outlet by reading its HeadOffice settings.
 * Returns the outletConfig shape expected by calculateItemTax.
 * @param {object} prismaClient - Prisma client (or transaction)
 * @param {string} outletId - Outlet UUID
 * @returns {Promise<{country_code: string, gst_inclusive: boolean, state: string, currency: string}>}
 */
async function getOutletTaxConfig(prismaClient, outletId) {
  const outlet = await prismaClient.outlet.findFirst({
    where: { id: outletId, is_deleted: false },
    select: { state: true, country: true, currency: true, head_office: { select: { country_code: true, region: true, gst_inclusive: true, currency: true } } },
  });
  if (!outlet) return { country_code: 'IN', gst_inclusive: false, state: '', currency: 'INR', default_gst_rate: 5 };

  // Detect country from EVERY available signal so the backend never disagrees with the
  // frontend (which keys off head_office.region). Self-signup historically set region but
  // left country_code null — without region here the backend would treat an AU outlet as
  // exclusive and add GST on top, while the UI showed inclusive prices. Any AU signal wins.
  const hoCountry = outlet.head_office?.country_code;
  const isAU = hoCountry === 'AU' || outlet.head_office?.region === 'AU'
    || outlet.currency === 'AUD' || outlet.head_office?.currency === 'AUD'
    || outlet.country === 'Australia';
  // ANY AU signal must win — a head office mis-seeded with country_code='IN' was
  // overriding a genuinely Australian outlet (currency AUD, country Australia),
  // producing CGST/SGST 5% splits on AU bills instead of a single 10% GST.
  const countryCode = isAU ? 'AU' : (hoCountry || 'IN');
  // AU GST is inclusive by law — always true for AU regardless of DB default
  // (Prisma defaults gst_inclusive to false; ?? won't override false, only null/undefined)
  const gstInclusive = isAU ? true : (outlet.head_office?.gst_inclusive ?? false);
  const currency = outlet.head_office?.currency || outlet.currency || 'INR';
  // Default GST rate to apply when a menu item has no gst_rate configured (0 or null)
  // AU: 10% mandatory, IN: 5% restaurant food (standard slab)
  const defaultGstRate = countryCode === 'AU' ? 10 : 5;

  return {
    country_code: countryCode,
    gst_inclusive: gstInclusive,
    state: outlet.state || '',
    currency,
    default_gst_rate: defaultGstRate,
  };
}

// computeGrandTotal is imported from ./pricing.service (single source of truth,
// reused by both this module and the pure pricing helpers).

/**
 * Atomically allocate the next per-outlet, per-day order sequence.
 *
 * Replaces the racy `prisma.order.count() + 1` that ran OUTSIDE the transaction
 * (concurrent orders collided on daily_sequence). Mirrors the atomic upsert
 * pattern used by generateInvoiceNumber. MUST be called inside the order
 * transaction so the increment and the order insert commit together.
 *
 * Falls back to the legacy count()+1 if the counter table is unavailable (e.g.
 * before the migration is applied), so nothing breaks pre-migration.
 *
 * @param {object} tx - Prisma transaction client
 * @param {string} outletId - Outlet UUID
 * @param {Date} [now=new Date()] - Reference time (its UTC date keys the counter)
 * @returns {Promise<number>} Next daily sequence (>= 1)
 */
async function nextDailySequence(tx, outletId, now = new Date()) {
  // Key on the UTC date so it matches generateOrderNumber's date component.
  const day = now.toISOString().slice(0, 10);
  // UTC day bounds → index-friendly range scan on orders(outlet_id, created_at),
  // and identical bucketing to order_number's UTC date component.
  const startMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayStart = new Date(startMs).toISOString();
  const dayEnd = new Date(startMs + 86400000).toISOString();
  try {
    // Atomically allocate the next sequence, FLOORED at today's true high-water
    // mark. order_number is derived deterministically from this value
    // (`${code}-${YYYYMMDD}-${seq}`) and is globally @unique, so a blind counter+1
    // re-emits an existing order_number — and the duplicate-key error rolls back
    // the whole order tx, reverting the increment and wedging the counter forever
    // — whenever the counter lags the real max (e.g. it was seeded from COUNT()
    // while soft-deleted/cancelled orders left gaps). GREATEST(counter+1,
    // MAX(daily_sequence)+1, COUNT(*)+1) can never return an already-used seq, so
    // a lagging counter self-heals on the next order instead of erroring forever.
    // The `counter.seq + 1` term is the race-safe primary (serialized by the row
    // lock on ON CONFLICT); the floor CTE is the self-heal for a stale counter.
    const rows = await tx.$queryRawUnsafe(
      `WITH floor AS (
         SELECT GREATEST(COALESCE(MAX(daily_sequence), 0), COUNT(*)) + 1 AS n
         FROM orders
         WHERE outlet_id = $1::uuid
           AND created_at >= $3::timestamptz AND created_at < $4::timestamptz
       )
       INSERT INTO outlet_daily_counters (outlet_id, day, seq)
       SELECT $1::uuid, $2, GREATEST(1, floor.n) FROM floor
       ON CONFLICT (outlet_id, day) DO UPDATE
         SET seq = GREATEST(outlet_daily_counters.seq + 1, EXCLUDED.seq)
       RETURNING seq`,
      outletId, day, dayStart, dayEnd,
    );
    return Number(rows[0].seq);
  } catch (err) {
    // Last-resort fallback (counter table genuinely unavailable). Use the
    // MAX(daily_sequence)/COUNT high-water mark — NOT the legacy count()+1, which
    // under-counted when soft-deleted orders left gaps and produced the duplicate
    // order_number in the first place. Non-transactional client: a failed upsert
    // above marks `tx` aborted, so any further `tx` query would itself error.
    logger.warn('OutletDailyCounter upsert failed — falling back to MAX(daily_sequence)+1', { error: err.message });
    const prisma = getDbClient();
    const rows = await prisma.$queryRawUnsafe(
      `SELECT GREATEST(COALESCE(MAX(daily_sequence), 0), COUNT(*)) + 1 AS n
       FROM orders
       WHERE outlet_id = $1::uuid
         AND created_at >= $2::timestamptz AND created_at < $3::timestamptz`,
      outletId, dayStart, dayEnd,
    );
    return Number(rows[0].n);
  }
}

/**
 * Build the socket payload broadcast to the /kitchen namespace for a new KOT.
 * Shared by generateKOT and punchKOT so both emit byte-identical shapes.
 *
 * @param {object} kot - Created KOT row (id, kot_number, station)
 * @param {object} order - { outlet_id, id, order_number, order_type, table_id }
 * @param {Array} items - The KOT's items (name, variant_name, quantity, notes, addons)
 * @returns {object} Socket payload for the 'new_kot' event
 */
function buildKotSocketPayload(kot, order, items) {
  return {
    id: kot.id,
    kot_number: kot.kot_number,
    station: kot.station,
    status: 'pending',
    outlet_id: order.outlet_id,
    order_id: order.id,
    order_number: order.order_number,
    order_type: order.order_type,
    table_id: order.table_id,
    items_count: items.length,
    kot_items: items.map((item) => ({
      order_item: {
        name: item.name,
        variant_name: item.variant_name,
        quantity: item.quantity,
        notes: item.notes,
        addons: item.addons?.map((a) => ({ name: a.name })) || [],
      },
    })),
  };
}

/**
 * Recalculate tax totals for all items on an order using the proper tax engine.
 * Used by addItemsToOrder and mergeOrder.
 * @param {object} tx - Prisma transaction client
 * @param {string} orderId - Order UUID
 * @param {object} taxConfig - From getOutletTaxConfig
 * @returns {Promise<{subtotal:number, cgst:number, sgst:number, igst:number, totalTax:number, totalAmount:number, grandTotal:number, roundOff:number}>}
 */
async function recalcOrderTotals(tx, orderId, taxConfig) {
  const allItems = await tx.orderItem.findMany({
    where: { order_id: orderId, is_deleted: false },
  });

  let subtotalPaise = 0;
  let totalCgstPaise = 0;
  let totalSgstPaise = 0;
  let totalIgstPaise = 0;
  let totalTaxPaise = 0;

  for (const oi of allItems) {
    const itemTotal = Number(oi.item_total);
    subtotalPaise += Math.round(itemTotal * 100);

    // AU GST is a uniform 10% — never let an Indian per-item slab (e.g. a menu
    // item seeded with gst_rate=5) leak into an Australian bill.
    const gstRate = taxConfig.country_code === 'AU'
      ? (taxConfig.default_gst_rate || 10)
      : (Number(oi.gst_rate) || taxConfig.default_gst_rate || 0);
    const tax = calculateItemTax(
      { base_price: itemTotal / Number(oi.quantity), quantity: Number(oi.quantity), gst_rate: gstRate, is_inclusive: taxConfig.gst_inclusive },
      { country_code: taxConfig.country_code, state: taxConfig.state }
    );

    totalCgstPaise += Math.round(tax.cgst * 100);
    totalSgstPaise += Math.round(tax.sgst * 100);
    totalIgstPaise += Math.round(tax.igst * 100);
    totalTaxPaise += Math.round(tax.total_tax * 100);
  }

  const subtotal = subtotalPaise / 100;
  const totalCgst = totalCgstPaise / 100;
  const totalSgst = totalSgstPaise / 100;
  const totalIgst = totalIgstPaise / 100;
  const totalTax = totalTaxPaise / 100;

  let totalAmount;
  if (taxConfig.gst_inclusive) {
    // Price already includes tax — total is just the subtotal
    totalAmount = subtotal;
  } else {
    totalAmount = subtotal + totalTax;
  }

  const { grandTotal, roundOff } = computeGrandTotal(totalAmount, taxConfig.country_code);

  return { subtotal, cgst: totalCgst, sgst: totalSgst, igst: totalIgst, totalTax, totalAmount, grandTotal, roundOff };
}

/**
 * Generates the next invoice number for an outlet by incrementing its sequence.
 * @param {object} tx - Prisma transaction client
 * @param {string} outletId - Outlet UUID
 * @returns {Promise<string>} Formatted invoice number
 */
async function generateInvoiceNumber(tx, outletId) {
  const fy = getFinancialYear();
  const sequence = await tx.invoiceSequence.upsert({
    where: { outlet_id_financial_year: { outlet_id: outletId, financial_year: fy } },
    update: { last_sequence: { increment: 1 } },
    create: { outlet_id: outletId, financial_year: fy, last_sequence: 1 },
  });

  const outlet = await tx.outlet.findUnique({ where: { id: outletId }, select: { code: true } });
  return formatInvoiceNumber(fy, outlet.code, sequence.last_sequence);
}

/**
 * Creates a new order with items, calculates totals and taxes.
 * @param {object} data - Order data including items array
 * @param {string} staffId - Staff user ID creating the order
 * @returns {Promise<object>} Complete order with items and totals
 */
async function createOrder(data, staffId) {
  const prisma = getDbClient();

  try {
    const outlet = await prisma.outlet.findFirst({
      where: { id: data.outlet_id, is_deleted: false, is_active: true },
      include: { head_office: { select: { country_code: true, region: true, gst_inclusive: true, currency: true } } },
    });
    if (!outlet) throw new NotFoundError('Outlet not found or inactive');

    // Tax config for this outlet (shared detection — see utils/outlet)
    const outletTaxConfig = resolveOutletTaxConfig(outlet);
    const { country_code: countryCode, gst_inclusive: gstInclusive } = outletTaxConfig;

    if (data.table_id) {
      const table = await prisma.table.findFirst({
        where: { id: data.table_id, outlet_id: data.outlet_id, is_deleted: false },
      });
      if (!table) throw new NotFoundError('Table not found');
      if (table.status === 'occupied' && table.current_order_id) {
        throw new BadRequestError('Table is already occupied. Use add items to existing order.');
      }
    } else if ((data.order_type || 'dine_in') === 'dine_in') {
      // Table is mandatory for dine-in orders only when the outlet enables it.
      const setting = await prisma.outletSetting.findFirst({
        where: { outlet_id: data.outlet_id, setting_key: 'require_table_for_dine_in' },
        select: { setting_value: true },
      });
      const requireTable = setting?.setting_value === 'true';
      if (requireTable) {
        throw new BadRequestError('Please select a table before placing a dine-in order.');
      }
    }

    const menuItemIds = data.items.map((i) => i.menu_item_id);
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, outlet_id: data.outlet_id, is_deleted: false },
      include: { variants: { where: { is_deleted: false } }, addons: { where: { is_deleted: false } } },
    });
    const menuItemMap = new Map(menuItems.map((mi) => [mi.id, mi]));

    // Build items + per-item tax (shared pure pricing engine).
    // Pass customer_state for inter-state detection (IN only).
    const taxCfg = { ...outletTaxConfig, customer_state: data.delivery_address_state || '' };
    const { orderItemsData, subtotal, tax } = buildOrderItems(data.items, menuItemMap, taxCfg);

    // Cart-level discount the POS attaches to the order (BOGO / manager / coupon).
    // Resolve the money amount, clamp to subtotal (never negative total), then
    // recompute per-item tax on the discounted base so GST is charged post-discount
    // — identical semantics to the apply-discount controller path.
    let discountAmount = 0;
    if (data.discount_type === 'percentage') {
      discountAmount = subtotal * (Math.min(Number(data.discount_value) || 0, 100) / 100);
    } else if (data.discount_type === 'flat') {
      discountAmount = Number(data.discount_value) || 0;
    }
    discountAmount = round2(Math.min(Math.max(discountAmount, 0), subtotal));

    let totalCgst, totalSgst, totalIgst, totalTax, totalAmount, grandTotal, roundOff;
    if (discountAmount > 0) {
      // Proportional factor across items so tax follows the discounted base.
      const factor = subtotal > 0 ? Math.max(subtotal - discountAmount, 0) / subtotal : 0;
      let cgstPaise = 0, sgstPaise = 0, igstPaise = 0, totalTaxPaise = 0;
      for (const oi of orderItemsData) {
        const qty = Number(oi.quantity) || 1;
        const discountedUnitBase = (Number(oi.item_total) * factor) / qty;
        // AU: uniform 10% — coerce stored Indian per-item slabs (see recalcOrderTotals)
        const rate = taxCfg.country_code === 'AU'
          ? (taxCfg.default_gst_rate || 10)
          : oi.gst_rate;
        const t = calculateItemTax(
          { base_price: discountedUnitBase, quantity: qty, gst_rate: rate, is_inclusive: taxCfg.gst_inclusive },
          taxCfg
        );
        cgstPaise += Math.round(t.cgst * 100);
        sgstPaise += Math.round(t.sgst * 100);
        igstPaise += Math.round(t.igst * 100);
        totalTaxPaise += Math.round(t.total_tax * 100);
      }
      totalCgst = cgstPaise / 100;
      totalSgst = sgstPaise / 100;
      totalIgst = igstPaise / 100;
      totalTax = totalTaxPaise / 100;
      const discountedSubtotal = round2(Math.max(subtotal - discountAmount, 0));
      totalAmount = taxCfg.gst_inclusive ? discountedSubtotal : round2(discountedSubtotal + totalTax);
      ({ grandTotal, roundOff } = computeGrandTotal(totalAmount, countryCode));
    } else {
      ({ cgst: totalCgst, sgst: totalSgst, igst: totalIgst, totalTax, totalAmount, grandTotal, roundOff } =
        computeOrderTotals(subtotal, taxCfg, countryCode, tax));
    }

    let orderNumber;
    const order = await prisma.$transaction(async (tx) => {
      // Atomic per-outlet/day sequence (race-safe — runs inside the tx).
      const dailySequence = await nextDailySequence(tx, data.outlet_id);
      orderNumber = generateOrderNumber(outlet.code, dailySequence);

      const newOrder = await tx.order.create({
        data: {
          outlet_id: data.outlet_id,
          order_number: orderNumber,
          order_type: data.order_type || 'dine_in',
          status: data.status || 'created',
          table_id: data.table_id || null,
          customer_id: data.customer_id || null,
          staff_id: staffId,
          subtotal,
          taxable_amount: round2(Math.max(subtotal - discountAmount, 0)),
          discount_amount: discountAmount,
          ...(discountAmount > 0 ? {
            discount_type: data.discount_type,
            discount_value: Number(data.discount_value) || 0,
            discount_reason: data.discount_reason || null,
          } : {}),
          cgst: round2(totalCgst),
          sgst: round2(totalSgst),
          igst: round2(totalIgst),
          total_tax: round2(totalTax),
          total_amount: round2(totalAmount),
          round_off: round2(roundOff),
          grand_total: grandTotal,
          source: data.source || 'pos',
          notes: data.notes || null,
          daily_sequence: dailySequence,
        },
      });

      // Items must be created individually to map addons to their new ids;
      // all addon rows are then flushed in a single createMany.
      const allAddonRows = [];
      for (const oi of orderItemsData) {
        const createdItem = await tx.orderItem.create({
          data: {
            order_id: newOrder.id,
            menu_item_id: oi.menu_item_id,
            variant_id: oi.variant_id,
            name: oi.name,
            variant_name: oi.variant_name,
            quantity: oi.quantity,
            unit_price: oi.unit_price,
            variant_price: oi.variant_price,
            addons_total: oi.addons_total,
            item_total: oi.item_total,
            gst_rate: oi.gst_rate,
            item_tax: oi.item_tax,
            kitchen_station: oi.kitchen_station,
            notes: oi.notes,
          },
        });

        if (oi.addons.length > 0) {
          for (const a of oi.addons) allAddonRows.push({ ...a, order_item_id: createdItem.id });
        }
      }
      if (allAddonRows.length > 0) {
        await tx.orderItemAddon.createMany({ data: allAddonRows });
      }

      await tx.orderStatusHistory.create({
        data: { order_id: newOrder.id, from_status: null, to_status: data.status || 'created', changed_by: staffId },
      });

      // Dine-in table seize INSIDE the transaction so two concurrent orders
      // cannot grab the same table (M7). The conditional updateMany only matches
      // while the table is still free; count === 0 means a concurrent order won
      // the race, so the losing order throws and the whole transaction rolls back.
      if (data.table_id) {
        const seized = await tx.table.updateMany({
          where: { id: data.table_id, current_order_id: null, status: { not: 'occupied' } },
          data: { status: 'occupied', current_order_id: newOrder.id },
        });
        if (seized.count === 0) {
          throw new ConflictError('Table is already occupied. Use add items to existing order.');
        }
      }

      return newOrder;
    }, {
      // Same headroom as punchKOT: a large ticket does one insert per item inside
      // this interactive tx; don't let Prisma's default 5s ceiling abort it → 500.
      maxWait: 8000,
      timeout: 20000,
    });

    // Emit socket in background — don't block the HTTP response
    setImmediate(async () => {
      try {
        if ((data.status || 'created') !== 'pending') {
          const io = getIO();
          if (io) {
            const fullOrder = await getOrderById(order.id);
            io.of('/orders').to(`outlet:${data.outlet_id}`).emit('new_order', fullOrder);
            if (data.table_id) {
              io.of('/orders').to(`outlet:${data.outlet_id}`).emit('table_status_change', {
                table_id: data.table_id, status: 'occupied', order_id: order.id,
              });
            }
          }
        }
      } catch (e) {
        logger.warn('Socket emit failed after createOrder', { error: e.message });
      }
    });

    logger.info('Order created', { orderId: order.id, orderNumber, outlet: outlet.code });
    // Return just the fields callers actually need — skips the expensive getOrderById JOIN
    return {
      id: order.id,
      order_number: orderNumber,
      grand_total: grandTotal,
      subtotal,
      total_tax: totalTax,
      status: data.status || 'created',
      outlet_id: data.outlet_id,
      table_id: data.table_id || null,
    };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof BadRequestError || error instanceof ConflictError) throw error;
    logger.error('Create order failed', { error: error.message });
    throw error;
  }
}

/**
 * Retrieves a full order with all items, addons, status history, and payments.
 * @param {string} orderId - Order UUID
 * @param {string} [outletId] - Optional outlet UUID for scoped access (non-super_admin callers)
 * @returns {Promise<object>} Complete order object
 */
async function getOrderById(orderId, outletId = null) {
  const prisma = getDbClient();
  try {
    const where = { id: orderId, is_deleted: false };
    if (outletId) where.outlet_id = outletId;
    const order = await prisma.order.findFirst({
      where,
      include: {
        // Full header fields so a receipt/bill rendered from this order carries the
        // outlet's address, contact and tax IDs (GSTIN for IN, ABN for AU) — not just
        // the name. Used by the Order History "Print Receipt" flow and POS bill print.
        outlet: { select: {
          id: true, name: true, code: true, gstin: true, currency: true,
          address_line1: true, address_line2: true, city: true, state: true, pincode: true,
          phone: true, email: true, fssai_number: true, abn: true, acn: true,
          bill_header: true, bill_footer: true,
        } },
        table: { select: { id: true, table_number: true } },
        customer: { select: { id: true, full_name: true, phone: true } },
        staff: { select: { id: true, full_name: true } },
        order_items: {
          where: { is_deleted: false },
          include: { addons: true, variant: { select: { name: true } } },
          orderBy: { created_at: 'asc' },
        },
        status_history: { orderBy: { created_at: 'asc' } },
        kots: { include: { kot_items: true }, orderBy: { created_at: 'asc' } },
        payments: { where: { is_deleted: false } },
      },
    });
    if (!order) throw new NotFoundError('Order not found');
    return order;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}

/**
 * Lists orders with filtering and pagination.
 * @param {string} outletId - Outlet UUID
 * @param {object} query - Filter params
 * @returns {Promise<{orders: object[], total: number, page: number, limit: number}>}
 */
async function listOrders(outletId, query = {}) {
  const prisma = getDbClient();
  try {
    const { page, limit, offset, sort: rawSort, order: sortOrder } = parsePagination(query);
    const ALLOWED_SORTS = ['created_at', 'grand_total', 'status', 'order_number', 'updated_at', 'order_type'];
    const sort = ALLOWED_SORTS.includes(rawSort) ? rawSort : 'created_at';
    const where = { outlet_id: outletId, is_deleted: false };

    if (query.status) {
      if (typeof query.status === 'string' && query.status.includes(',')) {
        where.status = { in: query.status.split(',') };
      } else {
        where.status = query.status;
      }
    }
    // "Active" orders for the Live Orders screen: every order still in play — dine-in,
    // takeaway or delivery, paid or not — that isn't fully done. The trigger that removes
    // an order from this list depends on the order type:
    //   • Takeaway / delivery → leaves when the KITCHEN hands it over (all KOTs
    //     served/completed), regardless of payment. Collecting payment must NOT clear it;
    //     money owed is tracked separately in Collect Payments / open bills. A prepaid
    //     takeaway therefore stays here until the kitchen serves/pickup is done.
    //   • Dine-in (and anything else) → the table/tab stays active until it's BOTH settled
    //     (paid) AND the kitchen work is finished, so a served-but-unpaid table doesn't vanish.
    if (query.running === 'true' || query.running === true) {
      // 'completed' and 'refunded' are TERMINAL (order finished / closed). Exclude them up
      // front so a finished-but-unpaid order can't leak back in via the is_paid:false leg below.
      where.status = { notIn: ['cancelled', 'voided', 'completed', 'refunded'] };
      const kitchenStillWorking = { kots: { some: { is_deleted: false, status: { notIn: ['served', 'completed'] } } } };
      where.OR = [
        {
          // Takeaway / delivery: payment-independent. Stays while the kitchen still has work,
          // or while it's an open draft not yet sent to the kitchen (no live KOTs, unpaid).
          order_type: { in: ['takeaway', 'delivery'] },
          OR: [
            kitchenStillWorking,
            { AND: [{ is_paid: false }, { kots: { none: { is_deleted: false } } }] },
          ],
        },
        {
          // Dine-in and any other type: stays until paid AND kitchen-served.
          order_type: { notIn: ['takeaway', 'delivery'] },
          OR: [
            { is_paid: false },
            kitchenStillWorking,
          ],
        },
      ];
    }
    if (query.order_type) where.order_type = query.order_type;
    if (query.source) where.source = query.source;
    if (query.from && query.to) {
      // Date-only strings like '2026-05-08' parse as UTC midnight.
      // Always expand 'to' to end-of-day UTC so the window covers the full day.
      const fromDate = new Date(query.from);
      const toEnd = new Date(query.to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(query.to)) {
        toEnd.setUTCHours(23, 59, 59, 999);
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(query.from)) {
        fromDate.setUTCHours(0, 0, 0, 0);
      }
      where.created_at = { gte: fromDate, lte: toEnd };
    }
    if (query.table_id) where.table_id = query.table_id;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { [sort]: sortOrder },
        include: {
          table: { select: { table_number: true } },
          staff: { select: { full_name: true } },
          customer: { select: { full_name: true, phone: true } },
          payments: { where: { is_deleted: false }, select: { id: true, method: true, amount: true, status: true, processed_at: true } },
          // The card (EnhancedOrderCard) renders the item list and the item/KOT counts, so
          // each list row must carry the live items array AND a kots count — not just an
          // order_items count. Without this the cards showed "0 ITEMS / 0 KOTS" beside a real total.
          order_items: { where: { is_deleted: false }, orderBy: { created_at: 'asc' } },
          // Lightweight kot slice (status only) so we can derive `kitchen_stage` below
          // without bloating the response with kot_items / station / printed_at, etc.
          kots: { where: { is_deleted: false }, select: { status: true } },
          _count: { select: { order_items: true, kots: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    // ── Augment each order with a derived `kitchen_stage` ────────────────────
    // The order.status enum is created → confirmed → ready → billed → paid and
    // has no "served" value (served is a KOT-level status). Without a derived
    // field the Order History jumps from "Ready" straight to "Paid" because
    // we never persist the intermediate "all-KOTs-served" moment.
    // kitchen_stage gives the UI a stable label for that moment:
    //   • paid          → terminal money state wins
    //   • cancelled/voided/refunded → terminal failure states win
    //   • status in (ready, billed) AND every KOT is served/completed
    //                   → 'served' (or 'picked_up' for takeaway/delivery)
    //   • status in (ready, billed) but some KOTs still in flight
    //                   → 'ready'  (kitchen done from cook's view, customer not yet handed)
    //   • status in (confirmed, created)
    //                   → 'confirmed'
    //   • everything else → null (let the UI fall back to order.status)
    const augmented = orders.map(o => {
      const kots = o.kots || [];
      const allKotsServed = kots.length > 0 && kots.every(k => k.status === 'served' || k.status === 'completed');
      let kitchen_stage = null;
      if (o.is_paid) kitchen_stage = 'paid';
      else if (['cancelled', 'voided', 'refunded'].includes(o.status)) kitchen_stage = o.status;
      else if (['ready', 'billed'].includes(o.status)) {
        kitchen_stage = allKotsServed
          ? (['takeaway', 'delivery'].includes(o.order_type) ? 'picked_up' : 'served')
          : 'ready';
      } else if (['confirmed', 'created'].includes(o.status)) {
        kitchen_stage = kots.length > 0 ? 'confirmed' : 'created';
      }
      return { ...o, kitchen_stage };
    });

    return { orders: augmented, total, page, limit };
  } catch (error) {
    logger.error('List orders failed', { error: error.message });
    throw error;
  }
}

/**
 * Adds items to an existing (running) order and recalculates totals.
 * @param {string} orderId - Order UUID
 * @param {Array} items - New items to add
 * @param {string} staffId - Staff ID
 * @param {string} [outletId] - Optional outlet UUID for scoped access (defense-in-depth)
 * @returns {Promise<object>} Updated order
 */
async function addItemsToOrder(orderId, items, staffId, outletId = null) {
  const prisma = getDbClient();
  try {
    const orderWhere = { id: orderId, is_deleted: false };
    if (outletId) orderWhere.outlet_id = outletId;
    const order = await prisma.order.findFirst({
      where: orderWhere,
    });
    if (!order) throw new NotFoundError('Order not found');
    if (['paid', 'cancelled', 'voided', 'refunded'].includes(order.status)) {
      throw new BadRequestError(`Cannot add items to ${order.status} order`);
    }

    const menuItemIds = items.map((i) => i.menu_item_id);
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, outlet_id: order.outlet_id, is_deleted: false },
      include: { variants: { where: { is_deleted: false } }, addons: { where: { is_deleted: false } } },
    });
    const menuItemMap = new Map(menuItems.map((mi) => [mi.id, mi]));

    // Fetch tax config before the transaction so default_gst_rate is available for item creation
    const preTxTaxConfig = await getOutletTaxConfig(prisma, order.outlet_id);

    let addedSubtotal = 0;

    await prisma.$transaction(async (tx) => {
      // NOTE: this loop intentionally differs from buildOrderItems — addItems does
      // not enforce is_available and uses its own error messages. Kept inline to
      // preserve exact behavior. Addon rows are batched into one createMany.
      const allAddonRows = [];
      for (const item of items) {
        const menuItem = menuItemMap.get(item.menu_item_id);
        if (!menuItem) throw new BadRequestError(`Menu item not found: ${item.menu_item_id}`);

        let unitPrice = Number(menuItem.base_price);
        let variantPrice = 0;
        let variantName = null;

        if (item.variant_id) {
          const variant = menuItem.variants.find((v) => v.id === item.variant_id);
          if (!variant) throw new BadRequestError(`Variant not found`);
          variantPrice = Number(variant.price_addition);
          variantName = variant.name;
        }

        let addonsTotal = 0;
        const orderAddons = [];
        if (item.addons && item.addons.length > 0) {
          for (const addonReq of item.addons) {
            const addon = menuItem.addons.find((a) => a.id === addonReq.addon_id);
            if (!addon) throw new BadRequestError(`Addon not found`);
            addonsTotal += Number(addon.price) * (addonReq.quantity || 1);
            orderAddons.push({ addon_id: addon.id, name: addon.name, price: Number(addon.price), quantity: addonReq.quantity || 1 });
          }
        }

        // variantPrice may be negative (smaller size below base); floor effective unit at 0.
        const effectiveUnit = Math.max(0, unitPrice + variantPrice + addonsTotal);
        const itemTotal = effectiveUnit * item.quantity;
        addedSubtotal += itemTotal;

        const createdItem = await tx.orderItem.create({
          data: {
            order_id: orderId, menu_item_id: item.menu_item_id, variant_id: item.variant_id || null,
            name: menuItem.name, variant_name: variantName, quantity: item.quantity,
            unit_price: unitPrice, variant_price: variantPrice, addons_total: addonsTotal,
            item_total: itemTotal, gst_rate: Number(menuItem.gst_rate) || preTxTaxConfig.default_gst_rate || 0,
            kitchen_station: menuItem.kitchen_station, notes: item.notes || null,
          },
        });

        if (orderAddons.length > 0) {
          for (const a of orderAddons) allAddonRows.push({ ...a, order_item_id: createdItem.id });
        }
      }
      if (allAddonRows.length > 0) {
        await tx.orderItemAddon.createMany({ data: allAddonRows });
      }

      // Recalculate full order totals using proper tax engine
      const taxConfig = await getOutletTaxConfig(tx, order.outlet_id);
      const totals = await recalcOrderTotals(tx, orderId, taxConfig);

      await tx.order.update({
        where: { id: orderId },
        data: {
          subtotal: totals.subtotal,
          taxable_amount: totals.subtotal,
          cgst: round2(totals.cgst),
          sgst: round2(totals.sgst),
          igst: round2(totals.igst),
          total_tax: round2(totals.totalTax),
          total_amount: round2(totals.totalAmount),
          round_off: round2(totals.roundOff),
          grand_total: totals.grandTotal,
        },
      });
    });

    return await getOrderById(orderId);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof BadRequestError) throw error;
    throw error;
  }
}

/**
 * Generates KOTs from un-KOT'd items, split by kitchen station.
 * @param {string} orderId - Order UUID
 * @param {string} [outletId] - Optional outlet UUID for scoped access (defense-in-depth)
 * @returns {Promise<object[]>} Array of generated KOT objects
 */
async function generateKOT(orderId, outletId = null) {
  const prisma = getDbClient();
  try {
    const kotWhere = { id: orderId, is_deleted: false };
    if (outletId) kotWhere.outlet_id = outletId;
    const order = await prisma.order.findFirst({
      where: kotWhere,
      include: {
        order_items: { where: { is_kot_sent: false, is_deleted: false }, include: { addons: true } },
        outlet: { select: { id: true, code: true } },
      },
    });
    if (!order) throw new NotFoundError('Order not found');
    if (order.status === 'pending') {
      throw new BadRequestError('Cannot generate KOT for a pending online order. Please accept the order first.');
    }

    const unsentItems = order.order_items;
    if (unsentItems.length === 0) {
      throw new BadRequestError('No new items to send to kitchen');
    }

    const stationGroups = {};
    for (const item of unsentItems) {
      const station = item.kitchen_station || 'KITCHEN';
      if (!stationGroups[station]) stationGroups[station] = [];
      stationGroups[station].push(item);
    }

    const kots = [];
    await prisma.$transaction(async (tx) => {
      for (const [station, items] of Object.entries(stationGroups)) {
        const kotNumber = `KOT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 3).toUpperCase()}`;

        const kot = await tx.kOT.create({
          data: {
            outlet_id: order.outlet_id, order_id: orderId,
            kot_number: kotNumber, station, items_count: items.length,
            status: 'pending',
            printed_at: new Date(),
          },
        });

        for (const item of items) {
          await tx.kOTItem.create({
            data: { kot_id: kot.id, order_item_id: item.id, quantity: item.quantity },
          });
          await tx.orderItem.update({
            where: { id: item.id },
            data: { is_kot_sent: true, kot_id: kot.id, status: 'sent' },
          });
        }

        kots.push({ ...kot, items });
      }

      if (order.status === 'created') {
        await tx.order.update({ where: { id: orderId }, data: { status: 'confirmed' } });
        await tx.orderStatusHistory.create({
          data: { order_id: orderId, from_status: 'created', to_status: 'confirmed' },
        });
      }
    });

    setImmediate(() => {
      try {
        const io = getIO();
        if (io) {
          for (const kot of kots) {
            const payload = buildKotSocketPayload(kot, order, kot.items);
            io.of('/kitchen').to(`outlet:${order.outlet_id}`).emit('new_kot', payload);
            io.of('/kitchen').to(`station:${order.outlet_id}:${kot.station}`).emit('new_kot', payload);
          }
          io.of('/orders').to(`outlet:${order.outlet_id}`).emit('order_status_change', {
            order_id: orderId, status: 'confirmed',
          });
        }
      } catch (e) {
        logger.warn('Socket emit failed after generateKOT', { error: e.message });
      }
    });

    logger.info('KOTs generated', { orderId, kotCount: kots.length });
    return kots;
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof BadRequestError) throw error;
    throw error;
  }
}

/**
 * Deducts inventory for all items in an order based on recipes.
 * Safe to call multiple times — skips orders that already have consumption stock transactions.
 * Runs inside the provided Prisma transaction context.
 *
 * @param {object} tx - Prisma transaction client
 * @param {string} orderId
 * @param {string} outletId
 * @returns {Promise<{deducted: number, alerts: object[]}>}
 */
async function _deductInventoryForOrder(tx, orderId, outletId) {
  // Guard: skip if already deducted (idempotency via existing stock transactions)
  const alreadyDeducted = await tx.stockTransaction.findFirst({
    where: { reference_type: 'order', reference_id: orderId, transaction_type: 'consumption' },
  });
  if (alreadyDeducted) return { deducted: 0, alerts: [] };

  const orderWithItems = await tx.order.findFirst({
    where: { id: orderId, is_deleted: false },
    include: { order_items: { where: { is_deleted: false } } },
  });
  if (!orderWithItems) return { deducted: 0, alerts: [] };

  const deductionAlerts = [];
  let deducted = 0;

  for (const orderItem of orderWithItems.order_items) {
    const recipe = await tx.recipe.findFirst({
      where: { menu_item_id: orderItem.menu_item_id, is_deleted: false },
      include: { ingredients: { include: { inventory_item: true } } },
    });
    if (!recipe) {
      logger.warn('No recipe for menu item — skipping deduction', {
        menuItemId: orderItem.menu_item_id, orderId,
      });
      continue;
    }

    for (const ingredient of recipe.ingredients) {
      const consumeQty = Number(ingredient.quantity) * Number(orderItem.quantity);
      const stock = await tx.inventoryStock.upsert({
        where: {
          outlet_id_inventory_item_id: {
            outlet_id: outletId,
            inventory_item_id: ingredient.inventory_item_id,
          },
        },
        create: {
          outlet_id: outletId,
          inventory_item_id: ingredient.inventory_item_id,
          current_stock: -consumeQty,
        },
        update: { current_stock: { decrement: consumeQty } },
      });

      await tx.stockTransaction.create({
        data: {
          outlet_id: outletId,
          inventory_item_id: ingredient.inventory_item_id,
          transaction_type: 'consumption',
          quantity: -consumeQty,
          reference_type: 'order',
          reference_id: orderId,
        },
      });

      const newStock = Number(stock.current_stock);
      const minThreshold = Number(ingredient.inventory_item?.min_threshold ?? 0);
      if (newStock <= minThreshold) {
        deductionAlerts.push({
          item_name: ingredient.inventory_item.name,
          current_stock: newStock,
          min_threshold: minThreshold,
          unit: ingredient.inventory_item.unit,
        });
      }
      deducted++;
    }
  }

  return { deducted, alerts: deductionAlerts };
}

/**
 * Processes payment for an order. Marks as PAID, triggers stock deduction.
 * @param {string} orderId - Order UUID
 * @param {object} paymentData - Payment method, amount, splits
 * @param {string} staffId - Staff processing payment
 * @param {string} [outletId] - Optional outlet UUID for scoped access (defense-in-depth)
 * @returns {Promise<object>} Payment result with invoice info
 */
async function processPayment(orderId, paymentData, staffId, outletId = null) {
  const prisma = getDbClient();
  try {
    const paymentWhere = { id: orderId, is_deleted: false };
    if (outletId) paymentWhere.outlet_id = outletId;
    const order = await prisma.order.findFirst({
      where: paymentWhere,
    });
    if (!order) throw new NotFoundError('Order not found');
    if (order.is_paid) throw new BadRequestError('Order is already paid');
    if (['cancelled', 'voided'].includes(order.status)) {
      throw new BadRequestError(`Cannot pay for ${order.status} order`);
    }

    const grandTotal = Number(order.grand_total);

    // --- Prior partial tenders (split bill / multi-tender) --------------------
    // An order may already carry one or more partial payments recorded via the
    // multi-tender flow (order.split.service.recordTender). The closing payment
    // only needs to cover the REMAINING balance, so reconcile against
    // grand_total minus what has already been successfully tendered. With no
    // prior payments alreadyPaid is 0 and behaviour is identical to before.
    const priorAgg = await prisma.payment.aggregate({
      where: { order_id: orderId, status: 'success', is_deleted: false },
      _sum: { amount: true },
    });
    const alreadyPaid = round2(Number(priorAgg._sum.amount) || 0);

    // --- Loyalty redemption (H5) ---------------------------------------------
    // loyalty_points_redeem reduces the amount owed, but ONLY if we can actually
    // decrement the customer's balance inside the payment transaction below.
    // Here we just validate eligibility and compute the discount so the payment
    // amount can be reconciled against (grand_total - loyalty_discount) before the
    // tolerance check. Points are never allowed to drive the charge below zero.
    const pointsToRedeem = Number(paymentData.loyalty_points_redeem) || 0;
    let loyaltyDiscount = 0;
    let loyaltyCfg = null;
    if (pointsToRedeem > 0) {
      if (!order.customer_id) {
        throw new BadRequestError('Cannot redeem loyalty points without a customer on the order');
      }
      loyaltyCfg = await customerService.getLoyaltyConfig(order.outlet_id);
      if (!loyaltyCfg.enabled) {
        throw new BadRequestError('Loyalty programme is not enabled for this outlet');
      }
      if (pointsToRedeem < loyaltyCfg.min_redemption) {
        throw new BadRequestError(`Minimum ${loyaltyCfg.min_redemption} points required to redeem`);
      }
      const loyalty = await prisma.loyaltyPoints.findFirst({ where: { customer_id: order.customer_id } });
      const available = loyalty?.current_balance || 0;
      if (available < pointsToRedeem) {
        throw new BadRequestError(`Insufficient loyalty points. Available: ${available}`);
      }
      // Cap the redemption discount at the order grand total so points can never
      // produce a negative charge or a refund.
      loyaltyDiscount = round2(Math.min(pointsToRedeem * Number(loyaltyCfg.redeem_value), grandTotal));
      // Also enforce the configured per-order points-liability cap (max_redemption_pct,
      // M2). The frontend caps redemption client-side, but a crafted API call could
      // otherwise pay the whole bill in points and bypass the owner's business rule.
      const maxPct = Number(loyaltyCfg.max_redemption_pct) || 0;
      if (maxPct > 0) {
        loyaltyDiscount = Math.min(loyaltyDiscount, round2(grandTotal * (maxPct / 100)));
      }
    }

    const amountOwed = round2(grandTotal - loyaltyDiscount - alreadyPaid);

    if (Math.abs(Number(paymentData.amount) - amountOwed) > 1) {
      const priorNote = alreadyPaid > 0 ? ` (already tendered ${alreadyPaid} of ${grandTotal})` : '';
      throw new BadRequestError(
        loyaltyDiscount > 0
          ? `Payment amount ${paymentData.amount} does not match amount owed ${amountOwed} (order total ${grandTotal} less loyalty discount ${loyaltyDiscount}${alreadyPaid > 0 ? ` less already tendered ${alreadyPaid}` : ''})`
          : `Payment amount ${paymentData.amount} does not match amount owed ${amountOwed}${priorNote}`
      );
    }

    // --- Split payment reconciliation (M4) -----------------------------------
    // The split amounts must sum to the tendered payment amount, and the payment
    // amount must match the amount owed (grand_total less any loyalty discount).
    if (paymentData.method === 'split' && Array.isArray(paymentData.splits)) {
      const splitSum = paymentData.splits.reduce((acc, s) => acc + Number(s.amount || 0), 0);
      if (Math.abs(splitSum - Number(paymentData.amount)) > 0.01) {
        throw new BadRequestError(
          `Split amounts (${round2(splitSum)}) must sum to payment amount (${paymentData.amount})`
        );
      }
    }

    // When auto-free is enabled, a dine-in table is NOT freed on payment — it is
    // scheduled to auto-free later (once also kitchen-served) via a grace popup.
    const autoFreeCfg = await autoFreeService.getAutoFreeConfig(prisma, order.outlet_id);
    const deferTableFree = autoFreeCfg.enabled && order.order_type === 'dine_in' && !!order.table_id;

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          outlet_id: order.outlet_id, order_id: orderId,
          method: paymentData.method, amount: paymentData.amount,
          transaction_id: paymentData.transaction_id || null,
          status: 'success', processed_by: staffId, processed_at: new Date(),
        },
      });

      if (paymentData.method === 'split' && paymentData.splits) {
        for (const split of paymentData.splits) {
          await tx.paymentSplit.create({
            data: {
              payment_id: payment.id, method: split.method,
              amount: split.amount, transaction_id: split.transaction_id || null,
            },
          });
        }
      }

      // Redeem loyalty points atomically with the payment (H5). Re-check the
      // balance inside the transaction with a conditional decrement so concurrent
      // redemptions can't overspend; persist loyalty_discount/loyalty_points_used
      // and the redeem ledger entry so the reduced charge is fully reconciled.
      if (pointsToRedeem > 0 && loyaltyDiscount > 0) {
        const decremented = await tx.loyaltyPoints.updateMany({
          where: { customer_id: order.customer_id, current_balance: { gte: pointsToRedeem } },
          data: { total_redeemed: { increment: pointsToRedeem }, current_balance: { decrement: pointsToRedeem } },
        });
        if (decremented.count === 0) {
          throw new BadRequestError('Insufficient loyalty points');
        }
        const updatedLoyalty = await tx.loyaltyPoints.findFirst({ where: { customer_id: order.customer_id } });
        await tx.loyaltyTransaction.create({
          data: {
            customer_id: order.customer_id,
            outlet_id: order.outlet_id,
            order_id: orderId,
            type: 'redeem',
            points: -pointsToRedeem,
            balance_after: updatedLoyalty?.current_balance ?? 0,
            description: `Redeemed ${pointsToRedeem} pts for ₹${loyaltyDiscount.toFixed(2)} discount`,
          },
        });
      }

      await tx.order.update({
        where: { id: orderId },
        data: {
          is_paid: true,
          paid_at: new Date(),
          status: 'paid',
          ...(pointsToRedeem > 0 && loyaltyDiscount > 0
            ? { loyalty_points_used: pointsToRedeem, loyalty_discount: loyaltyDiscount }
            : {}),
        },
      });

      if (order.table_id) {
        // Post-payment the table is NOT freed outright — it enters a 'dirty'
        // (cleaning) state. The floor operator marks it free via the cleaning
        // popup + timed reminder loop (autofree.service / kot.routes tables/*).
        // Stamp cleaning_started_at (anchors the 10-min assign-during-cleaning
        // window) and reset any reminder schedule; auto_free_at stays null until
        // the operator picks a cleaning-timer duration.
        await tx.table.update({
          where: { id: order.table_id },
          data: {
            status: 'dirty',
            current_order_id: null,
            cleaning_started_at: new Date(),
            auto_free_at: null,
            reminder_count: 0,
          },
        });
      }

      await tx.orderStatusHistory.create({
        data: { order_id: orderId, from_status: order.status, to_status: 'paid', changed_by: staffId },
      });

      // --- Inventory deduction (atomic with payment) ---
      const { alerts: deductionAlerts } = await _deductInventoryForOrder(tx, orderId, order.outlet_id);

      return { payment, deductionAlerts };
    });

    // Auto-86: re-evaluate availability for this order's items against the new
    // (committed) stock, and pause/resume them across all delivery channels.
    // Fire-and-forget — never affects the payment response.
    (async () => {
      try {
        const items = await prisma.orderItem.findMany({
          where: { order_id: orderId, is_deleted: false }, select: { menu_item_id: true },
        });
        const ids = [...new Set(items.map((i) => i.menu_item_id).filter(Boolean))];
        if (ids.length) await require('../integrations/auto86.service').evaluateAvailability(order.outlet_id, ids);
      } catch (_) { /* non-critical */ }
    })();

    // Loyalty accrual is a non-critical side-effect — defer it so the payment response
    // isn't blocked on the extra DB round-trips (matters most on a cross-region DB).
    if (order.customer_id) {
      setImmediate(() => {
        customerService.earnPoints(order.customer_id, order.outlet_id, order.id, Number(order.grand_total))
          .catch((loyaltyErr) => logger.warn('Loyalty points failed (non-critical):', loyaltyErr.message));
      });
    }

    const io = getIO();
    if (io) {
      io.of('/orders').to(`outlet:${order.outlet_id}`).emit('order_complete', { order_id: orderId });
      if (order.table_id) {
        // Floor updates live: the table is now cleaning ('dirty'), not free.
        io.of('/orders').to(`outlet:${order.outlet_id}`).emit('table_status_change', {
          table_id: order.table_id, status: 'dirty',
        });
      }
    }
    // NB: the table now enters the 'dirty' cleaning lifecycle on payment (above),
    // which supersedes the old predictive auto-free grace popup for POS-paid
    // dine-in orders. `deferTableFree` is retained only for reference; the cleaning
    // reminder loop is driven from the Tables floor (kot.routes /tables/* + poll).
    void deferTableFree;

    logger.info('Payment processed', { orderId, method: paymentData.method, amount: paymentData.amount });

    // Emit low-stock alerts from the atomic deduction that ran inside the transaction
    if (result.deductionAlerts && result.deductionAlerts.length > 0) {
      const ioRef = getIO();
      if (ioRef) {
        for (const alert of result.deductionAlerts) {
          ioRef.of('/orders').to(`outlet:${order.outlet_id}`).emit('low_stock_alert', alert);
        }
      }
    }

    // Defer the full-order re-fetch (a 7-relation join) + accounting + usage metering
    // OFF the response path. The payment is already durably committed; these only need
    // the full order, which we fetch in the background.
    setImmediate(async () => {
      try {
        const fullOrder = await getOrderById(orderId);
        if (fullOrder?.is_paid) {
          try {
            require('../accounting/accounting.posting.service')
              .postOrderPaid(fullOrder)
              .catch((e) => logger.warn('Ledger postOrderPaid failed', { error: e.message }));
          } catch (e) { logger.warn('Ledger hook error', { error: e.message }); }
          try {
            require('../headoffice/billing.metering.service')
              .recordOrderUsage(fullOrder)
              .catch((e) => logger.warn('Usage metering failed', { error: e.message }));
          } catch (e) { logger.warn('Metering hook error', { error: e.message }); }
        }
      } catch (e) { logger.warn('processPayment post-commit re-fetch failed', { error: e.message }); }
    });

    // Slim, immediate response built from data already in hand — the committed
    // transaction is the source of truth, and no caller consumes the full order object
    // from the payment response (only `payment` and `order.is_paid` are read).
    return {
      payment: result.payment,
      order: {
        id: orderId,
        order_number: order.order_number,
        status: 'paid',
        is_paid: true,
        grand_total: order.grand_total,
        invoice_number: order.invoice_number,
        outlet_id: order.outlet_id,
        table_id: order.table_id,
      },
    };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof BadRequestError) throw error;
    throw error;
  }
}

/**
 * Generates a bill (invoice) for an order without processing payment.
 * @param {string} orderId - Order UUID
 * @param {string} staffId - Staff generating the bill
 * @returns {Promise<object>} Updated order with invoice number
 */
async function generateBill(orderId, staffId) {
  const prisma = getDbClient();
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, is_deleted: false },
    });
    if (!order) throw new NotFoundError('Order not found');
    if (order.is_paid) throw new BadRequestError('Order is already paid');
    if (order.status === 'cancelled') throw new BadRequestError('Cannot bill a cancelled order');
    
    // Prevent re-billing if already has invoice (optional, usually okay to re-print)
    if (order.invoice_number && order.status === 'billed') {
      return await getOrderById(orderId);
    }

    const result = await prisma.$transaction(async (tx) => {
      const invoiceNumber = await generateInvoiceNumber(tx, order.outlet_id);

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'billed',
          invoice_number: invoiceNumber,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          order_id: orderId,
          from_status: order.status,
          to_status: 'billed',
          changed_by: staffId,
        },
      });

      return updatedOrder;
    });

    const io = getIO();
    if (io) {
      io.of('/orders').to(`outlet:${order.outlet_id}`).emit('order_status_change', {
        order_id: orderId, status: 'billed', invoice_number: result.invoice_number
      });
    }

    logger.info('Bill generated', { orderId, invoiceNumber: result.invoice_number });
    return await getOrderById(orderId);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof BadRequestError) throw error;
    throw error;
  }
}

/**
 * Cancels an order, freeing the table and notifying the kitchen.
 * @param {string} orderId - Order UUID
 * @param {string} reason - Cancellation reason
 * @param {string} staffId - Staff performing cancellation
 * @returns {Promise<object>} Cancelled order
 */
async function cancelOrder(orderId, reason, staffId) {
  const prisma = getDbClient();
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, is_deleted: false },
      include: { kots: true, order_items: true }
    });
    if (!order) throw new NotFoundError('Order not found');
    if (order.is_paid) throw new BadRequestError('Cannot cancel a paid order. Use refund instead.');
    if (order.status === 'cancelled') return order;

    await prisma.$transaction(async (tx) => {
      if (order.invoice_number) {
        // CASE A: Bill generated -> Keep record but cancel it
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'cancelled',
            cancelled_at: new Date(),
            cancelled_by: staffId,
            cancel_reason: reason,
          },
        });

        await tx.orderStatusHistory.create({
          data: {
            order_id: orderId,
            from_status: order.status,
            to_status: 'cancelled',
            changed_by: staffId,
            reason,
          },
        });

        await tx.auditLog.create({
          data: {
            user_id: staffId,
            outlet_id: order.outlet_id,
            action: 'ORDER_CANCELLED',
            entity_type: 'order',
            entity_id: orderId,
            metadata: { reason },
          },
        });
      } else {
        // CASE B: No bill generated. Keep the order as a VISIBLE 'cancelled' record so it
        // shows in Order History and the audit trail (previously it was fully soft-deleted
        // and disappeared everywhere). We still clear its tickets from the live kitchen and
        // free the table. The order + items stay queryable; reports already exclude
        // cancelled orders by status, so this doesn't affect revenue/running counts.
        const kotIds = order.kots.map(k => k.id);
        if (kotIds.length > 0) {
          await tx.kOTItem.updateMany({ where: { kot_id: { in: kotIds } }, data: { is_deleted: true } });
        }
        await tx.kOT.updateMany({ where: { order_id: orderId }, data: { is_deleted: true } });

        await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'cancelled',
            cancelled_at: new Date(),
            cancelled_by: staffId,
            cancel_reason: reason,
          },
        });

        await tx.orderStatusHistory.create({
          data: { order_id: orderId, from_status: order.status, to_status: 'cancelled', changed_by: staffId, reason },
        });

        await tx.auditLog.create({
          data: {
            user_id: staffId,
            outlet_id: order.outlet_id,
            action: 'ORDER_CANCELLED',
            entity_type: 'order',
            entity_id: orderId,
            metadata: { reason, billed: false },
          },
        });
      }

      // Always free the table
      if (order.table_id) {
        await tx.table.update({
          where: { id: order.table_id },
          data: { status: 'available', current_order_id: null },
        });
      }
    });

    const io = getIO();
    if (io) {
      // Notify orders namespace
      io.of('/orders').to(`outlet:${order.outlet_id}`).emit('order_status_change', {
        order_id: orderId, status: 'cancelled',
      });
      if (order.table_id) {
        io.of('/orders').to(`outlet:${order.outlet_id}`).emit('table_status_change', {
          table_id: order.table_id, status: 'available',
        });
      }
      // Notify kitchen for cancellation
      io.of('/kitchen').to(`outlet:${order.outlet_id}`).emit('order_cancelled', {
        order_id: orderId,
        order_number: order.order_number,
        reason
      });
    }

    // Restock raw materials used by this order (recipe-based reversal)
    try {
      const inventoryService = require('../inventory/inventory.service');
      await inventoryService.restockFromCancelledOrder(orderId);
      logger.info('Inventory restocked after order cancellation', { orderId });
    } catch (invErr) {
      logger.warn('Restock after cancel failed (non-fatal)', { orderId, error: invErr.message });
    }

    logger.warn('Order cancelled', { orderId, reason, staffId, purged: !order.invoice_number });
    return order.invoice_number ? await getOrderById(orderId) : { id: orderId, status: 'cancelled', purged: true };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof BadRequestError) throw error;
    throw error;
  }
}

const MANAGER_ROLES = ['super_admin', 'owner', 'manager'];

/**
 * Resolve a manager PIN to an authorized staff member AT a specific outlet.
 *
 * Scoping by outlet_id is required: manager_pin is NOT unique across outlets, so an
 * unscoped findFirst can resolve to the wrong staff row — and its ordering is not
 * deterministic, which made manager-PIN auth flaky (e.g. comp succeeded but void
 * failed with the same PIN). We fetch every matching staff at the outlet and accept
 * the PIN if any of them holds a manager role, so a duplicate non-manager row can't
 * shadow the real manager.
 *
 * @returns {Promise<object>} the authorized staff profile
 * @throws {ForbiddenError} if the PIN is unknown at the outlet or holds no manager role
 */
async function authorizeManagerPin(prisma, managerPin, outletId) {
  const staff = await prisma.staffProfile.findMany({
    where: { manager_pin: managerPin, outlet_id: outletId, is_deleted: false },
    include: { user: { include: { user_roles: { include: { role: true } } } } },
  });
  if (!staff.length) throw new ForbiddenError('Invalid manager PIN');
  const manager = staff.find((s) =>
    s.user.user_roles.some((ur) => MANAGER_ROLES.includes(ur.role.name))
  );
  if (!manager) throw new ForbiddenError('PIN does not belong to an authorized manager');
  return manager;
}

/**
 * Voids an order (requires manager PIN verification).
 * @param {string} orderId - Order UUID
 * @param {string} managerPin - Manager's PIN for authorization
 * @param {string} reason - Void reason
 * @param {string} staffId - Staff performing void
 * @returns {Promise<object>} Voided order
 */
async function voidOrder(orderId, managerPin, reason, staffId) {
  const prisma = getDbClient();
  try {
    const order = await prisma.order.findFirst({ where: { id: orderId, is_deleted: false } });
    if (!order) throw new NotFoundError('Order not found');
    if (['paid', 'cancelled', 'voided'].includes(order.status)) {
      throw new BadRequestError(`Cannot void a ${order.status} order`);
    }

    const manager = await authorizeManagerPin(prisma, managerPin, order.outlet_id);

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'voided', void_reason: reason, voided_by: staffId },
      });

      if (order.table_id) {
        await tx.table.update({
          where: { id: order.table_id },
          data: { status: 'available', current_order_id: null },
        });
      }
      await tx.orderStatusHistory.create({
        data: { order_id: orderId, from_status: order.status, to_status: 'voided', changed_by: staffId, reason },
      });
      await tx.auditLog.create({
        data: {
          user_id: staffId, outlet_id: order.outlet_id,
          action: 'ORDER_VOIDED', entity_type: 'order', entity_id: orderId,
          new_values: { reason, authorized_by: manager.user_id },
        },
      });
    });

    logger.warn('Order voided', { orderId, reason, voidedBy: staffId });
    return await getOrderById(orderId);
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError || error instanceof BadRequestError) throw error;
    throw error;
  }
}

/**
 * Updates order status.
 * @param {string} orderId - Order UUID
 * @param {string} newStatus - New status
 * @param {string} staffId - Staff making the change
 * @param {string} [outletId] - Optional outlet UUID for scoped access (defense-in-depth)
 * @returns {Promise<object>}
 */
async function updateOrderStatus(orderId, newStatus, staffId, outletId = null) {
  const prisma = getDbClient();
  try {
    const statusWhere = { id: orderId, is_deleted: false };
    if (outletId) statusWhere.outlet_id = outletId;
    const order = await prisma.order.findFirst({
      where: statusWhere,
      include: { outlet: { select: { name: true } } },
    });
    if (!order) throw new NotFoundError('Order not found');

    // 'completed' is a terminal/closed state. Revenue, head-office, accounting and
    // payment-reconciliation queries all key settlement on is_paid (never on
    // status='completed'), so marking an UNPAID order completed would create a
    // finished-but-uncollected order that's invisible to revenue yet no longer
    // surfaces as an open/live bill — money that's never reconciled. Block it and
    // require payment first (processPayment / POS). Prepaid orders (online/Razorpay,
    // Swiggy/Zomato) already carry is_paid=true, so this only blocks the never-settled
    // case and leaves the legitimate "complete an already-paid order" path untouched.
    if (newStatus === 'completed' && !order.is_paid) {
      throw new BadRequestError('Cannot mark an unpaid order as completed — collect payment first');
    }

    await prisma.$transaction(async (tx) => {
      // If transitioning to 'paid' via status update, also set is_paid + paid_at
      // so revenue calculations stay consistent with processPayment flow.
      const updateData = { status: newStatus };
      if (newStatus === 'paid' && !order.is_paid) {
        updateData.is_paid = true;
        updateData.paid_at = new Date();
      }
      await tx.order.update({ where: { id: orderId }, data: updateData });
      await tx.orderStatusHistory.create({
        data: { order_id: orderId, from_status: order.status, to_status: newStatus, changed_by: staffId },
      });

      // Trigger inventory deduction when order completes via status update
      // The !order.is_paid guard prevents double-deduction for orders that already went through processPayment
      if ((newStatus === 'completed' || newStatus === 'paid') && !order.is_paid) {
        await _deductInventoryForOrder(tx, orderId, order.outlet_id);
      }
    });

    const io = getIO();
    if (io) {
      io.of('/orders').to(`outlet:${order.outlet_id}`).emit('order_status_change', {
        order_id: orderId, status: newStatus,
      });
    }

    // Notify customer via SMS when food is ready
    if (newStatus === 'ready' && order.customer_phone) {
      const outletName = order.outlet?.name || 'our kitchen';
      sendOrderReadySms(order.customer_phone, order.order_number, outletName).catch(() => {});
    }

    return await getOrderById(orderId);
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}

async function refundOrder(orderId, data, userId) {
  const prisma = getDbClient();

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: true } });
  if (!order) throw new NotFoundError('Order not found');
  if (order.status !== 'paid') throw new BadRequestError('Can only refund paid orders');

  // Verify the manager PIN before authorizing a refund — same gate as voidOrder.
  // Without this, any PIN (or a forged one) could authorize a refund. Scoped to the
  // order's outlet so a duplicate PIN at another outlet can't authorize here.
  await authorizeManagerPin(prisma, data.manager_pin, order.outlet_id);

  // processPayment writes payments with status 'success' (not 'completed'); accept
  // both for legacy rows and require a positive amount so we don't pick a prior refund.
  const payment = order.payments.find(
    p => (p.status === 'success' || p.status === 'completed') && Number(p.amount) > 0
  );
  if (!payment) throw new BadRequestError('No completed payment found');

  // Clamp the refund to [0, grand_total] so a crafted request can neither create
  // free money via an over-refund (H4) nor have refund_amount=0 silently refund the
  // FULL total (H5). This single clamped value is used everywhere below: the negative
  // payment row, the isFullRefund test, and the ledger reversal.
  const refundAmount = Math.min(
    Math.max(Number(data.refund_amount) || 0, 0),
    Number(order.grand_total)
  );

  // Atomically write the negative refund payment and flip the order status (M1) so a
  // DB hiccup between the two writes cannot leave an orphan refund row on a still-'paid'
  // order (which would allow a second refund and corrupt settlement reports).
  const refund = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        order_id: orderId, outlet_id: order.outlet_id,
        method: payment.method, amount: -refundAmount,
        status: 'refunded', transaction_id: `RFND-${Date.now()}`,
      },
    });
    await tx.order.update({ where: { id: orderId }, data: { status: 'refunded' } });
    return created;
  });
  logger.info('Order refunded', { orderId, refundAmount, userId });

  // Reverse the inventory consumed by this order (M12) so a refund doesn't leave
  // phantom consumption on the books. Mirrors cancelOrder's restock. Only restock
  // on a FULL refund; restockFromCancelledOrder is idempotent (it soft-deletes the
  // consumption rows it reverses) so it won't double-restock if already cancelled.
  const isFullRefund = Math.abs(refundAmount - Number(order.grand_total)) <= 0.01;
  if (isFullRefund) {
    try {
      const inventoryService = require('../inventory/inventory.service');
      await inventoryService.restockFromCancelledOrder(orderId);
      logger.info('Inventory restocked after order refund', { orderId });
    } catch (invErr) {
      logger.warn('Restock after refund failed (non-fatal)', { orderId, error: invErr.message });
    }
  }

  // Post a reversing journal to the ledger. Fire-and-forget — never break refund.
  setImmediate(() => {
    try {
      require('../accounting/accounting.posting.service')
        .reverseOrderRefund(order, refundAmount)
        .catch((e) => logger.warn('Ledger reverseOrderRefund failed', { error: e.message }));
    } catch (e) { logger.warn('Ledger refund hook error', { error: e.message }); }
  });

  return refund;
}

async function transferTable(orderId, targetTableId, userId) {
  const prisma = getDbClient();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError('Order not found');
  if (!targetTableId) throw new BadRequestError('Target table ID required');

  return prisma.$transaction(async (tx) => {
    // Free old table
    if (order.table_id) {
      await tx.table.update({ where: { id: order.table_id }, data: { status: 'available', current_order_id: null } });
    }
    // Move order to new table
    await tx.order.update({ where: { id: orderId }, data: { table_id: targetTableId } });
    await tx.table.update({ where: { id: targetTableId }, data: { status: 'occupied', current_order_id: orderId } });
    logger.info('Table transferred', { orderId, from: order.table_id, to: targetTableId, userId });
    return { success: true, orderId, newTableId: targetTableId };
  });
}

async function mergeOrder(sourceOrderId, targetOrderId, userId) {
  const prisma = getDbClient();
  if (!targetOrderId || targetOrderId === 'auto') throw new BadRequestError('Valid target order ID required');
  const [source, target] = await Promise.all([
    prisma.order.findUnique({ where: { id: sourceOrderId }, include: { order_items: true } }),
    prisma.order.findUnique({ where: { id: targetOrderId } }),
  ]);
  if (!source || !target) throw new NotFoundError('Source or target order not found');

  return prisma.$transaction(async (tx) => {
    // Move items from source to target
    await tx.orderItem.updateMany({ where: { order_id: sourceOrderId }, data: { order_id: targetOrderId } });
    // Recalculate target totals with proper tax engine
    const taxConfig = await getOutletTaxConfig(tx, target.outlet_id);
    const totals = await recalcOrderTotals(tx, targetOrderId, taxConfig);
    await tx.order.update({
      where: { id: targetOrderId },
      data: {
        subtotal: totals.subtotal,
        taxable_amount: totals.subtotal,
        cgst: Math.round(totals.cgst * 100) / 100,
        sgst: Math.round(totals.sgst * 100) / 100,
        igst: Math.round(totals.igst * 100) / 100,
        total_tax: Math.round(totals.totalTax * 100) / 100,
        total_amount: Math.round(totals.totalAmount * 100) / 100,
        round_off: Math.round(totals.roundOff * 100) / 100,
        grand_total: totals.grandTotal,
      },
    });
    // Cancel source order
    await tx.order.update({ where: { id: sourceOrderId }, data: { status: 'cancelled', notes: `Merged into ${targetOrderId}` } });
    if (source.table_id) {
      await tx.table.update({ where: { id: source.table_id }, data: { status: 'available', current_order_id: null } });
    }
    logger.info('Orders merged', { source: sourceOrderId, target: targetOrderId, userId });
    return { success: true, targetOrderId };
  });
}

/**
 * syncOfflineOrders — replays orders captured by the offline desktop POS (v2 contract).
 *
 * Semantics (price-at-sale wins — prices are NEVER re-derived from the menu):
 * - Idempotent on the client UUID: the cloud order is created WITH the client id,
 *   so a retried batch finds the existing row and returns 'exists' + its cloud
 *   order_number instead of duplicating.
 * - The client's financial snapshot is trusted verbatim (subtotal/tax/discount/total);
 *   when cgst+sgst are 0 but tax_amount > 0 the tax lands in igst (AU single-GST).
 * - Table keep-both policy: an occupied table never fails the sync — the order is
 *   created without seizing the table and the result carries conflict:'table_occupied'.
 * - Paid orders also get a Payment row mirroring processPayment's shape.
 * - KOTs are NOT created (they were printed offline); items land is_kot_sent:true.
 * - Per-order try/catch: one bad order can never fail the batch.
 *
 * @param {Array<object>} orders - Offline order payloads (see syncOfflineOrdersSchema)
 * @param {string} userId - Authenticated user performing the sync (becomes staff_id)
 * @returns {Promise<Array<{id: string, status: 'synced'|'exists'|'failed', order_number?: string, conflict?: string, error?: string}>>}
 */
async function syncOfflineOrders(orders, userId) {
  const prisma = getDbClient();
  const results = [];

  // Normalise an offline status to the cloud lifecycle: a live/created order
  // lands as 'confirmed'; everything else (held/ready/billed/paid/cancelled/
  // completed) passes through unchanged (Order.status is a free VarChar).
  const mapStatus = (s) => (s === 'active' || s === 'created') ? 'confirmed' : (s || 'confirmed');
  // Stable item-id contract: only override the OrderItem PK when the client sent
  // a real UUID. Custom/open items may carry an empty or non-uuid id, in which
  // case we fall back to Prisma's gen_random_uuid() default.
  const isUuid = (v) => typeof v === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
  // Forward-only lifecycle rank — a re-synced order may only advance, never
  // regress. created/confirmed/held=1 < ready=2 < billed=3 < paid/completed=4
  // < cancelled=5 (terminal).
  const statusRank = (s) => ({
    created: 1, confirmed: 1, active: 1, held: 1,
    ready: 2, billed: 3, paid: 4, completed: 4, cancelled: 5,
  }[s] || 1);

  for (const o of orders || []) {
    try {
      // Outlet is needed for the order_number, the region-aware tax split and
      // (when a new Customer is minted) the owning tenant. Fetch it WITH
      // head_office so resolveOutletTaxConfig sees every AU/IN signal.
      const outlet = await prisma.outlet.findFirst({
        where: { id: o.outlet_id, is_deleted: false },
        select: {
          id: true, code: true, head_office_id: true,
          currency: true, country: true, state: true,
          head_office: { select: { country_code: true, region: true, gst_inclusive: true, currency: true } },
        },
      });
      if (!outlet) {
        results.push({ id: o.id, status: 'failed', error: 'Outlet not found' });
        continue;
      }

      // ── Idempotency + forward-only merge ────────────────────────────────
      // The client UUID is the primary key. A retried batch finds the existing
      // row; if the incoming state is strictly MORE advanced we replay the
      // forward transition (never regress, never double-create a Payment).
      const existing = await prisma.order.findUnique({
        where: { id: o.id },
        select: { id: true, order_number: true, status: true, is_paid: true, grand_total: true, outlet_id: true },
      });
      if (existing) {
        const incomingStatus = mapStatus(o.status);
        const statusAdvances = statusRank(incomingStatus) > statusRank(existing.status);
        const becomesPaid = incomingStatus === 'paid' || incomingStatus === 'completed';

        // ── Item-merge on idempotent replay ─────────────────────────────────
        // A lost 2xx can make the desktop resend an order it already created,
        // sometimes with items added after the first successful sync. Insert any
        // incoming item whose client order_items.id is NOT already an OrderItem
        // on this order; never touch or delete existing items. Guarded on
        // item.id presence, so a legacy id-less replay stays a pure no-op.
        const incomingWithIds = (o.items || []).filter((it) => it && isUuid(it.id));
        let itemsToInsert = [];
        if (incomingWithIds.length) {
          const existingItems = await prisma.orderItem.findMany({
            where: { order_id: existing.id },
            select: { id: true },
          });
          const haveIds = new Set(existingItems.map((r) => r.id));
          itemsToInsert = incomingWithIds.filter((it) => !haveIds.has(it.id));
        }

        let merged = false;
        if (statusAdvances || itemsToInsert.length) {
          // Financial snapshot + region-aware tax split — computed only when at
          // least one item is inserted (the order financial columns are then
          // re-asserted to the incoming payload so cloud totals stay correct).
          let cgst = 0, sgst = 0, igst = 0, itemGstRate = 0;
          let subtotal = 0, discountAmount = 0, totalTax = 0, grandTotal = 0, roundOff = 0;
          let itemTotals = [], itemsSum = 0, insertIds = new Set();
          const stationByItem = new Map();
          if (itemsToInsert.length) {
            subtotal = round2(Number(o.subtotal) || 0);
            discountAmount = round2(Number(o.discount_amount) || 0);
            totalTax = round2(Number(o.tax_amount) || 0);
            grandTotal = round2(Number(o.total_amount) || 0);
            roundOff = round2(Number(o.round_off) || 0);

            const { country_code: cc, gst_inclusive: gi, default_gst_rate: dgr } =
              resolveOutletTaxConfig(outlet);
            const clientCgst = round2(Number(o.cgst_amount) || 0);
            const clientSgst = round2(Number(o.sgst_amount) || 0);
            itemGstRate = dgr;
            if (cc === 'AU') {
              igst = totalTax;
              itemGstRate = 10;
            } else if (clientCgst + clientSgst > 0) {
              cgst = clientCgst;
              sgst = clientSgst;
            } else if (gi && totalTax > 0) {
              cgst = round2(totalTax / 2);
              sgst = round2(totalTax - cgst);
            }

            const allItems = o.items || [];
            itemTotals = allItems.map((i) => round2(Number(i.total_price) || 0));
            itemsSum = round2(itemTotals.reduce((a, b) => a + b, 0));
            insertIds = new Set(itemsToInsert.map((it) => it.id));

            // Best-effort station lookup for the inserted items (cosmetic).
            try {
              const menuIds = [...new Set(itemsToInsert.map((i) => i.menu_item_id).filter(Boolean))];
              if (menuIds.length) {
                const menuRows = await prisma.menuItem.findMany({
                  where: { id: { in: menuIds } },
                  select: { id: true, kitchen_station: true },
                });
                menuRows.forEach((mi) => stationByItem.set(mi.id, mi.kitchen_station || 'KITCHEN'));
              }
            } catch (_) { /* station lookup must not block the merge */ }
          }

          await prisma.$transaction(async (tx) => {
            // Status / payment forward-merge — only when the state advances.
            if (statusAdvances) {
              const updateData = { status: incomingStatus };
              if (o.invoice_number) updateData.invoice_number = o.invoice_number;
              if (becomesPaid) {
                updateData.is_paid = true;
                updateData.paid_at = o.paid_at ? new Date(o.paid_at) : new Date();
              }
              await tx.order.update({ where: { id: existing.id }, data: updateData });

              // Create exactly ONE Payment when the order first becomes paid and
              // none exists yet — mirrors processPayment's row shape.
              if (becomesPaid) {
                const payExists = await tx.payment.findFirst({
                  where: { order_id: existing.id, is_deleted: false },
                  select: { id: true },
                });
                if (!payExists) {
                  await tx.payment.create({
                    data: {
                      outlet_id: existing.outlet_id,
                      order_id: existing.id,
                      method: o.payment_method || 'cash',
                      // Device price-at-sale is authoritative (matches the create
                      // path + the item-merge re-assert below). Using the stale
                      // existing.grand_total here undercharged by exactly the value
                      // of any items added offline after the first sync.
                      amount: round2(Number(o.total_amount) || Number(existing.grand_total) || 0),
                      status: 'success',
                      processed_by: userId,
                      processed_at: o.paid_at ? new Date(o.paid_at) : new Date(),
                      gateway_response: {
                        offline_captured: true,
                        ...(o.payment_note ? { note: o.payment_note } : {}),
                      },
                    },
                  });
                }
              }

              await tx.orderStatusHistory.create({
                data: { order_id: existing.id, from_status: existing.status || null, to_status: incomingStatus, changed_by: userId },
              });
            }

            // Item-merge — insert only the NEW items (never modify/delete an
            // existing one). item_tax is a proportional share of the payload
            // total_tax over the FULL incoming item set (the last payload item
            // absorbs the rounding remainder), exactly as the create path does;
            // only ids not yet present are actually inserted.
            if (itemsToInsert.length) {
              const allItems = o.items || [];
              let remainingTax = totalTax;
              for (let idx = 0; idx < allItems.length; idx++) {
                const it = allItems[idx];
                const itemTotal = itemTotals[idx];
                const isLast = idx === allItems.length - 1;
                const share = itemsSum > 0
                  ? (isLast ? round2(remainingTax) : round2(totalTax * (itemTotal / itemsSum)))
                  : 0;
                remainingTax = round2(remainingTax - share);
                // Skip items already present (or id-less) — idempotent replay.
                if (!isUuid(it.id) || !insertIds.has(it.id)) continue;
                await tx.orderItem.create({
                  data: {
                    id: it.id, // client order_items.id — dedupes on the PK across retries
                    order_id: existing.id,
                    menu_item_id: it.menu_item_id,
                    variant_id: it.variant_id || null,
                    name: it.item_name,
                    variant_name: it.variant_name || null,
                    quantity: it.quantity,
                    unit_price: round2(Number(it.unit_price) || 0),
                    addons_total: round2(Number(it.addon_total) || 0),
                    item_total: itemTotal,
                    gst_rate: itemGstRate,
                    item_tax: share,
                    kitchen_station: stationByItem.get(it.menu_item_id) || 'KITCHEN',
                    notes: it.notes || null,
                    is_kot_sent: true,
                    status: 'sent',
                  },
                });
              }

              // ≥1 item inserted → re-assert the order financial columns to the
              // incoming payload snapshot so cloud totals track the device.
              await tx.order.update({
                where: { id: existing.id },
                data: {
                  subtotal,
                  taxable_amount: round2(Math.max(subtotal - discountAmount, 0)),
                  cgst,
                  sgst,
                  igst,
                  total_tax: totalTax,
                  discount_amount: discountAmount,
                  round_off: roundOff,
                  grand_total: grandTotal,
                  total_amount: grandTotal,
                },
              });
            }
          }, { maxWait: 8000, timeout: 20000 });
          merged = true;
        }
        results.push({ id: o.id, status: 'exists', order_number: existing.order_number, merged });
        continue;
      }

      // Best-effort kitchen_station lookup — cosmetic only. Deliberately NO
      // availability or price validation: the device already sold at these numbers.
      const stationByItem = new Map();
      try {
        const menuIds = [...new Set((o.items || []).map((i) => i.menu_item_id).filter(Boolean))];
        if (menuIds.length) {
          const menuRows = await prisma.menuItem.findMany({
            where: { id: { in: menuIds } },
            select: { id: true, kitchen_station: true },
          });
          menuRows.forEach((mi) => stationByItem.set(mi.id, mi.kitchen_station || 'KITCHEN'));
        }
      } catch (_) { /* station lookup failing must not block the sync */ }

      // ── Customer resolution — never let an untrusted client id fail the order.
      // The desktop mints LOCAL Customer UUIDs that don't exist in the cloud, so
      // a blind pass-through P2003s forever. Verify the id; else find-or-create
      // by phone (Customer.phone is globally unique); else drop it to null.
      const custPhone = o.customer_phone ? String(o.customer_phone).slice(0, 15) : null;
      let resolvedCustomerId = null;
      if (o.customer_id) {
        const existingCust = await prisma.customer.findUnique({
          where: { id: o.customer_id }, select: { id: true },
        });
        if (existingCust) resolvedCustomerId = existingCust.id;
      }
      if (!resolvedCustomerId && custPhone) {
        // Upsert is race-safe on the unique phone; an order-less customer stays
        // scoped to its tenant via head_office_id (see Customer model comment).
        const cust = await prisma.customer.upsert({
          where: { phone: custPhone },
          update: {},
          create: {
            phone: custPhone,
            full_name: o.customer_name ? String(o.customer_name).slice(0, 150) : null,
            head_office_id: outlet.head_office_id || null,
          },
          select: { id: true },
        });
        resolvedCustomerId = cust.id;
      }

      // ── Financial mapping — trust the client's captured-at-sale numbers ──
      const subtotal = round2(Number(o.subtotal) || 0);
      const discountAmount = round2(Number(o.discount_amount) || 0);
      const totalTax = round2(Number(o.tax_amount) || 0);
      const grandTotal = round2(Number(o.total_amount) || 0);
      const roundOff = round2(Number(o.round_off) || 0);

      // Region-aware tax split (NOT the old cgst==0→IGST heuristic — an IN
      // gst_inclusive order also has cgst==0). Resolve the outlet region once:
      //  • AU → single 10% GST, the whole tax lands in igst.
      //  • IN → trust the client CGST/SGST split when present; otherwise, for a
      //    gst_inclusive order, derive the split from tax_amount.
      const { country_code: countryCode, gst_inclusive: gstInclusive, default_gst_rate: defaultGstRate } =
        resolveOutletTaxConfig(outlet);
      const clientCgst = round2(Number(o.cgst_amount) || 0);
      const clientSgst = round2(Number(o.sgst_amount) || 0);
      let cgst = 0, sgst = 0, igst = 0, itemGstRate = defaultGstRate;
      if (countryCode === 'AU') {
        igst = totalTax;
        itemGstRate = 10;
      } else if (clientCgst + clientSgst > 0) {
        cgst = clientCgst;
        sgst = clientSgst;
      } else if (gstInclusive && totalTax > 0) {
        cgst = round2(totalTax / 2);
        sgst = round2(totalTax - cgst);
      }

      // Status map: created/active (offline live orders) land as 'confirmed';
      // held/ready/billed/paid/cancelled/completed are kept as-is.
      const status = mapStatus(o.status);
      const isPaid = status === 'paid';
      const isTerminal = status === 'paid' || status === 'cancelled' || status === 'completed';

      const items = o.items || [];
      const itemTotals = items.map((i) => round2(Number(i.total_price) || 0));
      const itemsSum = round2(itemTotals.reduce((a, b) => a + b, 0));

      const offlineTag = o.order_number ? ` [offline:${o.order_number}]` : '';
      const notes = `${o.notes || ''}${offlineTag}`.trim() || null;

      const txResult = await prisma.$transaction(async (tx) => {
        const dailySequence = await nextDailySequence(tx, o.outlet_id);
        const orderNumber = generateOrderNumber(outlet.code, dailySequence);

        const created = await tx.order.create({
          data: {
            id: o.id, // client UUID — the idempotency key
            outlet_id: o.outlet_id,
            order_number: orderNumber,
            order_type: o.order_type || 'dine_in',
            status,
            table_id: o.table_id || null,
            customer_id: resolvedCustomerId,
            staff_id: userId,
            customer_name: o.customer_name ? String(o.customer_name).slice(0, 150) : null,
            customer_phone: custPhone,
            subtotal,
            // Clamp so a discount larger than the subtotal can't persist a
            // negative taxable_amount (matches createOrder).
            taxable_amount: round2(Math.max(subtotal - discountAmount, 0)),
            discount_amount: discountAmount,
            discount_type: discountAmount > 0 ? 'flat' : null,
            cgst,
            sgst,
            igst,
            total_tax: totalTax,
            total_amount: grandTotal,
            round_off: roundOff,
            grand_total: grandTotal,
            source: o.source || 'pos',
            notes,
            daily_sequence: dailySequence,
            invoice_number: o.invoice_number || null,
            is_paid: isPaid,
            paid_at: isPaid ? (o.paid_at ? new Date(o.paid_at) : new Date()) : null,
            ...(o.created_at ? { created_at: new Date(o.created_at) } : {}),
          },
        });

        // Items — client prices verbatim; item_tax is a proportional share of
        // total_tax by item_total (last item absorbs the rounding remainder so
        // the shares always sum exactly to total_tax).
        let remainingTax = totalTax;
        for (let idx = 0; idx < items.length; idx++) {
          const it = items[idx];
          const itemTotal = itemTotals[idx];
          const isLast = idx === items.length - 1;
          const share = itemsSum > 0
            ? (isLast ? round2(remainingTax) : round2(totalTax * (itemTotal / itemsSum)))
            : 0;
          remainingTax = round2(remainingTax - share);
          await tx.orderItem.create({
            data: {
              // Idempotent across retries: create WITH the client's local
              // order_items.id when it's a valid uuid; else let Prisma generate.
              ...(isUuid(it.id) ? { id: it.id } : {}),
              order_id: created.id,
              menu_item_id: it.menu_item_id,
              variant_id: it.variant_id || null,
              name: it.item_name,
              variant_name: it.variant_name || null,
              quantity: it.quantity,
              unit_price: round2(Number(it.unit_price) || 0),
              addons_total: round2(Number(it.addon_total) || 0),
              item_total: itemTotal,
              gst_rate: itemGstRate, // region-resolved (AU 10% / IN default)
              item_tax: share,
              kitchen_station: stationByItem.get(it.menu_item_id) || 'KITCHEN',
              notes: it.notes || null,
              is_kot_sent: true, // KOTs were printed on the offline device
              status: 'sent',
            },
          });
        }

        // Paid offline → record the tender. Mirrors processPayment's row shape
        // (status 'success' — revenue/refund reconciliation keys on it, not 'completed').
        if (isPaid) {
          await tx.payment.create({
            data: {
              outlet_id: o.outlet_id,
              order_id: created.id,
              method: o.payment_method || 'cash',
              amount: grandTotal,
              status: 'success',
              processed_by: userId,
              processed_at: o.paid_at ? new Date(o.paid_at) : new Date(),
              gateway_response: {
                offline_captured: true,
                ...(o.payment_note ? { note: o.payment_note } : {}),
              },
            },
          });
        }

        await tx.orderStatusHistory.create({
          data: { order_id: created.id, from_status: null, to_status: status, changed_by: userId },
        });

        // Table keep-both policy: conditional seize, and an occupied table is a
        // soft conflict — the order is already created above, we just don't touch
        // the table and surface conflict:'table_occupied' to the client.
        let conflict;
        if (!isTerminal && o.table_id) {
          const seized = await tx.table.updateMany({
            where: { id: o.table_id, current_order_id: null, status: { not: 'occupied' } },
            data: { status: 'occupied', current_order_id: created.id },
          });
          if (seized.count === 0) conflict = 'table_occupied';
        }

        return { orderNumber, conflict };
      }, {
        // Same headroom as punchKOT: a big offline ticket writes many rows
        // sequentially in one interactive tx over Render↔DB latency.
        maxWait: 8000,
        timeout: 20000,
      });

      const result = { id: o.id, status: 'synced', order_number: txResult.orderNumber };
      if (txResult.conflict) result.conflict = txResult.conflict;
      results.push(result);
    } catch (err) {
      // One bad order must never fail the batch.
      logger.warn('syncOfflineOrders: order failed to sync', { id: o?.id, error: err.message });
      results.push({ id: o?.id, status: 'failed', error: err.message });
    }
  }

  return results;
}

/**
 * Sends an eBill (digital receipt) to a customer via SMS, Email, or returns
 * a WhatsApp deep-link URL for the caller to open.
 *
 * @param {string} orderId
 * @param {{ method: 'sms'|'email'|'whatsapp', phone?: string, email?: string }} opts
 * @returns {Promise<{ sent: boolean, channel: string, preview?: string, waUrl?: string }>}
 */
async function sendEBill(orderId, { method, phone, email }) {
  const { sendSms } = require('../../utils/sms.service');
  const { sendMail } = require('../../utils/mail.service');

  const order = await getOrderById(orderId);

  const outletName = order.outlet?.name || 'The Restaurant';
  const orderNum   = order.order_number || orderId.slice(-6).toUpperCase();
  const total      = Number(order.grand_total || 0);
  const currency   = order.outlet?.country_code === 'AU' ? 'A$' : '₹';
  const items      = (order.order_items || []).filter(i => !i.is_deleted);
  const itemLines  = items.map(i => `  • ${i.menu_item_name || i.name} x${i.quantity}`).join('\n');

  // ── SMS / WhatsApp text ──
  const shortMsg =
    `${outletName}\n` +
    `Order #${orderNum}\n` +
    itemLines + '\n' +
    `Total: ${currency}${total.toFixed(2)}\n` +
    `Thank you for dining with us!`;

  if (method === 'whatsapp') {
    const normalized = (phone || '').replace(/\D/g, '');
    const waUrl = `https://wa.me/${normalized}?text=${encodeURIComponent(shortMsg)}`;
    return { sent: false, channel: 'whatsapp', waUrl };
  }

  if (method === 'sms') {
    await sendSms(phone, shortMsg);
    return { sent: true, channel: 'sms' };
  }

  if (method === 'email') {
    const safe = (s) => String(s || '').replace(/[<>"&]/g, c => ({ '<':'&lt;','>':'&gt;','"':'&quot;','&':'&amp;' }[c]));
    const itemRows = items.map(i => {
      const lineTotal = (Number(i.unit_price || 0) + Number(i.variant_price || 0)) * i.quantity;
      return `<tr>
        <td style="padding:8px 12px;font-size:14px;color:#334155;">${safe(i.menu_item_name || i.name)}${i.variant ? ` <span style="color:#64748b;font-size:12px">(${safe(i.variant?.name)})</span>` : ''}</td>
        <td style="padding:8px 12px;text-align:center;font-size:14px;color:#334155;">${i.quantity}</td>
        <td style="padding:8px 12px;text-align:right;font-size:14px;color:#334155;font-family:monospace;">${currency}${lineTotal.toFixed(2)}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:28px 32px;color:#fff;">
          <div style="font-size:11px;font-weight:600;opacity:.7;text-transform:uppercase;letter-spacing:.1em;">${safe(outletName)}</div>
          <div style="font-size:22px;font-weight:800;margin-top:4px;">Your Digital Bill</div>
          <div style="font-size:13px;opacity:.8;margin-top:2px;">Order #${safe(orderNum)}</div>
        </td></tr>
        <tr><td style="padding:24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <thead><tr style="border-bottom:2px solid #e2e8f0;">
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:600;">Item</th>
              <th style="padding:8px 12px;text-align:center;font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:600;">Qty</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:600;">Amount</th>
            </tr></thead>
            <tbody>${itemRows}</tbody>
            <tfoot><tr style="border-top:2px solid #e2e8f0;">
              <td colspan="2" style="padding:12px 12px;font-size:15px;font-weight:700;color:#0f172a;">Total</td>
              <td style="padding:12px 12px;text-align:right;font-size:18px;font-weight:800;color:#6366f1;font-family:monospace;">${currency}${total.toFixed(2)}</td>
            </tr></tfoot>
          </table>
        </td></tr>
        <tr><td style="padding:16px 32px 28px;text-align:center;font-size:13px;color:#64748b;">
          Thank you for dining with <strong>${safe(outletName)}</strong>!
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const result = await sendMail({
      to: email,
      subject: `Your bill from ${outletName} — Order #${orderNum}`,
      html,
      text: shortMsg,
    });
    return { sent: true, channel: 'email', preview: result.previewUrl };
  }

  throw new Error(`Unknown eBill method: ${method}`);
}

/**
 * punchKOT — Creates an order AND generates KOT in a single DB transaction.
 * Used by POST /orders/punch-kot for maximum POS speed.
 * @returns {{ order: object, kots: object[] }}
 */
async function punchKOT(data, staffId) {
  const prisma = getDbClient();

  // ── 1. Fetch outlet & validate ────────────────────────────────────────────
  const outlet = await prisma.outlet.findFirst({
    where: { id: data.outlet_id, is_deleted: false, is_active: true },
    include: { head_office: { select: { country_code: true, region: true, gst_inclusive: true, currency: true } } },
  });
  if (!outlet) throw new NotFoundError('Outlet not found or inactive');

  // Use the shared resolver (forces AU = GST-inclusive). punchKOT previously had its own
  // inline copy with the gst_inclusive ?? bug, so the PUNCH KOT path billed AU orders
  // GST-on-top even after createOrder/resolveOutletTaxConfig were fixed.
  const outletTaxConfig = resolveOutletTaxConfig(outlet);
  const countryCode = outletTaxConfig.country_code;

  // ── 2. Fetch menu items & compute pricing (parallel with table check) ────
  const [menuItems, todayOrderCount, tableRow, requireTableSetting] = await Promise.all([
    prisma.menuItem.findMany({
      where: { id: { in: data.items.map(i => i.menu_item_id) }, outlet_id: data.outlet_id, is_deleted: false },
      include: { variants: { where: { is_deleted: false } }, addons: { where: { is_deleted: false } } },
    }),
    prisma.order.count({ where: { outlet_id: data.outlet_id, created_at: { gte: (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })() } } }),
    data.table_id ? prisma.table.findFirst({ where: { id: data.table_id, outlet_id: data.outlet_id, is_deleted: false } }) : Promise.resolve(null),
    (data.order_type || 'dine_in') === 'dine_in' && !data.table_id
      ? prisma.outletSetting.findFirst({ where: { outlet_id: data.outlet_id, setting_key: 'require_table_for_dine_in' }, select: { setting_value: true } })
      : Promise.resolve(null),
  ]);

  if (data.table_id && !tableRow) throw new NotFoundError('Table not found');
  // Fast-fail check (the authoritative atomic seize happens inside the tx below).
  // A table is "in use" if it's flagged occupied OR has any non-terminal order id
  // attached — both states must clear (i.e. payment + auto-free) before reuse.
  if (tableRow && (tableRow.status === 'occupied' || tableRow.current_order_id)) {
    throw new ConflictError('Table is already occupied. Use "Add items to existing order" or pick another table.');
  }
  // Table mandatory for dine-in when the outlet enables the setting.
  if (requireTableSetting?.setting_value === 'true') {
    throw new BadRequestError('Please select a table before placing a dine-in order.');
  }

  const menuItemMap = new Map(menuItems.map(mi => [mi.id, mi]));
  // Pre-tx order number (used for socket payloads). The authoritative, race-safe
  // daily_sequence is re-allocated atomically inside the transaction below; the
  // count()+1 here is only a provisional value if the tx allocation succeeds.
  let dailySequence = todayOrderCount + 1;
  let orderNumber = generateOrderNumber(outlet.code, dailySequence);

  // Build items + per-item tax via the shared pure pricing engine (identical
  // math to createOrder; replaces the previously copy-pasted inline loops).
  const taxCfg = { ...outletTaxConfig, customer_state: data.delivery_address_state || '' };
  const { orderItemsData, subtotal, tax } = buildOrderItems(data.items, menuItemMap, taxCfg);
  const {
    cgst: totalCgst, sgst: totalSgst, igst: totalIgst, totalTax, totalAmount, grandTotal, roundOff,
  } = computeOrderTotals(subtotal, taxCfg, countryCode, tax);

  // ── 4. Single transaction: create order + items + KOTs ──────────────────
  const stationGroups = {};
  orderItemsData.forEach(oi => {
    const station = oi.kitchen_station || 'KITCHEN';
    if (!stationGroups[station]) stationGroups[station] = [];
    stationGroups[station].push(oi);
  });

  let createdOrder, createdKots;

  await prisma.$transaction(async (tx) => {
    // Atomic per-outlet/day sequence (race-safe — runs inside the tx, replacing
    // the provisional count()+1 computed above). Falls back to count()+1 if the
    // counter table is not yet migrated.
    dailySequence = await nextDailySequence(tx, data.outlet_id);
    orderNumber = generateOrderNumber(outlet.code, dailySequence);

    // Create order
    createdOrder = await tx.order.create({
      data: {
        outlet_id: data.outlet_id,
        order_number: orderNumber,
        order_type: data.order_type || 'dine_in',
        status: 'confirmed', // skip 'created' — go straight to confirmed since KOT is being generated
        table_id: data.table_id || null,
        customer_id: data.customer_id || null,
        staff_id: staffId,
        subtotal,
        taxable_amount: subtotal,
        cgst: round2(totalCgst),
        sgst: round2(totalSgst),
        igst: round2(totalIgst),
        total_tax: round2(totalTax),
        total_amount: round2(totalAmount),
        round_off: round2(roundOff),
        grand_total: grandTotal,
        source: data.source || 'pos',
        notes: data.notes || null,
        daily_sequence: dailySequence,
      },
    });

    // Create order items + addons
    const createdItems = [];
    for (const oi of orderItemsData) {
      const createdItem = await tx.orderItem.create({
        data: {
          order_id: createdOrder.id,
          menu_item_id: oi.menu_item_id,
          variant_id: oi.variant_id,
          name: oi.name,
          variant_name: oi.variant_name,
          quantity: oi.quantity,
          unit_price: oi.unit_price,
          variant_price: oi.variant_price,
          addons_total: oi.addons_total,
          item_total: oi.item_total,
          gst_rate: oi.gst_rate,
          item_tax: oi.item_tax,
          kitchen_station: oi.kitchen_station,
          notes: oi.notes,
          is_kot_sent: true,
          status: 'sent',
        },
      });
      if (oi.addons.length > 0) {
        await tx.orderItemAddon.createMany({
          data: oi.addons.map(a => ({ ...a, order_item_id: createdItem.id })),
        });
      }
      createdItems.push({ ...oi, id: createdItem.id });
    }

    // Status history
    await tx.orderStatusHistory.create({
      data: { order_id: createdOrder.id, from_status: null, to_status: 'confirmed', changed_by: staffId },
    });

    // Atomic table seize — only succeeds if the table is still free at commit
    // time. Mirrors createOrder so two concurrent punches can't quietly merge
    // into one occupied row (which previously let a stale "available" cache
    // re-select an in-use table and silently overwrite current_order_id).
    if (data.table_id) {
      const seized = await tx.table.updateMany({
        where: { id: data.table_id, current_order_id: null, status: { not: 'occupied' } },
        data: { status: 'occupied', current_order_id: createdOrder.id },
      });
      if (seized.count === 0) {
        throw new ConflictError('Table is already occupied. Use "Add items to existing order" or pick another table.');
      }
    }

    // Create KOTs
    createdKots = [];
    for (const [station, items] of Object.entries(stationGroups)) {
      const stationItems = createdItems.filter(ci => (ci.kitchen_station || 'KITCHEN') === station);
      const kotNumber = `KOT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 3).toUpperCase()}`;
      const kot = await tx.kOT.create({
        data: {
          outlet_id: data.outlet_id,
          order_id: createdOrder.id,
          kot_number: kotNumber,
          station,
          items_count: stationItems.length,
          status: 'pending',
          printed_at: new Date(),
        },
      });
      for (const si of stationItems) {
        await tx.kOTItem.create({ data: { kot_id: kot.id, order_item_id: si.id, quantity: si.quantity } });
        await tx.orderItem.update({ where: { id: si.id }, data: { kot_id: kot.id } });
      }
      createdKots.push({ ...kot, items: stationItems });
    }
  }, {
    // A big ticket writes ~3 rows per item (order-item + KOT-item + kot_id update)
    // sequentially inside this one interactive transaction. Prisma's default 5s
    // ceiling aborts a large order (~30 items ≈ 90 DB round-trips over Render↔DB
    // latency) with a transaction-timeout (P2028) → generic 500 "Internal server
    // error" on PUNCH KOT. Give large tickets room to commit. (maxWait = time to
    // acquire a pool connection; timeout = max time the tx body may run.)
    maxWait: 8000,
    timeout: 20000,
  });

  // ── 5. Emit sockets async — don't block response ─────────────────────────
  setImmediate(() => {
    try {
      const io = getIO();
      if (!io) return;

      // Notify orders namespace (running orders tab)
      io.of('/orders').to(`outlet:${data.outlet_id}`).emit('new_order', {
        id: createdOrder.id,
        order_number: orderNumber,
        order_type: data.order_type || 'dine_in',
        status: 'confirmed',
        grand_total: grandTotal,
        outlet_id: data.outlet_id,
        table_id: data.table_id || null,
      });
      if (data.table_id) {
        io.of('/orders').to(`outlet:${data.outlet_id}`).emit('table_status_change', {
          table_id: data.table_id, status: 'occupied', order_id: createdOrder.id,
        });
      }

      // Notify kitchen namespace (KDS)
      for (const kot of createdKots) {
        const payload = {
          id: kot.id,
          kot_number: kot.kot_number,
          station: kot.station,
          status: 'pending',
          outlet_id: data.outlet_id,
          order_id: createdOrder.id,
          order_number: orderNumber,
          order_type: data.order_type || 'dine_in',
          table_id: data.table_id || null,
          items_count: kot.items.length,
          kot_items: kot.items.map(item => ({
            order_item: { name: item.name, variant_name: item.variant_name, quantity: item.quantity, notes: item.notes, addons: item.addons?.map(a => ({ name: a.name })) || [] },
          })),
        };
        io.of('/kitchen').to(`outlet:${data.outlet_id}`).emit('new_kot', payload);
        io.of('/kitchen').to(`station:${data.outlet_id}:${kot.station}`).emit('new_kot', payload);
      }
    } catch (e) {
      logger.warn('Socket emit failed after punchKOT', { error: e.message });
    }
  });

  logger.info('PunchKOT completed', { orderId: createdOrder.id, orderNumber, kots: createdKots.length });

  return {
    order: { id: createdOrder.id, order_number: orderNumber, grand_total: grandTotal, subtotal, status: 'confirmed' },
    kots: createdKots.map(k => ({ id: k.id, kot_number: k.kot_number, station: k.station, items_count: k.items.length })),
  };
}

/**
 * Add (or replace) a gratuity/tip on an order's bill.
 *
 * There is no dedicated tip column on the Order model, so the gratuity is folded
 * into the amount the customer owes: it is added on top of the *clean* recomputed
 * grand total. To stay idempotent (re-tipping replaces rather than stacks) and to
 * keep tax/round_off authoritative, the base totals are always recomputed from the
 * surviving order items via the shared recompute helper before the tip is applied.
 *
 * @param {string} orderId - Order UUID
 * @param {number} tipAmount - Gratuity amount (>= 0). 0 clears a prior tip.
 * @param {function} recomputeBase - (tx, orderId, outlet, discount, loyalty) => totals
 *   The controller passes its recomputeOrderWithDiscount helper so the tax engine
 *   and region-aware rounding (computeGrandTotal) remain the single source of truth.
 * @returns {Promise<object>} The updated order row.
 */
async function addTip(orderId, tipAmount, recomputeBase) {
  const prisma = getDbClient();

  const tip = round2(Math.max(Number(tipAmount) || 0, 0));

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, is_deleted: false },
      include: {
        outlet: {
          include: { head_office: { select: { country_code: true, region: true, gst_inclusive: true, currency: true } } },
        },
      },
    });
    if (!order) throw new NotFoundError('Order not found');

    // A tip only makes sense on a live or just-settled bill — never on a
    // cancelled/voided order.
    const BLOCKED = ['cancelled', 'voided', 'refunded'];
    if (BLOCKED.includes(order.status)) {
      throw new BadRequestError(`Cannot add a tip to a ${order.status} order`);
    }

    // Recompute the clean (no-tip) base so tax, round_off and the base grand_total
    // are authoritative and re-applying a tip never stacks.
    const base = await recomputeBase(
      tx,
      orderId,
      order.outlet,
      Number(order.discount_amount) || 0,
      Number(order.loyalty_discount) || 0,
    );

    const totalAmount = round2(base.total_amount + tip);
    const grandTotal = round2(base.grand_total + tip);

    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        cgst: base.cgst,
        sgst: base.sgst,
        igst: base.igst,
        total_tax: base.total_tax,
        round_off: base.round_off,
        total_amount: totalAmount,
        grand_total: grandTotal,
      },
    });

    return updated;
  });
}

module.exports = {
  createOrder, getOrderById, listOrders, addItemsToOrder,
  generateKOT, generateBill, processPayment, cancelOrder, voidOrder, updateOrderStatus,
  generateInvoiceNumber, refundOrder, transferTable, mergeOrder, syncOfflineOrders,
  sendEBill, punchKOT, addTip, authorizeManagerPin,
};
