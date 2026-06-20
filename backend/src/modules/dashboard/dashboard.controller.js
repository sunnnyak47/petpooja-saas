/**
 * @fileoverview Dashboard controller — aggregated summary for mobile app / head-office.
 * @module modules/dashboard/dashboard.controller
 */

const { getDbClient } = require('../../config/database');
const { sendSuccess } = require('../../utils/response');

/** GET /api/dashboard/summary */
async function getSummary(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const prisma = getDbClient();

    // Date window — today in the server timezone
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Base where clause scoped to outlet + today
    const baseWhere = {
      outlet_id: outletId,
      is_deleted: false,
      created_at: { gte: todayStart, lte: todayEnd },
    };

    // Run aggregations in parallel
    const [revenueAgg, statusGroups, topItemsRaw, allTodayOrders] = await Promise.all([
      // Total revenue (paid orders only)
      prisma.order.aggregate({
        where: { ...baseWhere, is_paid: true },
        _sum: { grand_total: true },
        _count: { id: true },
      }),

      // Order counts grouped by status
      prisma.order.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { id: true },
      }),

      // Top 5 menu items by quantity sold today
      prisma.orderItem.groupBy({
        by: ['menu_item_id'],
        where: {
          order: {
            outlet_id: outletId,
            is_deleted: false,
            created_at: { gte: todayStart, lte: todayEnd },
          },
        },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),

      // Hourly breakdown — fetch all orders with grand_total for the day
      prisma.order.findMany({
        where: { ...baseWhere, is_paid: true },
        select: { grand_total: true, created_at: true },
      }),
    ]);

    // Build status map
    const statusMap = {};
    statusGroups.forEach(({ status, _count }) => {
      statusMap[status] = _count.id;
    });

    // Build hourly breakdown (0-23)
    const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0, orders: 0 }));
    allTodayOrders.forEach(({ grand_total, created_at }) => {
      const h = new Date(created_at).getHours();
      hourly[h].revenue += Number(grand_total);
      hourly[h].orders += 1;
    });

    // Resolve top item names from menu_item_id (best-effort — skip if DB call fails)
    let topItems = topItemsRaw.map((r) => ({
      menu_item_id: r.menu_item_id,
      quantity_sold: Number(r._sum.quantity) || 0,
      name: null,
    }));
    try {
      const ids = topItemsRaw.map((r) => r.menu_item_id).filter(Boolean);
      if (ids.length) {
        const menuItems = await prisma.menuItem.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        });
        const nameMap = {};
        menuItems.forEach((m) => { nameMap[m.id] = m.name; });
        topItems = topItems.map((t) => ({ ...t, name: nameMap[t.menu_item_id] || 'Unknown' }));
      }
    } catch (_) { /* non-fatal */ }

    const totalOrders = statusGroups.reduce((acc, s) => acc + s._count.id, 0);
    const totalRevenue = Number(revenueAgg._sum.grand_total) || 0;
    const paidOrders = revenueAgg._count.id || 0;

    const summary = {
      date: todayStart.toISOString().split('T')[0],
      revenue: {
        total: totalRevenue,
        currency: 'INR',
        paid_orders: paidOrders,
      },
      orders: {
        total: totalOrders,
        by_status: statusMap,
      },
      top_items: topItems,
      hourly_breakdown: hourly,
    };

    // If the DB returned nothing (empty restaurant), supplement with mock values
    // so the mobile app always renders something useful.
    if (totalOrders === 0) {
      summary._note = 'No orders today — showing mock data for preview';
      summary.revenue.total = 0;
      summary.orders.by_status = {
        created: 0, confirmed: 0, preparing: 0, ready: 0, served: 0, paid: 0, cancelled: 0,
      };
    }

    sendSuccess(res, summary, 'Dashboard summary retrieved');
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/dashboard/live
 * Real-time live dashboard stats — polled every 30s by the frontend.
 * Returns today's orders, revenue, active tables, order pipeline, kitchen status,
 * and performance indicators using REAL data from Order, Payment, Table, KOT, User.
 */
async function getLive(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const prisma = getDbClient();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const baseWhere = {
      outlet_id: outletId,
      is_deleted: false,
      created_at: { gte: todayStart, lte: todayEnd },
    };

    // Run all queries in parallel for speed
    const [
      paidAgg,
      allOrders,
      statusGroups,
      activeTables,
      totalTables,
      kotStats,
      onlineOrderCount,
      activeStaffCount,
    ] = await Promise.all([
      // 1. Revenue from paid orders
      prisma.order.aggregate({
        where: { ...baseWhere, is_paid: true },
        _sum: { grand_total: true },
        _count: { id: true },
      }),

      // 2. All today's orders (for avg calc)
      prisma.order.count({ where: baseWhere }),

      // 3. Orders grouped by status
      prisma.order.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { id: true },
      }),

      // 4. Active (occupied) tables
      prisma.table.count({
        where: { outlet_id: outletId, status: 'occupied', is_deleted: false },
      }),

      // 5. Total tables
      prisma.table.count({
        where: { outlet_id: outletId, is_deleted: false },
      }),

      // 6. KOT status breakdown for kitchen stats
      prisma.kOT.groupBy({
        by: ['status'],
        where: {
          outlet_id: outletId,
          is_deleted: false,
          created_at: { gte: todayStart, lte: todayEnd },
        },
        _count: { id: true },
      }),

      // 7. Online / QR orders count
      prisma.order.count({
        where: {
          ...baseWhere,
          source: { in: ['online', 'qr', 'aggregator'] },
        },
      }),

      // 8. Staff who created orders today (active staff)
      prisma.order.findMany({
        where: { ...baseWhere, staff_id: { not: null } },
        select: { staff_id: true },
        distinct: ['staff_id'],
      }),
    ]);

    // Build order status map — frontend expects uppercase keys
    const statusMap = {};
    const statusKeyMap = {
      created: 'PENDING', pending: 'PENDING',
      confirmed: 'CONFIRMED',
      cooking: 'PREPARING', preparing: 'PREPARING',
      ready: 'READY',
      served: 'DELIVERED', delivered: 'DELIVERED', completed: 'DELIVERED',
      cancelled: 'CANCELLED', voided: 'CANCELLED',
    };
    for (const sg of statusGroups) {
      const key = statusKeyMap[sg.status] || sg.status.toUpperCase();
      statusMap[key] = (statusMap[key] || 0) + sg._count.id;
    }
    // Ensure all expected keys exist
    for (const k of ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED']) {
      statusMap[k] = statusMap[k] || 0;
    }

    // Build KOT-based kitchen stats
    const kotMap = {};
    for (const k of kotStats) {
      kotMap[k.status] = k._count.id;
    }

    const totalRevenue = Number(paidAgg._sum.grand_total) || 0;
    const paidOrderCount = paidAgg._count.id || 0;

    // Compute average prep time from KOTs that have been completed
    let avgPrepTime = 0;
    try {
      const completedKots = await prisma.kOT.findMany({
        where: {
          outlet_id: outletId,
          is_deleted: false,
          status: { in: ['completed', 'served', 'delivered'] },
          created_at: { gte: todayStart, lte: todayEnd },
          completed_at: { not: null },
        },
        select: { created_at: true, completed_at: true },
      });
      if (completedKots.length > 0) {
        const totalMs = completedKots.reduce((sum, k) => {
          return sum + (new Date(k.completed_at) - new Date(k.created_at));
        }, 0);
        avgPrepTime = Math.round(totalMs / completedKots.length / 60000); // minutes
      }
    } catch (_) {
      // completed_at column may not exist on all setups — non-fatal
    }

    const liveData = {
      orders_today: allOrders,
      revenue_today: Math.round(totalRevenue * 100) / 100,
      active_tables: activeTables,
      total_tables: totalTables,
      avg_order_value: paidOrderCount > 0
        ? Math.round((totalRevenue / paidOrderCount) * 100) / 100
        : 0,
      orders_by_status: statusMap,
      avg_prep_time: avgPrepTime,
      online_orders: onlineOrderCount,
      staff_count: activeStaffCount.length,
      kitchen: {
        in_queue: kotMap['pending'] || 0,
        preparing: kotMap['preparing'] || kotMap['cooking'] || 0,
        ready: kotMap['ready'] || 0,
        completed: kotMap['completed'] || kotMap['served'] || 0,
      },
      last_updated: new Date().toISOString(),
    };

    sendSuccess(res, liveData, 'Live dashboard data retrieved');
  } catch (error) {
    next(error);
  }
}

// ── Order pipeline (Confirmed → Ready → Served → Paid) ──────────────────────
// Minutes an order may sit in a stage before it's flagged as "stuck".
const STAGE_THRESHOLDS = { confirmed: 20, ready: 10, served: 15 };

/**
 * Derive which pipeline stage an order is in. "Served" is not an order status —
 * it's derived from the order's KOTs (kitchen marks each KOT served on pickup).
 * @param {{status:string, is_paid:boolean, kots?:{status:string}[]}} order
 * @returns {'confirmed'|'ready'|'served'|'paid'|null} null = not shown in the pipeline
 */
function deriveStage(order) {
  if (order.is_paid) return 'paid';
  if (order.status === 'cancelled' || order.status === 'voided') return null;
  const kots = order.kots || [];
  if (order.status === 'confirmed' || (order.status === 'created' && kots.length > 0)) return 'confirmed';
  if (order.status === 'ready' || order.status === 'billed') {
    if (kots.length > 0 && kots.every((k) => k.status === 'served' || k.status === 'completed')) return 'served';
    return 'ready';
  }
  return null; // 'created' with no KOT, 'held' → not part of the 4-stage view
}

/** GET /api/dashboard/order-pipeline — today's open orders bucketed by stage + stuck alerts */
async function getOrderPipeline(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const prisma = getDbClient();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const orders = await prisma.order.findMany({
      where: {
        outlet_id: outletId, is_deleted: false,
        created_at: { gte: todayStart, lte: todayEnd },
        status: { notIn: ['cancelled', 'voided'] },
      },
      select: {
        id: true, order_number: true, order_type: true, grand_total: true, status: true, is_paid: true, created_at: true,
        table: { select: { table_number: true } },
        kots: { where: { is_deleted: false }, select: { status: true, completed_at: true } },
      },
      orderBy: { created_at: 'asc' },
    });

    const now = Date.now();
    const stages = {
      confirmed: { count: 0, orders: [] },
      ready: { count: 0, orders: [] },
      served: { count: 0, orders: [] },
      paid: { count: 0, orders: [] },
    };

    for (const o of orders) {
      const stage = deriveStage(o);
      if (!stage) continue;
      stages[stage].count += 1;

      const base = {
        id: o.id,
        order_number: o.order_number,
        order_type: o.order_type,
        table_number: o.table?.table_number || null,
        grand_total: Number(o.grand_total),
        created_at: o.created_at,
      };

      // Paid: list-only (no stuck timer/alert) so the drill-down popup can show
      // today's settled orders too. Other stages carry a stuck timer.
      if (stage === 'paid') {
        stages.paid.orders.push({ ...base, stuck_mins: 0, alert: false });
        continue;
      }

      // since = when the order entered this stage: latest KOT completed_at (ready/served)
      // when available, else the order's created_at.
      let since = new Date(o.created_at);
      if (stage === 'ready' || stage === 'served') {
        const times = (o.kots || []).map((k) => k.completed_at).filter(Boolean).map((t) => new Date(t).getTime());
        if (times.length) since = new Date(Math.max(...times));
      }
      const stuckMins = Math.max(0, Math.round((now - since.getTime()) / 60000));
      stages[stage].orders.push({
        ...base,
        stuck_mins: stuckMins,
        alert: stuckMins > (STAGE_THRESHOLDS[stage] ?? Infinity),
      });
    }
    // Most-stuck first so the UI can surface the worst order per stage; paid newest-first.
    for (const k of ['confirmed', 'ready', 'served']) stages[k].orders.sort((a, b) => b.stuck_mins - a.stuck_mins);
    stages.paid.orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    sendSuccess(res, { stages, thresholds: STAGE_THRESHOLDS, generated_at: new Date().toISOString() }, 'Order pipeline retrieved');
  } catch (error) {
    next(error);
  }
}

module.exports = { getSummary, getLive, getOrderPipeline, deriveStage };
