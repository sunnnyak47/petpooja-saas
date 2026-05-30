/**
 * @fileoverview Reports service — sales, revenue, item-wise, payment, tax, and dashboard analytics.
 * @module modules/reports/reports.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const { round2, classifyPaymentMethod, getDateRange, validOrderWhere } = require('./report-helpers');
const { cached, getPersisted, setPersisted } = require('../../utils/reportCache');

/** Cache TTLs (seconds) tuned per report volatility. */
const TTL = {
  SHORT: 5 * 60,   // live-ish reports (daily, hourly, dashboard-adjacent)
  MEDIUM: 10 * 60, // item/category/staff/franchise breakdowns
  LONG: 15 * 60,   // heavy historical reports (GST detailed, advanced)
};

/**
 * Generates a daily sales summary for an outlet.
 * @param {string} outletId - Outlet UUID
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {Promise<object>} Daily sales summary
 */
async function getDailySales(outletId, date) {
  const prisma = getDbClient();
  try {
    const { start, end } = getDateRange(date, date);
    const baseWhere = {
      outlet_id: outletId,
      is_deleted: false,
      created_at: { gte: start, lt: end },
      status: { notIn: ['cancelled', 'voided'] },
    };

    return await cached(`daily-sales:${outletId}:${date}`, TTL.SHORT, async () => {
      const summary = {
        date,
        total_orders: 0,
        total_revenue: 0,
        total_tax: 0,
        total_discount: 0,
        by_type: { dine_in: 0, takeaway: 0, delivery: 0, online: 0, qr_order: 0 },
        by_source: { pos: 0, qr: 0, online: 0, kiosk: 0, app: 0 },
        by_payment: { cash: 0, card: 0, upi: 0, other: 0 },
        paid_orders: 0,
        unpaid_orders: 0,
        avg_order_value: 0,
      };

      // Aggregate order totals, type/source counts, and paid/unpaid splits in DB.
      const [totals, byType, bySource, paidGroups, paymentRows] = await Promise.all([
        prisma.order.aggregate({
          where: baseWhere,
          _count: { id: true },
          _sum: { grand_total: true, total_tax: true, discount_amount: true },
        }),
        prisma.order.groupBy({ by: ['order_type'], where: baseWhere, _count: { id: true } }),
        prisma.order.groupBy({ by: ['source'], where: baseWhere, _count: { id: true } }),
        prisma.order.groupBy({ by: ['is_paid'], where: baseWhere, _count: { id: true } }),
        // Payments for PAID + valid orders, grouped by method (matches the original
        // "only sum payments of paid orders" semantics).
        prisma.payment.groupBy({
          by: ['method'],
          where: {
            status: 'success',
            is_deleted: false,
            order: { ...baseWhere, is_paid: true },
          },
          _sum: { amount: true },
        }),
      ]);

      summary.total_orders = totals._count.id;
      summary.total_revenue = Number(totals._sum.grand_total || 0);
      summary.total_tax = Number(totals._sum.total_tax || 0);
      summary.total_discount = Number(totals._sum.discount_amount || 0);

      for (const g of byType) {
        summary.by_type[g.order_type] = (summary.by_type[g.order_type] || 0) + g._count.id;
      }
      for (const g of bySource) {
        summary.by_source[g.source] = (summary.by_source[g.source] || 0) + g._count.id;
      }
      for (const g of paidGroups) {
        if (g.is_paid) summary.paid_orders += g._count.id;
        else summary.unpaid_orders += g._count.id;
      }
      for (const p of paymentRows) {
        summary.by_payment[classifyPaymentMethod(p.method)] += Number(p._sum.amount || 0);
      }

      summary.avg_order_value = summary.total_orders > 0 ? round2(summary.total_revenue / summary.total_orders) : 0;
      summary.total_revenue = round2(summary.total_revenue);
      summary.total_tax = round2(summary.total_tax);

      return summary;
    });
  } catch (error) {
    logger.error('Get daily sales failed', { error: error.message });
    throw error;
  }
}

/**
 * Gets item-wise sales report (top sellers, revenue by item).
 * @param {string} outletId - Outlet UUID
 * @param {string} from - Start date
 * @param {string} to - End date
 * @param {number} [topN=20] - Number of top items
 * @returns {Promise<object>} Item-wise sales data
 */
async function getItemWiseSales(outletId, from, to, topN = 20) {
  const prisma = getDbClient();
  try {
    // Preserve original boundary semantics exactly: gte from, lte to (no setHours).
    const orderWhere = {
      outlet_id: outletId,
      is_deleted: false,
      status: { notIn: ['cancelled', 'voided'] },
      created_at: { gte: new Date(from), lte: new Date(to) },
    };

    return await cached(`item-wise:${outletId}:${from}:${to}:${topN}`, TTL.MEDIUM, async () => {
      // Push the per-item reduction into the DB. group by (menu_item_id, name) to
      // keep the original behaviour where differing names share a menu_item_id
      // would produce separate rows — matching the legacy Map keyed by menu_item_id
      // requires re-merging by id below.
      const grouped = await prisma.orderItem.groupBy({
        by: ['menu_item_id', 'name'],
        where: { is_deleted: false, order: orderWhere },
        _sum: { quantity: true, item_total: true, item_tax: true },
        _count: { id: true },
      });

      // Re-merge by menu_item_id (legacy keyed the Map on menu_item_id alone, taking
      // the first-seen name).
      const itemMap = new Map();
      let totalItemsSold = 0;
      let totalRevenue = 0;
      for (const g of grouped) {
        const qty = g._sum.quantity || 0;
        const rev = Number(g._sum.item_total || 0);
        const tax = Number(g._sum.item_tax || 0);
        totalItemsSold += qty;
        totalRevenue += rev;
        const existing = itemMap.get(g.menu_item_id) || {
          menu_item_id: g.menu_item_id, name: g.name,
          total_quantity: 0, total_revenue: 0, total_tax: 0, order_count: 0,
        };
        existing.total_quantity += qty;
        existing.total_revenue += rev;
        existing.total_tax += tax;
        existing.order_count += g._count.id;
        itemMap.set(g.menu_item_id, existing);
      }

      const items = Array.from(itemMap.values())
        .sort((a, b) => b.total_revenue - a.total_revenue)
        .slice(0, topN)
        .map((item) => ({
          ...item,
          total_revenue: round2(item.total_revenue),
          total_tax: round2(item.total_tax),
          avg_price: item.total_quantity > 0 ? round2(item.total_revenue / item.total_quantity) : 0,
        }));

      return {
        period: { from, to },
        total_items_sold: totalItemsSold,
        total_revenue: round2(totalRevenue),
        items,
      };
    });
  } catch (error) {
    logger.error('Get item-wise sales failed', { error: error.message });
    throw error;
  }
}

/**
 * Gets revenue trend report (daily/weekly/monthly).
 * @param {string} outletId - Outlet UUID
 * @param {string} from - Start date
 * @param {string} to - End date
 * @returns {Promise<object[]>} Array of daily revenue data points
 */
async function getRevenueTrend(outletId, from, to) {
  const prisma = getDbClient();
  try {
    return await cached(`revenue-trend:${outletId}:${new Date(from).toISOString()}:${new Date(to).toISOString()}`, TTL.SHORT, async () => {
    const summaries = await prisma.dailySummary.findMany({
      where: {
        outlet_id: outletId,
        summary_date: { gte: new Date(from), lte: new Date(to) },
      },
      orderBy: { summary_date: 'asc' },
    });

    return summaries.map((s) => ({
      date: s.summary_date,
      orders: s.total_orders,
      revenue: Number(s.total_revenue),
      tax: Number(s.total_tax),
      discount: Number(s.total_discount),
      dine_in: s.dine_in_orders,
      takeaway: s.takeaway_orders,
      delivery: s.delivery_orders,
      online: s.online_orders,
      avg_order_value: Number(s.avg_order_value),
    }));
    });
  } catch (error) {
    logger.error('Get revenue trend failed', { error: error.message });
    throw error;
  }
}

/**
 * Gets a dashboard summary with key KPIs for today.
 * @param {string} outletId - Outlet UUID
 * @returns {Promise<object>} Dashboard data
 */
async function getDashboard(outletId) {
  const prisma = getDbClient();
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const [todayOrders, yesterdayOrders, activeTables, pendingKots] = await Promise.all([
      prisma.order.findMany({
        where: {
          outlet_id: outletId, is_deleted: false,
          created_at: { gte: today, lt: tomorrow },
          status: { notIn: ['cancelled', 'voided', 'pending'] },
        },
      }),
      prisma.order.findMany({
        where: {
          outlet_id: outletId, is_deleted: false,
          created_at: { gte: yesterday, lt: today },
          status: { notIn: ['cancelled', 'voided'] },
        },
      }),
      prisma.table.count({
        where: { outlet_id: outletId, status: 'occupied', is_deleted: false },
      }),
      prisma.kOT.count({
        where: { outlet_id: outletId, status: { in: ['pending', 'preparing'] }, is_deleted: false },
      }),
    ]);

    // Revenue = only paid orders (matches EOD cash reconciliation)
    const todayPaid = todayOrders.filter((o) => o.is_paid);
    const todayRevenue = todayPaid.reduce((sum, o) => sum + Number(o.grand_total), 0);
    // Open tabs value = sum of grand_total for unpaid running orders.
    // Lets the dashboard explain "$0 revenue but 3 orders" → "$220 pending in 3 open tabs".
    const todayOpenTabs = todayOrders.filter((o) => !o.is_paid && o.status !== 'cancelled' && o.status !== 'voided');
    const todayOpenTabsValue = todayOpenTabs.reduce((sum, o) => sum + Number(o.grand_total), 0);
    // Gross = paid + open. Useful for projecting end-of-day cash position.
    const todayGrossRevenue = todayRevenue + todayOpenTabsValue;
    const yesterdayPaid = yesterdayOrders.filter((o) => o.is_paid);
    const yesterdayRevenue = yesterdayPaid.reduce((sum, o) => sum + Number(o.grand_total), 0);
    const revenueGrowth = yesterdayRevenue > 0
      ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 10000) / 100
      : 0;

    const totalTables = await prisma.table.count({
      where: { outlet_id: outletId, is_deleted: false },
    });

    return {
      today: {
        orders: todayOrders.length,
        revenue: Math.round(todayRevenue * 100) / 100,
        avg_order_value: todayPaid.length > 0
          ? Math.round((todayRevenue / todayPaid.length) * 100) / 100
          : 0,
        paid_orders: todayPaid.length,
        running_orders: todayOrders.filter((o) => !o.is_paid && o.status !== 'cancelled').length,
        // New fields — explain the "orders > 0 but revenue = 0" case clearly:
        open_tabs_value: Math.round(todayOpenTabsValue * 100) / 100,
        gross_revenue:   Math.round(todayGrossRevenue * 100) / 100,
      },
      comparison: {
        yesterday_revenue: Math.round(yesterdayRevenue * 100) / 100,
        yesterday_orders: yesterdayOrders.length,
        revenue_growth_pct: revenueGrowth,
      },
      live: {
        active_tables: activeTables,
        total_tables: totalTables,
        occupancy_pct: totalTables > 0 ? Math.round((activeTables / totalTables) * 100) : 0,
        pending_kots: pendingKots,
      },
    };
  } catch (error) {
    logger.error('Get dashboard failed', { error: error.message });
    throw error;
  }
}

/**
 * Gets hourly revenue breakdown for a date.
 * @param {string} outletId - Outlet UUID
 * @param {string} date - Date string
 * @returns {Promise<object[]>}
 */
async function getHourlyBreakdown(outletId, date) {
  const prisma = getDbClient();
  try {
    const { start, end } = getDateRange(date, date);

    return await cached(`hourly:${outletId}:${date}`, TTL.SHORT, async () => {
      // NOTE: hour buckets use the server-local clock to mirror the original
      // `new Date().getHours()` behaviour. We only select created_at + grand_total
      // (no nested includes), so the payload stays small; bucketing in JS keeps the
      // hour-of-day identical to the legacy output regardless of the DB session tz.
      // TODO(reports-tz): switch to SQL EXTRACT(HOUR FROM created_at AT TIME ZONE
      // <outlet_tz>) once getDateRange honours the outlet timezone.
      const orders = await prisma.order.findMany({
        where: {
          outlet_id: outletId, is_deleted: false,
          created_at: { gte: start, lt: end },
          status: { notIn: ['cancelled', 'voided'] },
        },
        select: { created_at: true, grand_total: true },
      });

      const hourly = Array.from({ length: 24 }, (_, i) => ({
        hour: i, orders: 0, revenue: 0,
      }));

      for (const order of orders) {
        const hour = new Date(order.created_at).getHours();
        hourly[hour].orders++;
        hourly[hour].revenue += Number(order.grand_total);
      }

      return hourly.map((h) => ({ ...h, revenue: round2(h.revenue) }));
    });
  } catch (error) {
    throw error;
  }
}

async function getCategoryWiseSales(outletId, from, to) {
  const prisma = getDbClient();
  try {
    // Preserve original quirky boundary defaults exactly.
    const fromDate = from ? new Date(from) : new Date();
    if(!from) fromDate.setHours(0,0,0,0);
    const toDate = to ? new Date(to) : new Date();
    if(!to) toDate.setDate(toDate.getDate() + 1);

    return await cached(`category-wise:${outletId}:${from || 'd'}:${to || 'd'}`, TTL.MEDIUM, async () => {
      // Push the per-item revenue sum to the DB, then roll up to category in JS
      // using a single id→category lookup (original status filter omits 'voided').
      const grouped = await prisma.orderItem.groupBy({
        by: ['menu_item_id'],
        where: { order: { outlet_id: outletId, status: { notIn: ['cancelled'] }, created_at: { gte: fromDate, lte: toDate } } },
        _sum: { item_total: true },
      });

      const ids = grouped.map((g) => g.menu_item_id);
      const menuItems = ids.length
        ? await prisma.menuItem.findMany({
            where: { id: { in: ids } },
            select: { id: true, category: { select: { name: true } } },
          })
        : [];
      const catById = {};
      for (const m of menuItems) catById[m.id] = m.category?.name || 'Uncategorised';

      const categories = {};
      for (const g of grouped) {
        const cat = catById[g.menu_item_id] || 'Uncategorised';
        if (!categories[cat]) categories[cat] = 0;
        categories[cat] += Number(g._sum.item_total || 0);
      }
      return Object.keys(categories).map(k => ({ category: k, revenue: categories[k] }));
    });
  } catch(e) { throw e; }
}

async function getGstReport(outletId, from, to) {
  const prisma = getDbClient();
  try {
    const fromDate = from ? new Date(from) : new Date();
    if(!from) fromDate.setHours(0,0,0,0);
    const toDate = to ? new Date(to) : new Date();
    if(!to) toDate.setDate(toDate.getDate() + 1);

    return await cached(`gst-report:${outletId}:${from || 'd'}:${to || 'd'}`, TTL.MEDIUM, async () => {
      // Aggregate subtotal/total_tax per UTC calendar day directly in Postgres.
      // The legacy code keyed on created_at.toISOString().split('T')[0] (UTC date),
      // so we bucket with `AT TIME ZONE 'UTC'` to reproduce identical day keys.
      const rows = await prisma.$queryRaw`
        SELECT to_char((created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS date,
               COALESCE(SUM(subtotal), 0)  AS taxable,
               COALESCE(SUM(total_tax), 0) AS total_tax
        FROM orders
        WHERE outlet_id = ${outletId}::uuid
          AND is_deleted = false
          AND status NOT IN ('cancelled')
          AND created_at >= ${fromDate}
          AND created_at <= ${toDate}
        GROUP BY 1
        ORDER BY 1
      `;

      return rows.map((r) => {
        const taxable = Number(r.taxable);
        const totalTax = Number(r.total_tax);
        return { date: r.date, taxable, cgst: totalTax / 2, sgst: totalTax / 2, total_tax: totalTax };
      });
    });
  } catch(e) { throw e; }
}

async function getStaffPerformance(outletId, from, to) {
  const prisma = getDbClient();
  try {
    const fromDate = from ? new Date(from) : new Date();
    if(!from) fromDate.setHours(0,0,0,0);
    const toDate = to ? new Date(to) : new Date();
    if(!to) toDate.setDate(toDate.getDate() + 1);

    return await cached(`staff-perf:${outletId}:${from || 'd'}:${to || 'd'}`, TTL.MEDIUM, async () => {
      const where = { outlet_id: outletId, is_deleted: false, status: { notIn: ['cancelled', 'voided'] }, created_at: { gte: fromDate, lte: toDate } };

      // Aggregate orders/revenue/discounts per staff_id in the DB.
      // (status excludes 'voided', so the legacy void branch was dead → voids = 0,
      // preserved below.)
      const grouped = await prisma.order.groupBy({
        by: ['staff_id'],
        where,
        _count: { id: true },
        _sum: { grand_total: true, discount_amount: true },
      });

      // Resolve staff names for the grouped ids.
      const ids = grouped.map((g) => g.staff_id).filter(Boolean);
      const users = ids.length
        ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, full_name: true } })
        : [];
      const nameById = {};
      for (const u of users) nameById[u.id] = u.full_name;

      // Merge by resolved staff name (null staff_id → 'Self Order / POS'); names can
      // collapse multiple ids, matching the original Map keyed on full_name.
      const staffMap = {};
      for (const g of grouped) {
        const staffName = (g.staff_id && nameById[g.staff_id]) || 'Self Order / POS';
        if (!staffMap[staffName]) staffMap[staffName] = { name: staffName, orders: 0, revenue: 0, discounts: 0, voids: 0 };
        staffMap[staffName].orders += g._count.id;
        staffMap[staffName].revenue += Number(g._sum.grand_total || 0);
        staffMap[staffName].discounts += Number(g._sum.discount_amount || 0);
      }
      return Object.values(staffMap).sort((a,b)=>b.revenue - a.revenue);
    });
  } catch(e) { throw e; }
}

async function getTopSellingItems(outletId, limit = 5) {
  const prisma = getDbClient();
  try {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;

    return await cached(`top-selling:${outletId}:${limit}:${monthKey}`, TTL.SHORT, async () => {
    const items = await prisma.orderItem.groupBy({
      by: ['menu_item_id', 'name'],
      where: {
        is_deleted: false,
        order: { 
          outlet_id: outletId, 
          is_deleted: false, 
          created_at: { gte: firstDay }, 
          status: { notIn: ['cancelled', 'voided'] } 
        }
      },
      _sum: { quantity: true, item_total: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit
    });

    return items.map(i => ({
      name: i.name,
      count: i._sum.quantity || 0,
      revenue: Number(i._sum.item_total || 0),
      // We don't have category here easily, stub for now as 'Food'
      category: 'Food'
    }));
    });
  } catch (error) {
    logger.error('Get top selling items failed', { error: error.message });
    throw error;
  }
}

/**
 * Detailed GST report with rate-wise, daily, and HSN breakdown.
 * @param {string} outletId
 * @param {string} from
 * @param {string} to
 */
async function getGstDetailedReport(outletId, from, to) {
  const prisma = getDbClient();
  try {
    const fromDate = from ? new Date(from) : new Date();
    if (!from) fromDate.setHours(0, 0, 0, 0);
    const toDate = to ? new Date(to) : new Date();
    if (to) toDate.setHours(23, 59, 59, 999);

    return await cached(`gst-detailed:${outletId}:${from || 'd'}:${to || 'd'}`, TTL.LONG, async () => {
    const orders = await prisma.order.findMany({
      where: {
        outlet_id: outletId,
        is_deleted: false,
        status: { notIn: ['cancelled', 'voided'] },
        created_at: { gte: fromDate, lte: toDate },
      },
      include: {
        order_items: {
          where: { is_deleted: false },
          select: {
            quantity: true,
            item_total: true,
            item_tax: true,
            gst_rate: true,
            name: true,
            menu_item: { select: { hsn_code: true, name: true } },
          },
        },
      },
    });

    // Daily register
    const dailyMap = {};
    // Rate-wise map
    const rateMap = {};
    // HSN map
    const hsnMap = {};

    let totalTaxable = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0, totalTax = 0;

    for (const order of orders) {
      const dateStr = order.created_at.toISOString().split('T')[0];
      if (!dailyMap[dateStr]) {
        dailyMap[dateStr] = { date: dateStr, order_count: 0, gross_revenue: 0, discount: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total_tax: 0, grand_total: 0 };
      }

      const gross = Number(order.subtotal || 0);
      const discount = Number(order.discount_amount || 0);
      const tax = Number(order.total_tax || 0);
      const cgst = Number(order.cgst || tax / 2);
      const sgst = Number(order.sgst || tax / 2);
      const igst = Number(order.igst || 0);
      const taxable = gross - discount;
      const grand = Number(order.grand_total || 0);

      dailyMap[dateStr].order_count++;
      dailyMap[dateStr].gross_revenue += gross;
      dailyMap[dateStr].discount += discount;
      dailyMap[dateStr].taxable += taxable;
      dailyMap[dateStr].cgst += cgst;
      dailyMap[dateStr].sgst += sgst;
      dailyMap[dateStr].igst += igst;
      dailyMap[dateStr].total_tax += tax;
      dailyMap[dateStr].grand_total += grand;

      totalTaxable += taxable;
      totalCgst += cgst;
      totalSgst += sgst;
      totalIgst += igst;
      totalTax += tax;

      // Rate-wise from items
      for (const item of order.order_items) {
        const rate = Number(item.gst_rate || 0);
        const itemTax = Number(item.item_tax || 0);
        const itemTotal = Number(item.item_total || 0);
        const itemTaxable = itemTotal;
        const itemCgst = itemTax / 2;
        const itemSgst = itemTax / 2;

        if (!rateMap[rate]) {
          rateMap[rate] = { rate, order_count: 0, taxable: 0, cgst: 0, sgst: 0, total_tax: 0 };
        }
        rateMap[rate].order_count++;
        rateMap[rate].taxable += itemTaxable;
        rateMap[rate].cgst += itemCgst;
        rateMap[rate].sgst += itemSgst;
        rateMap[rate].total_tax += itemTax;

        // HSN
        const hsnCode = item.menu_item?.hsn_code || null;
        const hsnKey = hsnCode || `NO_HSN_${rate}`;
        if (!hsnMap[hsnKey]) {
          hsnMap[hsnKey] = {
            hsn_code: hsnCode,
            description: item.menu_item?.name || item.name,
            gst_rate: rate,
            total_qty: 0,
            taxable: 0,
            cgst: 0,
            sgst: 0,
            total_tax: 0,
          };
        }
        hsnMap[hsnKey].total_qty += item.quantity;
        hsnMap[hsnKey].taxable += itemTaxable;
        hsnMap[hsnKey].cgst += itemCgst;
        hsnMap[hsnKey].sgst += itemSgst;
        hsnMap[hsnKey].total_tax += itemTax;
      }
    }

    const round2 = (n) => Math.round(n * 100) / 100;

    const daily = Object.values(dailyMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        gross_revenue: round2(d.gross_revenue),
        discount: round2(d.discount),
        taxable: round2(d.taxable),
        cgst: round2(d.cgst),
        sgst: round2(d.sgst),
        igst: round2(d.igst),
        total_tax: round2(d.total_tax),
        grand_total: round2(d.grand_total),
      }));

    const by_rate = Object.values(rateMap)
      .sort((a, b) => a.rate - b.rate)
      .map((r) => ({
        ...r,
        taxable: round2(r.taxable),
        cgst: round2(r.cgst),
        sgst: round2(r.sgst),
        total_tax: round2(r.total_tax),
      }));

    const hsn = Object.values(hsnMap)
      .sort((a, b) => b.taxable - a.taxable)
      .map((h) => ({
        ...h,
        taxable: round2(h.taxable),
        cgst: round2(h.cgst),
        sgst: round2(h.sgst),
        total_tax: round2(h.total_tax),
      }));

    return {
      period: { from, to },
      totals: {
        order_count: orders.length,
        taxable: round2(totalTaxable),
        cgst: round2(totalCgst),
        sgst: round2(totalSgst),
        igst: round2(totalIgst),
        total_tax: round2(totalTax),
      },
      daily,
      by_rate,
      hsn,
    };
    });
  } catch (error) {
    logger.error('Get GST detailed report failed', { error: error.message });
    throw error;
  }
}

/**
 * Generate GST export CSV (GSTR-1, GSTR-3B summary, HSN, rate-wise).
 */
async function exportGstCsv(outletId, from, to, type = 'gstr1') {
  const data = await getGstDetailedReport(outletId, from, to);

  let csv = '';
  const fmt = (n) => Number(n || 0).toFixed(2);

  if (type === 'gstr1') {
    csv += 'GSTR-1 - Daily GST Register\n';
    csv += `Period: ${from} to ${to}\n\n`;
    csv += 'Date,Orders,Gross Revenue,Discount,Taxable Value,CGST,SGST,IGST,Total Tax,Grand Total\n';
    for (const row of data.daily) {
      csv += `${row.date},${row.order_count},${fmt(row.gross_revenue)},${fmt(row.discount)},${fmt(row.taxable)},${fmt(row.cgst)},${fmt(row.sgst)},${fmt(row.igst)},${fmt(row.total_tax)},${fmt(row.grand_total)}\n`;
    }
    csv += `\nTOTAL,${data.totals.order_count},,,"${fmt(data.totals.taxable)}","${fmt(data.totals.cgst)}","${fmt(data.totals.sgst)}","${fmt(data.totals.igst)}","${fmt(data.totals.total_tax)}"\n`;
  } else if (type === 'gstr3b') {
    csv += 'GSTR-3B Summary\n';
    csv += `Period: ${from} to ${to}\n\n`;
    csv += 'GST Rate (%),Total Orders,Taxable Amount,CGST,SGST,IGST,Total Tax\n';
    for (const row of data.by_rate) {
      csv += `${row.rate},${row.order_count},${fmt(row.taxable)},${fmt(row.cgst)},${fmt(row.sgst)},0.00,${fmt(row.total_tax)}\n`;
    }
    csv += `\nGrand Total,${data.totals.order_count},${fmt(data.totals.taxable)},${fmt(data.totals.cgst)},${fmt(data.totals.sgst)},${fmt(data.totals.igst)},${fmt(data.totals.total_tax)}\n`;
  } else if (type === 'hsn') {
    csv += 'HSN-wise Summary (GSTR-1 Table 12)\n';
    csv += `Period: ${from} to ${to}\n\n`;
    csv += 'HSN Code,Description,UOM,Total Qty,GST Rate (%),Taxable Value,CGST,SGST,Total Tax\n';
    for (const row of data.hsn) {
      csv += `"${row.hsn_code || 'N/A'}","${(row.description || '').replace(/"/g, '""')}",NOS,${row.total_qty},${row.gst_rate},${fmt(row.taxable)},${fmt(row.cgst)},${fmt(row.sgst)},${fmt(row.total_tax)}\n`;
    }
  } else if (type === 'rate_wise') {
    csv += 'Rate-wise GST Summary\n';
    csv += `Period: ${from} to ${to}\n\n`;
    csv += 'GST Rate (%),Orders,Taxable Amount,CGST,SGST,Total Tax\n';
    for (const row of data.by_rate) {
      csv += `${row.rate},${row.order_count},${fmt(row.taxable)},${fmt(row.cgst)},${fmt(row.sgst)},${fmt(row.total_tax)}\n`;
    }
  }

  return csv;
}

/**
 * Franchise KPIs — revenue, covers, avg check, with WoW/MoM growth.
 * @param {string} outletId
 * @param {string} from - YYYY-MM-DD
 * @param {string} to - YYYY-MM-DD
 */
async function getFranchiseKPIs(outletId, from, to) {
  const prisma = getDbClient();
  const fromDate = new Date(from || new Date().toISOString().split('T')[0]);
  fromDate.setHours(0, 0, 0, 0);
  const toDate = new Date(to || from || new Date().toISOString().split('T')[0]);
  toDate.setHours(23, 59, 59, 999);

  return await cached(`franchise-kpis:${outletId}:${from || 'd'}:${to || 'd'}`, TTL.MEDIUM, async () => {
  // Current period — only paid orders for revenue
  const orders = await prisma.order.findMany({
    where: { outlet_id: outletId, is_deleted: false, is_paid: true, status: { notIn: ['cancelled', 'voided'] }, created_at: { gte: fromDate, lte: toDate } },
    include: { order_items: true },
  });

  const revenue = orders.reduce((s, o) => s + Number(o.grand_total), 0);
  const covers = orders.reduce((s, o) => s + (o.covers || 1), 0);
  const total_orders = orders.length;
  const avg_check = total_orders > 0 ? revenue / total_orders : 0;
  const total_items_sold = orders.reduce((s, o) => s + o.order_items.reduce((ss, i) => ss + i.quantity, 0), 0);

  // Previous period (same duration)
  const duration = toDate - fromDate;
  const prevTo = new Date(fromDate - 1);
  const prevFrom = new Date(prevTo - duration);
  const prevOrders = await prisma.order.findMany({
    where: { outlet_id: outletId, is_deleted: false, is_paid: true, status: { notIn: ['cancelled', 'voided'] }, created_at: { gte: prevFrom, lte: prevTo } },
  });
  const prevRevenue = prevOrders.reduce((s, o) => s + Number(o.grand_total), 0);
  const prevOrderCount = prevOrders.length;

  const revenueGrowth = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;
  const ordersGrowth = prevOrderCount > 0 ? ((total_orders - prevOrderCount) / prevOrderCount) * 100 : null;

  // Inventory cost data for food cost %
  let food_cost = 0;
  let waste_value = 0;
  try {
    const wasteLogs = await prisma.stockAdjustment.findMany({
      where: { outlet_id: outletId, reason: { contains: 'waste', mode: 'insensitive' }, created_at: { gte: fromDate, lte: toDate }, is_deleted: false },
      include: { inventory_item: { select: { cost_per_unit: true } } },
    });
    waste_value = wasteLogs.reduce((s, w) => s + Math.abs(Number(w.quantity)) * Number(w.inventory_item?.cost_per_unit || 0), 0);

    // Simple food cost estimate from recipe-based deductions
    const recipeDeductions = await prisma.stockAdjustment.findMany({
      where: { outlet_id: outletId, reason: { contains: 'order', mode: 'insensitive' }, created_at: { gte: fromDate, lte: toDate }, is_deleted: false },
      include: { inventory_item: { select: { cost_per_unit: true } } },
    });
    food_cost = recipeDeductions.reduce((s, d) => s + Math.abs(Number(d.quantity)) * Number(d.inventory_item?.cost_per_unit || 0), 0);
  } catch (_) { /* inventory may not be linked */ }

  const food_cost_pct = revenue > 0 ? (food_cost / revenue) * 100 : 0;
  const waste_pct = revenue > 0 ? (waste_value / revenue) * 100 : 0;
  const gross_margin_pct = revenue > 0 ? ((revenue - food_cost) / revenue) * 100 : 0;

  return {
    revenue: Math.round(revenue * 100) / 100,
    total_orders,
    covers,
    avg_check: Math.round(avg_check * 100) / 100,
    total_items_sold,
    revenue_growth: revenueGrowth !== null ? Math.round(revenueGrowth * 10) / 10 : null,
    orders_growth: ordersGrowth !== null ? Math.round(ordersGrowth * 10) / 10 : null,
    food_cost: Math.round(food_cost * 100) / 100,
    food_cost_pct: Math.round(food_cost_pct * 10) / 10,
    waste_value: Math.round(waste_value * 100) / 100,
    waste_pct: Math.round(waste_pct * 10) / 10,
    gross_margin_pct: Math.round(gross_margin_pct * 10) / 10,
  };
  });
}

/**
 * Inventory valuation — total stock value by category.
 * @param {string} outletId
 */
async function getInventoryValuation(outletId) {
  const prisma = getDbClient();
  try {
    return await cached(`inventory-valuation:${outletId}`, TTL.SHORT, async () => {
    const items = await prisma.inventoryItem.findMany({
      where: { outlet_id: outletId, is_deleted: false },
      select: { id: true, name: true, category: true, current_stock: true, cost_per_unit: true, unit: true },
    });

    const byCategory = {};
    let totalValue = 0;
    for (const item of items) {
      const value = Number(item.current_stock) * Number(item.cost_per_unit);
      totalValue += value;
      if (!byCategory[item.category]) byCategory[item.category] = { category: item.category, value: 0, count: 0 };
      byCategory[item.category].value += value;
      byCategory[item.category].count++;
    }

    return {
      total_value: Math.round(totalValue * 100) / 100,
      total_items: items.length,
      by_category: Object.values(byCategory).map(c => ({ ...c, value: Math.round(c.value * 100) / 100 })),
    };
    });
  } catch (_) {
    return { total_value: 0, total_items: 0, by_category: [] };
  }
}

/**
 * Revenue trend — daily revenue for date range.
 * @param {string} outletId
 * @param {string} from
 * @param {string} to
 */
async function getRevenueTrendRange(outletId, from, to) {
  const prisma = getDbClient();
  const fromDate = new Date(from);
  fromDate.setHours(0, 0, 0, 0);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  return await cached(`revenue-trend-range:${outletId}:${from}:${to}`, TTL.SHORT, async () => {
    const orders = await prisma.order.findMany({
      where: { outlet_id: outletId, is_deleted: false, is_paid: true, status: { notIn: ['cancelled', 'voided'] }, created_at: { gte: fromDate, lte: toDate } },
      select: { grand_total: true, created_at: true, order_type: true },
    });

    const dailyMap = {};
    for (const order of orders) {
      const day = order.created_at.toISOString().split('T')[0];
      if (!dailyMap[day]) dailyMap[day] = { date: day, revenue: 0, orders: 0 };
      dailyMap[day].revenue += Number(order.grand_total);
      dailyMap[day].orders++;
    }

    return Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
      ...d, revenue: Math.round(d.revenue * 100) / 100,
    }));
  });
}

/**
 * Returns financial year date range for a given date and region.
 * AU: July 1 – June 30. IN: April 1 – March 31.
 */
function getFinancialYearRange(date = new Date(), region = 'IN') {
  const d = new Date(date);
  const month = d.getMonth(); // 0-indexed
  const year = d.getFullYear();
  if (region === 'AU') {
    const fyStart = month >= 6 ? year : year - 1;
    return {
      start: new Date(fyStart, 6, 1),
      end: new Date(fyStart + 1, 5, 30),
      label: `FY${fyStart}-${fyStart + 1}`,
    };
  }
  // India
  const fyStart = month >= 3 ? year : year - 1;
  return {
    start: new Date(fyStart, 3, 1),
    end: new Date(fyStart + 1, 2, 31),
    label: `FY${fyStart}-${String(fyStart + 1).slice(2)}`,
  };
}

/**
 * BAS (Business Activity Statement) report for Australian outlets.
 * Returns GST collected, GST on purchases, and net GST payable.
 */
async function getBASReport(outletId, from, to) {
  const prisma = getDbClient();

  return await cached(`bas-report:${outletId}:${from}:${to}`, TTL.LONG, async () => {
    const orders = await prisma.order.findMany({
      where: {
        outlet_id: outletId,
        created_at: { gte: new Date(from), lte: new Date(to) },
        is_deleted: false,
      },
      select: { total_amount: true, total_tax: true },
    });

    const totalSalesInclGST = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const gstCollected = Math.round(totalSalesInclGST * 10 / 110 * 100) / 100;

    // GST paid on purchases (from purchase orders)
    const pos = await prisma.purchaseOrder.findMany({
      where: {
        outlet_id: outletId,
        created_at: { gte: new Date(from), lte: new Date(to) },
        is_deleted: false,
      },
      select: { total_amount: true, tax_amount: true },
    }).catch(() => []);

    const gstPaid = pos.reduce((s, p) => s + Number(p.tax_amount || 0), 0);
    const netGSTPayable = Math.round((gstCollected - gstPaid) * 100) / 100;

    return {
      period: { from, to },
      g1_total_sales_incl_gst: totalSalesInclGST,
      g1_label: 'G1 Total Sales',
      gst_collected: gstCollected,
      gst_paid_on_purchases: gstPaid,
      net_gst_payable: netGSTPayable,
      net_sales_excl_gst: Math.round((totalSalesInclGST - gstCollected) * 100) / 100,
      order_count: orders.length,
    };
  });
}

/**
 * Advanced Reports — comprehensive analytics with hourly heatmap,
 * category breakdown, P&L statement, and daily revenue trend.
 * @param {string} outletId
 * @param {string} range - 'today' | 'week' | 'month' | 'quarter'
 */
async function getAdvancedReport(outletId, range = 'week') {
  const prisma = getDbClient();
  try {
    return await cached(`advanced:${outletId}:${range}`, TTL.LONG, async () => {
    const round2 = (n) => Math.round(n * 100) / 100;

    // Compute date range from the range parameter
    const now = new Date();
    const to = new Date(now);
    to.setHours(23, 59, 59, 999);
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);

    switch (range) {
      case 'today':
        break; // from is already today
      case 'week':
        from.setDate(from.getDate() - 7);
        break;
      case 'month':
        from.setMonth(from.getMonth() - 1);
        break;
      case 'quarter':
        from.setMonth(from.getMonth() - 3);
        break;
      default:
        from.setDate(from.getDate() - 7);
    }

    // 1. Fetch all valid PAID orders in the range with items and payments
    const orders = await prisma.order.findMany({
      where: {
        outlet_id: outletId,
        is_deleted: false,
        is_paid: true,
        status: { notIn: ['cancelled', 'voided'] },
        created_at: { gte: from, lte: to },
      },
      include: {
        order_items: {
          where: { is_deleted: false },
          select: {
            quantity: true,
            item_total: true,
            item_tax: true,
            name: true,
            menu_item: { select: { category: { select: { name: true } } } },
          },
        },
        payments: {
          where: { is_deleted: false, status: { not: 'failed' } },
          select: { amount: true, refund_amount: true },
        },
      },
    });

    // 2. Cancelled/voided orders for refund/void stats
    const voidedOrders = await prisma.order.findMany({
      where: {
        outlet_id: outletId,
        is_deleted: false,
        status: { in: ['cancelled', 'voided'] },
        created_at: { gte: from, lte: to },
      },
      select: { grand_total: true },
    });

    // ── HOURLY HEATMAP (24h × 7 days) ──
    // Build a grid of {hour: 0-23, day: 0-6 (Sun-Sat), count}
    const heatmap = [];
    const heatmapGrid = {};
    for (const order of orders) {
      const d = new Date(order.created_at);
      const hour = d.getHours();
      const day = d.getDay(); // 0=Sun, 6=Sat
      const key = `${hour}-${day}`;
      heatmapGrid[key] = (heatmapGrid[key] || 0) + 1;
    }
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        heatmap.push({ hour, day, count: heatmapGrid[`${hour}-${day}`] || 0 });
      }
    }

    // ── CATEGORY BREAKDOWN ──
    const categoryMap = {};
    let totalItemRevenue = 0;
    for (const order of orders) {
      for (const oi of order.order_items) {
        const catName = oi.menu_item?.category?.name || 'Uncategorised';
        if (!categoryMap[catName]) {
          categoryMap[catName] = { name: catName, revenue: 0, orders: 0 };
        }
        categoryMap[catName].revenue += Number(oi.item_total);
        categoryMap[catName].orders += oi.quantity;
        totalItemRevenue += Number(oi.item_total);
      }
    }
    const category_breakdown = Object.values(categoryMap)
      .sort((a, b) => b.revenue - a.revenue)
      .map((c) => ({
        ...c,
        revenue: round2(c.revenue),
        pct: totalItemRevenue > 0 ? round2((c.revenue / totalItemRevenue) * 100) : 0,
      }));

    // ── P&L STATEMENT ──
    let grossRevenue = 0;
    let totalDiscounts = 0;
    let totalRefunds = 0;
    let totalTax = 0;

    for (const order of orders) {
      grossRevenue += Number(order.subtotal || 0);
      totalDiscounts += Number(order.discount_amount || 0) + Number(order.loyalty_discount || 0);
      totalTax += Number(order.total_tax || 0);
      for (const p of order.payments) {
        totalRefunds += Number(p.refund_amount || 0);
      }
    }
    // Add voided order amounts to refunds
    totalRefunds += voidedOrders.reduce((s, o) => s + Number(o.grand_total || 0), 0);

    const netRevenue = grossRevenue - totalDiscounts - totalRefunds;

    // Estimate costs from inventory data (best-effort)
    let foodCost = 0;
    let staffCost = 0;
    try {
      const recipeDeductions = await prisma.stockAdjustment.findMany({
        where: {
          outlet_id: outletId,
          reason: { contains: 'order', mode: 'insensitive' },
          created_at: { gte: from, lte: to },
          is_deleted: false,
        },
        include: { inventory_item: { select: { cost_per_unit: true } } },
      });
      foodCost = recipeDeductions.reduce(
        (s, d) => s + Math.abs(Number(d.quantity)) * Number(d.inventory_item?.cost_per_unit || 0), 0
      );
    } catch (_) { /* inventory not linked yet */ }

    // Staff cost estimate from StaffProfile.monthly_salary
    try {
      const staffProfiles = await prisma.staffProfile.findMany({
        where: { outlet_id: outletId },
        select: { monthly_salary: true },
      });
      const totalMonthlySalary = staffProfiles.reduce((s, sp) => s + Number(sp.monthly_salary || 0), 0);
      // Prorate based on range
      const rangeDays = Math.max(1, Math.ceil((to - from) / (1000 * 60 * 60 * 24)));
      staffCost = round2((totalMonthlySalary / 30) * rangeDays);
    } catch (_) { /* staff profile may not exist */ }

    // Overheads — estimate at 15% of net revenue (standard restaurant benchmark)
    const overheads = round2(netRevenue * 0.15);
    const totalExpenses = round2(foodCost + staffCost + overheads);
    const grossProfit = round2(netRevenue - foodCost);
    const netProfit = round2(netRevenue - totalExpenses - totalTax);

    const profit_loss = {
      gross_revenue: round2(grossRevenue),
      discounts: round2(totalDiscounts),
      refunds: round2(totalRefunds),
      net_revenue: round2(netRevenue),
      food_cost: round2(foodCost),
      staff_cost: round2(staffCost),
      overheads,
      total_expenses: totalExpenses,
      gross_profit: grossProfit,
      tax: round2(totalTax),
      net_profit: netProfit,
    };

    // ── DAILY REVENUE (last 7 days, day-of-week labels) ──
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dailyMap = {};

    // Initialize last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      dailyMap[key] = { day: dayNames[d.getDay()], v: 0 };
    }

    for (const order of orders) {
      const key = new Date(order.created_at).toISOString().split('T')[0];
      if (dailyMap[key]) {
        dailyMap[key].v += Number(order.grand_total || 0);
      }
    }
    const daily_revenue = Object.values(dailyMap).map((d) => ({
      day: d.day,
      v: round2(d.v),
    }));

    return {
      hourly_heatmap: heatmap,
      category_breakdown,
      profit_loss,
      daily_revenue,
      total_orders: orders.length,
      period: { from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0], range },
    };
    });
  } catch (error) {
    logger.error('Get advanced report failed', { error: error.message });
    throw error;
  }
}

/**
 * Payment breakdown by method (cash, card, upi, other) for a date range.
 * Primary source: DailySummary (pre-aggregated). Fallback: Payment/PaymentSplit tables.
 * @param {string} outletId
 * @param {string} from - YYYY-MM-DD
 * @param {string} to - YYYY-MM-DD
 * @returns {Promise<{breakdown: object[], total: number}>}
 */
async function getPaymentBreakdown(outletId, from, to) {
  const prisma = getDbClient();
  try {
    const fromDate = new Date(from);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    return await cached(`payment-breakdown:${outletId}:${from}:${to}`, TTL.SHORT, async () => {
    // Try DailySummary first (pre-aggregated, faster)
    const summaries = await prisma.dailySummary.findMany({
      where: {
        outlet_id: outletId,
        summary_date: { gte: fromDate, lte: toDate },
        is_deleted: false,
      },
    });

    let cash = 0, card = 0, upi = 0, other = 0;

    if (summaries.length > 0) {
      for (const s of summaries) {
        cash += Number(s.cash_collected);
        card += Number(s.card_collected);
        upi += Number(s.upi_collected);
        other += Number(s.other_collected);
      }
    } else {
      // Fallback: aggregate from Payment table directly
      const payments = await prisma.payment.findMany({
        where: {
          outlet_id: outletId,
          status: 'success',
          is_deleted: false,
          created_at: { gte: fromDate, lte: toDate },
        },
        include: {
          splits: { where: { is_deleted: false, status: 'success' } },
        },
      });

      for (const payment of payments) {
        if (payment.splits && payment.splits.length > 0) {
          // Use splits for split-payment orders
          for (const split of payment.splits) {
            const method = split.method;
            const amount = Number(split.amount);
            if (method === 'cash') cash += amount;
            else if (method.includes('card')) card += amount;
            else if (method.includes('upi')) upi += amount;
            else other += amount;
          }
        } else {
          const method = payment.method;
          const amount = Number(payment.amount);
          if (method === 'cash') cash += amount;
          else if (method.includes('card')) card += amount;
          else if (method.includes('upi')) upi += amount;
          else other += amount;
        }
      }
    }

    const total = Math.round((cash + card + upi + other) * 100) / 100;

    const breakdown = [
      { method: 'Cash', amount: Math.round(cash * 100) / 100, percentage: total > 0 ? Math.round((cash / total) * 100) : 0 },
      { method: 'Card', amount: Math.round(card * 100) / 100, percentage: total > 0 ? Math.round((card / total) * 100) : 0 },
      { method: 'UPI', amount: Math.round(upi * 100) / 100, percentage: total > 0 ? Math.round((upi / total) * 100) : 0 },
      { method: 'Other', amount: Math.round(other * 100) / 100, percentage: total > 0 ? Math.round((other / total) * 100) : 0 },
    ];

    return { breakdown, total };
    });
  } catch (error) {
    logger.error('Get payment breakdown failed', { error: error.message });
    throw error;
  }
}

module.exports = {
  getDailySales, getItemWiseSales, getRevenueTrend,
  getDashboard, getHourlyBreakdown, getCategoryWiseSales, getGstReport, getStaffPerformance,
  getTopSellingItems, getGstDetailedReport, exportGstCsv,
  getFranchiseKPIs, getInventoryValuation, getRevenueTrendRange,
  getFinancialYearRange, getBASReport, getAdvancedReport, getPaymentBreakdown,
};
