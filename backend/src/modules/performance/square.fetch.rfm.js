/**
 * @fileoverview RFM (Recency / Frequency / Monetary) customer-segmentation
 * fetcher for the Phase-2 Square analytics pipeline. Walks a merchant's
 * payments over a date range, groups them by customer, and buckets each
 * customer into a single behavioural segment (Champions, Loyal, New, At Risk,
 * Lost, Promising).
 *
 * All Square money amounts arrive in CENTS; per-segment averages are
 * normalised to dollars via toDollars() before being returned. This module
 * never throws — on any failure (e.g. a 403 from a token lacking
 * PAYMENTS_READ) it logs a warning and reports the data as unavailable.
 * @module modules/performance/square.fetch.rfm
 */

const { sqGet, toDollars, MAX_PAGES } = require('./square.http');
const logger = require('../../config/logger');

// Segment evaluation order — each customer matches exactly one (first wins).
const SEGMENTS = ['Champions', 'Loyal', 'New', 'At Risk', 'Lost', 'Promising'];

/** Classify a single customer's RFM signals into one segment label. */
function classify(frequency, recencyDays) {
  if (frequency >= 4 && recencyDays <= 30) return 'Champions';
  if (frequency >= 2 && recencyDays <= 60) return 'Loyal';
  if (frequency === 1 && recencyDays <= 30) return 'New';
  if (recencyDays > 60 && recencyDays <= 120) return 'At Risk';
  if (recencyDays > 120) return 'Lost';
  return 'Promising';
}

/**
 * Build RFM customer segments from a merchant's payments over [beginISO, endISO].
 * @param {object} ctx - Square API context.
 * @param {string} beginISO - Inclusive range start (RFC 3339).
 * @param {string} endISO - Inclusive range end (RFC 3339).
 * @returns {Promise<object>} RFM summary, or { available: false }.
 */
async function fetchCustomerRFM(ctx, beginISO, endISO) {
  try {
    const customers = new Map(); // customer_id -> { frequency, monetaryCents, last }

    let cursor;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      let path =
        `/v2/payments?begin_time=${encodeURIComponent(beginISO)}` +
        `&end_time=${encodeURIComponent(endISO)}&sort_order=ASC&limit=100`;
      if (cursor) path += `&cursor=${encodeURIComponent(cursor)}`;

      const data = await sqGet(ctx, path);
      const payments = data.payments || [];

      for (const p of payments) {
        const status = p.status;
        if (status !== 'COMPLETED' && status !== 'APPROVED') continue;
        if (!p.customer_id) continue;

        const entry = customers.get(p.customer_id) || { frequency: 0, monetaryCents: 0, last: null };
        entry.frequency += 1;
        entry.monetaryCents += Number(p.amount_money?.amount) || 0;
        if (!entry.last || new Date(p.created_at) > new Date(entry.last)) {
          entry.last = p.created_at;
        }
        customers.set(p.customer_id, entry);
      }

      cursor = data.cursor;
      if (!cursor) break;
    }

    if (customers.size === 0) return { available: false };

    // Aggregate each customer into its segment bucket.
    const buckets = new Map(); // segment -> { count, monetaryCents }
    const now = Date.now();
    for (const c of customers.values()) {
      const recencyDays = Math.floor((now - new Date(c.last)) / 86400000);
      const segment = classify(c.frequency, recencyDays);
      const b = buckets.get(segment) || { count: 0, monetaryCents: 0 };
      b.count += 1;
      b.monetaryCents += c.monetaryCents;
      buckets.set(segment, b);
    }

    const segments = SEGMENTS.map((segment) => {
      const b = buckets.get(segment);
      if (!b || b.count === 0) return { segment, count: 0, avg_spend: 0 };
      return { segment, count: b.count, avg_spend: toDollars(b.monetaryCents / b.count) };
    });

    return { available: true, total_customers: customers.size, segments };
  } catch (e) {
    logger.warn('[SquarePull] RFM unavailable', { error: e.message });
    return { available: false };
  }
}

module.exports = { fetchCustomerRFM };
