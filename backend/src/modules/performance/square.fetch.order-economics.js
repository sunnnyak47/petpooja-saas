/**
 * @fileoverview Order-economics fetcher for the Phase-2 Square analytics
 * pipeline. Searches a merchant's closed orders over a date range and surfaces
 * discount totals, return totals, sales-channel mix, and a time-of-day
 * (daypart) breakdown.
 *
 * All Square money amounts arrive in CENTS; sums are normalised to dollars via
 * toDollars() before being returned. This module never throws — on any failure
 * (e.g. a 403 from a token lacking ORDERS_READ) it logs a warning and reports
 * the data as unavailable.
 * @module modules/performance/square.fetch.order-economics
 */

const { sqPost, toDollars, MAX_PAGES } = require('./square.http');
const logger = require('../../config/logger');

// Daypart bucket order, used to emit a stable Breakfast→Late night sequence.
const DAYPART_ORDER = ['Breakfast', 'Lunch', 'Afternoon', 'Dinner', 'Late night'];

/** Map a Square fulfillment type to a human sales channel. */
function mapFulfillment(order) {
  const type = order.fulfillments?.[0]?.type;
  if (type === 'PICKUP') return 'Takeaway';
  if (type === 'DELIVERY') return 'Delivery';
  if (type === 'SHIPMENT') return 'Shipment';
  return 'Dine-in';
}

/** Bucket an order's closing hour (UTC) into a daypart label. */
function mapDaypart(order) {
  const h = new Date(order.closed_at || order.created_at).getUTCHours();
  if (h >= 5 && h <= 10) return 'Breakfast';
  if (h >= 11 && h <= 14) return 'Lunch';
  if (h >= 15 && h <= 16) return 'Afternoon';
  if (h >= 17 && h <= 21) return 'Dinner';
  return 'Late night';
}

/**
 * Analyse a location's closed orders over [beginISO, endISO].
 * @param {object} ctx - Square API context.
 * @param {string} locationId - Square location id.
 * @param {string} beginISO - Inclusive range start (RFC 3339).
 * @param {string} endISO - Inclusive range end (RFC 3339).
 * @returns {Promise<object>} Order-economics summary, or { available: false }.
 */
async function fetchOrderEconomics(ctx, locationId, beginISO, endISO) {
  if (!locationId) return { available: false };

  try {
    let discountsCents = 0;
    let returnsCents = 0;
    let ordersCount = 0;
    const channelMap = new Map(); // channel -> { amount, count }
    const daypartMap = new Map(); // part -> { amount, count }

    let cursor;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const body = {
        location_ids: [locationId],
        query: { filter: { date_time_filter: { closed_at: { start_at: beginISO, end_at: endISO } } } },
        limit: 200,
      };
      if (cursor) body.cursor = cursor;

      const data = await sqPost(ctx, '/v2/orders/search', body);
      const orders = data.orders || [];

      for (const order of orders) {
        ordersCount += 1;

        // Discounts — prefer the order-level total, fall back to line discounts.
        const orderDiscount = order.total_discount_money?.amount;
        if (orderDiscount != null) {
          discountsCents += orderDiscount;
        } else {
          discountsCents += (order.discounts || []).reduce(
            (sum, d) => sum + (d.amount_money?.amount || 0),
            0,
          );
        }

        // Returns.
        returnsCents += order.return_amounts?.total_money?.amount || 0;

        const totalCents = order.total_money?.amount || 0;

        // Sales-channel mix.
        const channel = order.source?.name || mapFulfillment(order);
        const ch = channelMap.get(channel) || { amount: 0, count: 0 };
        ch.amount += totalCents;
        ch.count += 1;
        channelMap.set(channel, ch);

        // Daypart breakdown.
        const part = mapDaypart(order);
        const dp = daypartMap.get(part) || { amount: 0, count: 0 };
        dp.amount += totalCents;
        dp.count += 1;
        daypartMap.set(part, dp);
      }

      cursor = data.cursor;
      if (!cursor) break;
    }

    if (ordersCount === 0) return { available: false };

    const channel_mix = [...channelMap.entries()]
      .map(([channel, v]) => ({ channel, amount: toDollars(v.amount), count: v.count }))
      .sort((a, b) => b.amount - a.amount);

    const daypart = DAYPART_ORDER.filter((part) => daypartMap.has(part)).map((part) => {
      const v = daypartMap.get(part);
      return { part, amount: toDollars(v.amount), count: v.count };
    });

    return {
      available: true,
      discounts_total: toDollars(discountsCents),
      returns_total: toDollars(returnsCents),
      orders_count: ordersCount,
      channel_mix,
      daypart,
    };
  } catch (e) {
    logger.warn('[SquarePull] order economics unavailable', { error: e.message });
    return { available: false };
  }
}

module.exports = { fetchOrderEconomics };
