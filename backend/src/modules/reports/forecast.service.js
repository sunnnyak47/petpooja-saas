/**
 * @fileoverview AI Demand Forecasting Service
 * Uses weighted moving averages on DailySummary + OrderItem history
 * to predict tomorrow's revenue, order count, and top-selling items.
 * Falls back gracefully when historical data is thin.
 * @module modules/reports/forecast.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

/* ── Constants ──────────────────────────────────────────────── */
const LOOKBACK_DAYS  = 28;   // how far back to look
const EMA_ALPHA      = 0.3;  // exponential smoothing weight (higher = recent bias)
const MIN_DATA_DAYS  = 3;    // minimum days needed for a real prediction

/**
 * Compute weighted moving average with exponential smoothing.
 * @param {number[]} values - oldest → newest
 * @param {number} alpha - smoothing factor (0-1)
 * @returns {number}
 */
function ema(values, alpha = EMA_ALPHA) {
  if (!values.length) return 0;
  let result = values[0];
  for (let i = 1; i < values.length; i++) {
    result = alpha * values[i] + (1 - alpha) * result;
  }
  return result;
}

/**
 * Day-of-week index for tomorrow (0=Sun…6=Sat).
 */
function tomorrowDOW() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.getDay();
}

/**
 * Get demand forecast for an outlet.
 * @param {string} outletId
 * @returns {Promise<object>} Forecast data object
 */
async function getDemandForecast(outletId) {
  const prisma  = getDbClient();
  const lookback = new Date();
  lookback.setDate(lookback.getDate() - LOOKBACK_DAYS);
  lookback.setHours(0, 0, 0, 0);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDow = tomorrowDOW();
  const DOW_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  /* ── 1. Pull DailySummary rows ─────────────────────────────── */
  const dailies = await prisma.dailySummary.findMany({
    where: {
      outlet_id:    outletId,
      is_deleted:   false,
      summary_date: { gte: lookback },
    },
    orderBy: { summary_date: 'asc' },
    select: {
      summary_date: true,
      total_orders: true,
      total_revenue: true,
      avg_order_value: true,
    },
  });

  /* ── 2. Pull order-item history for top-item prediction ─────── */
  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: {
        outlet_id:  outletId,
        created_at: { gte: lookback },
        is_deleted: false,
        status:     { notIn: ['cancelled', 'voided'] },
      },
      is_deleted: false,
    },
    select: {
      menu_item_id: true,
      quantity:     true,
      menu_item: { select: { name: true, food_type: true, base_price: true } },
      order: { select: { created_at: true } },
    },
  });

  /* ── 3. Check data sufficiency ─────────────────────────────── */
  const hasHistory = dailies.length >= MIN_DATA_DAYS;

  if (!hasHistory && !orderItems.length) {
    return {
      forecast_date:     tomorrow.toISOString().split('T')[0],
      day_of_week:       DOW_NAMES[tomorrowDow],
      predicted_revenue: 0,
      predicted_orders:  0,
      avg_order_value:   0,
      top_predicted_items: [],
      confidence:        'low',
      note:              'Insufficient historical data — start taking orders to enable forecasting.',
    };
  }

  /* ── 4. Revenue & orders forecast (EMA on all days, DOW-adjusted) ── */
  let revenueAll = dailies.map(d => Number(d.total_revenue));
  let ordersAll  = dailies.map(d => d.total_orders);

  // DOW-specific rows (same weekday as tomorrow)
  const dowRows = dailies.filter(d => new Date(d.summary_date).getDay() === tomorrowDow);
  const dowRevenues = dowRows.map(d => Number(d.total_revenue));
  const dowOrders   = dowRows.map(d => d.total_orders);

  // Blend global EMA with DOW-specific EMA (60/40 when DOW data exists)
  const globalRevEma = ema(revenueAll);
  const globalOrdEma = ema(ordersAll);

  let predictedRevenue, predictedOrders;
  if (dowRevenues.length >= 2) {
    const dowRevEma = ema(dowRevenues);
    const dowOrdEma = ema(dowOrders);
    predictedRevenue = Math.round((0.4 * globalRevEma + 0.6 * dowRevEma) * 100) / 100;
    predictedOrders  = Math.round(0.4 * globalOrdEma + 0.6 * dowOrdEma);
  } else {
    predictedRevenue = Math.round(globalRevEma * 100) / 100;
    predictedOrders  = Math.round(globalOrdEma);
  }

  const avgOv = predictedOrders > 0
    ? Math.round((predictedRevenue / predictedOrders) * 100) / 100
    : 0;

  /* ── 5. Top-item prediction ────────────────────────────────── */
  // Aggregate quantity sold per item; weight recent days 2×
  const cutoff14 = new Date();
  cutoff14.setDate(cutoff14.getDate() - 14);

  const itemMap = new Map();
  for (const oi of orderItems) {
    if (!oi.menu_item) continue;
    const isRecent = new Date(oi.order.created_at) >= cutoff14;
    const key = oi.menu_item_id;
    if (!itemMap.has(key)) {
      itemMap.set(key, {
        menu_item_id: key,
        name:         oi.menu_item.name,
        food_type:    oi.menu_item.food_type,
        base_price:   Number(oi.menu_item.base_price),
        qty:          0,
        score:        0,
      });
    }
    const entry = itemMap.get(key);
    entry.qty   += oi.quantity;
    entry.score += oi.quantity * (isRecent ? 2 : 1); // recency weight
  }

  // DOW-specific boost: items sold most on same weekday
  for (const oi of orderItems) {
    if (!oi.menu_item) continue;
    if (new Date(oi.order.created_at).getDay() === tomorrowDow) {
      const entry = itemMap.get(oi.menu_item_id);
      if (entry) entry.score += oi.quantity * 1.5; // DOW boost
    }
  }

  const topItems = [...itemMap.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(item => ({
      menu_item_id:      item.menu_item_id,
      name:              item.name,
      food_type:         item.food_type,
      base_price:        item.base_price,
      predicted_qty:     Math.max(1, Math.round(item.qty / Math.max(dailies.length, 1))),
      popularity_score:  Math.round(item.score),
    }));

  /* ── 6. Confidence rating ─────────────────────────────────── */
  let confidence = 'low';
  if (dailies.length >= 21)      confidence = 'high';
  else if (dailies.length >= 7)  confidence = 'medium';

  /* ── 7. Revenue variance (± range) ───────────────────────── */
  const stdDev = revenueAll.length > 1
    ? Math.sqrt(revenueAll.reduce((s, v) => s + (v - globalRevEma) ** 2, 0) / revenueAll.length)
    : predictedRevenue * 0.15;

  logger.info(`[Forecast] Outlet ${outletId} — predicted ₹${predictedRevenue} (${predictedOrders} orders) for ${DOW_NAMES[tomorrowDow]}`);

  return {
    forecast_date:       tomorrow.toISOString().split('T')[0],
    day_of_week:         DOW_NAMES[tomorrowDow],
    predicted_revenue:   predictedRevenue,
    predicted_orders:    predictedOrders,
    avg_order_value:     avgOv,
    revenue_range: {
      low:  Math.round(Math.max(0, predictedRevenue - stdDev)),
      high: Math.round(predictedRevenue + stdDev),
    },
    top_predicted_items: topItems,
    confidence,
    data_points:         dailies.length,
    note: confidence === 'low'
      ? `Based on ${dailies.length} day(s) of history — forecast improves with more data.`
      : `Based on ${dailies.length} days of sales history.`,
  };
}

module.exports = { getDemandForecast };
