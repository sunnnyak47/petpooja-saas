/**
 * @fileoverview Pure pricing/tax helpers for the order engine (NO database access).
 *
 * These functions were extracted verbatim from the three copy-pasted write paths
 * in order.service.js (createOrder, addItemsToOrder, punchKOT). They must produce
 * byte-identical numbers to the original inline code:
 *   - subtotal accumulates as a plain float sum of per-item totals
 *   - per-item tax is computed via {@link calculateItemTax} with
 *     base_price = unit_price + variant_price + (addons_total / quantity)
 *   - CGST/SGST/IGST/total-tax accumulate in integer paise then divide by 100
 *   - inclusive (AU) orders use subtotal as the total; exclusive add the tax
 *
 * @module modules/orders/pricing.service
 */

const { BadRequestError } = require('../../utils/errors');
const { calculateItemTax } = require('./tax.service');

/**
 * Region-aware grand-total rounding.
 * - IN: round to nearest whole rupee
 * - AU: round to nearest cent (2dp, i.e. no whole-number rounding)
 * Reproduces order.service.computeGrandTotal exactly.
 * @param {number} totalAmount - Total before final rounding
 * @param {string} countryCode - 'AU' or 'IN'
 * @returns {{ grandTotal: number, roundOff: number }}
 */
function computeGrandTotal(totalAmount, countryCode) {
  if (countryCode === 'AU') {
    // AU: keep to 2 decimal places (no whole-number rounding)
    const grandTotal = Math.round(totalAmount * 100) / 100;
    const roundOff = Math.round((grandTotal - totalAmount) * 100) / 100;
    return { grandTotal, roundOff };
  }
  // IN (default): round to nearest whole rupee
  const grandTotal = Math.round(totalAmount);
  const roundOff = Math.round((grandTotal - totalAmount) * 100) / 100;
  return { grandTotal, roundOff };
}

/**
 * Build the order-item rows from a request payload and accumulate the subtotal
 * and per-item tax. Pure: no DB, no mutation of inputs other than the rows it
 * itself creates.
 *
 * Reproduces createOrder:198-280 (pricing loop + tax loop) exactly. Each returned
 * item row carries `item_tax` and `taxable_amount` (as the original code set on
 * the in-memory objects), plus `addons` (the resolved addon rows).
 *
 * @param {Array} items - Request items (menu_item_id, quantity, variant_id?, addons?, notes?)
 * @param {Map} menuItemMap - Map of menu_item_id -> menu item (with variants & addons)
 * @param {object} taxConfig - { country_code, gst_inclusive, state, default_gst_rate, customer_state? }
 * @returns {{
 *   orderItemsData: Array,
 *   subtotal: number,
 *   tax: { cgstPaise: number, sgstPaise: number, igstPaise: number, totalTaxPaise: number }
 * }}
 */
function buildOrderItems(items, menuItemMap, taxConfig) {
  let subtotal = 0;
  const orderItemsData = [];

  // ── Pricing loop (createOrder:198-249) ────────────────────────────────────
  for (const item of items) {
    const menuItem = menuItemMap.get(item.menu_item_id);
    if (!menuItem) throw new BadRequestError(`Menu item not found: ${item.menu_item_id}`);
    if (!menuItem.is_available) throw new BadRequestError(`Item '${menuItem.name}' is currently unavailable`);

    let unitPrice = Number(menuItem.base_price);
    let variantPrice = 0;
    let variantName = null;

    if (item.variant_id) {
      const variant = menuItem.variants.find((v) => v.id === item.variant_id);
      if (!variant) throw new BadRequestError(`Variant not found for ${menuItem.name}`);
      variantPrice = Number(variant.price_addition);
      variantName = variant.name;
    }

    let addonsTotal = 0;
    const orderAddons = [];
    if (item.addons && item.addons.length > 0) {
      for (const addonReq of item.addons) {
        const addon = menuItem.addons.find((a) => a.id === addonReq.addon_id);
        if (!addon) throw new BadRequestError(`Addon not found: ${addonReq.addon_id}`);
        const addonLineTotal = Number(addon.price) * (addonReq.quantity || 1);
        addonsTotal += addonLineTotal;
        orderAddons.push({
          addon_id: addon.id,
          name: addon.name,
          price: Number(addon.price),
          quantity: addonReq.quantity || 1,
        });
      }
    }

    const itemTotal = (unitPrice + variantPrice + addonsTotal) * item.quantity;
    subtotal += itemTotal;

    orderItemsData.push({
      menu_item_id: item.menu_item_id,
      variant_id: item.variant_id || null,
      name: menuItem.name,
      variant_name: variantName,
      quantity: item.quantity,
      unit_price: unitPrice,
      variant_price: variantPrice,
      addons_total: addonsTotal,
      item_total: itemTotal,
      gst_rate: Number(menuItem.gst_rate) || taxConfig.default_gst_rate || 0,
      kitchen_station: menuItem.kitchen_station,
      notes: item.notes || null,
      addons: orderAddons,
    });
  }

  // ── Tax loop (createOrder:260-271) ────────────────────────────────────────
  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;
  let totalTaxPaise = 0;

  for (const oi of orderItemsData) {
    const tax = calculateItemTax(
      { base_price: oi.unit_price + oi.variant_price + (oi.addons_total / oi.quantity), quantity: oi.quantity, gst_rate: oi.gst_rate, is_inclusive: taxConfig.gst_inclusive },
      taxConfig
    );
    oi.item_tax = tax.total_tax;
    oi.taxable_amount = tax.taxable_amount;
    cgstPaise += Math.round(tax.cgst * 100);
    sgstPaise += Math.round(tax.sgst * 100);
    igstPaise += Math.round(tax.igst * 100);
    totalTaxPaise += Math.round(tax.total_tax * 100);
  }

  return {
    orderItemsData,
    subtotal,
    tax: { cgstPaise, sgstPaise, igstPaise, totalTaxPaise },
  };
}

/**
 * Compute final order monetary totals from a subtotal and the accumulated tax
 * paise produced by {@link buildOrderItems}. Reproduces createOrder:273-280.
 *
 * @param {number} subtotal - Float subtotal from buildOrderItems
 * @param {object} taxConfig - { gst_inclusive }
 * @param {string} countryCode - 'AU' or 'IN'
 * @param {{ cgstPaise:number, sgstPaise:number, igstPaise:number, totalTaxPaise:number }} taxPaise
 * @returns {{ cgst:number, sgst:number, igst:number, totalTax:number, totalAmount:number, grandTotal:number, roundOff:number }}
 */
function computeOrderTotals(subtotal, taxConfig, countryCode, taxPaise) {
  const cgst = taxPaise.cgstPaise / 100;
  const sgst = taxPaise.sgstPaise / 100;
  const igst = taxPaise.igstPaise / 100;
  const totalTax = taxPaise.totalTaxPaise / 100;

  // For inclusive pricing (AU), total is just the subtotal (tax is already inside)
  const totalAmount = taxConfig.gst_inclusive ? subtotal : subtotal + totalTax;
  const { grandTotal, roundOff } = computeGrandTotal(totalAmount, countryCode);

  return { cgst, sgst, igst, totalTax, totalAmount, grandTotal, roundOff };
}

module.exports = { buildOrderItems, computeOrderTotals, computeGrandTotal };
