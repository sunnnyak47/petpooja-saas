/**
 * @fileoverview Square data-pull service — pulls EVERY Square module via the
 * Square REST API for an outlet and aggregates it into per-day rows in the
 * `square_snapshots` Postgres table. This feeds a combined Square + Xero
 * analytics dashboard.
 *
 * Per-day aggregated modules: payments, refunds, payouts, disputes, orders.
 * Current-total (point-in-time) modules stored only on the latest day's row:
 * customers, loyalty, gift cards. Labor is aggregated per day.
 *
 * Each module fetch is wrapped in its own try/catch so a missing scope (403) or
 * any single-module error never aborts the others — many merchants only use
 * Square for payments. All Square money amounts arrive in CENTS and are stored
 * as DOLLARS.
 *
 * @module modules/performance/square.pull.service
 */
const square = require('../integrations/square.service');
const prisma = require('../../config/database').getDbClient();
const logger = require('../../config/logger');
const { fetchCatalog } = require('./square.fetch.catalog');
const { fetchInventory } = require('./square.fetch.inventory');
const { fetchOrderEconomics } = require('./square.fetch.order-economics');
const { fetchStaffPerformance } = require('./square.fetch.staff');
const { fetchCustomerRFM } = require('./square.fetch.rfm');
const { fetchCashDrawer } = require('./square.fetch.cashdrawer');

// Pagination safety cap — never loop more than this many pages per module.
const MAX_PAGES = 25;

/** Build the standard Square auth/version headers from an API context. */
function sqHeaders(ctx) {
  return {
    Authorization: `Bearer ${ctx.accessToken}`,
    'Square-Version': ctx.version,
    'Content-Type': 'application/json',
  };
}

/** GET a Square REST path, returning parsed JSON; throws on !res.ok. */
async function sqGet(ctx, path) {
  const res = await fetch(`${ctx.apiBase}${path}`, { method: 'GET', headers: sqHeaders(ctx) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Square GET ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

/** POST a Square REST path with a JSON body, returning parsed JSON; throws on !res.ok. */
async function sqPost(ctx, path, body) {
  const res = await fetch(`${ctx.apiBase}${path}`, {
    method: 'POST',
    headers: sqHeaders(ctx),
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Square POST ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

/** UTC `YYYY-MM-DD` for an ISO/Date-ish value. Returns null if unparseable. */
function dateKey(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Cents (integer) → dollars (number, 2 dp). */
function toDollars(cents) {
  return Math.round((Number(cents) || 0)) / 100;
}

/** Fresh per-day accumulator with all fields zeroed. */
function newAccumulator() {
  return {
    payments_count: 0,
    gross: 0, // cents
    fees: 0, // cents
    refunds: 0, // cents
    tips: 0, // cents
    payout_total: 0, // cents
    disputes_count: 0,
    disputes_amount: 0, // cents
    labor_hours: 0,
    labor_cost: 0, // cents
    customers_count: 0,
    loyalty_members: 0,
    giftcard_outstanding: 0, // cents
    payment_mix: {}, // brand -> cents
    hourly: {}, // hour(0-23) -> cents
    items: {}, // name -> { qty, gross(cents) }
  };
}

/** Get (creating if needed) the accumulator for a date key. */
function acc(map, key) {
  if (!map.has(key)) map.set(key, newAccumulator());
  return map.get(key);
}

/**
 * Pull every Square module for an outlet over the last `days` days and upsert
 * one aggregated row per day into `square_snapshots`.
 *
 * @param {string} outletId
 * @param {{ days?: number }} [opts]
 * @returns {Promise<{ ok:true, days_pulled:number, latest:(string|null), modules:Object }>}
 */
async function pullAll(outletId, { days = 30 } = {}) {
  // Throws (and propagates to the caller) if the outlet isn't connected.
  const ctx = await square.getApiContext(outletId);
  const environment = String(ctx.apiBase).includes('sandbox') ? 'sandbox' : 'production';
  const locationId = ctx.locationId || null;

  const now = new Date();
  const begin = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const beginISO = begin.toISOString();
  const endISO = now.toISOString();

  const map = new Map(); // dateStr -> accumulator
  const modules = {
    payments: false,
    refunds: false,
    payouts: false,
    disputes: false,
    orders: false,
    customers: false,
    loyalty: false,
    giftcards: false,
    labor: false,
  };

  // 1. Payments (per-day) ─────────────────────────────────────────────────────
  try {
    let cursor;
    let page = 0;
    do {
      const qs = `?begin_time=${encodeURIComponent(beginISO)}&end_time=${encodeURIComponent(endISO)}` +
        `&sort_order=ASC&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const json = await sqGet(ctx, `/v2/payments${qs}`);
      for (const p of json.payments || []) {
        const status = p.status;
        if (status !== 'COMPLETED' && status !== 'APPROVED') continue;
        const key = dateKey(p.created_at) || dateKey(endISO);
        const a = acc(map, key);
        const amount = Number(p.amount_money?.amount) || 0;
        a.gross += amount;
        a.tips += Number(p.tip_money?.amount) || 0;
        for (const f of p.processing_fee || []) {
          a.fees += Number(f.amount_money?.amount) || 0;
        }
        a.payments_count += 1;
        const brand = p.card_details?.card?.card_brand || 'OTHER';
        a.payment_mix[brand] = (a.payment_mix[brand] || 0) + amount;
        const hour = new Date(p.created_at).getUTCHours();
        if (!Number.isNaN(hour)) a.hourly[hour] = (a.hourly[hour] || 0) + amount;
      }
      cursor = json.cursor;
    } while (cursor && ++page < MAX_PAGES);
    modules.payments = true;
  } catch (e) {
    logger.warn('[SquarePull] payments unavailable', { error: e.message });
  }

  // 2. Refunds (per-day) ──────────────────────────────────────────────────────
  try {
    let cursor;
    let page = 0;
    do {
      const qs = `?begin_time=${encodeURIComponent(beginISO)}&end_time=${encodeURIComponent(endISO)}` +
        `&sort_order=ASC&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const json = await sqGet(ctx, `/v2/refunds${qs}`);
      for (const r of json.refunds || []) {
        const key = dateKey(r.created_at) || dateKey(endISO);
        acc(map, key).refunds += Number(r.amount_money?.amount) || 0;
      }
      cursor = json.cursor;
    } while (cursor && ++page < MAX_PAGES);
    modules.refunds = true;
  } catch (e) {
    logger.warn('[SquarePull] refunds unavailable', { error: e.message });
  }

  // 3. Payouts (per-day) ──────────────────────────────────────────────────────
  try {
    let cursor;
    let page = 0;
    let needLocation = false;
    do {
      const base = `?begin_time=${encodeURIComponent(beginISO)}&end_time=${encodeURIComponent(endISO)}&limit=100`;
      const loc = needLocation && locationId ? `&location_id=${encodeURIComponent(locationId)}` : '';
      const qs = `${base}${loc}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      let json;
      try {
        json = await sqGet(ctx, `/v2/payouts${qs}`);
      } catch (inner) {
        // Retry once with explicit location_id on a 400.
        if (!needLocation && locationId && /\(400\)/.test(inner.message)) {
          needLocation = true;
          const qs2 = `${base}&location_id=${encodeURIComponent(locationId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
          json = await sqGet(ctx, `/v2/payouts${qs2}`);
        } else {
          throw inner;
        }
      }
      for (const po of json.payouts || []) {
        if (po.status !== 'PAID') continue;
        const key = dateKey(po.created_at) || dateKey(endISO);
        acc(map, key).payout_total += Number(po.amount_money?.amount) || 0;
      }
      cursor = json.cursor;
    } while (cursor && ++page < MAX_PAGES);
    modules.payouts = true;
  } catch (e) {
    logger.warn('[SquarePull] payouts unavailable', { error: e.message });
  }

  // 4. Disputes (per-day) ─────────────────────────────────────────────────────
  try {
    let cursor;
    let page = 0;
    do {
      const qs = `?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const json = await sqGet(ctx, `/v2/disputes${qs}`);
      for (const d of json.disputes || []) {
        const key = dateKey(d.created_at) || dateKey(endISO);
        const a = acc(map, key);
        a.disputes_count += 1;
        a.disputes_amount += Number(d.amount_money?.amount) || 0;
      }
      cursor = json.cursor;
    } while (cursor && ++page < MAX_PAGES);
    modules.disputes = true;
  } catch (e) {
    logger.warn('[SquarePull] disputes unavailable', { error: e.message });
  }

  // 5. Orders → item breakdown (per-day) ──────────────────────────────────────
  if (locationId) {
    try {
      let cursor;
      let page = 0;
      do {
        const body = {
          location_ids: [locationId],
          query: { filter: { date_time_filter: { closed_at: { start_at: beginISO, end_at: endISO } } } },
          limit: 200,
        };
        if (cursor) body.cursor = cursor;
        const json = await sqPost(ctx, '/v2/orders/search', body);
        for (const o of json.orders || []) {
          const key = dateKey(o.closed_at || o.created_at) || dateKey(endISO);
          const a = acc(map, key);
          for (const li of o.line_items || []) {
            const name = li.name || 'Unknown';
            if (!a.items[name]) a.items[name] = { qty: 0, gross: 0 };
            a.items[name].qty += parseInt(li.quantity, 10) || 0;
            a.items[name].gross += Number(li.gross_sales_money?.amount ?? li.total_money?.amount) || 0;
          }
        }
        cursor = json.cursor;
      } while (cursor && ++page < MAX_PAGES);
      modules.orders = true;
    } catch (e) {
      logger.warn('[SquarePull] orders unavailable', { error: e.message });
    }
  }

  // 9. Labor (per-day) ────────────────────────────────────────────────────────
  try {
    let cursor;
    let page = 0;
    do {
      const body = {
        query: { filter: { start: { start_at: beginISO, end_at: endISO } } },
        limit: 200,
      };
      if (cursor) body.cursor = cursor;
      const json = await sqPost(ctx, '/v2/labor/shifts/search', body);
      for (const s of json.shifts || []) {
        if (!s.start_at || !s.end_at) continue;
        const start = new Date(s.start_at).getTime();
        const end = new Date(s.end_at).getTime();
        if (Number.isNaN(start) || Number.isNaN(end)) continue;
        let hours = (end - start) / 3600000;
        for (const b of s.breaks || []) {
          if (b.start_at && b.end_at) {
            const bs = new Date(b.start_at).getTime();
            const be = new Date(b.end_at).getTime();
            if (!Number.isNaN(bs) && !Number.isNaN(be)) hours -= (be - bs) / 3600000;
          }
        }
        if (hours < 0) hours = 0;
        const key = dateKey(s.start_at) || dateKey(endISO);
        const a = acc(map, key);
        a.labor_hours += hours;
        const rateCents = Number(s.wage?.hourly_rate?.amount) || 0;
        a.labor_cost += hours * rateCents; // cents
      }
      cursor = json.cursor;
    } while (cursor && ++page < MAX_PAGES);
    modules.labor = true;
  } catch (e) {
    logger.warn('[SquarePull] labor unavailable', { error: e.message });
  }

  // ── Current-total modules (point-in-time) ───────────────────────────────────
  let customersCount = 0;
  try {
    let cursor;
    let page = 0;
    do {
      const qs = `?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const json = await sqGet(ctx, `/v2/customers${qs}`);
      customersCount += (json.customers || []).length;
      cursor = json.cursor;
    } while (cursor && ++page < 20);
    modules.customers = true;
  } catch (e) {
    logger.warn('[SquarePull] customers unavailable', { error: e.message });
  }

  let loyaltyMembers = 0;
  try {
    // Optional: confirm a program exists (non-fatal if it 403s).
    try { await sqGet(ctx, '/v2/loyalty/programs'); } catch (_) { /* ignore */ }
    let cursor;
    let page = 0;
    do {
      const body = { limit: 200 };
      if (cursor) body.cursor = cursor;
      const json = await sqPost(ctx, '/v2/loyalty/accounts/search', body);
      loyaltyMembers += (json.loyalty_accounts || []).length;
      cursor = json.cursor;
    } while (cursor && ++page < 10);
    modules.loyalty = true;
  } catch (e) {
    logger.warn('[SquarePull] loyalty unavailable', { error: e.message });
  }

  let giftcardOutstanding = 0; // cents
  try {
    let cursor;
    let page = 0;
    do {
      const qs = `?state=ACTIVE&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const json = await sqGet(ctx, `/v2/gift-cards${qs}`);
      for (const g of json.gift_cards || []) {
        giftcardOutstanding += Number(g.balance_money?.amount) || 0;
      }
      cursor = json.cursor;
    } while (cursor && ++page < MAX_PAGES);
    modules.giftcards = true;
  } catch (e) {
    logger.warn('[SquarePull] gift cards unavailable', { error: e.message });
  }

  // ── Phase-2 operations analytics (period-level, fetched once) ──────────────
  // Each fetcher is fault-tolerant (returns { available:false } on a missing
  // scope or error) and never throws, so Promise.all is safe.
  const operations = {};
  try {
    const [catalog, inventory, order_economics, staff, rfm, cash_drawer] = await Promise.all([
      fetchCatalog(ctx),
      fetchInventory(ctx, locationId),
      fetchOrderEconomics(ctx, locationId, beginISO, endISO),
      fetchStaffPerformance(ctx, locationId, beginISO, endISO),
      fetchCustomerRFM(ctx, beginISO, endISO),
      fetchCashDrawer(ctx, locationId, beginISO, endISO),
    ]);
    Object.assign(operations, { catalog, inventory, order_economics, staff, rfm, cash_drawer });
  } catch (e) {
    logger.warn('[SquarePull] operations analytics failed', { error: e.message });
  }
  const hasOps = Object.values(operations).some(o => o && o.available);

  // Attribute current totals to the latest day's row (creating it if needed).
  const latest = map.size
    ? [...map.keys()].sort().slice(-1)[0]
    : dateKey(endISO);
  if (modules.customers || modules.loyalty || modules.giftcards) {
    const a = acc(map, latest);
    a.customers_count = customersCount;
    a.loyalty_members = loyaltyMembers;
    a.giftcard_outstanding = giftcardOutstanding;
  }
  // Ensure a row exists to carry the operations payload even with no payments.
  if (hasOps && !map.has(latest)) acc(map, latest);

  // ── Upsert one row per day ──────────────────────────────────────────────────
  const dates = [...map.keys()].sort();
  for (const dateStr of dates) {
    const a = map.get(dateStr);
    const gross_sales = toDollars(a.gross);
    const fees = toDollars(a.fees);
    const refunds = toDollars(a.refunds);
    const tips = toDollars(a.tips);
    const payout_total = toDollars(a.payout_total);
    const disputes_amount = toDollars(a.disputes_amount);
    const labor_cost = toDollars(a.labor_cost);
    const giftcard_outstanding = toDollars(a.giftcard_outstanding);
    const labor_hours = Math.round(a.labor_hours * 100) / 100;
    const net_sales = Math.round((gross_sales - refunds - fees) * 100) / 100;

    const payment_mix = Object.entries(a.payment_mix)
      .map(([brand, cents]) => ({ brand, amount: toDollars(cents) }))
      .sort((x, y) => y.amount - x.amount);
    const hourly = Object.entries(a.hourly)
      .map(([hour, cents]) => ({ hour: Number(hour), amount: toDollars(cents) }))
      .sort((x, y) => x.hour - y.hour);
    const top_items = Object.entries(a.items)
      .map(([name, v]) => ({ name, qty: v.qty, gross: toDollars(v.gross) }))
      .sort((x, y) => y.gross - x.gross)
      .slice(0, 10);

    const dataObj = { payment_mix, hourly, top_items, modules };
    if (dateStr === latest && hasOps) dataObj.operations = operations;

    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO square_snapshots
         (outlet_id, snapshot_date, environment, payments_count, gross_sales, fees, refunds, net_sales, tips, payout_total, disputes_count, disputes_amount, labor_hours, labor_cost, customers_count, loyalty_members, giftcard_outstanding, data, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb, now())
         ON CONFLICT (outlet_id, snapshot_date) DO UPDATE SET
           environment=EXCLUDED.environment, payments_count=EXCLUDED.payments_count, gross_sales=EXCLUDED.gross_sales,
           fees=EXCLUDED.fees, refunds=EXCLUDED.refunds, net_sales=EXCLUDED.net_sales, tips=EXCLUDED.tips,
           payout_total=EXCLUDED.payout_total, disputes_count=EXCLUDED.disputes_count, disputes_amount=EXCLUDED.disputes_amount,
           labor_hours=EXCLUDED.labor_hours, labor_cost=EXCLUDED.labor_cost, customers_count=EXCLUDED.customers_count,
           loyalty_members=EXCLUDED.loyalty_members, giftcard_outstanding=EXCLUDED.giftcard_outstanding, data=EXCLUDED.data, updated_at=now()`,
        outletId, dateStr, environment, a.payments_count, gross_sales, fees, refunds, net_sales, tips, payout_total,
        a.disputes_count, disputes_amount, labor_hours, labor_cost, a.customers_count, a.loyalty_members, giftcard_outstanding,
        JSON.stringify(dataObj)
      );
    } catch (e) {
      logger.warn('[SquarePull] upsert failed', { outletId, dateStr, error: e.message });
    }
  }

  const latestStored = dates.length ? dates[dates.length - 1] : null;
  logger.info('[SquarePull] completed', { outletId, days_pulled: dates.length, latest: latestStored });

  return { ok: true, days_pulled: dates.length, latest: latestStored, modules };
}

module.exports = { pullAll };
